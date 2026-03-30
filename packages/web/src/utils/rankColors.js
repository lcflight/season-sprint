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
  const bands = []
  let currentTier = null
  let floor = 0

  for (let i = 0; i < thresholds.length; i++) {
    const tier = thresholds[i].badge.split(' ')[0]
    const nextTier = i + 1 < thresholds.length ? thresholds[i + 1].badge.split(' ')[0] : null

    if (currentTier === null) currentTier = tier
    if (tier !== currentTier) {
      // Previous tier ended at last threshold
      floor = thresholds[i - 1].points
      currentTier = tier
    }

    // If this is the last entry for this tier, emit a band
    if (nextTier !== tier) {
      const colors = getRankColor(thresholds[i].badge)
      bands.push({
        tier: currentTier,
        floor,
        ceil: thresholds[i].points,
        fill: colors.fill,
        stroke: colors.stroke,
      })
    }
  }
  return bands
}
