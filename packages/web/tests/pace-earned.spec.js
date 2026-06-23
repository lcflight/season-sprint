import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

// Minimal in-memory localStorage for the node test env (storage.js is a guarded
// facade, so without this the persistence paths are simply no-ops).
const store = {}
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}

import { useGraphSettings } from '@/composables/useGraphSettings'
import { useChartGeometry } from '@/composables/useChartGeometry'

describe('pace "points earned" style setting', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to bars when the user has no saved preference', () => {
    const s = useGraphSettings('default-test')
    s.loadSettings()
    expect(s.paceEarnedStyle.value).toBe('bars')
  })

  it('persists a chosen style and reloads it', () => {
    const a = useGraphSettings('persist-test')
    a.paceEarnedStyle.value = 'line'
    a.saveSettings()

    const b = useGraphSettings('persist-test')
    b.loadSettings()
    expect(b.paceEarnedStyle.value).toBe('line')
  })

  it('ignores an invalid stored value and keeps the bars default', () => {
    localStorage.setItem('season-sprint:bad-test:v1', JSON.stringify({ paceEarnedStyle: 'pie' }))
    const s = useGraphSettings('bad-test')
    s.loadSettings()
    expect(s.paceEarnedStyle.value).toBe('bars')
  })
})

describe('pace "points earned" bar geometry', () => {
  function geometryFor(points, { start = '2025-01-01', end = '2025-01-31' } = {}) {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
    return useChartGeometry({
      width: 600, height: 400, padding: 40,
      paceTop: 372, paceHeight: 70, pacePadY: 6,
      today: new Date('2025-01-15T00:00:00Z'),
      mode: 'world-tour',
      goalOptions: () => [],
      seasonStart: ref(start),
      seasonEnd: ref(end),
      goalWinPoints: ref(1000),
      isSeasonValid: computed(() => true),
      points,
      sortedPoints: computed(() => sorted),
    })
  }

  it('emits one bar per earned point, uniform width, centered on the line points and zero baseline', () => {
    const g = geometryFor([{ date: '2025-01-05', y: 100 }, { date: '2025-01-10', y: 120 }])
    const bars = g.scaledPaceEarnedBars.value
    const line = g.scaledPaceEarned.value
    const zeroY = g.paceScaleY(0)

    expect(bars.length).toBe(line.length)
    expect(bars.length).toBeGreaterThan(0)
    const w = bars[0].width
    expect(w).toBeGreaterThanOrEqual(2)
    expect(w).toBeLessThanOrEqual(14)
    bars.forEach((b, i) => {
      expect(b.width).toBeCloseTo(w, 6) // uniform across bars
      expect(b.x).toBeCloseTo(line[i].x - w / 2, 6) // centered on the same x as the line point
      expect(b.y).toBeCloseTo(Math.min(line[i].y, zeroY), 6)
      expect(b.height).toBeCloseTo(Math.abs(line[i].y - zeroY), 6)
    })
  })

  it('scales bar width to the season length: longer season → narrower bars', () => {
    const pts = [{ date: '2025-01-05', y: 100 }]
    const short = geometryFor(pts, { start: '2025-01-01', end: '2025-01-09' })
      .scaledPaceEarnedBars.value[0].width
    const long = geometryFor(pts, { start: '2025-01-01', end: '2025-04-30' })
      .scaledPaceEarnedBars.value[0].width

    expect(long).toBeLessThan(short)
    expect(long).toBeGreaterThanOrEqual(2)
    expect(short).toBeLessThanOrEqual(14)
  })

  it('grows a positive daily gain upward from the zero line', () => {
    // First in-season point is a +100 gain from the World Tour baseline of 0.
    const g = geometryFor([{ date: '2025-01-05', y: 100 }, { date: '2025-01-10', y: 120 }])
    const zeroY = g.paceScaleY(0)
    const firstBar = g.scaledPaceEarnedBars.value[0]
    expect(firstBar.y).toBeLessThan(zeroY) // top of the bar is above the zero line
    expect(firstBar.height).toBeGreaterThan(0)
  })
})
