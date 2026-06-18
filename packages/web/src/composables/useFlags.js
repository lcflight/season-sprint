import { reactive, ref } from 'vue'
import { getFlags, getAuthorizationHeader } from '@/services/api'

// Module-level singleton so every component shares one resolved flag set.
const flags = reactive({})
const isAdmin = ref(false)
const loaded = ref(false)
let inflight = null

/**
 * Fetch the current user's resolved flags + admin status from the server.
 * No-ops (all flags false) when unauthenticated. Safe to call repeatedly;
 * concurrent calls share a single in-flight request.
 */
async function loadFlags() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) {
        // Signed out — clear any previously loaded state.
        for (const k of Object.keys(flags)) delete flags[k]
        isAdmin.value = false
        return
      }
      const data = await getFlags(authHeader)
      const next = data?.flags || {}
      for (const k of Object.keys(flags)) {
        if (!(k in next)) delete flags[k]
      }
      Object.assign(flags, next)
      isAdmin.value = Boolean(data?.isAdmin)
    } catch (e) {
      console.warn('Failed to load feature flags', e)
    } finally {
      loaded.value = true
      inflight = null
    }
  })()
  return inflight
}

export function useFlags() {
  return { flags, isAdmin, loaded, loadFlags }
}
