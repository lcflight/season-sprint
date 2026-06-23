import { describe, it, expect } from 'vitest'
import { mapOverlayByDayOfSeason, seasonsWithDataKeys } from '@/utils/chart'
import { dateToMs } from '@/utils/date'

// Two seasons on different calendar dates. The overlay should be re-mapped so
// "day N of season" lines up regardless of the real dates.
const prevStart = dateToMs('2025-01-01')
const viewedStart = dateToMs('2026-03-01')
const viewedEnd = dateToMs('2026-03-31')

describe('mapOverlayByDayOfSeason', () => {
  it('aligns day 0 of both seasons', () => {
    const overlay = [{ date: '2025-01-01', y: 100 }]
    const out = mapOverlayByDayOfSeason(overlay, prevStart, viewedStart, viewedEnd)
    expect(out).toHaveLength(1)
    // Day 0 of the previous season maps to day 0 (start) of the viewed season.
    expect(out[0].date).toBe('2026-03-01')
    expect(out[0].y).toBe(100)
  })

  it('preserves elapsed-day offset, not the calendar date', () => {
    // 11 days into the previous season -> 11 days into the viewed season.
    const overlay = [{ date: '2025-01-12', y: 250 }]
    const out = mapOverlayByDayOfSeason(overlay, prevStart, viewedStart, viewedEnd)
    expect(out[0].date).toBe('2026-03-12')
    expect(out[0].y).toBe(250)
  })

  it('drops points that fall past the viewed season end', () => {
    // The previous season was longer; a point on its day 40 has no day 40 in a
    // 30-day viewed window, so it is dropped rather than clamped to the edge.
    const overlay = [
      { date: '2025-01-15', y: 1 }, // day 14 -> in range
      { date: '2025-02-15', y: 2 }, // day 45 -> past viewed end
    ]
    const out = mapOverlayByDayOfSeason(overlay, prevStart, viewedStart, viewedEnd)
    expect(out.map((p) => p.y)).toEqual([1])
  })

  it('returns nothing when anchors are invalid', () => {
    expect(mapOverlayByDayOfSeason([{ date: '2025-01-01', y: 1 }], NaN, viewedStart, viewedEnd)).toEqual([])
    expect(mapOverlayByDayOfSeason([{ date: '2025-01-01', y: 1 }], prevStart, NaN, viewedEnd)).toEqual([])
  })

  it('skips points with unparseable dates', () => {
    const overlay = [
      { date: 'not-a-date', y: 9 },
      { date: '2025-01-05', y: 7 },
    ]
    const out = mapOverlayByDayOfSeason(overlay, prevStart, viewedStart, viewedEnd)
    expect(out.map((p) => p.y)).toEqual([7])
  })
})

describe('seasonsWithDataKeys', () => {
  const seasons = [
    { key: 'S1', startMs: dateToMs('2025-01-01'), endMs: dateToMs('2025-01-31') },
    { key: 'S2', startMs: dateToMs('2025-02-01'), endMs: dateToMs('2025-02-28') },
    { key: 'S3', startMs: dateToMs('2025-03-01'), endMs: dateToMs('2025-03-31') },
  ]

  it('returns only seasons containing at least one point', () => {
    const points = [
      { date: '2025-01-10', y: 5 }, // S1
      { date: '2025-03-15', y: 9 }, // S3
    ]
    const keys = seasonsWithDataKeys(points, seasons)
    expect([...keys].sort()).toEqual(['S1', 'S3'])
  })

  it('is inclusive of season boundaries', () => {
    const keys = seasonsWithDataKeys([{ date: '2025-01-31', y: 1 }], seasons)
    expect(keys.has('S1')).toBe(true)
  })

  it('returns an empty set when there are no points', () => {
    expect(seasonsWithDataKeys([], seasons).size).toBe(0)
  })

  it('ignores points outside every season window', () => {
    const keys = seasonsWithDataKeys([{ date: '2024-12-15', y: 1 }], seasons)
    expect(keys.size).toBe(0)
  })
})
