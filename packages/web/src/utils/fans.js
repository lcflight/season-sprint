// World Tour "fans" (Season 12 onward).
//
// Fans replaced World Tour points in Season 12. The game no longer shows a
// season total: the "X / Y" readout is fans earned since entering the current
// badge / fans that badge needs. Badge n (Bronze 4 = 1 … Emerald 1 = 24) needs
// 2,000·(n+1) fans (Bronze 2 = 8,000 and Silver 1 = 18,000 in game), so Y
// alone identifies the badge and the season total is
//
//   fans to enter badge n  =  2,000 · (2 + 3 + … + n)  =  1,000 · (n-1) · (n+2)
//   season total           =  that + X
//
// Everything in the app (graph, pace, goals) works on the season total.

export const FANS_STEP = 2000
export const FANS_BADGES = 24

// The smallest and largest "Y" the game shows (Bronze 4, Emerald 1).
export const FANS_MIN_REQUIRED = 2 * FANS_STEP
export const FANS_MAX_REQUIRED = (FANS_BADGES + 1) * FANS_STEP

/** Fans badge n needs to progress (n is 1-based). */
export function fansRequired(n) {
  return FANS_STEP * (n + 1)
}

/** Season-total fans at the moment you enter badge n (n is 1-based). */
export function fansToEnter(n) {
  return (FANS_STEP / 2) * (n - 1) * (n + 2)
}

/**
 * Where the first fans table (before Oct 2026's fix) put badge n: it had every
 * badge one requirement too low. Only used to move goals saved on it.
 */
export function legacyFansToEnter(n) {
  return (FANS_STEP / 2) * n * (n - 1)
}

/**
 * Season-total fans from the in-game "X / Y" readout, or null when it doesn't
 * describe a real badge (Y not a multiple of 2,000 in range, or X > Y).
 */
export function fansTotalFromReadout(inRank, required) {
  const x = Number(inRank)
  const y = Number(required)
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y <= 0) return null
  if (y % FANS_STEP !== 0) return null
  const n = y / FANS_STEP - 1
  if (n < 1 || n > FANS_BADGES || x > y) return null
  return fansToEnter(n) + x
}

/** The in-game "X / Y" readout for a season total: { inRank, required, badge }. */
export function fansReadoutFromTotal(total) {
  const t = Math.max(0, Math.floor(Number(total) || 0))
  let n = 1
  while (n < FANS_BADGES && t >= fansToEnter(n + 1)) n++
  return { inRank: t - fansToEnter(n), required: fansRequired(n), badge: n }
}
