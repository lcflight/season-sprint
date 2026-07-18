import { computed, ref } from 'vue'
import { getRecords, upsertRecord, getAuthorizationHeader } from '@/services/api'
import { formatDate } from '@/utils/date'

// Set once the user has either saved their starting totals or skipped the
// prompt. Detection is server-side (no records in any prompted mode), so this
// flag exists only to stop nagging someone who genuinely has zero points and
// chose to skip — they'd otherwise see the prompt on every launch.
const DISMISSED_KEY = 'onboarding.dismissed'

function isDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private mode / storage disabled — treat as not dismissed. Worst case the
    // prompt reappears, which is better than crashing the app shell.
    return false
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Non-fatal; see isDismissed.
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
    if (isDismissed()) {
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
      markDismissed()
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
    markDismissed()
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
