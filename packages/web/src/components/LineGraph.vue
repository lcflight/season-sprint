<template>
  <div class="line-graph">
    <header class="lg-header">
      <h2 class="lg-gamemode">World Tour</h2>
      <h2 class="lg-season-title">
        {{ headerTitle || seasonTitle || "Interactive Line Graph" }}
      </h2>
      <div v-if="headerDisclaimer" class="lg-disclaimer">
        {{ headerDisclaimer }}
      </div>
    </header>

    <div v-if="!isAuthenticated && !isLoading" class="status-banner auth-banner">
      Sign in to save and sync your data.
    </div>

    <div class="controls" v-if="showGoalControl">
      <GoalControls
        :goal-options="goalOptions"
        :selected-goal-index="selectedGoalIndex"
        :goal-win-points="goalWinPoints"
        :rank-info="rankInfo"
        :current-win-points="currentWinPoints"
        :to-next="toNext"
        :progress-pct="progressPct"
        unit="WP"
        @select-goal="onSelectGoal"
        @set-goal-win-points="setGoalWinPoints"
      />
    </div>

    <StatsPanel
      v-if="isSeasonValid"
      :required-per-day-zero="requiredPerDayZero"
      :required-per-day-from-last="requiredPerDayFromLast"
      :is-from-last-defined="isFromLastDefined"
    />

    <!-- Custom content below stats -->
    <slot name="below-stats"></slot>

    <!-- Import Modal -->
    <ImportModal
      v-if="showImportModal"
      :auto-set-season-from-import="autoSetSeasonFromImport"
      :simplify-import="simplifyImport"
      @update:autoSetSeasonFromImport="(v) => (autoSetSeasonFromImport = v)"
      @update:simplifyImport="(v) => (simplifyImport = v)"
      @import-data="onImportedRows"
      @close="closeImportModal"
    />

    <!-- Settings Modal -->
    <SettingsModal
      v-if="showSettingsModal"
      :nav-sensitivity="navSensitivity"
      :enable-navigation="enableNavigation"
      :show-rank-overlay="showRankOverlay"
      :has-goal-options="goalOptions.length > 0"
      @update:nav-sensitivity="navSensitivity = $event"
      @update:enable-navigation="enableNavigation = $event"
      @update:show-rank-overlay="showRankOverlay = $event"
      @close="closeSettingsModal"
    />

    <!-- Points Modal -->
    <PointsModal
      v-if="showPointsModal"
      :points="points"
      :sorted-points-reverse="sortedPointsReverse"
      @save-edit="onSaveEdit"
      @remove-point="removePoint"
      @close="closePointsModal"
    />

    <p v-if="!isSeasonValid" class="error">Season start must be before end.</p>

    <div class="chart-wrapper" v-if="isSeasonValid">
      <div class="today-progress">
        <template v-if="todayPoint">
          <span class="today-label">Today</span>
          <span class="today-value">+{{ todayGain }} pts</span>
        </template>
        <template v-else>
          <span class="today-label">No points logged today</span>
        </template>
      </div>
      <button
        v-if="isOutOfDefault"
        class="recenter-btn"
        @click="resetView"
        title="Recenter view"
        aria-label="Recenter view"
      >
        Recenter
      </button>
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${width} ${height}`"
        :width="width"
        :height="height"
        role="img"
        aria-label="Line chart"
        :class="{ 'nav-disabled': !enableNavigation, 'chart-blurred': isLoading || loadError }"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerUp"
      >
        <defs>
          <clipPath id="plot-clip">
            <rect
              :x="padding"
              :y="padding"
              :width="width - padding * 2"
              :height="height - padding * 2"
            />
          </clipPath>
        </defs>

        <!-- Axes -->
        <g class="axes">
          <!-- X axis -->
          <line
            :x1="padding"
            :y1="height - padding"
            :x2="width - padding"
            :y2="height - padding"
          />
          <!-- Y axis -->
          <line
            :x1="padding"
            :y1="padding"
            :x2="padding"
            :y2="height - padding"
          />
        </g>

        <!-- Plot content (pan/zoom) -->
        <g clip-path="url(#plot-clip)">
        <g :transform="plotTransform">
          <!-- Rank threshold overlay -->
          <g v-if="showRankOverlay && rankBands.length" class="rank-overlay">
            <rect
              v-for="(band, i) in rankBands"
              :key="'band-' + i"
              :x="padding"
              :width="width - padding * 2"
              :y="scaleY(band.ceil)"
              :height="Math.max(0, scaleY(band.floor) - scaleY(band.ceil))"
              :fill="band.fill"
            />
            <line
              v-for="(band, i) in rankBands"
              :key="'thresh-' + i"
              :x1="padding"
              :x2="width - padding"
              :y1="scaleY(band.ceil)"
              :y2="scaleY(band.ceil)"
              :stroke="band.stroke"
              stroke-width="0.5"
              stroke-dasharray="3 3"
            />
            <text
              v-for="(band, i) in rankBands"
              :key="'label-' + i"
              :x="width - padding - 4"
              :y="scaleY(band.ceil) + 12"
              class="rank-label"
              text-anchor="end"
              :fill="band.stroke"
            >{{ band.tier }}</text>
          </g>

          <!-- Grid lines -->
          <g class="grid">
            <template v-if="!showRankOverlay || !rankBands.length">
              <line
                v-for="t in 4"
                :key="`h-${t}`"
                :x1="padding"
                :x2="width - padding"
                :y1="padding + t * (plotHeight / 5)"
                :y2="padding + t * (plotHeight / 5)"
              />
            </template>
            <template v-for="(tick, i) in xTicks" :key="`v-${i}`">
              <line
                :x1="tick.x"
                :x2="tick.x"
                :y1="padding"
                :y2="height - padding"
              />
            </template>
          </g>

          <!-- Projection Lines -->
          <path
            v-if="pathGoalFromZero"
            :d="pathGoalFromZero"
            class="proj proj-total"
          />
          <path
            v-if="pathGoalFromLast"
            :d="pathGoalFromLast"
            class="proj proj-from-last"
          />

          <!-- Path -->
          <path v-if="pathD" :d="pathD" class="line" />

          <!-- Points -->
          <g v-for="(p, idx) in scaledPoints" :key="idx" class="point">
            <circle :cx="p.x" :cy="p.y" r="3" />
          </g>

          <!-- X tick labels -->
          <g class="labels-ticks">
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
        </g>
        </g>

        <!-- Axis labels -->
        <text
          class="axis-label"
          :x="22"
          :y="height / 2"
          text-anchor="middle"
          :transform="`rotate(-90 22 ${height / 2})`"
        >Total Win Points</text>
        <text
          class="axis-label"
          :x="width / 2"
          :y="height - 10"
          text-anchor="middle"
        >Season Timeline</text>

        <!-- Transparent overlay for better hit area -->
        <rect
          class="interaction-overlay"
          :x="padding"
          :y="padding"
          :width="width - padding * 2"
          :height="height - padding * 2"
        />
      </svg>
      <div v-if="isLoading || loadError" class="chart-overlay">
        <span v-if="isLoading" class="chart-overlay-text">Loading data...</span>
        <span v-if="loadError" class="chart-overlay-text chart-overlay-error">{{ loadError }}</span>
      </div>
    </div>

    <div class="chart-actions">
      <button @click="clearPoints" :disabled="points.length === 0 || !isAuthenticated">
        Clear
      </button>
      <button @click="openPointsModal" :disabled="points.length === 0">
        View points ({{ points.length }})
      </button>
      <span class="spacer"></span>
      <button @click="exportCSV" :disabled="points.length === 0">
        Export CSV
      </button>
      <button @click="openImportModal" :disabled="!isAuthenticated">Import CSV</button>
      <button @click="openSettingsModal" title="Settings" aria-label="Open settings">⚙️</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useAuth } from "@clerk/vue";
import {
  dateToMs,
  msToDateInput,
  formatDate,
} from "@/utils/date";
import { buildCSV } from "@/utils/csv";
import {
  MS_PER_DAY,
  calcXDomain,
  calcYDomain,
  scaleXFactory,
  scaleYFactory,
  buildPathD,
  buildXTicks,
} from "@/utils/chart";
import { loadSeasonJson } from "@/utils/season";
import { buildRankBands } from "@/utils/rankColors";
import { useRankInfo } from "@/composables/useRankInfo";
import { usePanZoom } from "@/composables/usePanZoom";
import { useGraphSettings } from "@/composables/useGraphSettings";
import { usePointsData } from "@/composables/usePointsData";
import GoalControls from "@/components/GoalControls.vue";
import StatsPanel from "@/components/StatsPanel.vue";
import ImportModal from "@/components/modals/ImportModal.vue";
import SettingsModal from "@/components/modals/SettingsModal.vue";
import PointsModal from "@/components/modals/PointsModal.vue";

// eslint-disable-next-line no-undef
const emit = defineEmits(["win-points"]);

// eslint-disable-next-line no-undef
const props = defineProps({
  storageKey: { type: String, default: "" },
  showGoalControl: { type: Boolean, default: true },
  // Optional list of rank thresholds to show a dropdown instead of raw numeric input
  // Expected shape: [{ badge: string, points: number }, ...]
  goalOptions: { type: Array, default: () => [] },
  headerDisclaimer: { type: String, default: "" },
  headerTitle: { type: String, default: "" },
});

// Config
const width = 600;
const height = 400;
const padding = 40;
const plotHeight = height - padding * 2;

const today = new Date();

// Settings (persisted to localStorage)
const {
  seasonStart,
  seasonEnd,
  seasonTitle,
  goalWinPoints,
  selectedGoalIndex,
  autoSetSeasonFromImport,
  simplifyImport,
  navSensitivity,
  enableNavigation,
  showRankOverlay,
  loadSettings,
} = useGraphSettings(props.storageKey);

// Domains
const isSeasonValid = computed(
  () =>
    seasonStart.value &&
    seasonEnd.value &&
    dateToMs(seasonStart.value) < dateToMs(seasonEnd.value)
);

// Points data (API-backed CRUD)
const {
  points,
  isLoading,
  loadError,
  isAuthenticated,
  sortedPoints,
  sortedPointsReverse,
  currentWinPoints,
  todayPoint,
  todayGain,
  loadPointsFromAPI,
  addPointAtDate,
  removePoint,
  onSaveEdit,
  clearPoints,
  onImportedRows,
  addWinPoints,
  incrementWinPoints,
} = usePointsData({ isSeasonValid, seasonStart, seasonEnd, autoSetSeasonFromImport });

// Modal state
const showImportModal = ref(false);
const showPointsModal = ref(false);
const showSettingsModal = ref(false);

const xDomain = computed(() =>
  calcXDomain(seasonStart.value, seasonEnd.value, today)
);

// Filter raw points to the current season (x) domain for display/scaling
const pointsInSeason = computed(() => {
  const [min, max] = xDomain.value;
  return points.filter((p) => {
    const ms = dateToMs(p.date);
    return isFinite(ms) && ms >= min && ms <= max;
  });
});

const yDomain = computed(() =>
  calcYDomain(pointsInSeason.value, goalWinPoints.value)
);

// Scales
const scaleX = (dateStr) =>
  scaleXFactory(xDomain.value, width, padding)(dateStr);
const scaleY = (y) => scaleYFactory(yDomain.value, height, padding)(y);

// Rank overlay bands
const rankBands = computed(() => buildRankBands(props.goalOptions));

// Points within season, but sorted by date for path rendering
const sortedPointsInSeason = computed(() => {
  const [min, max] = xDomain.value;
  return sortedPoints.value.filter((p) => {
    const ms = dateToMs(p.date);
    return ms >= min && ms <= max;
  });
});

const scaledPoints = computed(() =>
  sortedPointsInSeason.value.map((p) => ({ x: scaleX(p.date), y: scaleY(p.y) }))
);

// Build path points with a synthetic baseline at season start (y=0) when
// the first in-season point occurs after the season start. This extends the
// blue line visually back to day zero without adding a visible point.
const scaledPathPoints = computed(() => {
  const sp = scaledPoints.value;
  if (!sp.length) return sp;
  const seasonStartMs = dateToMs(seasonStart.value);
  const firstMs = dateToMs(sortedPointsInSeason.value[0].date);
  if (isFinite(seasonStartMs) && isFinite(firstMs) && firstMs > seasonStartMs) {
    const baseline = { x: scaleX(seasonStart.value), y: scaleY(0) };
    return [baseline, ...sp];
  }
  return sp;
});

const pathD = computed(() => buildPathD(scaledPathPoints.value));

// Rank info based on goalOptions thresholds
const goalOptionsRef = computed(() => props.goalOptions);
const { rankInfo, toNext, progressPct } = useRankInfo(currentWinPoints, goalOptionsRef);

// Pan/Zoom
const {
  svgRef,
  plotTransform,
  isOutOfDefault,
  resetView,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} = usePanZoom({ width, height, padding }, enableNavigation, navSensitivity);

// Projection paths
const pathGoalFromZero = computed(() => {
  if (!isSeasonValid.value) return "";
  const x1 = scaleX(seasonStart.value);
  const y1 = scaleY(0);
  const x2 = scaleX(seasonEnd.value);
  const y2 = scaleY(goalWinPoints.value);
  return `M${x1},${y1} L${x2},${y2}`;
});

const pathGoalFromLast = computed(() => {
  if (!isSeasonValid.value || sortedPointsInSeason.value.length === 0)
    return "";
  const last =
    sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1];
  const lastMs = dateToMs(last.date);
  if (lastMs >= xDomain.value[1]) return "";
  const x1 = scaleX(last.date);
  const y1 = scaleY(last.y);
  const x2 = scaleX(seasonEnd.value);
  const y2 = scaleY(goalWinPoints.value);
  return `M${x1},${y1} L${x2},${y2}`;
});

const xTicks = computed(() => buildXTicks(xDomain.value, width, padding, 4));

// Pace stats
const daysInSeason = computed(() => {
  if (!isSeasonValid.value) return 1;
  const [min, max] = xDomain.value;
  const days = (max - min) / MS_PER_DAY;
  return Math.max(1, Math.round(days));
});

const requiredPerDayZero = computed(() => {
  // slope of the zero→goal projection per day
  return goalWinPoints.value / daysInSeason.value;
});

const isFromLastDefined = computed(
  () =>
    sortedPointsInSeason.value.length > 0 &&
    dateToMs(
      sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1].date
    ) < xDomain.value[1]
);

const requiredPerDayFromLast = computed(() => {
  if (!isFromLastDefined.value) return 0;
  const last =
    sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1];
  const remaining = goalWinPoints.value - last.y;
  const endMs = xDomain.value[1];
  const left = Math.max(
    1,
    Math.round((endMs - dateToMs(last.date)) / MS_PER_DAY)
  );
  return remaining / left;
});

// Actions
function setGoalWinPoints(val) {
  const num = Number(val);
  if (Number.isFinite(num)) {
    goalWinPoints.value = num;
  }
}

function getGoalWinPoints() {
  return goalWinPoints.value;
}

function applySelectedGoal() {
  const idx = Number(selectedGoalIndex.value);
  if (
    Array.isArray(props.goalOptions) &&
    idx >= 0 &&
    idx < props.goalOptions.length
  ) {
    const pts = Number(props.goalOptions[idx]?.points);
    if (Number.isFinite(pts)) {
      goalWinPoints.value = pts;
    }
  }
}

function onSelectGoal(idx) {
  selectedGoalIndex.value = Number(idx);
  applySelectedGoal();
}

// Export CSV
function exportCSV() {
  const csv = buildCSV(points);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `line-data-${formatDate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openImportModal() {
  showImportModal.value = true;
}

function closeImportModal() {
  showImportModal.value = false;
}

function openPointsModal() {
  showPointsModal.value = true;
}

function closePointsModal() {
  showPointsModal.value = false;
}

function openSettingsModal() {
  showSettingsModal.value = true;
}

function closeSettingsModal() {
  showSettingsModal.value = false;
}

// (Removed per design) newDate is managed by parent when adding custom points.

// Expose imperative helpers to parent components
// eslint-disable-next-line no-undef
defineExpose({
  addWinPoints,
  incrementWinPoints,
  addPointAtDate,
  setGoalWinPoints,
  getGoalWinPoints,
});

// Keep selectedGoalIndex in sync with goalWinPoints and provided options
watch(
  [() => props.goalOptions, goalWinPoints],
  () => {
    if (Array.isArray(props.goalOptions) && props.goalOptions.length) {
      const idx = props.goalOptions.findIndex(
        (o) => Number(o.points) === Number(goalWinPoints.value)
      );
      selectedGoalIndex.value = idx;
    } else {
      selectedGoalIndex.value = -1;
    }
  },
  { deep: true }
);
watch(
  points,
  () => {
    emit("win-points", currentWinPoints.value);
  },
  { deep: true }
);

// Also emit when loaded and when points potentially change via import or initial state
watch(currentWinPoints, (v) => emit("win-points", v));

onMounted(async () => {
  loadSettings();
  try {
    const data = await loadSeasonJson();
    if (
      data &&
      data.currentSeason &&
      data.currentSeason.start &&
      data.currentSeason.end
    ) {
      const startMs = new Date(data.currentSeason.start).getTime();
      const endMs = new Date(data.currentSeason.end).getTime();
      if (!isNaN(startMs) && !isNaN(endMs)) {
        seasonStart.value = msToDateInput(startMs);
        seasonEnd.value = msToDateInput(endMs);
      }
      if (
        typeof data.currentSeason.name === "string" &&
        data.currentSeason.name.trim()
      ) {
        const nm = String(data.currentSeason.name).trim();
        seasonTitle.value = nm.startsWith("Season") ? nm : `Season ${nm}`;
      }
    }
  } catch (e) {
    // If fetch fails (e.g., CORS), keep existing defaults/state
  }
  // Load points from D1
  await loadPointsFromAPI();
  // Emit initial after load tick
  requestAnimationFrame(() => emit("win-points", currentWinPoints.value));
});

// Re-load data when Clerk auth state changes (e.g. user signs in after mount)
try {
  const { isSignedIn } = useAuth();
  watch(isSignedIn, (signedIn) => {
    if (signedIn && !isAuthenticated.value) {
      loadPointsFromAPI();
    }
  });
} catch (_) {
  // Clerk not available (e.g. dev mode)
}

</script>

<style scoped>
.line-graph {
  max-width: 1000px;
  margin: 0 auto;
  text-align: left;
}

.lg-header {
  margin-bottom: 8px;
}
.lg-gamemode {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-strong);
}
.lg-season-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-strong);
}
.lg-disclaimer {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
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

.divider {
  width: 1px;
  height: 24px;
  background: color-mix(in oklab, var(--primary) 16%, var(--surface));
  margin: 0 8px;
}

.quick-actions button {
  margin-right: 8px;
}

/* Recenter button floats inside chart-wrapper */
.recenter-btn {
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 10;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  background: color-mix(in oklab, var(--surface) 85%, #000);
  border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--surface));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.recenter-btn:hover {
  background: color-mix(in oklab, var(--surface) 90%, #000);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 0 3px var(--ring);
}

.quick-actions .spacer {
  flex: 1;
}

.chart-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.chart-actions .spacer {
  flex: 1;
}

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
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 6px 24px rgba(0, 0, 0, 0.35);
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


.today-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 13px;
}
.today-label {
  color: var(--muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 12px;
}
.today-value {
  color: var(--success);
  font-weight: 800;
}

.status-banner {
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}
.auth-banner {
  background: color-mix(in oklab, var(--warning, #f59e0b) 10%, var(--surface));
  color: var(--muted);
  border: 1px solid color-mix(in oklab, var(--warning, #f59e0b) 20%, var(--surface));
}

.chart-blurred {
  filter: blur(4px);
  opacity: 0.4;
  transition: filter 0.3s, opacity 0.3s;
  pointer-events: none;
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}

.chart-overlay-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in oklab, var(--surface) 80%, transparent);
  padding: 10px 20px;
  border-radius: 8px;
}

.chart-overlay-error {
  color: #ff6b6b;
}

.error {
  color: #ff6b6b;
  margin: 4px 0 8px;
}

.chart-wrapper {
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  border-radius: 10px;
  padding: 8px;
  background: radial-gradient(
      100% 100% at 0% 0%,
      rgba(255, 212, 0, 0.05) 0%,
      rgba(0, 0, 0, 0) 40%
    ),
    var(--surface);
  position: relative;
}

svg {
  width: 100%;
  height: auto;
  /* Enable custom gestures */
  touch-action: none;
  cursor: default;
}

svg.nav-disabled {
  touch-action: auto;
}

.interaction-overlay {
  fill: transparent;
  cursor: grab;
}
.interaction-overlay:active {
  cursor: grabbing;
}

.axes line {
  stroke: color-mix(in oklab, var(--primary) 35%, #1f2937);
  stroke-width: 1.25;
}

.rank-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  pointer-events: none;
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
  filter: drop-shadow(
    0 0 6px color-mix(in oklab, var(--accent) 60%, transparent)
  );
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

.axis-label {
  font-size: 11px;
  fill: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

/* Positioned version for inside the graph wrapper */
.rank-in-graph {
  position: absolute;
  top: 8px;
  left: 8px;
  max-width: min(460px, 60%);
  z-index: 9;
}

/* ── Mobile (phone) ── */
@media (max-width: 480px) {
  .chart-actions {
    flex-wrap: wrap;
  }
  .chart-actions button {
    flex: 1 1 auto;
    min-width: 0;
  }
  .chart-actions .spacer {
    display: none;
  }

  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .status-banner {
    font-size: 12px;
    padding: 8px 12px;
  }

  .lg-header {
    padding: 0 4px;
  }
}
</style>
