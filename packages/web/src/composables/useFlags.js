import { reactive, ref } from 'vue'
import { getFlags, getAuthorizationHeader } from '@/services/api'
import { isClerkEnabled } from '@/services/clerk'

// Module-level singleton so every component shares one resolved flag set.
const flags = reactive({})
const isAdmin = ref(false)
const loaded = ref(false)
let inflight = null

// Local-only convenience: in dev-auth mode (no Clerk) on a development build,
// treat the dev user as an admin with every feature flag on, so the Ranked and
// Admin tabs are testable without touching the DB. Never applies to a
// production build (NODE_ENV === 'production'), even if Clerk is misconfigured.
const DEV_FLAG_OVERRIDE =
  !isClerkEnabled() && process.env.NODE_ENV !== 'production'

function applyDevOverride() {
  if (!DEV_FLAG_OVERRIDE) return
  isAdmin.value = true
  // Turn on any flags the server reported, plus known UI-gated flags.
  for (const k of Object.keys(flags)) flags[k] = true
  flags.ranked = true
}

// Apply immediately so the very first render already reflects dev access,
// without waiting for loadFlags to run.
applyDevOverride()
if (DEV_FLAG_OVERRIDE) loaded.value = true

/**
 * Fetch the current user's resolved flags + admin status from the server.
 * No-ops (all flags false) when unauthenticated. Safe to call repeatedly;
 * concurrent calls share a single in-flight request.
 */
async function loadFlags() {
  // In dev-auth mode everything is granted locally — skip the server entirely
  // so the tabs appear instantly instead of after a slow/timing-out request.
  if (DEV_FLAG_OVERRIDE) {
    applyDevOverride()
    loaded.value = true
    return
  }
  if (inflight) return inflight
  inflight = (async () => {
    let succeeded = false
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) {
        // Signed out — clear any previously loaded state.
        for (const k of Object.keys(flags)) delete flags[k]
        isAdmin.value = false
        succeeded = true
        return
      }
      const data = await getFlags(authHeader)
      const next = data?.flags || {}
      for (const k of Object.keys(flags)) {
        if (!(k in next)) delete flags[k]
      }
      Object.assign(flags, next)
      isAdmin.value = Boolean(data?.isAdmin)
      succeeded = true
    } catch (e) {
      console.warn('Failed to load feature flags', e)
      // Fail closed: never preserve stale admin/feature access on error, and
      // leave `loaded` false so route guards retry instead of trusting state.
      for (const k of Object.keys(flags)) delete flags[k]
      isAdmin.value = false
    } finally {
      loaded.value = succeeded
      inflight = null
    }
  })()
  return inflight
}

export function useFlags() {
  return { flags, isAdmin, loaded, loadFlags }
}
