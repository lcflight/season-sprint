import { describe, it, expect } from 'vitest'
import { resolveSeasonGoals, seasonNumber } from '@/utils/seasonGoals'
import { fansToEnter, fansRequired, FANS_BADGES } from '@/utils/fans'
import WT_THRESHOLDS from '@/data/worldTourRanks.json'
import WT_BY_SEASON from '@/data/worldTourRanksBySeason.json'

const base = { bySeason: WT_BY_SEASON, fallback: WT_THRESHOLDS, fallbackNote: 'Based on World Tour wiki thresholds.' }

describe('seasonNumber', () => {
  it('reads the trailing number', () => {
    expect(seasonNumber('Season 12')).toBe(12)
    expect(seasonNumber('Season 0')).toBe(0)
    expect(seasonNumber('__upcoming__')).toBe(null)
    expect(seasonNumber('')).toBe(null)
  })
})

describe('resolveSeasonGoals', () => {
  it('uses the fans table for season 12', () => {
    const r = resolveSeasonGoals({ ...base, seasonKey: 'Season 12' })
    const byBadge = Object.fromEntries(r.thresholds.map((t) => [t.badge, t.points]))
    expect(r.thresholds).toHaveLength(24)
    expect(byBadge['Bronze 4']).toBe(0)
    expect(byBadge['Bronze 3']).toBe(2000)
    expect(byBadge['Silver 4']).toBe(20000)
    expect(byBadge['Platinum 4']).toBe(156000)
    expect(byBadge['Emerald 1']).toBe(552000)
    expect(r.fans).toBe(true)
    expect(r.unit).toBe('fans')
    expect(r.yAxisLabel).toBe('Total Fans')
  })

  it('keeps using the fans table for later seasons', () => {
    for (const key of ['Season 13', 'Season 20']) {
      const r = resolveSeasonGoals({ ...base, seasonKey: key })
      expect(r.thresholds).toBe(WT_BY_SEASON['Season 12'].thresholds)
      expect(r.fans).toBe(true)
    }
  })

  // The wiki names Season 12 "PRIME TIME": only Seasons 0–11 are old-style.
  it('uses the newest table for seasons named without a number', () => {
    const r = resolveSeasonGoals({ ...base, seasonKey: 'PRIME TIME' })
    expect(r.thresholds).toBe(WT_BY_SEASON['Season 12'].thresholds)
    expect(r.fans).toBe(true)
  })

  it('keeps the original table and units for earlier seasons', () => {
    for (const key of ['Season 11', 'Season 3', 'Season 0']) {
      const r = resolveSeasonGoals({ ...base, seasonKey: key })
      expect(r.thresholds).toBe(WT_THRESHOLDS)
      expect(r.note).toBe(base.fallbackNote)
      expect(r.fans).toBe(false)
      expect(r.unit).toBe(null)
    }
  })

  it('has no thresholds for the upcoming-season placeholder, but the newest units', () => {
    const r = resolveSeasonGoals({ ...base, seasonKey: '__upcoming__', upcoming: true })
    expect(r.thresholds).toEqual([])
    expect(r.fans).toBe(true)
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
      expect(pts.every((p) => Number.isFinite(p) && p >= 0)).toBe(true)
      for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThan(pts[i - 1])
      expect(entry.thresholds.every((t) => typeof t.badge === 'string' && t.badge)).toBe(true)
    })
  }

  it('the Season 12 table is the fans formula (badge n needs 2,000·n)', () => {
    const t = WT_BY_SEASON['Season 12'].thresholds
    expect(t).toHaveLength(FANS_BADGES)
    t.forEach((row, i) => {
      expect(row.points).toBe(fansToEnter(i + 1))
      if (i + 1 < t.length) expect(t[i + 1].points - row.points).toBe(fansRequired(i + 1))
    })
    // Completing Emerald 1 is 600,000 fans in total.
    expect(t[t.length - 1].points + fansRequired(FANS_BADGES)).toBe(600000)
  })

  it('keeps the same badges, in order, as the original table', () => {
    expect(WT_BY_SEASON['Season 12'].thresholds.map((t) => t.badge)).toEqual(WT_THRESHOLDS.map((t) => t.badge))
  })
})
