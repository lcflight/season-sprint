// Ranked reads are placed next to the last saved ranked score (the "anchor",
// see rankedTotal in screenReader.js). Only this season's records count.

/** Start (ms) of the season running at nowMs: the latest start not after it. */
export function currentSeasonStart(seasons, nowMs) {
  let best = null
  for (const s of seasons || []) {
    const t = new Date(s.start).getTime()
    if (!isNaN(t) && t <= nowMs && (best === null || t > best)) best = t
  }
  return best
}

/**
 * The latest saved ranked score if it's from this season (records come newest
 * first), else null: last season's score is no guide after a reset.
 */
export function rankedAnchorFrom(records, seasonStartMs) {
  const latest = Array.isArray(records) && records.length ? records[0] : null
  if (!latest) return null
  if (seasonStartMs !== null && new Date(latest.date).getTime() < seasonStartMs) return null
  return latest.winPoints
}
