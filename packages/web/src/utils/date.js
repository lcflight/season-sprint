// Date utilities (pure) for local, date-only handling
// All functions assume date strings like YYYY-MM-DD unless parsing flexible formats.

function monthNameToNum(name) {
  const map = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  }
  return map[name?.toLowerCase?.()] ?? -1
}

export function parseFlexibleDate(str) {
  if (str instanceof Date) return new Date(str.getFullYear(), str.getMonth(), str.getDate())
  if (typeof str !== 'string') return new Date(NaN)
  const s = str.trim()
  // 1) YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const y = +m[1], mo = +m[2], da = +m[3]
    return new Date(y, mo - 1, da)
  }
  // 2) DD-MM-YYYY or MM-DD-YYYY (disambiguate by values)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]
    if (y < 100) y += 2000
    // if a > 12, it's definitely day-first
    // else if b > 12, it's month-first
    // else ambiguous: default to month-first
    let mo, da
    if (a > 12 && b <= 12) { da = a; mo = b }
    else { mo = a; da = b }
    return new Date(y, mo - 1, da)
  }
  // 3) 'DD Mon YYYY' or 'Mon DD YYYY' (comma optional)
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*,?\s*(\d{4})$/)
  if (m) {
    const da = +m[1], mo = monthNameToNum(m[2]), y = +m[3]
    return new Date(y, mo, da)
  }
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})$/)
  if (m) {
    const mo = monthNameToNum(m[1]), da = +m[2], y = +m[3]
    return new Date(y, mo, da)
  }
  return new Date(NaN)
}

export function parseDateLocal(str) {
  const d = parseFlexibleDate(str)
  if (isNaN(d.getTime())) return d
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function isValidDateStr(str) {
  const d = parseFlexibleDate(str)
  return !isNaN(d.getTime())
}

export function dateToMs(d) {
  if (typeof d === 'string') return parseDateLocal(d).getTime()
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return NaN
}

export function formatDate(d) {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const da = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${da}`
}

export function msToDateInput(ms) {
  return formatDate(new Date(ms))
}

export function addDays(d, n) {
  const dt = typeof d === 'string' ? parseDateLocal(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  dt.setDate(dt.getDate() + n)
  return dt
}

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

