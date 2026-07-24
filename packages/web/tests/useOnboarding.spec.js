import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRecords = vi.fn()
const upsertRecord = vi.fn()
const getAuthorizationHeader = vi.fn()

vi.mock('@/services/api', () => ({
  getRecords: (...args) => getRecords(...args),
  upsertRecord: (...args) => upsertRecord(...args),
  getAuthorizationHeader: (...args) => getAuthorizationHeader(...args),
}))

// The resolved flag is scoped per user id, so specs control who is signed in.
let currentUser = { id: 'user_a' }
vi.mock('@/services/clerk', () => ({
  isClerkEnabled: () => true,
  getClerkUserSync: () => currentUser,
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
const { takeRecords, clearRecordsCache } = await import('@/services/recordsCache')

const WT = 'world-tour'
const BOTH = [WT, 'ranked']

describe('useOnboarding', () => {
  beforeEach(() => {
    // State is a module singleton (the header and app shell share it), so it
    // must be cleared between specs.
    resetOnboardingStateForTests()
    clearRecordsCache()
    store.clear()
    currentUser = { id: 'user_a' }
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

    it('never probes again for a user who already has records', async () => {
      // Otherwise every returning user refetches every mode on every load just
      // to rediscover they aren't new.
      getRecords.mockResolvedValue([{ id: 'r1', winPoints: 100 }])
      const first = useOnboarding()
      await first.check(BOTH)
      expect(getRecords).toHaveBeenCalledTimes(2)

      resetOnboardingStateForTests()
      getRecords.mockClear()
      const second = useOnboarding()
      await second.check(BOTH)

      expect(second.needed.value).toBe(false)
      expect(getRecords).not.toHaveBeenCalled()
    })

    it('does prompt again if the user closed the tab without answering', async () => {
      // Nothing was settled, so the probe must run again next load.
      getRecords.mockResolvedValue([])
      const first = useOnboarding()
      await first.check(BOTH)
      expect(first.needed.value).toBe(true)

      resetOnboardingStateForTests()
      getRecords.mockClear()
      const second = useOnboarding()
      await second.check(BOTH)

      expect(second.needed.value).toBe(true)
      expect(getRecords).toHaveBeenCalled()
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

  describe('account switching on a shared browser', () => {
    it('still onboards a new user after a different account resolved it here', async () => {
      // A single global flag would let the first account silently suppress the
      // prompt for everyone who signs in afterwards — dropping a genuinely new
      // user onto a zero graph, the exact thing this prompt exists to prevent.
      getRecords.mockResolvedValue([{ id: 'r1', winPoints: 100 }])
      const settled = useOnboarding()
      await settled.check(BOTH)
      expect(settled.needed.value).toBe(false)

      currentUser = { id: 'user_b' }
      resetOnboardingStateForTests()
      getRecords.mockResolvedValue([])
      const newcomer = useOnboarding()
      await newcomer.check(BOTH)

      expect(newcomer.needed.value).toBe(true)
    })

    it('keeps each account resolved independently', async () => {
      getRecords.mockResolvedValue([{ id: 'r1' }])
      await useOnboarding().check(BOTH)

      currentUser = { id: 'user_b' }
      resetOnboardingStateForTests()
      getRecords.mockResolvedValue([])
      const b = useOnboarding()
      await b.check(BOTH)
      b.skip()

      // Returning to A must not re-probe: their flag is still set.
      currentUser = { id: 'user_a' }
      resetOnboardingStateForTests()
      getRecords.mockClear()
      const a = useOnboarding()
      await a.check(BOTH)

      expect(a.needed.value).toBe(false)
      expect(getRecords).not.toHaveBeenCalled()
    })

    it('probes rather than trusting a flag when the user is unidentifiable', async () => {
      getRecords.mockResolvedValue([{ id: 'r1' }])
      await useOnboarding().check(BOTH)

      currentUser = null
      resetOnboardingStateForTests()
      getRecords.mockClear().mockResolvedValue([])
      const unknown = useOnboarding()
      await unknown.check(BOTH)

      expect(getRecords).toHaveBeenCalled()
      expect(unknown.needed.value).toBe(true)
    })

    it('clears state and cached records when a new probe starts', async () => {
      // A remount must not render the dashboard for the new account off the
      // previous one's answer, nor hand it the previous one's records.
      getRecords.mockResolvedValue([{ id: 'r1', winPoints: 100 }])
      const first = useOnboarding()
      await first.check(BOTH)
      expect(first.needed.value).toBe(false)

      currentUser = { id: 'user_b' }
      getRecords.mockResolvedValue([])
      const second = useOnboarding()
      const inFlight = second.check(BOTH)
      expect(second.needed.value).toBe(null)
      expect(takeRecords(WT)).toBe(null)

      await inFlight
      expect(second.needed.value).toBe(true)
    })

    it('lets a newer probe win when two overlap', async () => {
      // Account A's slow probe must not overwrite account B's newer result.
      let resolveSlow
      getRecords.mockImplementationOnce(
        () => new Promise((r) => { resolveSlow = () => r([{ id: 'r1' }]) })
      )
      const { check, needed } = useOnboarding()
      const slow = check([WT])

      getRecords.mockResolvedValue([])
      currentUser = { id: 'user_b' }
      await check([WT])
      expect(needed.value).toBe(true)

      resolveSlow()
      await slow

      // The stale probe found records, but it's superseded — B is still new.
      expect(needed.value).toBe(true)
    })
  })

  describe('records handoff', () => {
    it('hands the fetched records to the dashboard instead of making it refetch', async () => {
      const wtRecords = [{ id: 'r1', winPoints: 100 }]
      const rkRecords = [{ id: 'r2', winPoints: 18000 }]
      getRecords.mockImplementation((_auth, mode) =>
        Promise.resolve(mode === 'ranked' ? rkRecords : wtRecords)
      )
      const { check } = useOnboarding()
      await check(BOTH)

      expect(takeRecords(WT)).toEqual(wtRecords)
      expect(takeRecords('ranked')).toEqual(rkRecords)
    })

    it('hands over the empty result too, for a user who skips', async () => {
      getRecords.mockResolvedValue([])
      const { check, skip } = useOnboarding()
      await check(BOTH)
      skip()

      // Nothing was written, so the empty result is still accurate.
      expect(takeRecords(WT)).toEqual([])
    })

    it('invalidates the handoff after saving, since it is now stale', async () => {
      // The cached result predates the write; serving it would render the
      // dashboard empty despite the user having just entered a total.
      getRecords.mockResolvedValue([])
      const { check, save } = useOnboarding()
      await check(BOTH)
      await save({ [WT]: 1200 })

      expect(takeRecords(WT)).toBe(null)
      expect(takeRecords('ranked')).toBe(null)
    })

    it('caches nothing when the probe is skipped entirely', async () => {
      getRecords.mockResolvedValue([{ id: 'r1' }])
      const first = useOnboarding()
      await first.check(BOTH)
      clearRecordsCache()

      resetOnboardingStateForTests()
      const second = useOnboarding()
      await second.check(BOTH)

      // Resolved locally, so no fetch happened and there's nothing to hand over.
      expect(takeRecords(WT)).toBe(null)
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
      expect(localStorage.getItem('onboarding.resolved.user_a')).toBe(null)
    })
  })
})
