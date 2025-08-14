// src/utils/season.js
// Load pre-scraped season JSON produced by scripts/scrape-finals-seasons.mjs
// The JSON is expected at public/data/finals-seasons.json
// Use the app's base URL so it works when the app is deployed at a subpath.

function withBase(path) {
  // import.meta.env.BASE_URL is provided by Vite
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  const cleanBase = String(base).replace(/\/+$/, '')
  const cleanPath = String(path).replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

export async function loadSeasonJson(signal) {
  const url = withBase('data/finals-seasons.json')
  const res = await fetch(url, { cache: 'no-cache', signal })
  if (!res.ok) throw new Error(`Failed to load season JSON: ${res.status}`)
  return await res.json()
}

