// src/utils/season.js
// Load pre-scraped season JSON produced by scripts/scrape-finals-seasons.mjs
// The JSON is expected at /data/finals-seasons.json (served from public/data)

export async function loadSeasonJson(signal) {
  const res = await fetch('/data/finals-seasons.json', { cache: 'no-cache', signal })
  if (!res.ok) throw new Error(`Failed to load season JSON: ${res.status}`)
  return await res.json()
}

