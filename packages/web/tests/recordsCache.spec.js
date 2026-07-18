import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  primeRecords,
  takeRecords,
  clearRecordsCache,
} from '@/services/recordsCache'

// The onboarding check and the dashboard's first load would otherwise fetch the
// same records back to back. The cache bridges that one handoff.
describe('recordsCache', () => {
  beforeEach(() => {
    clearRecordsCache()
  })

  it('hands primed records to the matching mode', () => {
    const records = [{ id: 'r1', winPoints: 100 }]
    primeRecords('world-tour', records)

    expect(takeRecords('world-tour')).toEqual(records)
  })

  it('is single-use, so a later reload fetches fresh', () => {
    primeRecords('world-tour', [{ id: 'r1' }])

    expect(takeRecords('world-tour')).not.toBe(null)
    expect(takeRecords('world-tour')).toBe(null)
  })

  it('keeps modes separate', () => {
    primeRecords('ranked', [{ id: 'r1' }])

    expect(takeRecords('world-tour')).toBe(null)
    expect(takeRecords('ranked')).not.toBe(null)
  })

  it('returns null for a mode that was never primed', () => {
    expect(takeRecords('world-tour')).toBe(null)
  })

  describe('staleness', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('serves records within the handoff window', () => {
      primeRecords('world-tour', [{ id: 'r1' }])
      vi.advanceTimersByTime(5_000)

      expect(takeRecords('world-tour')).not.toBe(null)
    })

    it('drops records the user only reaches much later', () => {
      // e.g. primed for Ranked at boot, but they open Ranked minutes later —
      // that data is no longer trustworthy, so refetch.
      primeRecords('ranked', [{ id: 'r1' }])
      vi.advanceTimersByTime(60_000)

      expect(takeRecords('ranked')).toBe(null)
    })
  })

  it('clears everything on demand', () => {
    primeRecords('world-tour', [{ id: 'r1' }])
    primeRecords('ranked', [{ id: 'r2' }])
    clearRecordsCache()

    expect(takeRecords('world-tour')).toBe(null)
    expect(takeRecords('ranked')).toBe(null)
  })
})
