import { describe, it, expect } from 'vitest'
import { resolveSeasonGoals } from '@/utils/seasonGoals'
import WT_THRESHOLDS from '@/data/worldTourRanks.json'
import WT_BY_SEASON from '@/data/worldTourRanksBySeason.json'

const base = { bySeason: WT_BY_SEASON, fallback: WT_THRESHOLDS, fallbackNote: 'Based on World Tour wiki thresholds.' }

describe('resolveSeasonGoals', () => {
  it('uses the season 12 table for season 12', () => {
    const r = resolveSeasonGoals({ ...base, seasonKey: 'Season 12' })
    expect(r.thresholds).toEqual([
      { badge: 'Bronze 2', points: 6000 },
      { badge: 'Bronze 1', points: 8000 },
      { badge: 'Silver 4', points: 10000 },
    ])
    expect(r.note).toMatch(/partly known/)
  })

  it('keeps the original table for earlier seasons', () => {
    for (const key of ['Season 11', 'Season 3']) {
      const r = resolveSeasonGoals({ ...base, seasonKey: key })
      expect(r.thresholds).toBe(WT_THRESHOLDS)
      expect(r.note).toBe(base.fallbackNote)
    }
  })

  it('has no thresholds for the upcoming-season placeholder', () => {
    expect(resolveSeasonGoals({ ...base, seasonKey: '__upcoming__', upcoming: true }).thresholds).toEqual([])
  })

  it('falls back when no per-season tables are given', () => {
    expect(resolveSeasonGoals({ seasonKey: 'Season 12', fallback: WT_THRESHOLDS }).thresholds).toBe(WT_THRESHOLDS)
  })
})

// Rank logic walks thresholds in order, so every table must ascend.
describe('worldTourRanksBySeason.json', () => {
  for (const [season, entry] of Object.entries(WT_BY_SEASON)) {
    it(`${season} is a well-formed ascending table`, () => {
      expect(Array.isArray(entry.thresholds)).toBe(true)
      const pts = entry.thresholds.map((t) => t.points)
      expect(pts.every((p) => Number.isFinite(p) && p > 0)).toBe(true)
      expect([...pts].sort((a, b) => a - b)).toEqual(pts)
      expect(entry.thresholds.every((t) => typeof t.badge === 'string' && t.badge)).toBe(true)
    })
  }
})
