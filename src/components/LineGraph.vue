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
          points
          <input v-model.number="newY" type="number" step="any" required />
        </label>
        <button type="submit" :disabled="!isSeasonValid">Add point</button>
      </form>
      <div class="quick-actions">
        <label>
          Goal win points
          <input v-model.number="goalWinPoints" type="number" step="any" />
        </label>
        <button @click="clearPoints" :disabled="points.length === 0">Clear</button>
        <button @click="openPointsModal" :disabled="points.length === 0">View points ({{ points.length }})</button>
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
          <p>Provide a CSV with columns: <strong>date,y</strong> (y = points). Supported date formats include YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, DD/MM/YYYY, and names like 5 Jan 2025. Header row is optional. Delimiters supported: comma, semicolon, colon, or tab.</p>
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

    <!-- Points Modal -->
    <div v-if="showPointsModal" class="modal-backdrop" @click.self="closePointsModal">
      <div class="modal">
        <header class="modal-header">
          <h3>Points</h3>
        </header>
        <section class="modal-body">
          <p v-if="!points.length" class="muted">No points yet.</p>
          <ul class="points-ul" v-else>
            <li v-for="(pt, i) in points" :key="i">
              <template v-if="editIndex === i">
                <div class="edit-row">
                  <label>
                    date
                    <input v-model="editDate" type="date" required />
                  </label>
                  <label>
                    points
                    <input v-model.number="editY" type="number" step="any" required />
                  </label>
                </div>
                <div class="row-actions">
                  <button class="btn-primary" @click="saveEdit(i)" :disabled="!canSaveEdit">save</button>
                  <button class="btn-ghost" @click="cancelEdit">cancel</button>
                </div>
              </template>
              <template v-else>
                <span>({{ pt.date }} , {{ pt.y }} pts)</span>
                <div class="row-actions">
                  <button class="btn-primary" @click="openEdit(i)">edit</button>
                  <button class="btn-ghost" @click="removePoint(i)">remove</button>
                </div>
              </template>
            </li>
          </ul>
        </section>
        <footer class="modal-footer">
          <button @click="closePointsModal">Close</button>
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
          <text :x="padding - 6" :y="padding - 6" text-anchor="start">points: {{ yDomain[0] }} → {{ yDomain[1] }}</text>
          <template v-for="(tick, i) in xTicks" :key="`lbl-${i}`">
            <text
              :x="tick.x"
              :y="height - padding + 28"
              text-anchor="end"
              :transform="`rotate(-35 ${tick.x} ${height - padding + 28})`"
            >
              {{ tick.label }}
            </text>
          </template>
        </g>
      </svg>
    </div>

  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { isValidDateStr, dateToMs, msToDateInput, addDays, clamp, formatDate } from '@/utils/date'
import { parseCSVText, buildCSV } from '@/utils/csv'
import { saveState as saveLocalState, loadState as loadLocalState, saveStateWithKey, loadStateWithKey } from '@/utils/storage'
import { MS_PER_DAY, calcXDomain, calcYDomain, scaleXFactory, scaleYFactory, buildPathD, buildXTicks } from '@/utils/chart'

// eslint-disable-next-line no-undef
const props = defineProps({
  storageKey: { type: String, default: '' }
})

// Config
const width = 600
const height = 400
const padding = 40
const plotHeight = height - padding * 2

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
const showPointsModal = ref(false)
const importError = ref('')
const autoSetSeasonFromImport = ref(true)
const fileInput = ref(null)

// Editing state for points
const editIndex = ref(-1)
const editDate = ref('')
const editY = ref(0)
const canSaveEdit = computed(() => isValidDateStr(editDate.value) && isFinite(editY.value))

// Persistence
function saveState() {
  const state = {
    seasonStart: seasonStart.value,
    seasonEnd: seasonEnd.value,
    goalWinPoints: goalWinPoints.value,
    autoSetSeasonFromImport: autoSetSeasonFromImport.value,
    points: [...points],
  }
  if (props.storageKey) {
    saveStateWithKey(`season-sprint:${props.storageKey}:v1`, state)
  } else {
    saveLocalState(state)
  }
}

function loadState() {
  const parsed = props.storageKey
    ? loadStateWithKey(`season-sprint:${props.storageKey}:v1`)
    : loadLocalState()
  if (!parsed || typeof parsed !== 'object') return
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

// Domains
const isSeasonValid = computed(() => seasonStart.value && seasonEnd.value && dateToMs(seasonStart.value) < dateToMs(seasonEnd.value))

const xDomain = computed(() => calcXDomain(seasonStart.value, seasonEnd.value, today))
const yDomain = computed(() => calcYDomain(points, goalWinPoints.value))

// Scales
const scaleX = (dateStr) => scaleXFactory(xDomain.value, width, padding)(dateStr)
const scaleY = (y) => scaleYFactory(yDomain.value, height, padding)(y)

// Derived
const sortedPoints = computed(() => [...points].sort((a, b) => dateToMs(a.date) - dateToMs(b.date)))

const scaledPoints = computed(() => sortedPoints.value.map(p => ({ x: scaleX(p.date), y: scaleY(p.y) })))

const pathD = computed(() => buildPathD(scaledPoints.value))

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

const xTicks = computed(() => buildXTicks(xDomain.value, width, padding, 4))

// Pace stats
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

function removePoint(index) {
  points.splice(index, 1)
  if (editIndex.value === index) {
    editIndex.value = -1
  }
}

function openEdit(index) {
  const p = points[index]
  editIndex.value = index
  editDate.value = p.date
  editY.value = p.y
}

function saveEdit(index) {
  if (!canSaveEdit.value) return
  const yNum = Number(editY.value)
  if (!isFinite(yNum)) return
  points[index] = { date: editDate.value, y: yNum }
  editIndex.value = -1
}

function cancelEdit() {
  editIndex.value = -1
}

function clearPoints() {
  points.splice(0, points.length)
}

// Export CSV
function exportCSV() {
  const csv = buildCSV(points)
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

function openPointsModal() {
  showPointsModal.value = true
}

function closePointsModal() {
  showPointsModal.value = false
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
      const imported = parseCSVText(text)
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
  max-width: 1000px;
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
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  border-radius: 10px;
  padding: 12px;
  background: color-mix(in oklab, var(--surface) 85%, black);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02), 0 6px 24px rgba(0,0,0,0.35);
}

.stat-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-strong);
  text-shadow: 0 0 20px color-mix(in oklab, var(--primary) 35%, transparent);
}

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--surface);
  width: min(720px, 95vw);
  max-height: 85vh;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header, .modal-footer {
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
}

.modal-footer { border-bottom: 0; border-top: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface)); }

.modal-body {
  padding: 12px 16px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
}

.dropzone {
  border: 2px dashed color-mix(in oklab, var(--primary) 35%, var(--surface));
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  color: var(--muted);
  margin: 8px 0 12px;
}

.example {
  background: color-mix(in oklab, var(--surface) 85%, black);
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  padding: 8px;
  overflow: auto;
}

.import-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error {
  color: #ff6b6b;
  margin: 4px 0 8px;
}

.chart-wrapper {
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  border-radius: 10px;
  padding: 8px;
  background: radial-gradient(100% 100% at 0% 0%, rgba(255, 212, 0, 0.05) 0%, rgba(0,0,0,0) 40%), var(--surface);
}

svg {
  width: 100%;
  height: auto;
}

.axes line {
  stroke: color-mix(in oklab, var(--primary) 35%, #1f2937);
  stroke-width: 1.25;
}

.grid line {
  stroke: color-mix(in oklab, var(--primary) 14%, #374151);
  stroke-opacity: 0.5;
  stroke-width: 1;
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 60%, transparent));
}

.proj {
  fill: none;
  stroke: color-mix(in oklab, var(--primary) 45%, #9ca3af);
  stroke-width: 2;
  stroke-dasharray: 6 6;
}

.proj-from-last {
  stroke: var(--success);
}

.point circle {
  fill: var(--danger);
  filter: drop-shadow(0 0 4px rgba(255, 61, 127, 0.65));
}

.labels text {
  font-size: 12px;
  fill: var(--muted);
}

.points-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.points-ul li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 10%, var(--surface));
  flex-wrap: wrap;
}

.edit-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.row-actions {
  display: inline-flex;
  gap: 8px;
}

.points-ul li:last-child {
  border-bottom: 0;
}
</style>
