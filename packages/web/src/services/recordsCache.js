// Records fetched by the onboarding check, handed to the dashboard so its first
// load doesn't refetch what we pulled moments earlier. Entries are single-use
// and short-lived: this exists to bridge one app-boot handoff, not to be a
// general cache. Anything that misses simply fetches as normal.

const entries = new Map()

// Long enough to cover the gap between the check resolving and the dashboard
// mounting; short enough that a mode the user opens later still refetches.
const MAX_AGE_MS = 30_000

export function primeRecords(mode, records) {
  entries.set(mode, { records, at: Date.now() })
}

/** Returns the cached records for `mode` and drops them, or null if absent/stale. */
export function takeRecords(mode) {
  const entry = entries.get(mode)
  if (!entry) return null
  entries.delete(mode)
  if (Date.now() - entry.at > MAX_AGE_MS) return null
  return entry.records
}

export function clearRecordsCache() {
  entries.clear()
}
