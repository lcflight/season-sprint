import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import vectors from '@/data/domainVectors.json'
import thresholds from '@/data/worldTourRanks.json'
import { useRankInfo } from '@/composables/useRankInfo'
import { requiredPerDayFromBaseline, MS_PER_DAY } from '@/utils/chart'

/**
 * Golden-vector guard for the World Tour *math* (the computed logic), extending
 * the data-table parity check in rank-parity.spec.js. The rank and pace formulas
 * are hand-ported into JS, Swift, and Kotlin; these vectors pin the expected
 * outputs so the three implementations can't silently disagree on a result.
 *
 * This file enforces the JS implementation in CI. The same vectors are consumed
 * by the Android JUnit suite via a copy under app/src/test/resources/ — the last
 * test here asserts that copy is identical, so the canonical contract and the
 * Android-side copy cannot drift apart (CI only runs web/server, not native).
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

describe('rank math golden vectors (web useRankInfo)', () => {
  it('has vectors to check', () => {
    expect(vectors.rank.length).toBeGreaterThan(0)
  })

  for (const v of vectors.rank) {
    it(`points=${v.points} → ${v.badge}`, () => {
      const { rankInfo, toNext, progressPct } = useRankInfo(ref(v.points), ref(thresholds))
      expect(rankInfo.value.badge).toBe(v.badge)
      expect(rankInfo.value.currentFloor).toBe(v.currentFloor)
      expect(rankInfo.value.nextTarget).toBe(v.nextTarget)
      expect(rankInfo.value.nextBadge).toBe(v.nextBadge)
      expect(toNext.value).toBe(v.toNext)
      // web reports 0..100; the canonical fraction is 0..1
      expect(progressPct.value / 100).toBeCloseTo(v.progressFraction, 6)
    })
  }
})

describe('required-per-day math golden vectors (web chart.js)', () => {
  it('has vectors to check', () => {
    expect(vectors.requiredPerDay.length).toBeGreaterThan(0)
  })

  for (const v of vectors.requiredPerDay) {
    it(`goal=${v.goal} baseline=${v.baselineY} over ${v.days}d → ${v.expected}/day`, () => {
      const endMs = v.days * MS_PER_DAY // baselineMs = 0
      expect(requiredPerDayFromBaseline(v.goal, v.baselineY, 0, endMs)).toBeCloseTo(
        v.expected,
        6
      )
    })
  }
})

describe('Android golden-vector copy stays in sync with the canonical source', () => {
  it('app/src/test/resources/domainVectors.json is identical to the canonical vectors', () => {
    const androidCopy = JSON.parse(
      readFileSync(
        resolve(repoRoot, 'packages/android/app/src/test/resources/domainVectors.json'),
        'utf8'
      )
    )
    expect(androidCopy).toEqual(vectors)
  })
})
