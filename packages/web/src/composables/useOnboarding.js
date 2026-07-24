import { computed, ref } from 'vue'
import { getRecords, upsertRecord, getAuthorizationHeader } from '@/services/api'
import { formatDate } from '@/utils/date'
import { primeRecords, clearRecordsCache } from '@/services/recordsCache'
import { getClerkUserSync, isClerkEnabled } from '@/services/clerk'

// Set once onboarding is settled for a user, by any route: they saved their
// totals, they skipped, or the check found they already have records. Detection
// is server-side, so this is purely a "don't probe again" marker — without it
// every returning user would refetch their records on every load just to
// rediscover that they're not new.
//
// Scoped per user id, because browsers are shared. A single global flag would
// mean the first account to resolve onboarding silently suppresses it for every
// later account on that browser — a genuinely new user would be dropped
// straight onto a zero graph, which is the exact thing this prompt exists to
// prevent.
const RESOLVED_KEY_PREFIX = 'onboarding.resolved'

// Dev-auth mode has one fixed user, so a single bucket is correct there.
const DEV_SCOPE = 'dev'

/** Stable per-user storage scope, or null if we can't identify the user yet. */
function currentScope() {
  if (!isClerkEnabled()) return DEV_SCOPE
  return getClerkUserSync()?.id ?? null
}

function isResolvedLocally(scope) {
  // Unknown user — fail safe by probing rather than trusting someone else's flag.
  if (!scope) return false
  try {
    return localStorage.getItem(`${RESOLVED_KEY_PREFIX}.${scope}`) === '1'
  } catch {
    // Private mode / storage disabled — treat as unresolved. Worst case we
    // probe again, which is better than crashing the app shell.
    return false
  }
}

function markResolved(scope) {
  if (!scope) return
  try {
    localStorage.setItem(`${RESOLVED_KEY_PREFIX}.${scope}`, '1')
  } catch {
    // Non-fatal; see isResolvedLocally.
  }
}

// Module-level singleton (same pattern as useFlags) so the app shell and the
// header share one resolved state — the header needs it to hide the mode
// switcher while onboarding is up, and it sits outside the shell's subtree.
//
// null = not yet determined, so callers can hold the UI back instead of
// flashing the dashboard and then covering it with the prompt.
const needed = ref(null)
const isSaving = ref(false)
const saveError = ref('')

// Bumped per probe so a superseded one can't overwrite newer state.
let checkGeneration = 0

const isResolved = computed(() => needed.value !== null)

/** True only once we know the user is past onboarding and the dashboard is up. */
const isDashboardVisible = computed(() => needed.value === false)

/**
 * Decides whether to show the first-launch "enter your current totals" prompt,
 * and saves what the user enters as today's record in each mode.
 *
 * A user is considered new when they have no records at all in any of the modes
 * we'd prompt for. `modes` is passed in rather than hardcoded because Ranked is
 * behind a feature flag on web — a user without it should neither be asked for
 * a Ranked total nor kept out of the app by Ranked data they can't create.
 */
export function useOnboarding() {
  async function check(modes) {
    // The shell remounts when the signed-in account changes. Reset rather than
    // inheriting the previous user's answer, which would otherwise render the
    // dashboard for the new account while their probe is still in flight — and
    // discard any records cached for the previous account, so the dashboard
    // can't be handed someone else's data.
    const generation = ++checkGeneration
    const isCurrent = () => generation === checkGeneration
    needed.value = null
    clearRecordsCache()

    const scope = currentScope()
    if (isResolvedLocally(scope)) {
      if (isCurrent()) needed.value = false
      return
    }
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) {
        // Signed out — the auth gate handles this; nothing to onboard.
        if (isCurrent()) needed.value = false
        return
      }
      const results = await Promise.all(
        modes.map((mode) => getRecords(authHeader, mode))
      )
      // A newer probe started while we were awaiting — its account's state is
      // the truth now, so drop this result instead of overwriting it.
      if (!isCurrent()) return

      needed.value = results.every((records) => !records.length)
      // The dashboard is about to load these same records; hand them over
      // rather than making it fetch them again. Accurate whichever way the
      // check went — `save` clears the cache, since it makes them stale.
      modes.forEach((mode, i) => primeRecords(mode, results[i]))
      if (!needed.value) {
        // They already have data, so they're settled — record that locally so
        // later loads skip this probe entirely instead of re-asking the server.
        markResolved(scope)
      }
    } catch (e) {
      // Never let a failed probe block the app — fall through to the dashboard,
      // which surfaces its own load error if the API is genuinely down.
      console.warn('Failed to determine onboarding state', e)
      if (isCurrent()) needed.value = false
    }
  }

  /**
   * Persist the totals the user filled in as today's record, one per mode.
   * `values` only carries the modes they actually entered — a player who only
   * plays one mode shouldn't get a phantom 0 in the other, which would anchor
   * that mode's graph and pace at zero.
   */
  async function save(values) {
    isSaving.value = true
    saveError.value = ''
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) throw new Error('Not signed in')
      const today = formatDate(new Date())
      for (const [mode, winPoints] of Object.entries(values)) {
        await upsertRecord(today, Number(winPoints), authHeader, mode)
      }
      // We just wrote records, so anything the check cached is now stale — the
      // dashboard must fetch fresh or it would render the pre-save empty state.
      clearRecordsCache()
      markResolved(currentScope())
      needed.value = false
      return true
    } catch (e) {
      console.error('Failed to save starting totals', e)
      saveError.value = 'Could not save. Please try again.'
      return false
    } finally {
      isSaving.value = false
    }
  }

  function skip() {
    // Nothing was written, so whatever the check cached is still accurate and
    // the dashboard can use it.
    markResolved(currentScope())
    needed.value = false
  }

  return {
    needed,
    isResolved,
    isDashboardVisible,
    isSaving,
    saveError,
    check,
    save,
    skip,
  }
}

/** Test-only: clear the module singleton so specs don't leak state into each other. */
export function resetOnboardingStateForTests() {
  needed.value = null
  isSaving.value = false
  saveError.value = ''
}
