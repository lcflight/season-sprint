import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { usePointsData } from '@/composables/usePointsData'
import { formatDate } from '@/utils/date'

// incrementWinPoints persists via getAuthorizationHeader() -> upsertRecord(),
// which otherwise falls through to an 8s wait for window.Clerk (never present
// in this test environment) before resolving unauthenticated. Short-circuit
// it so the test exercises the local optimistic-update logic under test, not
// unrelated auth-resolution timing.
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getAuthorizationHeader: async () => null }
})

// A point from a prior season shouldn't be treated as "yesterday's total" once
// a new season starts — points reset to (near) zero at season start, so
// diffing against last season's final total reads as a huge, wrong drop.
describe('usePointsData — season boundary', () => {
  const today = new Date()
  const todayStr = formatDate(today)
  const seasonStartDate = new Date(today)
  seasonStartDate.setDate(seasonStartDate.getDate() - 2)
  const seasonStartStr = formatDate(seasonStartDate)
  const lastSeasonDate = new Date(today)
  lastSeasonDate.setDate(lastSeasonDate.getDate() - 30)
  const lastSeasonStr = formatDate(lastSeasonDate)

  function setup(mode = 'world-tour') {
    const isSeasonValid = ref(true)
    const seasonStart = ref(seasonStartStr)
    const seasonEnd = ref('2099-01-01')
    const autoSetSeasonFromImport = ref(false)
    return usePointsData({ isSeasonValid, seasonStart, seasonEnd, autoSetSeasonFromImport, mode })
  }

  it('todayGain ignores a prior-season point instead of diffing against it', () => {
    const { points, todayGain } = setup('world-tour')
    points.push({ date: lastSeasonStr, y: 2400 }) // last season's final total
    points.push({ date: todayStr, y: 50 }) // fresh start this season

    // Without the fix this would be 50 - 2400 = -2350.
    expect(todayGain.value).toBe(50)
  })

  it('todayGain still diffs correctly against an in-season prior point', () => {
    const { points, todayGain } = setup('world-tour')
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    points.push({ date: lastSeasonStr, y: 2400 })
    points.push({ date: formatDate(yesterday), y: 120 })
    points.push({ date: todayStr, y: 180 })

    expect(todayGain.value).toBe(60)
  })

  it('todayGain treats a ranked placement with no in-season history as zero gain', () => {
    const { points, todayGain } = setup('ranked')
    points.push({ date: lastSeasonStr, y: 40000 }) // last season's rank score
    points.push({ date: todayStr, y: 500 }) // this season's placement match

    expect(todayGain.value).toBe(0)
  })

  it('incrementWinPoints bases off zero, not a prior-season total', async () => {
    const { points, incrementWinPoints } = setup('world-tour')
    points.push({ date: lastSeasonStr, y: 2400 })

    await incrementWinPoints(25)

    const todayEntry = points.find((p) => p.date === todayStr)
    // Without the fix this would be 2400 + 25 = 2425.
    expect(todayEntry.y).toBe(25)
  })

  it('incrementWinPoints still bases off an in-season prior point', async () => {
    const { points, incrementWinPoints } = setup('world-tour')
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    points.push({ date: lastSeasonStr, y: 2400 })
    points.push({ date: formatDate(yesterday), y: 100 })

    await incrementWinPoints(25)

    const todayEntry = points.find((p) => p.date === todayStr)
    expect(todayEntry.y).toBe(125)
  })
})
