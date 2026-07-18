import { computed, ref } from 'vue'
import { getRecords, upsertRecord, getAuthorizationHeader } from '@/services/api'
import { formatDate } from '@/utils/date'
import { primeRecords, clearRecordsCache } from '@/services/recordsCache'

// Set once onboarding is settled for this user, by any route: they saved their
// totals, they skipped, or the check found they already have records. Detection
// is server-side, so this is purely a "don't probe again" marker — without it
// every returning user would refetch their records on every load just to
// rediscover that they're not new.
const RESOLVED_KEY = 'onboarding.resolved'

function isResolvedLocally() {
  try {
    return localStorage.getItem(RESOLVED_KEY) === '1'
  } catch {
    // Private mode / storage disabled — treat as unresolved. Worst case we
    // probe again, which is better than crashing the app shell.
    return false
  }
}

function markResolved() {
  try {
    localStorage.setItem(RESOLVED_KEY, '1')
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
    if (isResolvedLocally()) {
      needed.value = false
      return
    }
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) {
        // Signed out — the auth gate handles this; nothing to onboard.
        needed.value = false
        return
      }
      const results = await Promise.all(
        modes.map((mode) => getRecords(authHeader, mode))
      )
      needed.value = results.every((records) => !records.length)
      // The dashboard is about to load these same records; hand them over
      // rather than making it fetch them again. Accurate whichever way the
      // check went — `save` clears the cache, since it makes them stale.
      modes.forEach((mode, i) => primeRecords(mode, results[i]))
      if (!needed.value) {
        // They already have data, so they're settled — record that locally so
        // later loads skip this probe entirely instead of re-asking the server.
        markResolved()
      }
    } catch (e) {
      // Never let a failed probe block the app — fall through to the dashboard,
      // which surfaces its own load error if the API is genuinely down.
      console.warn('Failed to determine onboarding state', e)
      needed.value = false
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
      markResolved()
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
    markResolved()
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
