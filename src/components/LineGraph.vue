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
            {{ formatDate(new Date(xDomain[0])) }} → {{ formatDate(new Date(xDomain[1])) }}
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
import { computed, reactive, ref, watch } from 'vue'

// Config
const width = 600
const height = 360
const padding = 40
const plotWidth = width - padding * 2
const plotHeight = height - padding * 2

// Helpers
const dateToMs = (d) => new Date(d).getTime()
const msToDateInput = (ms) => new Date(ms).toISOString().slice(0, 10)
const addDays = (d, n) => {
  const dt = new Date(d)
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
    out.push({ x, label: formatDate(new Date(ms)) })
  }
  return out
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

// Keep newDate in range when season changes
watch([seasonStart, seasonEnd], () => {
  if (!isSeasonValid.value) return
  const [min, max] = xDomain.value
  const cur = dateToMs(newDate.value)
  const clamped = clamp(cur, min, max)
  newDate.value = msToDateInput(clamped)
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
