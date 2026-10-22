// Rank thresholds can change between seasons (Season 12 rescaled World Tour),
// so a season can carry its own table. See data/worldTourRanksBySeason.json.

/**
 * Pick the rank-threshold table and header note for the season on screen.
 *
 * @param {object} opts
 * @param {Record<string, {thresholds: Array, note?: string}>} [opts.bySeason]
 *        per-season tables keyed by season name ("Season 12")
 * @param {string} opts.seasonKey  name of the season being viewed
 * @param {Array} opts.fallback    table for seasons not in bySeason
 * @param {string} [opts.fallbackNote] header note for those seasons
 * @param {boolean} [opts.upcoming] the "Upcoming season" placeholder, whose
 *        thresholds aren't known yet
 * @returns {{ thresholds: Array, note: string }}
 */
export function resolveSeasonGoals({ bySeason, seasonKey, fallback, fallbackNote = '', upcoming = false }) {
  if (upcoming) return { thresholds: [], note: fallbackNote }
  const own = (bySeason || {})[seasonKey]
  if (own && Array.isArray(own.thresholds)) {
    return { thresholds: own.thresholds, note: own.note || fallbackNote }
  }
  return { thresholds: Array.isArray(fallback) ? fallback : [], note: fallbackNote }
}
