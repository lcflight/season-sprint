// CSV utilities: import/export points [ { date: 'YYYY-MM-DD', y: number } ]
// Pure functions, no DOM. Returns normalized data.
import { parseDateLocal, isValidDateStr, formatDate } from './date'

export function detectDelimiter(lines) {
  const sample = lines.slice(0, Math.min(5, lines.length))
  const delims = [',', ';', '\t', ':']
  let delim = ','
  let best = -1
  for (const d of delims) {
    const score = sample.reduce((acc, s) => acc + (s.split(d).length - 1), 0)
    if (score > best) { best = score; delim = d }
  }
  return delim
}

export function splitCSVLine(s, delim) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') { cur += '"'; i++; continue }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === delim) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(x => x.trim())
}

export function parseCSVText(text) {
  let t = text || ''
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1) // strip BOM
  const rawLines = t.split(/\r?\n/)
  const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'))
  if (lines.length === 0) return []
  const delim = detectDelimiter(lines)

  const out = []
  for (let i = 0; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i], delim)
    if (fields.length < 2) continue
    let [dstr, ystr] = fields
    if (dstr.startsWith('"') && dstr.endsWith('"')) dstr = dstr.slice(1, -1)
    if (ystr.startsWith('"') && ystr.endsWith('"')) ystr = ystr.slice(1, -1)
    const lower = dstr.toLowerCase()
    if (i === 0 && (lower.includes('date') || ystr.toLowerCase().includes('y'))) continue
    if (!isValidDateStr(dstr)) continue
    const yClean = ystr.replace(/[\s,]/g, '')
    const yNum = Number(yClean)
    if (!isFinite(yNum)) continue
    out.push({ date: formatDate(parseDateLocal(dstr)), y: yNum })
  }
  return out
}

export function buildCSV(points) {
  const header = 'date,y\n'
  const rows = points.map(p => `${p.date},${p.y}`).join('\n')
  return header + rows + '\n'
}

