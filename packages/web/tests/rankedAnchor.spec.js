import { describe, it, expect } from 'vitest'
import { currentSeasonStart, rankedAnchorFrom } from '@/tracker/rankedAnchor'

const seasons = [
  { name: 'Season 11', start: '2026-07-09T00:00:00.000Z', end: '2026-10-20T00:00:00.000Z' },
  { name: 'PRIME TIME', start: '2026-10-20T00:00:00.000Z', end: '2027-02-04T00:00:00.000Z' },
]
const at = (iso) => new Date(iso).getTime()

describe('currentSeasonStart', () => {
  it('is the latest season start not after now', () => {
    expect(currentSeasonStart(seasons, at('2026-10-25T12:00:00Z'))).toBe(at('2026-10-20T00:00:00Z'))
    expect(currentSeasonStart(seasons, at('2026-09-01T00:00:00Z'))).toBe(at('2026-07-09T00:00:00Z'))
  })

  it('is null without seasons', () => {
    expect(currentSeasonStart(null, Date.now())).toBe(null)
    expect(currentSeasonStart([], Date.now())).toBe(null)
  })
})

describe('rankedAnchorFrom', () => {
  const start = at('2026-10-20T00:00:00Z')

  it('uses the newest record from this season', () => {
    const records = [
      { date: '2026-10-22T00:00:00.000Z', winPoints: 25189 },
      { date: '2026-10-09T00:00:00.000Z', winPoints: 27012 },
    ]
    expect(rankedAnchorFrom(records, start)).toBe(25189)
  })

  it('ignores last season (a record on the first day counts)', () => {
    expect(rankedAnchorFrom([{ date: '2026-10-09T00:00:00.000Z', winPoints: 27012 }], start)).toBe(null)
    expect(rankedAnchorFrom([{ date: '2026-10-20T00:00:00.000Z', winPoints: 100 }], start)).toBe(100)
  })

  it('without season dates, uses the newest record', () => {
    expect(rankedAnchorFrom([{ date: '2026-10-09T00:00:00.000Z', winPoints: 27012 }], null)).toBe(27012)
  })

  it('is null with no records', () => {
    expect(rankedAnchorFrom([], start)).toBe(null)
    expect(rankedAnchorFrom(null, start)).toBe(null)
  })
})
