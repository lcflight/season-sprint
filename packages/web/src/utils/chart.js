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

export function buildAveragePacePath(pointsInSeason, seasonStartMs, seasonEndMs, scaleX, scaleY) {
  if (!pointsInSeason.length) return ''

  // Convert points to (dayOffset, y) pairs, including an implicit origin (0, 0)
  const pts = [{ x: 0, y: 0 }]
  for (const p of pointsInSeason) {
    const day = (dateToMs(p.date) - seasonStartMs) / MS_PER_DAY
    pts.push({ x: day, y: p.y })
  }

  // Through-origin least-squares regression: y = slope * x
  // Anchors the line at (0, 0) = season start with 0 points.
  // slope = Σ(x·y) / Σ(x²)
  let sumXX = 0, sumXY = 0
  for (const p of pts) {
    sumXX += p.x * p.x
    sumXY += p.x * p.y
  }
  if (sumXX === 0) return ''

  const slope = sumXY / sumXX
  const totalDays = (seasonEndMs - seasonStartMs) / MS_PER_DAY
  const yAtEnd = slope * totalDays

  console.log('[avg-pace]', {
    points: pts,
    slope: slope.toFixed(2) + ' pts/day',
    yAtEnd,
    totalDays,
  })

  const startDateStr = msToDateInput(seasonStartMs)
  const endDateStr = msToDateInput(seasonEndMs)
  const x1 = scaleX(startDateStr)
  const y1 = scaleY(0)
  const x2 = scaleX(endDateStr)
  const y2 = scaleY(yAtEnd)
  return `M${x1},${y1} L${x2},${y2}`
}

export function buildDeviationWedgePath(pointsInSeason, seasonStartMs, seasonEndMs, scaleX, scaleY) {
  if (pointsInSeason.length < 2) return ''

  // Convert to (dayOffset, y) with implicit origin
  const pts = [{ x: 0, y: 0 }]
  for (const p of pointsInSeason) {
    const day = (dateToMs(p.date) - seasonStartMs) / MS_PER_DAY
    pts.push({ x: day, y: p.y })
  }

  // Through-origin regression: slope = Σ(x·y) / Σ(x²)
  let sumXX = 0, sumXY = 0
  for (const p of pts) {
    sumXX += p.x * p.x
    sumXY += p.x * p.y
  }
  if (sumXX === 0) return ''
  const slope = sumXY / sumXX

  // Standard deviation of residuals
  let sumResidualSq = 0
  for (const p of pts) {
    const residual = p.y - slope * p.x
    sumResidualSq += residual * residual
  }
  const stdDev = Math.sqrt(sumResidualSq / pts.length)

  const totalDays = (seasonEndMs - seasonStartMs) / MS_PER_DAY
  const startDateStr = msToDateInput(seasonStartMs)
  const endDateStr = msToDateInput(seasonEndMs)
  const x1 = scaleX(startDateStr)
  const x2 = scaleX(endDateStr)

  // Wedge fans out proportionally: deviation grows with distance from origin
  const yUpperEnd = slope * totalDays + stdDev
  const yLowerEnd = Math.max(0, slope * totalDays - stdDev)

  // Polygon: origin → upper end → lower end → origin → close
  const y0 = scaleY(0)
  const yU = scaleY(yUpperEnd)
  const yL = scaleY(yLowerEnd)

  return `M${x1},${y0} L${x2},${yU} L${x2},${yL} L${x1},${y0} Z`
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

