<template>
  <div class="line-graph">
    <h2>Interactive Line Graph</h2>

    <div class="controls">
      <form class="range-form" @submit.prevent>
        <label>
          Season start
          <input v-model="seasonStart" type="date" required />
        </label>
        <label>
          Season end
          <input v-model="seasonEnd" type="date" required />
        </label>
      </form>
      <form @submit.prevent="addPointFromForm" class="add-form">
        <label>
          date
          <input v-model="newDate" type="date" required />
        </label>
        <label>
          y
          <input v-model.number="newY" type="number" step="any" required />
        </label>
        <button type="submit" :disabled="!isSeasonValid">Add point</button>
      </form>
      <div class="quick-actions">
        <label>
          Goal win points
          <input v-model.number="goalWinPoints" type="number" step="any" />
        </label>
        <button @click="addRandomPoint" :disabled="!isSeasonValid">Add random</button>
        <button @click="clearPoints" :disabled="points.length === 0">Clear</button>
        <span class="spacer"></span>
        <button @click="exportCSV" :disabled="points.length === 0">Export CSV</button>
        <button @click="openImportModal">Import CSV</button>
      </div>
    </div>

    <div v-if="isSeasonValid" class="stats">
      <div class="stat">
        <div class="stat-label">Required/day (zero → goal)</div>
        <div class="stat-value">{{ requiredPerDayZero.toFixed(2) }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Required/day (last → goal)</div>
        <div class="stat-value">
          <template v-if="isFromLastDefined">{{ requiredPerDayFromLast.toFixed(2) }}</template>
          <template v-else>—</template>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-backdrop" @click.self="closeImportModal">
      <div class="modal">
        <header class="modal-header">
          <h3>Import CSV</h3>
        </header>
        <section class="modal-body">
          <p>Provide a CSV with columns: <strong>date,y</strong>. Supported date formats include YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, DD/MM/YYYY, and names like 5 Jan 2025. Header row is optional. Delimiters supported: comma, semicolon, colon, or tab.</p>
          <pre class="example">date,y
2025-03-01,2
2025-03-07,5.5
2025-03-15,7
</pre>
          <div
            class="dropzone"
            @dragover.prevent
            @dragenter.prevent
            @drop.prevent="onDropCSV"
          >
            <p>Drag and drop a CSV file here</p>
            <p>or</p>
            <input ref="fileInput" type="file" accept=".csv,text/csv" @change="onFilePick" />
          </div>
          <label class="import-options">
            <input type="checkbox" v-model="autoSetSeasonFromImport" />
            Auto-set season range to imported data dates
          </label>
          <p v-if="importError" class="error">{{ importError }}</p>
        </section>
        <footer class="modal-footer">
          <button @click="closeImportModal">Cancel</button>
        </footer>
      </div>
    </div>

    <p v-if="!isSeasonValid" class="error">Season start must be before end.</p>

    <div class="chart-wrapper" v-if="isSeasonValid">
      <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" role="img" aria-label="Line chart">
        <!-- Axes -->
        <g class="axes">
          <!-- X axis -->
          <line :x1="padding" :y1="height - padding" :x2="width - padding" :y2="height - padding" />
          <!-- Y axis -->
          <line :x1="padding" :y1="padding" :x2="padding" :y2="height - padding" />
        </g>

        <!-- Grid lines (optional for readability) -->
        <g class="grid">
          <template v-for="t in 4" :key="`h-${t}`">
            <line
              :x1="padding"
              :x2="width - padding"
              :y1="padding + t * (plotHeight / 5)"
              :y2="padding + t * (plotHeight / 5)"
            />
          </template>
          <template v-for="(tick, i) in xTicks" :key="`v-${i}`">
            <line :x1="tick.x" :x2="tick.x" :y1="padding" :y2="height - padding" />
          </template>
        </g>

        <!-- Projection Lines -->
        <path v-if="pathGoalFromZero" :d="pathGoalFromZero" class="proj proj-total" />
        <path v-if="pathGoalFromLast" :d="pathGoalFromLast" class="proj proj-from-last" />

        <!-- Path -->
        <path v-if="pathD" :d="pathD" class="line" />

        <!-- Points -->
        <g v-for="(p, idx) in scaledPoints" :key="idx" class="point">
          <circle :cx="p.x" :cy="p.y" r="3" />
        </g>

        <!-- Labels for min/max -->
        <g class="labels">
          <text :x="width - padding" :y="height - padding + 16" text-anchor="end">
            {{ msToDateInput(xDomain[0]) }} → {{ msToDateInput(xDomain[1]) }}
          </text>
          <text :x="padding - 6" :y="padding - 6" text-anchor="start">y: {{ yDomain[0] }} → {{ yDomain[1] }}</text>
          <template v-for="(tick, i) in xTicks" :key="`lbl-${i}`">
            <text :x="tick.x" :y="height - padding + 16" text-anchor="middle">{{ tick.label }}</text>
          </template>
        </g>
      </svg>
    </div>

    <div class="points-list" v-if="points.length">
      <h3>Points</h3>
      <ul>
        <li v-for="(pt, i) in points" :key="i">
          ({{ pt.date }} , {{ pt.y }})
          <button @click="removePoint(i)">remove</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'

// Config
const width = 600
const height = 360
const padding = 40
const plotWidth = width - padding * 2
const plotHeight = height - padding * 2

// Helpers
function monthNameToNum(name) {
  const map = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  }
  return map[name?.toLowerCase?.()] ?? -1
}

function parseFlexibleDate(str) {
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

function parseDateLocal(str) {
  const d = parseFlexibleDate(str)
  if (isNaN(d.getTime())) return d
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isValidDateStr(str) {
  const d = parseFlexibleDate(str)
  return !isNaN(d.getTime())
}

const dateToMs = (d) => {
  if (typeof d === 'string') return parseDateLocal(d).getTime()
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return NaN
}
const msToDateInput = (ms) => formatDate(new Date(ms))
const addDays = (d, n) => {
  const dt = typeof d === 'string' ? parseDateLocal(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  dt.setDate(dt.getDate() + n)
  return dt
}
const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

function formatDate(d) {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const da = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${da}`
}

// Season range state (defaults: today .. +30 days)
const today = new Date()
const seasonStart = ref(formatDate(today))
const seasonEnd = ref(formatDate(addDays(today, 30)))

// Points (date-based)
const points = reactive([
  { date: formatDate(addDays(today, 0)), y: 0 },
  { date: formatDate(addDays(today, 5)), y: 2 },
  { date: formatDate(addDays(today, 10)), y: 3 },
])

// Inputs for adding a point
const newDate = ref(formatDate(addDays(today, 1)))
const newY = ref(0)

// Goal win points
const goalWinPoints = ref(10)

// Import/Export state
const showImportModal = ref(false)
const importError = ref('')
const autoSetSeasonFromImport = ref(true)
const fileInput = ref(null)

// Persistence
const STORAGE_KEY = 'season-sprint:line-graph:v1'
function saveState() {
  try {
    const state = {
      seasonStart: seasonStart.value,
      seasonEnd: seasonEnd.value,
      goalWinPoints: goalWinPoints.value,
      autoSetSeasonFromImport: autoSetSeasonFromImport.value,
      points: [...points],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    // ignore storage errors
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    // basic validation
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.seasonStart === 'string' && isValidDateStr(parsed.seasonStart)) seasonStart.value = parsed.seasonStart
      if (typeof parsed.seasonEnd === 'string' && isValidDateStr(parsed.seasonEnd)) seasonEnd.value = parsed.seasonEnd
      if (typeof parsed.goalWinPoints === 'number' && isFinite(parsed.goalWinPoints)) goalWinPoints.value = parsed.goalWinPoints
      if (typeof parsed.autoSetSeasonFromImport === 'boolean') autoSetSeasonFromImport.value = parsed.autoSetSeasonFromImport
      if (Array.isArray(parsed.points)) {
        const sanitized = parsed.points
          .map(p => ({ date: typeof p.date === 'string' ? p.date : '', y: Number(p.y) }))
          .filter(p => isValidDateStr(p.date) && isFinite(p.y))
        if (sanitized.length) {
          points.splice(0, points.length, ...sanitized)
        }
      }
    }
  } catch (e) {
    // ignore parse errors
  }
}

// Domains
const isSeasonValid = computed(() => seasonStart.value && seasonEnd.value && dateToMs(seasonStart.value) < dateToMs(seasonEnd.value))

const xDomain = computed(() => {
  // Always use the season range for x-domain
  const startMs = dateToMs(seasonStart.value || today)
  const endMs = dateToMs(seasonEnd.value || addDays(today, 1))
  return startMs === endMs ? [startMs - 86400000, endMs + 86400000] : [startMs, endMs]
})

const yDomain = computed(() => {
  // Include points, zero baseline, and goal so projections are always visible
  const ys = points.length ? points.map(p => p.y) : [0]
  ys.push(0)
  ys.push(Number.isFinite(goalWinPoints.value) ? goalWinPoints.value : 0)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (min === max) { min -= 1; max += 1 }
  return [roundTidy(min), roundTidy(max)]
})

function roundTidy(n) {
  if (!isFinite(n)) return 0
  const absn = Math.abs(n)
  if (absn === 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(absn)))
  return Math.round(n / pow) * pow
}

// Scales
const scaleX = (dateStr) => {
  const [min, max] = xDomain.value
  const x = dateToMs(dateStr)
  const t = (x - min) / (max - min)
  return padding + clamp(t, 0, 1) * plotWidth
}

const scaleY = (y) => {
  const [min, max] = yDomain.value
  return padding + (1 - (y - min) / (max - min)) * plotHeight
}

// Derived
const sortedPoints = computed(() => [...points].sort((a, b) => dateToMs(a.date) - dateToMs(b.date)))

const scaledPoints = computed(() => sortedPoints.value.map(p => ({ x: scaleX(p.date), y: scaleY(p.y) })))

const pathD = computed(() => {
  if (scaledPoints.value.length < 2) return ''
  return scaledPoints.value.reduce((d, p, i) => d + `${i === 0 ? 'M' : ' L'}${p.x},${p.y}`, '')
})

// Projection paths
const pathGoalFromZero = computed(() => {
  if (!isSeasonValid.value) return ''
  const x1 = scaleX(seasonStart.value)
  const y1 = scaleY(0)
  const x2 = scaleX(seasonEnd.value)
  const y2 = scaleY(goalWinPoints.value)
  return `M${x1},${y1} L${x2},${y2}`
})

const pathGoalFromLast = computed(() => {
  if (!isSeasonValid.value || sortedPoints.value.length === 0) return ''
  const last = sortedPoints.value[sortedPoints.value.length - 1]
  const lastMs = dateToMs(last.date)
  if (lastMs >= xDomain.value[1]) return ''
  const x1 = scaleX(last.date)
  const y1 = scaleY(last.y)
  const x2 = scaleX(seasonEnd.value)
  const y2 = scaleY(goalWinPoints.value)
  return `M${x1},${y1} L${x2},${y2}`
})

const xTicks = computed(() => {
  // 5 ticks including start and end
  const [min, max] = xDomain.value
  const n = 4
  const out = []
  for (let i = 0; i <= n; i++) {
    const ms = min + (i / n) * (max - min)
    const x = padding + (i / n) * plotWidth
    out.push({ x, label: msToDateInput(ms) })
  }
  return out
})

// Pace stats
const MS_PER_DAY = 86400000
const daysInSeason = computed(() => {
  if (!isSeasonValid.value) return 1
  const [min, max] = xDomain.value
  const days = (max - min) / MS_PER_DAY
  return Math.max(1, Math.round(days))
})

const requiredPerDayZero = computed(() => {
  // slope of the zero→goal projection per day
  return goalWinPoints.value / daysInSeason.value
})

const isFromLastDefined = computed(() => sortedPoints.value.length > 0 && dateToMs(sortedPoints.value[sortedPoints.value.length - 1].date) < xDomain.value[1])

const requiredPerDayFromLast = computed(() => {
  if (!isFromLastDefined.value) return 0
  const last = sortedPoints.value[sortedPoints.value.length - 1]
  const remaining = goalWinPoints.value - last.y
  const endMs = xDomain.value[1]
  const left = Math.max(1, Math.round((endMs - dateToMs(last.date)) / MS_PER_DAY))
  return remaining / left
})

// Actions
function addPointFromForm() {
  if (!isSeasonValid.value) return
  points.push({ date: newDate.value, y: Number(newY.value) })
  // Convenience: advance date by one day
  const next = formatDate(addDays(new Date(newDate.value), 1))
  newDate.value = next
}

function addRandomPoint() {
  if (!isSeasonValid.value) return
  // add at next day from latest point within season, or at seasonStart
  const latestMsInSeason = Math.max(
    ...[...points]
      .map(p => dateToMs(p.date))
      .filter(ms => ms >= xDomain.value[0] && ms <= xDomain.value[1]),
    xDomain.value[0] - 86400000 // ensure at least season start - 1 day
  )
  const nextDate = new Date(latestMsInSeason + 86400000)
  const y = +(Math.random() * 10 - 5).toFixed(2)
  points.push({ date: formatDate(nextDate), y })
}

function removePoint(index) {
  points.splice(index, 1)
}

function clearPoints() {
  points.splice(0, points.length)
}

// Export CSV
function exportCSV() {
  // Build CSV string
  const header = 'date,y\n'
  const rows = points.map(p => `${p.date},${p.y}`).join('\n')
  const csv = header + rows + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `line-data-${formatDate(new Date())}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function openImportModal() {
  importError.value = ''
  showImportModal.value = true
}

function closeImportModal() {
  showImportModal.value = false
  importError.value = ''
  // reset input element so same file can be re-picked
  if (fileInput.value) fileInput.value.value = ''
}

function onFilePick(e) {
  const f = e.target.files && e.target.files[0]
  if (f) readCSVFile(f)
}

function onDropCSV(e) {
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  if (f) readCSVFile(f)
}

function readCSVFile(file) {
  importError.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    try {
      let text = reader.result?.toString() || ''
      // Strip BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
      const imported = parseCSV(text)
      if (imported.length === 0) {
        throw new Error('No valid rows found. Expected columns: date,y (YYYY-MM-DD, numeric y).')
      }
      // Replace points
      points.splice(0, points.length, ...imported)
      // Optionally adjust season to imported min/max
      if (autoSetSeasonFromImport.value) {
        const dates = imported.map(r => dateToMs(r.date))
        const min = Math.min(...dates)
        const max = Math.max(...dates)
        seasonStart.value = msToDateInput(min)
        seasonEnd.value = msToDateInput(max)
        newDate.value = seasonStart.value
      }
      closeImportModal()
    } catch (err) {
      importError.value = err?.message || 'Failed to parse CSV.'
    }
  }
  reader.onerror = () => {
    importError.value = 'Unable to read file.'
  }
  reader.readAsText(file)
}

function parseCSV(text) {
  // Robust CSV reader for date,y with auto delimiter detection, quotes, and optional header
  const rawLines = text.split(/\r?\n/)
  const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'))
  if (lines.length === 0) return []

  // Detect delimiter among comma, semicolon, or tab based on first few lines
  const sample = lines.slice(0, Math.min(5, lines.length))
  const delims = [',', ';', '\t', ':']
  let delim = ','
  let best = -1
  for (const d of delims) {
    const score = sample.reduce((acc, s) => acc + (s.split(d).length - 1), 0)
    if (score > best) { best = score; delim = d }
  }

  function splitCSVLine(s) {
    const out = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === '"') {
        // handle escaped quotes "" inside quoted fields
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

  const out = []
  for (let i = 0; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i])
    if (fields.length < 2) continue
    let [dstr, ystr] = fields
    // Remove surrounding quotes if any
    if (dstr.startsWith('"') && dstr.endsWith('"')) dstr = dstr.slice(1, -1)
    if (ystr.startsWith('"') && ystr.endsWith('"')) ystr = ystr.slice(1, -1)

    // Skip header-like rows
    const lower = dstr.toLowerCase()
    if (i === 0 && (lower.includes('date') || ystr.toLowerCase().includes('y'))) continue

    if (!isValidDateStr(dstr)) continue
    // Normalize number: remove spaces and thousands separators
    const yClean = ystr.replace(/[\s,]/g, '')
    const yNum = Number(yClean)
    if (!isFinite(yNum)) continue
    out.push({ date: formatDate(parseDateLocal(dstr)), y: yNum })
  }
  return out
}

// Keep newDate in range when season changes
watch([seasonStart, seasonEnd], () => {
  if (!isSeasonValid.value) return
  const [min, max] = xDomain.value
  const cur = dateToMs(newDate.value)
  const clamped = clamp(cur, min, max)
  newDate.value = msToDateInput(clamped)
})

// Persist on changes
watch([seasonStart, seasonEnd, goalWinPoints, autoSetSeasonFromImport], saveState)
watch(points, saveState, { deep: true })

onMounted(() => {
  loadState()
})
</script>

<style scoped>
.line-graph {
  max-width: 900px;
  margin: 0 auto;
  text-align: left;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.range-form,
.add-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-form input,
.range-form input {
  width: 160px;
}

.quick-actions button {
  margin-right: 8px;
}

.quick-actions .spacer { flex: 1; }

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin: 8px 0 12px;
}

.stat {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #f9fafb;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: #fff;
  width: min(720px, 95vw);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  overflow: hidden;
}

.modal-header, .modal-footer {
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-footer { border-bottom: 0; border-top: 1px solid #e5e7eb; }

.modal-body { padding: 12px 16px; }

.dropzone {
  border: 2px dashed #9ca3af;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  color: #6b7280;
  margin: 8px 0 12px;
}

.example {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  padding: 8px;
  overflow: auto;
}

.import-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error {
  color: #b91c1c;
  margin: 4px 0 8px;
}

.chart-wrapper {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
}

svg {
  width: 100%;
  height: auto;
}

.axes line {
  stroke: #374151;
  stroke-width: 1.25;
}

.grid line {
  stroke: #e5e7eb;
  stroke-width: 1;
}

.line {
  fill: none;
  stroke: #3b82f6;
  stroke-width: 2;
}

.proj {
  fill: none;
  stroke: #9ca3af;
  stroke-width: 2;
  stroke-dasharray: 6 6;
}

.proj-from-last {
  stroke: #10b981; /* teal for clarity */
}

.point circle {
  fill: #ef4444;
}

.labels text {
  font-size: 12px;
  fill: #6b7280;
}

.points-list ul {
  list-style: none;
  padding: 0;
}

.points-list li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.points-list button {
  margin-left: 8px;
}
</style>
