<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
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
              :value="navSensitivity"
              @input="$emit('update:navSensitivity', Number($event.target.value))"
            />
            <div class="setting-hint">
              Current: {{ navSensitivity.toFixed(2) }}&times;
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
                :checked="enableNavigation"
                @change="$emit('update:enableNavigation', $event.target.checked)"
              />
              <span class="toggle-text">Enable pan/zoom</span>
            </label>
          </div>
        </div>

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
  hasGoalOptions: { type: Boolean, default: false },
})

// eslint-disable-next-line no-undef
defineEmits([
  'close',
  'update:navSensitivity',
  'update:enableNavigation',
  'update:showRankOverlay',
])
</script>
