import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useChartGeometry } from '@/composables/useChartGeometry'
import { dateToMs } from '@/utils/date'

// "Compare to a previous season" overlay: worked for World Tour but silently
// drew nothing for Ranked whenever the overlay season had only one logged
// point (buildPathD needs >=2 points, and ranked never stitched a lead-in).
function makeGeometry({ mode, points, seasonStart, seasonEnd, overlayStart, overlayEnd }) {
  const sortedPoints = computed(() =>
    [...points].sort((a, b) => dateToMs(a.date) - dateToMs(b.date))
  )
  return useChartGeometry({
    width: 600,
    height: 400,
    padding: 20,
    paceTop: 420,
    paceHeight: 70,
    pacePadY: 6,
    today: new Date('2026-08-01'),
    mode,
    goalOptions: () => [],
    seasonStart: ref(seasonStart),
    seasonEnd: ref(seasonEnd),
    goalWinPoints: ref(1000),
    isSeasonValid: ref(true),
    points,
    sortedPoints,
    overlayStart: ref(overlayStart),
    overlayEnd: ref(overlayEnd),
  })
}

// buildPathD emits "M{x},{y} L{x},{y}...". Pull out the leading M's y value.
function firstPathY(pathD) {
  const match = pathD.match(/^M[\d.-]+,([\d.-]+)/)
  return match ? Number(match[1]) : null
}

describe('overlay line rendering', () => {
  it('draws a ranked overlay line from a single logged point in the overlay season', () => {
    const points = [
      // Live season (world-tour dates reused as a generic season window)
      { date: '2026-07-05', y: 8000 },
      { date: '2026-07-10', y: 12000 },
      // Overlay season -- exactly one point, several days after its season start
      { date: '2026-04-06', y: 5000 },
    ]
    const geometry = makeGeometry({
      mode: 'ranked',
      points,
      seasonStart: '2026-07-01',
      seasonEnd: '2026-09-01',
      overlayStart: '2026-04-01',
      overlayEnd: '2026-06-01',
    })

    // Before the fix this was '' -- a single overlay point with no stitched
    // lead-in never met buildPathD's 2-point minimum.
    expect(geometry.overlayPathD.value).not.toBe('')
  })

  it('still draws a world-tour overlay line the same way (zero baseline)', () => {
    const points = [
      { date: '2026-07-05', y: 500 },
      { date: '2026-04-06', y: 300 },
    ]
    const geometry = makeGeometry({
      mode: 'world-tour',
      points,
      seasonStart: '2026-07-01',
      seasonEnd: '2026-09-01',
      overlayStart: '2026-04-01',
      overlayEnd: '2026-06-01',
    })

    expect(geometry.overlayPathD.value).not.toBe('')
    // World Tour's stitched lead-in is a zero baseline, not the point's own value.
    expect(firstPathY(geometry.overlayPathD.value)).toBe(geometry.scaleY(0))
  })

  it('ranked overlay lead-in uses the overlay point value, not zero', () => {
    const points = [
      { date: '2026-07-05', y: 8000 },
      { date: '2026-04-06', y: 5000 },
    ]
    const geometry = makeGeometry({
      mode: 'ranked',
      points,
      seasonStart: '2026-07-01',
      seasonEnd: '2026-09-01',
      overlayStart: '2026-04-01',
      overlayEnd: '2026-06-01',
    })

    expect(firstPathY(geometry.overlayPathD.value)).toBe(geometry.scaleY(5000))
  })
})
