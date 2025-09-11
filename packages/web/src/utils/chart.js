// Chart math utilities (pure)
import { dateToMs, msToDateInput } from './date'

export const MS_PER_DAY = 86400000

export function calcXDomain(seasonStart, seasonEnd, today = new Date()) {
  const startMs = dateToMs(seasonStart || today)
  const endMs = dateToMs(seasonEnd || new Date(today.getTime() + MS_PER_DAY))
  return startMs === endMs ? [startMs - MS_PER_DAY, endMs + MS_PER_DAY] : [startMs, endMs]
}

export function calcYDomain(points, goalWinPoints) {
  // Lower bound fixed at 0, upper bound is the maximum across data points and goal
  const ys = points.length ? points.map(p => p.y) : []
  if (Number.isFinite(goalWinPoints)) ys.push(goalWinPoints)
  const max = ys.length ? Math.max(0, ...ys) : 1
  const min = 0
  // Ensure non-zero height
  const upper = max === min ? 1 : max
  return [min, upper]
}

export function roundTidy(n) {
  if (!isFinite(n)) return 0
  const absn = Math.abs(n)
  if (absn === 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(absn)))
  return Math.round(n / pow) * pow
}

export function scaleXFactory(xDomain, width, padding) {
  const plotWidth = width - padding * 2
  return (dateStr) => {
    const [min, max] = xDomain
    const x = dateToMs(dateStr)
    const t = (x - min) / (max - min)
    return padding + Math.min(Math.max(t, 0), 1) * plotWidth
  }
}

export function scaleYFactory(yDomain, height, padding) {
  const plotHeight = height - padding * 2
  return (y) => {
    const [min, max] = yDomain
    return padding + (1 - (y - min) / (max - min)) * plotHeight
  }
}

export function buildPathD(pointsScaled) {
  if (pointsScaled.length < 2) return ''
  return pointsScaled.reduce((d, p, i) => d + `${i === 0 ? 'M' : ' L'}${p.x},${p.y}`, '')
}

export function buildXTicks(xDomain, width, padding, n = 4) {
  const plotWidth = width - padding * 2
  const [min, max] = xDomain
  const out = []
  for (let i = 0; i <= n; i++) {
    const ms = min + (i / n) * (max - min)
    const x = padding + (i / n) * plotWidth
    out.push({ x, label: msToDateInput(ms) })
  }
  return out
}

