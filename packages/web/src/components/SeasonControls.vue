<template>
  <div v-if="seasons.length" class="lg-season-controls">
    <label class="season-select">
      <span>Season</span>
      <select
        :value="selected"
        @change="$emit('update:selected', $event.target.value)"
      >
        <option v-for="s in seasonsDesc" :key="s.key" :value="s.key">
          {{ s.name }}{{ s.key === currentSeasonKey ? " (current)" : "" }}
        </option>
      </select>
    </label>
    <label class="season-select">
      <span>Compare</span>
      <select
        :value="overlay"
        @change="$emit('update:overlay', $event.target.value)"
      >
        <option value="">None</option>
        <option v-for="s in overlayOptions" :key="s.key" :value="s.key">
          {{ s.name }}
        </option>
      </select>
    </label>
    <span v-if="overlaySeason" class="overlay-legend">
      <span class="overlay-swatch"></span>{{ overlaySeason.name }} (overlay,
      aligned by day)
    </span>
  </div>
</template>

<script setup>
// Presentational season picker + previous-season overlay selector. All state
// lives in LineGraph; this is bound via :selected/:overlay and update events so
// it can be teleported into the aside without owning any logic.
// eslint-disable-next-line no-undef
defineProps({
  seasons: { type: Array, default: () => [] },
  seasonsDesc: { type: Array, default: () => [] },
  overlayOptions: { type: Array, default: () => [] },
  currentSeasonKey: { type: String, default: "" },
  selected: { type: String, default: "" },
  overlay: { type: String, default: "" },
  overlaySeason: { type: Object, default: null },
})

// eslint-disable-next-line no-undef
defineEmits(["update:selected", "update:overlay"])
</script>

<style scoped>
.lg-season-controls {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.season-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}

.season-select select {
  font: inherit;
  width: 100%;
  color: var(--text-strong);
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--primary) 30%, transparent);
  border-radius: 6px;
  padding: 4px 8px;
}

.overlay-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.overlay-swatch {
  display: inline-block;
  width: 18px;
  height: 0;
  border-top: 2px dashed var(--primary);
  opacity: 0.7;
}
</style>
