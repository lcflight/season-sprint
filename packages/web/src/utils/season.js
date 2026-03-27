// src/utils/season.js
// Load season data from the server API, with static JSON fallback.

const isLocalDevHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')

const API_BASE =
  process.env.VUE_APP_API_BASE_URL ||
  (isLocalDevHost ? 'http://localhost:8787' : '')

function withBase(path) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  const cleanBase = String(base).replace(/\/+$/, '')
  const cleanPath = String(path).replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

export async function loadSeasonJson(signal) {
  // Try server API first
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/seasons`, { signal })
      if (res.ok) return await res.json()
    } catch {
      // Fall through to static file
    }
  }

  // Fallback to static JSON file
  console.warn('[season] API unavailable, falling back to static JSON')
  const url = withBase('data/finals-seasons.json')
  const res = await fetch(url, { cache: 'no-cache', signal })
  if (!res.ok) throw new Error(`Failed to load season JSON: ${res.status}`)
  return await res.json()
}
