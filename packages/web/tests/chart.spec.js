import { describe, it, expect } from 'vitest'
import { calcXDomain, calcYDomain, scaleXFactory, scaleYFactory, buildPathD, buildXTicks, buildAveragePacePath, buildDeviationWedgePath, buildPointsEarnedData, buildRequiredPaceData } from '@/utils/chart'
import { dateToMs } from '@/utils/date'

const width = 600
const height = 360
const padding = 40

describe('chart utils', () => {
  it('calculates domains', () => {
    const today = '2025-01-01'
    const end = '2025-01-31'
    const xDomain = calcXDomain(today, end, new Date(2025,0,1))
    expect(xDomain[1] - xDomain[0]).toBeGreaterThan(0)

    const yDomain = calcYDomain([{ y: 1 }, { y: 5 }], 10)
    expect(yDomain[1]).toBeGreaterThan(yDomain[0])
  })

  it('scales points and builds path', () => {
    const xDomain = calcXDomain('2025-01-01', '2025-01-03', new Date(2025,0,1))
    const yDomain = [0, 10]
    const sx = scaleXFactory(xDomain, width, padding)
    const sy = scaleYFactory(yDomain, height, padding)
    const pts = [
      { x: sx('2025-01-01'), y: sy(0) },
      { x: sx('2025-01-02'), y: sy(5) },
      { x: sx('2025-01-03'), y: sy(10) },
    ]
    const d = buildPathD(pts)
    expect(d.startsWith('M')).toBe(true)
  })

  it('builds ticks', () => {
    const xDomain = calcXDomain('2025-01-01', '2025-01-05', new Date(2025,0,1))
    const ticks = buildXTicks(xDomain, width, padding, 4)
    expect(ticks.length).toBe(5)
  })
})

describe('buildAveragePacePath', () => {
  const seasonStart = '2025-01-01'
  const seasonEnd = '2025-01-11'
  const seasonStartMs = dateToMs(seasonStart)
  const seasonEndMs = dateToMs(seasonEnd)
  const xDomain = calcXDomain(seasonStart, seasonEnd, new Date(2025, 0, 1))
  const scaleX = scaleXFactory(xDomain, width, padding)
  const scaleY = scaleYFactory([0, 100], height, padding)

  it('returns empty string when no in-season points exist', () => {
    const result = buildAveragePacePath([], seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toBe('')
  })

  it('returns valid SVG path string', () => {
    const points = [
      { date: '2025-01-03', y: 20 },
      { date: '2025-01-06', y: 50 },
    ]
    const result = buildAveragePacePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/)
  })

  it('computes best-fit line through origin and points', () => {
    // Points perfectly on y = 10x line (day 0 = season start)
    // (0,0) origin, (2,20), (5,50) → perfect fit, slope = 10
    // At day 10 (season end): y = 100
    const points = [
      { date: '2025-01-03', y: 20 }, // day 2
      { date: '2025-01-06', y: 50 }, // day 5
    ]
    const result = buildAveragePacePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    const x1 = scaleX(seasonStart)
    const y1 = scaleY(0)
    expect(result).toContain(`M${x1},${y1}`)

    const x2 = scaleX(seasonEnd)
    const y2 = scaleY(100)
    expect(result).toContain(`L${x2},${y2}`)
  })

  it('weights toward steep early growth even with a plateau', () => {
    // Fast growth days 1-3 (10 pts/day), then plateau at day 8
    // Points: (0,0), (1,10), (2,20), (3,30), (8,35)
    // Regression slope should be pulled toward the cluster of steep points,
    // producing a higher projection than simple endpoint average (35/8 = 4.375)
    const points = [
      { date: '2025-01-02', y: 10 },
      { date: '2025-01-03', y: 20 },
      { date: '2025-01-04', y: 30 },
      { date: '2025-01-09', y: 35 },
    ]
    const result = buildAveragePacePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    // Simple average would give 35/8*10 = 43.75 at season end
    // Regression should give a higher value due to steep early cluster
    const simpleProjected = (35 / 8) * 10
    // Extract projected y from the path
    const match = result.match(/L[\d.]+,([\d.]+)$/)
    const projectedY = parseFloat(match[1])
    // scaleY inverts: lower pixel = higher value
    const simpleY = scaleY(simpleProjected)
    expect(projectedY).toBeLessThan(simpleY) // less pixels = higher points
  })

  it('always starts at y=0 at season start even with non-zero intercept data', () => {
    // Points that would produce a non-zero intercept in full regression:
    // (1, 50), (2, 60) — intercept would be ~40 with full regression
    // With through-origin regression, line must start at (seasonStart, 0)
    const points = [
      { date: '2025-01-02', y: 50 },
      { date: '2025-01-03', y: 60 },
    ]
    const result = buildAveragePacePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    const x1 = scaleX(seasonStart)
    const y1 = scaleY(0)
    expect(result).toContain(`M${x1},${y1}`)
  })

  it('with a single point, slope equals point_y / days_from_start', () => {
    // Only point: day 5 = 50 pts. With origin (0,0), best-fit through
    // two points is slope = 50/5 = 10. At day 10: y = 100
    const points = [{ date: '2025-01-06', y: 50 }]
    const result = buildAveragePacePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    const x2 = scaleX(seasonEnd)
    const y2 = scaleY(100)
    expect(result).toContain(`L${x2},${y2}`)
  })
})

describe('buildDeviationWedgePath', () => {
  const seasonStart = '2025-01-01'
  const seasonEnd = '2025-01-11'
  const seasonStartMs = dateToMs(seasonStart)
  const seasonEndMs = dateToMs(seasonEnd)
  const xDomain = calcXDomain(seasonStart, seasonEnd, new Date(2025, 0, 1))
  const scaleX = scaleXFactory(xDomain, width, padding)
  const scaleY = scaleYFactory([0, 200], height, padding)

  it('returns empty string with 0 points', () => {
    const result = buildDeviationWedgePath([], seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toBe('')
  })

  it('returns empty string with only 1 point (need variance)', () => {
    const points = [{ date: '2025-01-06', y: 50 }]
    const result = buildDeviationWedgePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toBe('')
  })

  it('returns valid SVG polygon path (closed with Z)', () => {
    const points = [
      { date: '2025-01-03', y: 30 },
      { date: '2025-01-06', y: 40 },
      { date: '2025-01-09', y: 90 },
    ]
    const result = buildDeviationWedgePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toMatch(/^M[\d.]+,[\d.]+.*Z$/)
  })

  it('wedge starts at origin (both edges meet at season start y=0)', () => {
    const points = [
      { date: '2025-01-03', y: 30 },
      { date: '2025-01-06', y: 40 },
      { date: '2025-01-09', y: 90 },
    ]
    const result = buildDeviationWedgePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    const x1 = scaleX(seasonStart)
    const y1 = scaleY(0)
    // Path starts at origin
    expect(result).toMatch(new RegExp(`^M${x1},${y1}`))
    // Path returns to origin before closing
    expect(result).toContain(`L${x1},${y1}`)
  })

  it('with perfectly linear data and few points, wedge still has width (low confidence)', () => {
    // Even with zero residuals, few points means low confidence →
    // minimum deviation floor keeps the band open
    const points = [
      { date: '2025-01-03', y: 20 }, // day 2
      { date: '2025-01-06', y: 50 }, // day 5
      { date: '2025-01-11', y: 100 }, // day 10
    ]
    const result = buildDeviationWedgePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)
    expect(result).toMatch(/^M[\d.]+,[\d.]+.*Z$/)

    // Upper and lower at season end should differ (band is open)
    const x2 = scaleX(seasonEnd)
    const endMatches = result.match(new RegExp(`${x2.toFixed(0)}[\\d.]*,([\\d.]+)`, 'g')) ?? []
    expect(endMatches.length).toBeGreaterThanOrEqual(2)
    const yVals = endMatches.map(m => parseFloat(m.split(',')[1]))
    expect(Math.abs(yVals[0] - yVals[1])).toBeGreaterThan(0)
  })

  it('lower bound never goes below 0', () => {
    const points = [
      { date: '2025-01-02', y: 50 },
      { date: '2025-01-06', y: 5 },
      { date: '2025-01-10', y: 80 },
    ]
    const result = buildDeviationWedgePath(points, seasonStartMs, seasonEndMs, scaleX, scaleY)

    // scaleY(0) is the max pixel y (bottom of chart). No point should exceed it.
    const maxPixelY = scaleY(0)
    const coords = result.match(/[\d.]+,[\d.]+/g)
    for (const coord of coords) {
      const pixelY = parseFloat(coord.split(',')[1])
      expect(pixelY).toBeLessThanOrEqual(maxPixelY + 0.01)
    }
  })
})

describe('buildPointsEarnedData', () => {
  it('returns empty array for empty input', () => {
    expect(buildPointsEarnedData([])).toEqual([])
  })

  it('single point has delta from implicit 0', () => {
    const points = [{ date: '2025-01-05', y: 30 }]
    const result = buildPointsEarnedData(points)
    expect(result).toEqual([{ date: '2025-01-05', y: 30 }])
  })

  it('computes deltas for multiple ascending points', () => {
    const points = [
      { date: '2025-01-01', y: 10 },
      { date: '2025-01-03', y: 25 },
      { date: '2025-01-05', y: 50 },
    ]
    const result = buildPointsEarnedData(points)
    expect(result).toEqual([
      { date: '2025-01-01', y: 10 },
      { date: '2025-01-03', y: 15 },
      { date: '2025-01-05', y: 25 },
    ])
  })

  it('handles flat segments (zero delta)', () => {
    const points = [
      { date: '2025-01-01', y: 10 },
      { date: '2025-01-02', y: 10 },
    ]
    const result = buildPointsEarnedData(points)
    expect(result).toEqual([
      { date: '2025-01-01', y: 10 },
      { date: '2025-01-02', y: 0 },
    ])
  })

  it('handles decrease (negative delta)', () => {
    const points = [
      { date: '2025-01-01', y: 50 },
      { date: '2025-01-02', y: 40 },
    ]
    const result = buildPointsEarnedData(points)
    expect(result).toEqual([
      { date: '2025-01-01', y: 50 },
      { date: '2025-01-02', y: -10 },
    ])
  })
})

describe('buildRequiredPaceData', () => {
  // Season: 2025-01-01 to 2025-04-11 (100 days)
  const seasonEnd = '2025-04-11'
  const seasonEndMs = dateToMs(seasonEnd)

  it('returns empty array for empty input', () => {
    expect(buildRequiredPaceData([], 1000, seasonEndMs)).toEqual([])
  })

  it('matches the example: 100 days left, cumulative=10, goal=1000 => 9.9', () => {
    // 2025-01-01 is 100 days before 2025-04-11
    const points = [{ date: '2025-01-01', y: 10 }]
    const result = buildRequiredPaceData(points, 1000, seasonEndMs)
    expect(result.length).toBe(1)
    expect(result[0].date).toBe('2025-01-01')
    expect(result[0].y).toBeCloseTo(9.9, 1)
  })

  it('required pace decreases as player catches up', () => {
    const points = [
      { date: '2025-01-01', y: 10 },   // 100 days left, need 990 => 9.9/day
      { date: '2025-01-11', y: 200 },  // 90 days left, need 800 => ~8.89/day
    ]
    const result = buildRequiredPaceData(points, 1000, seasonEndMs)
    expect(result.length).toBe(2)
    expect(result[1].y).toBeLessThan(result[0].y)
  })

  it('excludes points at or past season end (daysRemaining <= 0)', () => {
    const points = [
      { date: '2025-01-01', y: 10 },
      { date: '2025-04-11', y: 500 },  // exactly season end
    ]
    const result = buildRequiredPaceData(points, 1000, seasonEndMs)
    expect(result.length).toBe(1)
    expect(result[0].date).toBe('2025-01-01')
  })

  it('returns negative pace when goal is already exceeded', () => {
    const points = [{ date: '2025-01-01', y: 1500 }]
    const result = buildRequiredPaceData(points, 1000, seasonEndMs)
    expect(result.length).toBe(1)
    expect(result[0].y).toBeLessThan(0)
  })
})

