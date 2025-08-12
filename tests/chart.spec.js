import { describe, it, expect } from 'vitest'
import { calcXDomain, calcYDomain, scaleXFactory, scaleYFactory, buildPathD, buildXTicks } from '@/utils/chart'

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

