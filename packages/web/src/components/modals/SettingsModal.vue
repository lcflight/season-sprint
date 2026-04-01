<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h3>Settings</h3>
      </header>
      <section class="modal-body settings">
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
                :checked="enableNavigation"
                @change="$emit('update:enableNavigation', $event.target.checked)"
              />
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
                id="navSensitivity"
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                :value="navSensitivity"
                @input="$emit('update:navSensitivity', Number($event.target.value))"
              />
              <div class="setting-hint">
                Current: {{ navSensitivity.toFixed(2) }}&times;
              </div>
            </div>
          </div>
        </Transition>

        <div class="setting-group" v-if="hasGoalOptions">
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
                :checked="showRankOverlay"
                @change="$emit('update:showRankOverlay', $event.target.checked)"
              />
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
            <label class="toggle-row" for="showAveragePace">
              <input
                id="showAveragePace"
                class="toggle"
                type="checkbox"
                :checked="showAveragePace"
                @change="$emit('update:showAveragePace', $event.target.checked)"
              />
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
              <label class="toggle-row" for="showDeviationWedge">
                <input
                  id="showDeviationWedge"
                  class="toggle"
                  type="checkbox"
                  :checked="showDeviationWedge"
                  @change="$emit('update:showDeviationWedge', $event.target.checked)"
                />
                <span class="toggle-text">Show deviation wedge</span>
              </label>
            </div>
          </div>
        </Transition>
      </section>
      <footer class="modal-footer">
        <button @click="$emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
// eslint-disable-next-line no-undef
defineProps({
  navSensitivity: { type: Number, required: true },
  enableNavigation: { type: Boolean, required: true },
  showRankOverlay: { type: Boolean, required: true },
  showAveragePace: { type: Boolean, required: true },
  showDeviationWedge: { type: Boolean, required: true },
  hasGoalOptions: { type: Boolean, default: false },
})

// eslint-disable-next-line no-undef
defineEmits([
  'close',
  'update:navSensitivity',
  'update:enableNavigation',
  'update:showRankOverlay',
  'update:showAveragePace',
  'update:showDeviationWedge',
])
</script>
