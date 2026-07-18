import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRecords = vi.fn()
const upsertRecord = vi.fn()
const getAuthorizationHeader = vi.fn()

vi.mock('@/services/api', () => ({
  getRecords: (...args) => getRecords(...args),
  upsertRecord: (...args) => upsertRecord(...args),
  getAuthorizationHeader: (...args) => getAuthorizationHeader(...args),
}))

const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
})

const { useOnboarding, resetOnboardingStateForTests } = await import(
  '@/composables/useOnboarding'
)

const WT = 'world-tour'
const BOTH = [WT, 'ranked']

describe('useOnboarding', () => {
  beforeEach(() => {
    // State is a module singleton (the header and app shell share it), so it
    // must be cleared between specs.
    resetOnboardingStateForTests()
    store.clear()
    getRecords.mockReset()
    upsertRecord.mockReset().mockResolvedValue({ record: { id: 'r1' } })
    getAuthorizationHeader.mockReset().mockResolvedValue('Bearer token')
  })

  describe('check', () => {
    it('prompts a user with no records in any mode', async () => {
      getRecords.mockResolvedValue([])
      const { needed, isResolved, check } = useOnboarding()

      expect(isResolved.value).toBe(false)
      await check(BOTH)

      expect(needed.value).toBe(true)
      expect(isResolved.value).toBe(true)
    })

    it('does not prompt when any prompted mode already has records', async () => {
      getRecords.mockImplementation((_auth, mode) =>
        Promise.resolve(mode === 'ranked' ? [{ id: 'r1', winPoints: 18000 }] : [])
      )
      const { needed, check } = useOnboarding()
      await check(BOTH)

      expect(needed.value).toBe(false)
    })

    it('only checks the modes it would prompt for', async () => {
      // Ranked is flag-gated on web: a user without the flag shouldn't be held in
      // onboarding by Ranked data, nor probed for it.
      getRecords.mockResolvedValue([])
      const { needed, check } = useOnboarding()
      await check([WT])

      expect(needed.value).toBe(true)
      expect(getRecords).toHaveBeenCalledTimes(1)
      expect(getRecords).toHaveBeenCalledWith('Bearer token', WT)
    })

    it('does not prompt again once dismissed', async () => {
      getRecords.mockResolvedValue([])
      const first = useOnboarding()
      await first.check(BOTH)
      first.skip()

      // Simulate a fresh page load: in-memory state is gone, the flag persists.
      resetOnboardingStateForTests()
      const second = useOnboarding()
      getRecords.mockClear()
      await second.check(BOTH)

      expect(second.needed.value).toBe(false)
      expect(getRecords).not.toHaveBeenCalled()
    })

    it('falls through to the app when the probe fails', async () => {
      getRecords.mockRejectedValue(new Error('network down'))
      const { needed, check } = useOnboarding()
      await check(BOTH)

      expect(needed.value).toBe(false)
    })

    it('does not prompt when signed out', async () => {
      getAuthorizationHeader.mockResolvedValue(null)
      const { needed, check } = useOnboarding()
      await check(BOTH)

      expect(needed.value).toBe(false)
      expect(getRecords).not.toHaveBeenCalled()
    })
  })

  describe('isDashboardVisible', () => {
    // Drives whether the header shows the mode switcher: switching modes behind
    // the prompt would change the route without dismissing it.
    it('is false while the check is still in flight', () => {
      const { isDashboardVisible } = useOnboarding()
      expect(isDashboardVisible.value).toBe(false)
    })

    it('stays false while the prompt is up', async () => {
      getRecords.mockResolvedValue([])
      const { isDashboardVisible, check } = useOnboarding()
      await check(BOTH)

      expect(isDashboardVisible.value).toBe(false)
    })

    it('becomes true once onboarding resolves as not needed', async () => {
      getRecords.mockResolvedValue([{ id: 'r1', winPoints: 100 }])
      const { isDashboardVisible, check } = useOnboarding()
      await check(BOTH)

      expect(isDashboardVisible.value).toBe(true)
    })

    it('becomes true after the user saves', async () => {
      getRecords.mockResolvedValue([])
      const { isDashboardVisible, check, save } = useOnboarding()
      await check(BOTH)
      await save({ [WT]: 1200 })

      expect(isDashboardVisible.value).toBe(true)
    })

    it('becomes true after the user skips', async () => {
      getRecords.mockResolvedValue([])
      const { isDashboardVisible, check, skip } = useOnboarding()
      await check(BOTH)
      skip()

      expect(isDashboardVisible.value).toBe(true)
    })

    it('is shared across call sites', async () => {
      // The header and the app shell each call useOnboarding() separately.
      getRecords.mockResolvedValue([])
      const shell = useOnboarding()
      const header = useOnboarding()

      await shell.check(BOTH)
      expect(header.isDashboardVisible.value).toBe(false)

      shell.skip()
      expect(header.isDashboardVisible.value).toBe(true)
    })
  })

  describe('save', () => {
    it("writes each entered total as today's record in its own mode", async () => {
      const { needed, save } = useOnboarding()
      const ok = await save({ [WT]: 1200, ranked: 18000 })

      expect(ok).toBe(true)
      expect(needed.value).toBe(false)
      expect(upsertRecord).toHaveBeenCalledTimes(2)

      const today = new Date()
      const expectedDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-')

      expect(upsertRecord).toHaveBeenCalledWith(expectedDate, 1200, 'Bearer token', WT)
      expect(upsertRecord).toHaveBeenCalledWith(expectedDate, 18000, 'Bearer token', 'ranked')
    })

    it('does not write a mode the user left blank', async () => {
      // A phantom 0 would anchor that mode's graph and pace at zero.
      const { save } = useOnboarding()
      await save({ [WT]: 1200 })

      expect(upsertRecord).toHaveBeenCalledTimes(1)
      expect(upsertRecord).toHaveBeenCalledWith(expect.any(String), 1200, 'Bearer token', WT)
    })

    it('keeps the prompt up and surfaces an error when saving fails', async () => {
      upsertRecord.mockRejectedValue(new Error('500'))
      const { needed, saveError, save, check } = useOnboarding()
      getRecords.mockResolvedValue([])
      await check(BOTH)

      const ok = await save({ [WT]: 1200 })

      expect(ok).toBe(false)
      expect(needed.value).toBe(true)
      expect(saveError.value).toBeTruthy()
      expect(localStorage.getItem('onboarding.dismissed')).toBe(null)
    })
  })
})
