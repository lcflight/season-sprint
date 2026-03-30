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
    <div
      v-if="showSettingsModal"
      class="modal-backdrop"
      @click.self="closeSettingsModal"
    >
      <div class="modal">
        <header class="modal-header">
          <h3>Settings</h3>
        </header>
        <section class="modal-body settings">
          <div class="setting-group">
            <div class="setting-info">
              <div class="setting-title">Navigation sensitivity</div>
              <div class="setting-desc">
                Controls how fast panning feels and how strong wheel zoom is.
              </div>
            </div>
            <div class="setting-control">
              <input
                id="navSensitivity"
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                v-model.number="navSensitivity"
              />
              <div class="setting-hint">
                Current: {{ navSensitivity.toFixed(2) }}×
              </div>
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-info">
              <div class="setting-title">Graph navigation</div>
              <div class="setting-desc">
                Enable or disable drag-to-pan and pinch/wheel zoom on the chart.
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-row" for="enableNav">
                <input
                  id="enableNav"
                  class="toggle"
                  type="checkbox"
                  v-model="enableNavigation"
                />
                <span class="toggle-text">Enable pan/zoom</span>
              </label>
            </div>
          </div>

          <div class="setting-group" v-if="goalOptions.length">
            <div class="setting-info">
              <div class="setting-title">Rank overlay</div>
              <div class="setting-desc">
                Show translucent rank threshold bands on the chart.
              </div>
            </div>
            <div class="setting-control">
              <label class="toggle-row" for="showRankOverlay">
                <input
                  id="showRankOverlay"
                  class="toggle"
                  type="checkbox"
                  v-model="showRankOverlay"
                />
                <span class="toggle-text">Show rank overlay</span>
              </label>
            </div>
          </div>
        </section>
        <footer class="modal-footer">
          <button @click="closeSettingsModal">Close</button>
        </footer>
      </div>
    </div>

    <!-- Points Modal -->
    <div
      v-if="showPointsModal"
      class="modal-backdrop"
      @click.self="closePointsModal"
    >
      <div class="modal">
        <header class="modal-header">
          <h3>Points</h3>
        </header>
        <section class="modal-body">
          <p v-if="!points.length" class="muted">No points yet.</p>
          <ul class="points-ul" v-else>
            <li v-for="(pt, i) in sortedPointsReverse" :key="i">
              <template v-if="editIndex === getOriginalIndex(pt)">
                <div class="edit-row">
                  <label>
                    date
                    <input v-model="editDate" type="date" required />
                  </label>
                  <label>
                    points
                    <input
                      v-model.number="editY"
                      type="number"
                      step="any"
                      required
                    />
                  </label>
                </div>
                <div class="row-actions">
                  <button
                    class="btn-primary"
                    @click="saveEdit(getOriginalIndex(pt))"
                    :disabled="!canSaveEdit"
                  >
                    save
                  </button>
                  <button class="btn-ghost" @click="cancelEdit">cancel</button>
                </div>
              </template>
              <template v-else>
                <span>({{ pt.date }} , {{ pt.y }} pts)</span>
                <div class="row-actions">
                  <button
                    class="btn-primary"
                    @click="openEdit(getOriginalIndex(pt))"
                  >
                    edit
                  </button>
                  <button
                    class="btn-ghost"
                    @click="removePoint(getOriginalIndex(pt))"
                  >
                    remove
                  </button>
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
import { computed, reactive, ref, watch, onMounted } from "vue";
import { useAuth } from "@clerk/vue";
import {
  isValidDateStr,
  dateToMs,
  msToDateInput,
  addDays,
  clamp,
  formatDate,
} from "@/utils/date";
import { buildCSV } from "@/utils/csv";
import {
  saveStateWithKey,
  loadStateWithKey,
} from "@/utils/storage";
import {
  getRecords,
  upsertRecord,
  deleteRecord,
  deleteAllRecords,
  bulkUpsertRecords,
  getAuthorizationHeader,
} from "@/services/api";
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
import GoalControls from "@/components/GoalControls.vue";
import StatsPanel from "@/components/StatsPanel.vue";
import ImportModal from "@/components/modals/ImportModal.vue";

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

// Season range state (defaults: today .. +30 days)
const today = new Date();
const seasonStart = ref(formatDate(today));
const seasonEnd = ref(formatDate(addDays(today, 30)));
const seasonTitle = ref("");

// Points (date-based, loaded from API)
const points = reactive([]);

// API state
const isLoading = ref(false);
const loadError = ref("");
const isAuthenticated = ref(false);

// Inputs for adding a point are managed by parent UI; expose helpers instead

// Goal win points
const goalWinPoints = ref(10);
// If goalOptions provided, track selected index
const selectedGoalIndex = ref(-1);

// Import/Export state
const showImportModal = ref(false);
const showPointsModal = ref(false);
const autoSetSeasonFromImport = ref(true);
const simplifyImport = ref(false);

// Settings
const showSettingsModal = ref(false);
const navSensitivity = ref(1);
const enableNavigation = ref(false);
const showRankOverlay = ref(true);

// Editing state for points
const editIndex = ref(-1);
const editDate = ref("");
const editY = ref(0);
const canSaveEdit = computed(
  () => isValidDateStr(editDate.value) && isFinite(editY.value)
);

// Settings persistence (UI preferences only — points are in D1)
function saveSettings() {
  const state = {
    seasonStart: seasonStart.value,
    seasonEnd: seasonEnd.value,
    goalWinPoints: goalWinPoints.value,
    autoSetSeasonFromImport: autoSetSeasonFromImport.value,
    simplifyImport: simplifyImport.value,
    navSensitivity: navSensitivity.value,
    enableNavigation: enableNavigation.value,
    showRankOverlay: showRankOverlay.value,
  };
  const key = props.storageKey
    ? `season-sprint:${props.storageKey}:v1`
    : `season-sprint:line-graph:v1`;
  saveStateWithKey(key, state);
}

function loadSettings() {
  const key = props.storageKey
    ? `season-sprint:${props.storageKey}:v1`
    : `season-sprint:line-graph:v1`;
  const parsed = loadStateWithKey(key);
  if (!parsed || typeof parsed !== "object") return;
  if (
    typeof parsed.seasonStart === "string" &&
    isValidDateStr(parsed.seasonStart)
  )
    seasonStart.value = parsed.seasonStart;
  if (typeof parsed.seasonEnd === "string" && isValidDateStr(parsed.seasonEnd))
    seasonEnd.value = parsed.seasonEnd;
  if (
    typeof parsed.goalWinPoints === "number" &&
    isFinite(parsed.goalWinPoints)
  )
    goalWinPoints.value = parsed.goalWinPoints;
  if (typeof parsed.autoSetSeasonFromImport === "boolean")
    autoSetSeasonFromImport.value = parsed.autoSetSeasonFromImport;
  if (typeof parsed.simplifyImport === "boolean")
    simplifyImport.value = parsed.simplifyImport;
  if (
    typeof parsed.navSensitivity === "number" &&
    isFinite(parsed.navSensitivity)
  )
    navSensitivity.value = parsed.navSensitivity;
  if (typeof parsed.enableNavigation === "boolean")
    enableNavigation.value = parsed.enableNavigation;
  if (typeof parsed.showRankOverlay === "boolean")
    showRankOverlay.value = parsed.showRankOverlay;
}

// Load points from D1 via API
async function loadPointsFromAPI() {
  isLoading.value = true;
  loadError.value = "";
  try {
    const authHeader = await getAuthorizationHeader();
    if (!authHeader) {
      isAuthenticated.value = false;
      return;
    }
    isAuthenticated.value = true;
    const records = await getRecords(authHeader);
    const mapped = records.map((r) => ({
      remoteId: r.id,
      date: typeof r.date === "string" ? r.date.slice(0, 10) : "",
      y: r.winPoints,
    }));
    points.splice(0, points.length, ...mapped);
  } catch (e) {
    loadError.value = "Failed to load data. Please refresh to try again.";
    console.error("Failed to load points from API", e);
  } finally {
    isLoading.value = false;
  }
}

// Persist a single point to D1 (returns the upserted record)
async function persistPoint(dateStr, yVal) {
  try {
    const authHeader = await getAuthorizationHeader();
    if (!authHeader) return null;
    const result = await upsertRecord(dateStr, Number(yVal), authHeader);
    return result.record;
  } catch (error) {
    console.warn("Failed to persist point to server", error);
    return null;
  }
}

// Domains
const isSeasonValid = computed(
  () =>
    seasonStart.value &&
    seasonEnd.value &&
    dateToMs(seasonStart.value) < dateToMs(seasonEnd.value)
);

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

// Derived
const sortedPoints = computed(() =>
  [...points].sort((a, b) => dateToMs(a.date) - dateToMs(b.date))
);

// Points sorted in reverse order for display (newest first)
const sortedPointsReverse = computed(() =>
  [...points].sort((a, b) => dateToMs(b.date) - dateToMs(a.date))
);

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

// Today's progress
const todayStr = formatDate(new Date());
const todayPoint = computed(() => {
  return sortedPoints.value.find((p) => p.date === todayStr) || null;
});
const todayGain = computed(() => {
  if (!todayPoint.value) return 0;
  // Find the last point before today
  const prev = [...sortedPoints.value]
    .filter((p) => p.date < todayStr)
    .pop();
  const prevY = prev ? prev.y : 0;
  return Math.round((todayPoint.value.y - prevY) * 100) / 100;
});

// Current win points (latest y)
const currentWinPoints = computed(() => {
  const pts = sortedPoints.value;
  return pts.length ? Number(pts[pts.length - 1].y) : 0;
});

// Rank info based on goalOptions thresholds
const rankInfo = computed(() => {
  const opts = Array.isArray(props.goalOptions) ? props.goalOptions : [];
  if (!opts.length) {
    return { badge: "—", currentFloor: 0, nextTarget: null, nextBadge: null };
  }
  const wp = Math.max(0, Number(currentWinPoints.value) || 0);
  let prev = { badge: "Unranked", points: 0 };
  for (let i = 0; i < opts.length; i++) {
    const t = opts[i];
    const pts = Number(t?.points);
    if (!Number.isFinite(pts)) continue;
    if (wp < pts) {
      return {
        badge: prev.badge,
        currentFloor: prev.points,
        nextTarget: pts,
        nextBadge: t.badge ?? "",
      };
    }
    prev = { badge: t.badge ?? prev.badge, points: pts };
  }
  // At or beyond the top threshold
  return {
    badge: prev.badge,
    currentFloor: prev.points,
    nextTarget: null,
    nextBadge: null,
  };
});

const toNext = computed(() => {
  return rankInfo.value.nextTarget === null
    ? 0
    : Math.max(
        0,
        Number(rankInfo.value.nextTarget) -
          Math.floor(Number(currentWinPoints.value) || 0)
      );
});

const progressPct = computed(() => {
  const floor = Number(rankInfo.value.currentFloor) || 0;
  const ceil = rankInfo.value.nextTarget ?? floor;
  const span = Math.max(1, Number(ceil) - floor);
  const clamped = Math.min(
    Number(ceil),
    Math.max(floor, Number(currentWinPoints.value) || 0)
  );
  return ((clamped - floor) / span) * 100;
});

// Pan/Zoom state
const svgRef = ref(null);
const zoomScale = ref(1);
const minScale = 1;
const maxScale = 2;
const translate = reactive({ x: 0, y: 0 });

const plotTransform = computed(
  () => `translate(${translate.x}, ${translate.y}) scale(${zoomScale.value})`
);
const isOutOfDefault = computed(
  () => zoomScale.value !== 1 || translate.x !== 0 || translate.y !== 0
);

function resetView() {
  zoomScale.value = 1;
  translate.x = 0;
  translate.y = 0;
}

function clampScale(s) {
  return Math.min(maxScale, Math.max(minScale, s));
}

function clampTranslate() {
  // Prevent panning the plot area outside the visible SVG viewport.
  // The plot area spans [padding .. width-padding] x [padding .. height-padding].
  // After transform: a point at plotX maps to translate + plotX * scale.
  // We want the left edge of the plot (padding) to not go right of the SVG left edge (padding),
  // and the right edge (width-padding) to not go left of the SVG right edge (width-padding).
  const s = zoomScale.value;

  // max translate: left edge of scaled plot aligns with left edge of viewport plot area
  const maxTx = padding - padding * s;
  // min translate: right edge of scaled plot aligns with right edge of viewport plot area
  const minTx = (width - padding) - (width - padding) * s;

  const maxTy = padding - padding * s;
  const minTy = (height - padding) - (height - padding) * s;

  translate.x = clamp(translate.x, minTx, maxTx);
  translate.y = clamp(translate.y, minTy, maxTy);
}

function wheelZoom(deltaY, mx, my) {
  const zoomIntensity = 0.0015 * navSensitivity.value;
  const scaleFactor = Math.exp(-deltaY * zoomIntensity);
  const oldScale = zoomScale.value;
  const newScale = clampScale(oldScale * scaleFactor);
  const k = newScale / oldScale;
  // keep cursor position stable
  translate.x = mx - (mx - translate.x) * k;
  translate.y = my - (my - translate.y) * k;
  zoomScale.value = newScale;
  clampTranslate();
}

function svgPointFromEvent(evt) {
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * width;
  const y = ((evt.clientY - rect.top) / rect.height) * height;
  return { x, y };
}

function onWheel(evt) {
  if (!enableNavigation.value) {
    // Allow page to scroll normally when navigation is disabled
    return;
  }
  // When handling zoom, prevent page scroll
  evt.preventDefault();
  const { x, y } = svgPointFromEvent(evt);
  // constrain zoom center to plot area for better UX
  const mx = clamp(x, padding, width - padding);
  const my = clamp(y, padding, height - padding);
  wheelZoom(evt.deltaY, mx, my);
}

// Pointer interactions (pan + pinch)
const pointers = reactive(new Map());
let lastMid = null;
let lastDist = 0;
let isDragging = false;
let lastPos = { x: 0, y: 0 };

function updatePointer(evt) {
  pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
}

function removePointer(evt) {
  pointers.delete(evt.pointerId);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function onPointerDown(evt) {
  if (!enableNavigation.value) return;
  // Only start interactions inside plot area
  const { x, y } = svgPointFromEvent(evt);
  if (x < padding || x > width - padding || y < padding || y > height - padding)
    return;
  evt.currentTarget.setPointerCapture?.(evt.pointerId);
  updatePointer(evt);
  if (pointers.size === 1) {
    isDragging = true;
    lastPos = { x: evt.clientX, y: evt.clientY };
  }
}

function onPointerMove(evt) {
  if (!enableNavigation.value) return;
  if (!pointers.has(evt.pointerId)) return;
  updatePointer(evt);
  if (pointers.size === 1 && isDragging) {
    const dx = evt.clientX - lastPos.x;
    const dy = evt.clientY - lastPos.y;
    translate.x +=
      dx *
      (width / svgRef.value.getBoundingClientRect().width) *
      navSensitivity.value;
    translate.y +=
      dy *
      (height / svgRef.value.getBoundingClientRect().height) *
      navSensitivity.value;
    clampTranslate();
    lastPos = { x: evt.clientX, y: evt.clientY };
  } else if (pointers.size === 2) {
    const [p1, p2] = Array.from(pointers.values());
    const mid = midpoint(p1, p2);
    const dist = distance(p1, p2);
    if (lastMid && lastDist) {
      const rect = svgRef.value.getBoundingClientRect();
      // Convert midpoint from client to SVG coords
      const mx = ((mid.x - rect.left) / rect.width) * width;
      const my = ((mid.y - rect.top) / rect.height) * height;
      const scaleChange = dist / lastDist;
      const oldScale = zoomScale.value;
      const newScale = clampScale(oldScale * scaleChange);
      const k = newScale / oldScale;
      translate.x = mx - (mx - translate.x) * k;
      translate.y = my - (my - translate.y) * k;
      zoomScale.value = newScale;
      clampTranslate();
    }
    lastMid = mid;
    lastDist = dist;
  }
}

function onPointerUp(evt) {
  removePointer(evt);
  if (pointers.size < 2) {
    lastMid = null;
    lastDist = 0;
  }
  if (pointers.size === 0) {
    isDragging = false;
  }
}

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

async function addPointAtDate(dateStr, yVal) {
  if (!isSeasonValid.value) return;
  if (!isValidDateStr(dateStr)) return;
  const yNum = Number(yVal);
  if (!isFinite(yNum)) return;
  const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(dateStr));
  if (idx !== -1) {
    points[idx] = { ...points[idx], date: dateStr, y: yNum };
  } else {
    points.push({ date: dateStr, y: yNum });
  }
  const record = await persistPoint(dateStr, yNum);
  if (record) {
    // Update remoteId from server response
    const updatedIdx = points.findIndex((p) => dateToMs(p.date) === dateToMs(dateStr));
    if (updatedIdx !== -1) {
      points[updatedIdx] = { ...points[updatedIdx], remoteId: record.id };
    }
  }
}

async function removePoint(index) {
  const point = points[index];
  points.splice(index, 1);
  if (editIndex.value === index) {
    editIndex.value = -1;
  }
  if (point?.remoteId) {
    try {
      const authHeader = await getAuthorizationHeader();
      if (authHeader) await deleteRecord(point.remoteId, authHeader);
    } catch (e) {
      console.warn("Failed to delete point from server", e);
    }
  }
}

function openEdit(index) {
  const p = points[index];
  editIndex.value = index;
  editDate.value = p.date;
  editY.value = p.y;
}

async function saveEdit(index) {
  if (!canSaveEdit.value) return;
  const yNum = Number(editY.value);
  if (!isFinite(yNum)) return;
  points[index] = { ...points[index], date: editDate.value, y: yNum };
  editIndex.value = -1;
  const record = await persistPoint(editDate.value, yNum);
  if (record) {
    const updatedIdx = points.findIndex((p) => dateToMs(p.date) === dateToMs(editDate.value));
    if (updatedIdx !== -1) {
      points[updatedIdx] = { ...points[updatedIdx], remoteId: record.id };
    }
  }
}

function cancelEdit() {
  editIndex.value = -1;
}

function getOriginalIndex(point) {
  return points.findIndex((p) => p.date === point.date && p.y === point.y);
}

async function clearPoints() {
  points.splice(0, points.length);
  try {
    const authHeader = await getAuthorizationHeader();
    if (authHeader) await deleteAllRecords(authHeader);
  } catch (e) {
    console.warn("Failed to clear points on server", e);
  }
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

async function onImportedRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  points.splice(0, points.length, ...rows);
  if (autoSetSeasonFromImport.value) {
    const dates = rows.map((r) => dateToMs(r.date));
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    seasonStart.value = msToDateInput(min);
    seasonEnd.value = msToDateInput(max);
  }
  // Bulk upsert to API
  try {
    const authHeader = await getAuthorizationHeader();
    if (authHeader) {
      const input = rows.map((r) => ({ date: r.date, winPoints: r.y }));
      const result = await bulkUpsertRecords(input, authHeader);
      // Merge remoteIds back into local points
      if (result.records) {
        for (const rec of result.records) {
          const dateStr = typeof rec.date === "string" ? rec.date.slice(0, 10) : "";
          const idx = points.findIndex((p) => p.date === dateStr);
          if (idx !== -1) {
            points[idx] = { ...points[idx], remoteId: rec.id };
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed to bulk upsert imported points", e);
  }
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

// Persist settings on changes (not points — those go through API)
watch(
  [
    seasonStart,
    seasonEnd,
    goalWinPoints,
    autoSetSeasonFromImport,
    simplifyImport,
  ],
  saveSettings
);
watch([navSensitivity, enableNavigation], saveSettings);

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

// Expose helper to set today's win points to a specific value (replace, not add)
async function addWinPoints(value) {
  const val = Number(value);
  if (!isFinite(val)) return;
  const todayStr = formatDate(new Date());
  const idxToday = points.findIndex(
    (p) => dateToMs(p.date) === dateToMs(todayStr)
  );
  if (idxToday !== -1) {
    points[idxToday] = { ...points[idxToday], date: todayStr, y: val };
  } else {
    points.push({ date: todayStr, y: val });
  }
  const record = await persistPoint(todayStr, val);
  if (record) {
    const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(todayStr));
    if (idx !== -1) points[idx] = { ...points[idx], remoteId: record.id };
  }
}

// Expose helper to add to today's win points cumulatively
async function incrementWinPoints(increment) {
  const inc = Number(increment);
  if (!isFinite(inc)) return;
  const todayStr = formatDate(new Date());
  const todayMs = dateToMs(todayStr);
  const idxToday = points.findIndex((p) => dateToMs(p.date) === todayMs);

  let base = 0;
  if (idxToday !== -1) {
    base = Number(points[idxToday].y) || 0;
  } else {
    let last = null;
    for (const p of sortedPoints.value) {
      const ms = dateToMs(p.date);
      if (isFinite(ms) && ms <= todayMs) last = p;
    }
    base = last ? Number(last.y) || 0 : 0;
  }

  const newVal = base + inc;
  if (idxToday !== -1) {
    points[idxToday] = { ...points[idxToday], date: todayStr, y: newVal };
  } else {
    points.push({ date: todayStr, y: newVal });
  }
  const record = await persistPoint(todayStr, newVal);
  if (record) {
    const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(todayStr));
    if (idx !== -1) points[idx] = { ...points[idx], remoteId: record.id };
  }
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

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
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
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header,
.modal-footer {
  padding: 12px 16px;
  border-bottom: 1px solid
    color-mix(in oklab, var(--primary) 20%, var(--surface));
}

.modal-footer {
  border-bottom: 0;
  border-top: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
}

.modal-body {
  padding: 12px 16px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
}

/* Settings layout */
.settings .setting-group {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px 16px;
  padding: 12px 0;
  border-top: 1px solid color-mix(in oklab, var(--primary) 14%, var(--surface));
}
.settings .setting-group:first-child {
  border-top: 0;
}
.settings .setting-info {
  min-width: 0;
}
.settings .setting-title {
  font-weight: 800;
  color: var(--text-strong);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 12px;
}
.settings .setting-desc {
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}
.settings .setting-control {
  display: grid;
  justify-items: end;
  align-content: center;
  gap: 6px;
}
.settings .setting-hint {
  color: var(--muted);
  font-size: 12px;
}

/* Align toggle nicely */
.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.toggle-text {
  color: var(--text);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 12px;
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
  margin-top: 6px;
}

.import-hint {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0 0;
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

.setting-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  align-items: center;
  gap: 12px;
}

/* Pretty toggle switch */
.toggle {
  appearance: none;
  -webkit-appearance: none;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--primary) 22%, var(--surface));
  background: color-mix(in oklab, var(--surface) 85%, #000);
  position: relative;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease,
    box-shadow 140ms ease;
}
.toggle::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: transform 140ms ease;
}
.toggle:checked {
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--primary) 35%, #333) 0%,
    color-mix(in oklab, var(--primary) 15%, #111) 100%
  );
  border-color: var(--ring-strong);
}
.toggle:checked::after {
  transform: translateX(20px);
}
.toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}
.toggle-label {
  color: var(--text-strong);
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
  border-bottom: 1px solid
    color-mix(in oklab, var(--primary) 10%, var(--surface));
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

/* Rank indicator (uses same styling language as views) */
.rank-indicator {
  margin: 8px 0 6px;
  margin-top: 8px;
  margin-bottom: 0px;
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in oklab, var(--surface) 92%, black);
}
.rank-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.rank-badge {
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-strong);
}
.rank-points {
  color: var(--muted);
}
.rank-progress .bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--surface) 85%, #000);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
}
.rank-progress .fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in oklab, var(--accent) 50%, var(--primary))
  );
}
.rank-progress .labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
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

  .settings .setting-group {
    grid-template-columns: 1fr;
  }

  .points-ul li {
    flex-direction: column;
    align-items: flex-start;
  }
  .row-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .edit-row {
    flex-direction: column;
    width: 100%;
  }
  .edit-row label {
    width: 100%;
  }
  .edit-row input {
    width: 100%;
  }

  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .status-banner {
    font-size: 12px;
    padding: 8px 12px;
  }

  .rank-progress .labels {
    flex-direction: column;
    gap: 4px;
  }

  .lg-header {
    padding: 0 4px;
  }
}
</style>
