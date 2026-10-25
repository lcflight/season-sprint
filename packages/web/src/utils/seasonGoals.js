// Rank thresholds can change between seasons (Season 12 replaced World Tour
// points with fans), so a season can carry its own table. See
// data/worldTourRanksBySeason.json.
//
// An entry applies from its season onward: "Season 12" covers Season 12, 13,
// … until a later entry takes over. Seasons before the first entry use the
// fallback table. A season whose name has no number (the wiki calls Season 12
// "PRIME TIME") is treated as current-era and gets the newest entry, so only
// the old numbered seasons fall back.

/** "Season 12" -> 12; null for names without a number. */
export function seasonNumber(name) {
  const m = String(name || '').match(/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

/** The entry for the highest-numbered season, or null. */
function latestEntry(bySeason) {
  const entries = Object.entries(bySeason || {})
  return entries.length
    ? entries.reduce((a, b) => ((seasonNumber(b[0]) ?? -1) > (seasonNumber(a[0]) ?? -1) ? b : a))[1]
    : null
}

/** The bySeason entry in force for a season, or null. */
function entryFor(bySeason, seasonKey) {
  const own = (bySeason || {})[seasonKey]
  if (own) return own
  const n = seasonNumber(seasonKey)
  if (n === null) return latestEntry(bySeason)
  let best = null
  let bestN = -Infinity
  for (const [key, entry] of Object.entries(bySeason || {})) {
    const k = seasonNumber(key)
    if (k !== null && k <= n && k > bestN) {
      best = entry
      bestN = k
    }
  }
  return best
}

/**
 * Pick the rank-threshold table, header note and units for the season on screen.
 *
 * @param {object} opts
 * @param {Record<string, {thresholds: Array, note?: string, unit?: string, yAxisLabel?: string, fans?: boolean}>} [opts.bySeason]
 *        per-season tables keyed by the first season they apply to ("Season 12")
 * @param {string} opts.seasonKey  name of the season being viewed
 * @param {Array} opts.fallback    table for seasons before every bySeason entry
 * @param {string} [opts.fallbackNote] header note for those seasons
 * @param {boolean} [opts.upcoming] the "Upcoming season" placeholder: no
 *        thresholds, but the latest entry's units (it's a newer season)
 * @returns {{ thresholds: Array, note: string, unit: string|null, yAxisLabel: string|null, fans: boolean }}
 */
export function resolveSeasonGoals({ bySeason, seasonKey, fallback, fallbackNote = '', upcoming = false }) {
  const own = upcoming ? latestEntry(bySeason) : entryFor(bySeason, seasonKey)
  const units = {
    unit: own?.unit || null,
    yAxisLabel: own?.yAxisLabel || null,
    fans: !!own?.fans,
  }
  if (upcoming) return { thresholds: [], note: fallbackNote, ...units }
  if (own && Array.isArray(own.thresholds)) {
    return { thresholds: own.thresholds, note: own.note || fallbackNote, ...units }
  }
  return { thresholds: Array.isArray(fallback) ? fallback : [], note: fallbackNote, ...units }
}
