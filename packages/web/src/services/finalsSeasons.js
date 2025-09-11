// Lightweight browser-side Seasons fetcher for THE FINALS wiki.
// Self-contained and easily removable. If CORS ever blocks it, replace with
// a build-time task that writes JSON into /public and load that JSON instead.

const WIKI_URL = 'https://www.thefinals.wiki/wiki/Seasons'

function normalize(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim()
}

function parseRange(text) {
  const s = (text || '').replace(/\[[^\]]*\]/g, '').trim()
  const parts = s.split(/\s*[–-]\s*/)
  const parse = (v) => {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  if (parts.length === 1) return { start: parse(parts[0]), end: null }
  const endSan = parts[1].replace(/present|ongoing|tbd/i, '').trim()
  return { start: parse(parts[0]), end: parse(endSan) }
}

function pickCurrent(seasons, now = new Date()) {
  return seasons
    .filter(s => s.start instanceof Date && (!s.end || s.end instanceof Date))
    .filter(s => s.start <= now && (s.end ? now <= s.end : true))
    .sort((a, b) => b.start - a.start)[0] || null
}

export async function loadFinalsSeasons(signal) {
  const res = await fetch(WIKI_URL, { mode: 'cors', signal })
  if (!res.ok) throw new Error(`Failed to fetch wiki page: ${res.status}`)
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table.wikitable')
  const seasons = []

  if (table) {
    const headerRow = table.querySelector('thead tr') || table.querySelector('tbody tr')
    const headers = headerRow ? Array.from(headerRow.querySelectorAll('th')).map(normalize) : []
    const lower = headers.map(h => h.toLowerCase())
    const idxName = lower.findIndex(h => h.includes('season') || h.includes('name'))
    const idxDur = lower.findIndex(h => h.includes('duration'))
    const idxStart = lower.findIndex(h => h.includes('start'))
    const idxEnd = lower.findIndex(h => h.includes('end'))

    const rows = table.querySelectorAll('tbody tr')
    const startRow = headers.length ? 1 : 0
    Array.from(rows).slice(startRow).forEach(tr => {
      const tds = tr.querySelectorAll('td')
      if (!tds || tds.length === 0) return
      const name = idxName >= 0 ? normalize(tds[idxName]) : normalize(tds[0])
      let start = null, end = null
      if (idxDur >= 0 && tds[idxDur]) {
        const { start: s, end: e } = parseRange(normalize(tds[idxDur]))
        start = s; end = e
      } else {
        const sTxt = idxStart >= 0 ? normalize(tds[idxStart]) : ''
        const eTxt = idxEnd >= 0 ? normalize(tds[idxEnd]) : ''
        start = parseRange(sTxt).start
        end = parseRange(eTxt).start
      }
      if (name && start) seasons.push({ name, start, end })
    })
  }

  const current = pickCurrent(seasons)
  return {
    fetchedAt: new Date().toISOString(),
    source: WIKI_URL,
    seasons: seasons.map(s => ({
      name: s.name,
      start: s.start.toISOString(),
      end: s.end ? s.end.toISOString() : null,
    })),
    currentSeason: current ? {
      name: current.name,
      start: current.start.toISOString(),
      end: current.end ? current.end.toISOString() : null,
    } : null,
  }
}

