<template>
  <div class="line-graph">
    <header class="lg-header">
      <h2 v-if="gamemode" class="lg-gamemode">{{ gamemode }}</h2>
      <h2 class="lg-season-title">
        {{ displayTitle }}
        <span v-if="isViewingPastSeason" class="readonly-badge">read-only</span>
      </h2>
      <div v-if="headerDisclaimer" class="lg-disclaimer">
        {{ headerDisclaimer }}
      </div>
    </header>

    <!-- Season picker + previous-season overlay. Teleported into the aside
         (under the points controls) when a target is provided; rendered inline
         otherwise. State stays here — only the DOM moves. -->
    <Teleport v-if="teleportControls" :to="seasonControlsTo">
      <SeasonControls
        :seasons="seasons"
        :seasons-desc="seasonsDesc"
        :overlay-options="overlayOptions"
        :current-season-key="currentSeasonKey"
        :selected="selectedSeasonKey"
        :overlay="overlaySeasonKey"
        :overlay-season="overlaySeason"
        @update:selected="selectedSeasonKey = $event"
        @update:overlay="overlaySeasonKey = $event"
      />
    </Teleport>
    <SeasonControls
      v-else-if="!seasonControlsTo"
      :seasons="seasons"
      :seasons-desc="seasonsDesc"
      :overlay-options="overlayOptions"
      :current-season-key="currentSeasonKey"
      :selected="selectedSeasonKey"
      :overlay="overlaySeasonKey"
      :overlay-season="overlaySeason"
      @update:selected="selectedSeasonKey = $event"
      @update:overlay="overlaySeasonKey = $event"
    />

    <div v-if="!isAuthenticated && !isLoading" class="status-banner auth-banner">
      Sign in to save and sync your data.
    </div>

    <div
      v-if="isViewingPastSeason && isAuthenticated && !scaledPoints.length && !isLoading"
      class="status-banner"
    >
      No data logged for {{ selectedSeason && selectedSeason.name }}.
    </div>

    <!-- Unified status: goal/progress + required pace. Today's gain and live DB
         status are overlaid in the graph corners (see chart-wrapper below). -->
    <section class="lg-status">
      <div class="controls" v-if="showGoalControl">
        <GoalControls
          :goal-options="goalOptions"
          :selected-goal-index="selectedGoalIndex"
          :goal-win-points="goalWinPoints"
          :rank-info="rankInfo"
          :current-win-points="currentWinPoints"
          :to-next="toNext"
          :progress-pct="progressPct"
          :unit="unit"
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
    </section>

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


    <!-- Points Modal -->
    <PointsModal
      v-if="showPointsModal"
      :points="points"
      :sorted-points-reverse="sortedPointsReverse"
      :read-only="isViewingPastSeason"
      @save-edit="onSaveEdit"
      @remove-point="removePoint"
      @close="closePointsModal"
    />

    <p v-if="!isSeasonValid" class="error">Season start must be before end.</p>

    <div class="chart-wrapper" v-if="isSeasonValid">
      <!-- In-graph overlays: today's gain (top-left), live DB status (top-right) -->
      <div class="graph-overlay">
        <div class="today-progress">
          <template v-if="todayPoint">
            <span class="today-label">Today</span>
            <span class="today-value" :class="{ 'today-loss': todayGain < 0 }"
              >{{ todayGain >= 0 ? "+" : "" }}{{ todayGain }} pts</span
            >
          </template>
          <template v-else>
            <span class="today-label">No points logged today</span>
          </template>
        </div>
        <div
          v-if="liveStatus !== 'disconnected'"
          class="live-indicator"
          :class="`live-${liveStatus}`"
          :title="
            liveStatus === 'connected'
              ? 'Connected to live updates'
              : 'Connecting to live updates…'
          "
        >
          <svg
            class="live-db"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
        </div>
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
        :viewBox="`0 0 ${width} ${svgHeight}`"
        :width="width"
        :height="svgHeight"
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
          <path
            v-if="showAveragePace && showDeviationWedge && pathDeviationWedge"
            :d="pathDeviationWedge"
            class="deviation-wedge"
          />
          <path
            v-if="showAveragePace && pathAveragePace"
            :d="pathAveragePace"
            class="proj proj-average-pace"
          />

          <!-- Ranked: flat baseline from season start to the placement point -->
          <path
            v-if="placementBaselinePath"
            :d="placementBaselinePath"
            class="placement-baseline"
          />

          <!-- Previous-season overlay (aligned by day-of-season) -->
          <path v-if="overlayPathD" :d="overlayPathD" class="overlay-line" />
          <g
            v-for="(p, idx) in overlayScaledPoints"
            :key="'ov-' + idx"
            class="overlay-point"
          >
            <circle :cx="p.x" :cy="p.y" r="2.5" />
          </g>

          <!-- Path -->
          <path v-if="pathD" :d="pathD" class="line" />

          <!-- Points -->
          <g v-for="(p, idx) in scaledPoints" :key="idx" class="point">
            <circle :cx="p.x" :cy="p.y" r="3" />
          </g>

        </g>
        </g>

        <!-- Pace graph area -->
        <g v-if="showPaceGraph" class="pace-area">
          <!-- Pace axes -->
          <line class="pace-axis"
            :x1="padding" :y1="paceBottom"
            :x2="width - padding" :y2="paceBottom"
          />
          <line class="pace-axis"
            :x1="padding" :y1="paceTop"
            :x2="padding" :y2="paceBottom"
          />
          <!-- Pace grid (vertical ticks) -->
          <g class="grid">
            <template v-for="(tick, i) in xTicks" :key="`pv-${i}`">
              <line :x1="tick.x" :x2="tick.x" :y1="paceTop" :y2="paceBottom" />
            </template>
          </g>
          <!-- Zero reference line: above = net gain, below = net loss -->
          <line
            class="pace-zero-line"
            :x1="padding" :x2="width - padding"
            :y1="paceScaleY(0)" :y2="paceScaleY(0)"
          />
          <text
            class="pace-zero-label"
            :x="padding + 2" :y="paceScaleY(0) - 3"
          >0</text>
          <!-- Required pace line -->
          <path v-if="paceRequiredPath" :d="paceRequiredPath" class="pace-line pace-line-required" />
          <line v-if="scaledPaceRequired.length"
            class="pace-line pace-line-required"
            :x1="scaledPaceRequired[scaledPaceRequired.length - 1].x"
            :y1="scaledPaceRequired[scaledPaceRequired.length - 1].y"
            :x2="width - padding"
            :y2="scaledPaceRequired[scaledPaceRequired.length - 1].y"
          />
          <!-- Points earned per day: bars (default) or line -->
          <template v-if="paceEarnedStyle === 'bars'">
            <rect
              v-for="(b, i) in scaledPaceEarnedBars"
              :key="'peb-' + i"
              class="pace-bar-earned"
              :x="b.x"
              :y="b.y"
              :width="b.width"
              :height="b.height"
            />
          </template>
          <template v-else>
            <path v-if="paceEarnedPath" :d="paceEarnedPath" class="pace-line pace-line-earned" />
            <g v-for="(p, i) in scaledPaceEarned" :key="'ppe-' + i" class="pace-point pace-point-earned">
              <circle :cx="p.x" :cy="p.y" r="2.5" />
            </g>
          </template>
          <!-- Pace Y axis label -->
          <text
            class="axis-label"
            :x="22"
            :y="paceTop + paceHeight / 2"
            text-anchor="middle"
            :transform="`rotate(-90 22 ${paceTop + paceHeight / 2})`"
          >Pts / Day</text>
          <!-- Pace legend -->
          <text class="pace-legend" :x="width - padding - 4" :y="paceTop + 10" text-anchor="end">
            <tspan class="pace-legend-required">-- required</tspan>
          </text>
          <text class="pace-legend" :x="width - padding - 4" :y="paceTop + 22" text-anchor="end">
            <tspan class="pace-legend-earned">{{ paceEarnedStyle === 'bars' ? '▮ earned' : '-- earned' }}</tspan>
          </text>
        </g>

        <!-- Axis labels -->
        <text
          class="axis-label"
          :x="22"
          :y="height / 2"
          text-anchor="middle"
          :transform="`rotate(-90 22 ${height / 2})`"
        >{{ yAxisLabel }}</text>
        <text
          class="axis-label"
          :x="width / 2"
          :y="svgHeight - 4"
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
      <div class="action-group">
        <button @click="openPointsModal" :disabled="points.length === 0">
          View points ({{ points.length }})
        </button>
        <button @click="exportCSV" :disabled="points.length === 0">
          Export CSV
        </button>
        <button
          @click="openImportModal"
          :disabled="!isAuthenticated || isViewingPastSeason"
        >
          Import CSV
        </button>
        <button
          class="btn-danger"
          @click="clearPoints"
          :disabled="points.length === 0 || !isAuthenticated || isViewingPastSeason"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, nextTick } from "vue";
import { useAuth } from "@clerk/vue";
import {
  dateToMs,
  formatDate,
} from "@/utils/date";
import { buildCSV } from "@/utils/csv";
import { useRankInfo } from "@/composables/useRankInfo";
import { usePanZoom } from "@/composables/usePanZoom";
import { useGraphSettings } from "@/composables/useGraphSettings";
import { useSeasons } from "@/composables/useSeasons";
import { usePointsData } from "@/composables/usePointsData";
import { useChartGeometry } from "@/composables/useChartGeometry";
import GoalControls from "@/components/GoalControls.vue";
import StatsPanel from "@/components/StatsPanel.vue";
import SeasonControls from "@/components/SeasonControls.vue";
import ImportModal from "@/components/modals/ImportModal.vue";
import PointsModal from "@/components/modals/PointsModal.vue";

// eslint-disable-next-line no-undef
const emit = defineEmits(["win-points", "read-only"]);

// eslint-disable-next-line no-undef
const props = defineProps({
  storageKey: { type: String, default: "" },
  showGoalControl: { type: Boolean, default: true },
  // Optional list of rank thresholds to show a dropdown instead of raw numeric input
  // Expected shape: [{ badge: string, points: number }, ...]
  goalOptions: { type: Array, default: () => [] },
  headerDisclaimer: { type: String, default: "" },
  headerTitle: { type: String, default: "" },
  // Which game mode's data this graph reads/writes. Keeps World Tour and
  // Ranked records in separate buckets on the server.
  mode: { type: String, default: "world-tour" },
  // Y-axis label and progress unit (e.g. "Rank Score" / "RS" for Ranked).
  yAxisLabel: { type: String, default: "Total Win Points" },
  unit: { type: String, default: "WP" },
  // CSS selector of an element (in the aside) to teleport the season controls
  // into. When empty, the controls render inline under the header.
  seasonControlsTo: { type: String, default: "" },
});

// Config
const width = 600;
const height = 400;
const padding = 40;
const plotHeight = height - padding * 2;

// Pace graph area (below main plot, above x-tick labels)
const paceGap = 12;
const paceTop = height - padding + paceGap; // 412
const paceHeight = 70;
const paceBottom = paceTop + paceHeight; // 482
const pacePadY = 6;
const svgHeightPace = paceBottom + 22; // room for "Season Timeline" label

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
  showAveragePace,
  showDeviationWedge,
  showPaceGraph,
  paceEarnedStyle,
  loadSettings,
} = useGraphSettings(props.storageKey);

const svgHeight = computed(() => showPaceGraph.value ? svgHeightPace : height);

// Season list (current + historical) for the picker and overlay.
const { seasons, currentSeasonKey, load: loadSeasons } = useSeasons();

// Which season the graph is centered on, and which (if any) is overlaid for
// comparison. Not persisted — the graph always opens on the live season.
const selectedSeasonKey = ref("");
const overlaySeasonKey = ref("");

// The teleport target (in the aside) is rendered by the parent and may not
// exist until after this component mounts, so gate the Teleport on a post-mount
// flag to avoid "failed to locate target" warnings.
const controlsMounted = ref(false);
const teleportControls = computed(
  () => !!props.seasonControlsTo && controlsMounted.value
);

const currentSeason = computed(
  () => seasons.value.find((s) => s.key === currentSeasonKey.value) || null
);
const selectedSeason = computed(
  () => seasons.value.find((s) => s.key === selectedSeasonKey.value) || null
);
const overlaySeason = computed(
  () => seasons.value.find((s) => s.key === overlaySeasonKey.value) || null
);

// True when looking at any season other than the live one — the graph becomes
// read-only (a historical look-back, not an editable log).
const isViewingPastSeason = computed(
  () =>
    !!selectedSeasonKey.value &&
    !!currentSeasonKey.value &&
    selectedSeasonKey.value !== currentSeasonKey.value
);

// The window the chart actually renders. For the live season this is the
// persisted seasonStart/seasonEnd (unchanged behavior); for a past season it's
// that season's fixed window.
const viewedStart = computed(() =>
  isViewingPastSeason.value && selectedSeason.value
    ? selectedSeason.value.start
    : seasonStart.value
);
const viewedEnd = computed(() =>
  isViewingPastSeason.value && selectedSeason.value
    ? selectedSeason.value.end
    : seasonEnd.value
);
const overlayStart = computed(() =>
  overlaySeason.value ? overlaySeason.value.start : null
);
const overlayEnd = computed(() =>
  overlaySeason.value ? overlaySeason.value.end : null
);

// Season picker option lists.
const seasonsDesc = computed(() => [...seasons.value].reverse());
const overlayOptions = computed(() =>
  seasonsDesc.value.filter((s) => s.key !== selectedSeasonKey.value)
);

const displayTitle = computed(() => {
  if (isViewingPastSeason.value && selectedSeason.value)
    return selectedSeason.value.name;
  return props.headerTitle || seasonTitle.value || "Interactive Line Graph";
});

// Domains
const isSeasonValid = computed(
  () =>
    viewedStart.value &&
    viewedEnd.value &&
    dateToMs(viewedStart.value) < dateToMs(viewedEnd.value)
);

// Clear an overlay that collides with the newly selected season (can't overlay
// a season on itself).
watch(selectedSeasonKey, (key) => {
  if (overlaySeasonKey.value === key) overlaySeasonKey.value = "";
});

watch(isViewingPastSeason, (v) => emit("read-only", v), { immediate: true });

// Points data (API-backed CRUD)
const {
  points,
  isLoading,
  loadError,
  isAuthenticated,
  liveStatus,
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
} = usePointsData({ isSeasonValid, seasonStart, seasonEnd, autoSetSeasonFromImport, mode: props.mode, isReadOnly: isViewingPastSeason });

// Modal state
const showImportModal = ref(false);
const showPointsModal = ref(false);

// Chart geometry (domains, scales, line/projection paths, pace sub-graph data).
// Pure reactive derivations — see useChartGeometry.
const {
  scaleY,
  rankBands,
  scaledPoints,
  pathD,
  overlayScaledPoints,
  overlayPathD,
  placementBaselinePath,
  pathGoalFromZero,
  pathGoalFromLast,
  pathAveragePace,
  pathDeviationWedge,
  xTicks,
  paceScaleY,
  scaledPaceRequired,
  scaledPaceEarned,
  scaledPaceEarnedBars,
  paceRequiredPath,
  paceEarnedPath,
  requiredPerDayZero,
  isFromLastDefined,
  requiredPerDayFromLast,
} = useChartGeometry({
  width,
  height,
  padding,
  paceTop,
  paceHeight,
  pacePadY,
  today,
  mode: props.mode,
  goalOptions: () => props.goalOptions,
  seasonStart: viewedStart,
  seasonEnd: viewedEnd,
  goalWinPoints,
  isSeasonValid,
  points,
  sortedPoints,
  overlayStart,
  overlayEnd,
});

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
    await loadSeasons();
    // Default the live season's window to the current season (unchanged
    // behavior) and open the picker on it.
    const cur = currentSeason.value;
    if (cur) {
      seasonStart.value = cur.start;
      seasonEnd.value = cur.end;
      seasonTitle.value = cur.name;
    }
    selectedSeasonKey.value = currentSeasonKey.value;
  } catch (e) {
    // If fetch fails (e.g., CORS), keep existing defaults/state
  }
  // Wait for the full tree (incl. the aside teleport target) to render before
  // enabling the teleport.
  await nextTick();
  controlsMounted.value = true;
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

<style scoped src="./LineGraph.css"></style>
