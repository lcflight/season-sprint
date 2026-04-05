const RANK_COLORS = {
  bronze:   { fill: 'rgba(205, 127, 50, 0.10)',  stroke: 'rgba(205, 127, 50, 0.30)' },
  silver:   { fill: 'rgba(192, 192, 192, 0.10)', stroke: 'rgba(192, 192, 192, 0.30)' },
  gold:     { fill: 'rgba(255, 215, 0, 0.10)',   stroke: 'rgba(255, 215, 0, 0.30)' },
  platinum: { fill: 'rgba(120, 200, 220, 0.10)', stroke: 'rgba(120, 200, 220, 0.30)' },
  diamond:  { fill: 'rgba(185, 242, 255, 0.12)', stroke: 'rgba(185, 242, 255, 0.35)' },
  emerald:  { fill: 'rgba(80, 200, 120, 0.10)',  stroke: 'rgba(80, 200, 120, 0.30)' },
  ruby:     { fill: 'rgba(224, 17, 95, 0.10)',    stroke: 'rgba(224, 17, 95, 0.30)' },
}

const FALLBACK = { fill: 'rgba(255, 255, 255, 0.06)', stroke: 'rgba(255, 255, 255, 0.15)' }

export function getRankColor(badge) {
  const tier = badge.split(' ')[0].toLowerCase()
  return RANK_COLORS[tier] || FALLBACK
}

/**
 * Groups an array of { badge, points } thresholds into merged rank bands.
 * E.g. Bronze 4/3/2/1 become one band { tier: 'Bronze', floor: 0, ceil: 100, fill, stroke }.
 */
export function buildRankBands(thresholds) {
  if (!thresholds.length) return []

  // Collect each tier's first-entry points value
  const tiers = []
  let currentTier = null
  for (const t of thresholds) {
    const tier = t.badge.split(' ')[0]
    if (tier !== currentTier) {
      tiers.push({ tier, firstPoints: t.points })
      currentTier = tier
    }
  }

  const lastPoints = thresholds[thresholds.length - 1].points
  const bands = []
  for (let i = 0; i < tiers.length; i++) {
    const floor = i === 0 ? 0 : tiers[i].firstPoints
    const ceil = i + 1 < tiers.length ? tiers[i + 1].firstPoints : lastPoints
    const colors = getRankColor(tiers[i].tier)
    bands.push({
      tier: tiers[i].tier,
      floor,
      ceil,
      fill: colors.fill,
      stroke: colors.stroke,
    })
  }
  return bands
}
