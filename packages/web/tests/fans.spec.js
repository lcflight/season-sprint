import { describe, it, expect } from 'vitest'
import { fansTotalFromReadout, fansReadoutFromTotal, fansToEnter, fansRequired } from '@/utils/fans'

describe('fans math', () => {
  it('requirement grows by 2,000 per badge', () => {
    expect(fansRequired(1)).toBe(2000)
    expect(fansRequired(24)).toBe(48000)
  })

  it('season total to enter a badge', () => {
    expect(fansToEnter(1)).toBe(0) // Bronze 4
    expect(fansToEnter(2)).toBe(2000) // Bronze 3
    expect(fansToEnter(5)).toBe(20000) // Silver 4
    expect(fansToEnter(24)).toBe(552000) // Emerald 1
  })

  it('turns the in-game "X / Y" into a season total', () => {
    expect(fansTotalFromReadout(0, 2000)).toBe(0)
    expect(fansTotalFromReadout(1250, 6000)).toBe(7250) // Bronze 2: 6,000 + 1,250
    expect(fansTotalFromReadout(2726, 8000)).toBe(14726) // Bronze 1: 12,000 + 2,726
    expect(fansTotalFromReadout(48000, 48000)).toBe(600000)
  })

  it('rejects readouts that are not a real badge', () => {
    expect(fansTotalFromReadout(100, 3000)).toBe(null) // not a multiple of 2,000
    expect(fansTotalFromReadout(100, 50000)).toBe(null) // past Emerald 1
    expect(fansTotalFromReadout(100, 0)).toBe(null)
    expect(fansTotalFromReadout(9000, 8000)).toBe(null) // X > Y
    expect(fansTotalFromReadout(-1, 2000)).toBe(null)
    expect(fansTotalFromReadout(1.5, 2000)).toBe(null)
  })

  it('round-trips through the readout', () => {
    for (const total of [0, 1999, 2000, 7250, 14726, 551999, 552000, 600000]) {
      const { inRank, required } = fansReadoutFromTotal(total)
      expect(fansTotalFromReadout(inRank, required)).toBe(total)
    }
    expect(fansReadoutFromTotal(7250)).toEqual({ inRank: 1250, required: 6000, badge: 3 })
  })
})
