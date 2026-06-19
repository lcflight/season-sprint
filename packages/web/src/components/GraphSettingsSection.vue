<script setup>
import { onMounted } from "vue";
import { useGraphSettings } from "@/composables/useGraphSettings";

// One mode's graph display settings. Binds directly to the per-mode
// useGraphSettings refs, which auto-persist to localStorage on change, so the
// graph picks the values up when it next mounts.
// eslint-disable-next-line no-undef
const props = defineProps({
  storageKey: { type: String, required: true },
  title: { type: String, required: true },
  hasGoalOptions: { type: Boolean, default: false },
});

const {
  navSensitivity,
  enableNavigation,
  showRankOverlay,
  showAveragePace,
  showDeviationWedge,
  showPaceGraph,
  loadSettings,
} = useGraphSettings(props.storageKey);

onMounted(loadSettings);
</script>

<template>
  <div class="graph-settings">
    <h3 class="graph-settings-title">{{ title }}</h3>
    <div class="settings">
      <div class="setting-group">
        <div class="setting-info">
          <div class="setting-title">Graph navigation</div>
          <div class="setting-desc">
            Enable or disable drag-to-pan and pinch/wheel zoom on the chart.
          </div>
        </div>
        <div class="setting-control">
          <label class="toggle-row">
            <input class="toggle" type="checkbox" v-model="enableNavigation" />
            <span class="toggle-text">Enable pan/zoom</span>
          </label>
        </div>
      </div>

      <Transition name="setting-slide">
        <div v-if="enableNavigation" class="setting-group setting-child">
          <div class="setting-info">
            <div class="setting-title">Navigation sensitivity</div>
            <div class="setting-desc">
              Controls how fast panning feels and how strong wheel zoom is.
            </div>
          </div>
          <div class="setting-control">
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              v-model.number="navSensitivity"
            />
            <div class="setting-hint">
              Current: {{ navSensitivity.toFixed(2) }}&times;
            </div>
          </div>
        </div>
      </Transition>

      <div v-if="hasGoalOptions" class="setting-group">
        <div class="setting-info">
          <div class="setting-title">Rank overlay</div>
          <div class="setting-desc">
            Show translucent rank threshold bands on the chart.
          </div>
        </div>
        <div class="setting-control">
          <label class="toggle-row">
            <input class="toggle" type="checkbox" v-model="showRankOverlay" />
            <span class="toggle-text">Show rank overlay</span>
          </label>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-info">
          <div class="setting-title">Average pace line</div>
          <div class="setting-desc">
            Show a projection line based on your average points per day this season.
          </div>
        </div>
        <div class="setting-control">
          <label class="toggle-row">
            <input class="toggle" type="checkbox" v-model="showAveragePace" />
            <span class="toggle-text">Show average pace</span>
          </label>
        </div>
      </div>

      <Transition name="setting-slide">
        <div v-if="showAveragePace" class="setting-group setting-child">
          <div class="setting-info">
            <div class="setting-title">Deviation wedge</div>
            <div class="setting-desc">
              Show a confidence band around the pace line based on data variance.
            </div>
          </div>
          <div class="setting-control">
            <label class="toggle-row">
              <input class="toggle" type="checkbox" v-model="showDeviationWedge" />
              <span class="toggle-text">Show deviation wedge</span>
            </label>
          </div>
        </div>
      </Transition>

      <div class="setting-group">
        <div class="setting-info">
          <div class="setting-title">Pace graph</div>
          <div class="setting-desc">
            Show a secondary graph tracking required daily pace and points earned per day.
          </div>
        </div>
        <div class="setting-control">
          <label class="toggle-row">
            <input class="toggle" type="checkbox" v-model="showPaceGraph" />
            <span class="toggle-text">Show pace graph</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-settings + .graph-settings {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
}

.graph-settings-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary);
}
</style>
