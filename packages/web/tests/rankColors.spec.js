import { describe, it, expect } from 'vitest'
import { getRankColor, buildRankBands } from '@/utils/rankColors'

describe('getRankColor', () => {
  it('returns colors for known tiers', () => {
    const gold = getRankColor('Gold 3')
    expect(gold.fill).toContain('rgba')
    expect(gold.stroke).toContain('rgba')
    expect(gold.fill).toContain('255, 215, 0')
  })

  it('extracts tier name case-insensitively from badge', () => {
    const b1 = getRankColor('Bronze 4')
    const b2 = getRankColor('Bronze 1')
    expect(b1.fill).toBe(b2.fill)
    expect(b1.stroke).toBe(b2.stroke)
  })

  it('returns fallback for unknown tier', () => {
    const unknown = getRankColor('Mythic 1')
    expect(unknown.fill).toContain('255, 255, 255')
  })
})

describe('buildRankBands', () => {
  const WORLD_TOUR_SAMPLE = [
    { badge: 'Bronze 4', points: 25 },
    { badge: 'Bronze 3', points: 50 },
    { badge: 'Bronze 2', points: 75 },
    { badge: 'Bronze 1', points: 100 },
    { badge: 'Silver 4', points: 150 },
    { badge: 'Silver 3', points: 200 },
    { badge: 'Silver 2', points: 250 },
    { badge: 'Silver 1', points: 300 },
    { badge: 'Gold 4', points: 375 },
    { badge: 'Gold 3', points: 450 },
    { badge: 'Gold 2', points: 525 },
    { badge: 'Gold 1', points: 600 },
  ]

  it('returns empty array for empty input', () => {
    expect(buildRankBands([])).toEqual([])
  })

  it('groups sub-tiers into one band per major tier', () => {
    const bands = buildRankBands(WORLD_TOUR_SAMPLE)
    expect(bands).toHaveLength(3)
    expect(bands.map(b => b.tier)).toEqual(['Bronze', 'Silver', 'Gold'])
  })

  it('sets correct floor and ceil for each band', () => {
    const bands = buildRankBands(WORLD_TOUR_SAMPLE)
    // Bronze: floor 0, ceil 150 (where Silver starts)
    expect(bands[0].floor).toBe(0)
    expect(bands[0].ceil).toBe(150)
    // Silver: floor 150, ceil 375 (where Gold starts)
    expect(bands[1].floor).toBe(150)
    expect(bands[1].ceil).toBe(375)
    // Gold: floor 375, ceil 600 (last entry, no next tier)
    expect(bands[2].floor).toBe(375)
    expect(bands[2].ceil).toBe(600)
  })

  it('bands are contiguous (no gaps between them)', () => {
    const bands = buildRankBands(WORLD_TOUR_SAMPLE)
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].floor).toBe(bands[i - 1].ceil)
    }
  })

  it('each band has fill and stroke colors', () => {
    const bands = buildRankBands(WORLD_TOUR_SAMPLE)
    for (const band of bands) {
      expect(band.fill).toContain('rgba')
      expect(band.stroke).toContain('rgba')
    }
  })

  it('handles a single tier with one entry', () => {
    const bands = buildRankBands([{ badge: 'Diamond 4', points: 1150 }])
    expect(bands).toHaveLength(1)
    expect(bands[0].tier).toBe('Diamond')
    expect(bands[0].floor).toBe(0)
    expect(bands[0].ceil).toBe(1150)
  })

  it('works with ranked thresholds (starting at 0)', () => {
    const ranked = [
      { badge: 'Bronze 4', points: 0 },
      { badge: 'Bronze 3', points: 2500 },
      { badge: 'Bronze 2', points: 5000 },
      { badge: 'Bronze 1', points: 7500 },
      { badge: 'Silver 4', points: 10000 },
      { badge: 'Silver 3', points: 12500 },
      { badge: 'Silver 2', points: 15000 },
      { badge: 'Silver 1', points: 17500 },
    ]
    const bands = buildRankBands(ranked)
    expect(bands).toHaveLength(2)
    expect(bands[0]).toMatchObject({ tier: 'Bronze', floor: 0, ceil: 10000 })
    expect(bands[1]).toMatchObject({ tier: 'Silver', floor: 10000, ceil: 17500 })
  })
})
