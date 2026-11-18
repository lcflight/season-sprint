import { describe, it, expect } from 'vitest'
import {
  fansTotalFromReadout,
  fansReadoutFromTotal,
  fansToEnter,
  fansRequired,
  legacyFansToEnter,
} from '@/utils/fans'

describe('fans math', () => {
  it('requirement grows by 2,000 per badge, from 4,000', () => {
    expect(fansRequired(1)).toBe(4000) // Bronze 4
    expect(fansRequired(3)).toBe(8000) // Bronze 2, as in game
    expect(fansRequired(8)).toBe(18000) // Silver 1, as in game
    expect(fansRequired(24)).toBe(50000) // Emerald 1
  })

  it('season total to enter a badge', () => {
    expect(fansToEnter(1)).toBe(0) // Bronze 4
    expect(fansToEnter(2)).toBe(4000) // Bronze 3
    expect(fansToEnter(5)).toBe(28000) // Silver 4
    expect(fansToEnter(9)).toBe(88000) // Gold 4
    expect(fansToEnter(24)).toBe(598000) // Emerald 1
  })

  it('turns the in-game "X / Y" into a season total', () => {
    expect(fansTotalFromReadout(0, 4000)).toBe(0)
    expect(fansTotalFromReadout(2726, 8000)).toBe(12726) // Bronze 2: 10,000 + 2,726
    expect(fansTotalFromReadout(3053, 18000)).toBe(73053) // Silver 1: 70,000 + 3,053
    expect(fansTotalFromReadout(50000, 50000)).toBe(648000)
  })

  it('rejects readouts that are not a real badge', () => {
    expect(fansTotalFromReadout(100, 3000)).toBe(null) // not a multiple of 2,000
    expect(fansTotalFromReadout(100, 2000)).toBe(null) // below Bronze 4
    expect(fansTotalFromReadout(100, 52000)).toBe(null) // past Emerald 1
    expect(fansTotalFromReadout(100, 0)).toBe(null)
    expect(fansTotalFromReadout(9000, 8000)).toBe(null) // X > Y
    expect(fansTotalFromReadout(-1, 4000)).toBe(null)
    expect(fansTotalFromReadout(1.5, 4000)).toBe(null)
  })

  it('round-trips through the readout', () => {
    for (const total of [0, 3999, 4000, 12726, 73053, 597999, 598000, 648000]) {
      const { inRank, required } = fansReadoutFromTotal(total)
      expect(fansTotalFromReadout(inRank, required)).toBe(total)
    }
    expect(fansReadoutFromTotal(73053)).toEqual({ inRank: 3053, required: 18000, badge: 8 })
  })

  it('keeps the first table for moving old goals', () => {
    expect(legacyFansToEnter(2)).toBe(2000)
    expect(legacyFansToEnter(24)).toBe(552000)
  })
})
