<template>
  <div class="rank-indicator">
    <div class="rank-header">
      <span class="rank-badge">{{ badge }}</span>
      <span class="rank-points">{{ currentPointsLabel }}</span>
    </div>
    <div class="rank-progress">
      <div class="bar">
        <div class="fill" :style="{ width: progressPct + '%' }"></div>
      </div>
      <div class="labels">
        <span>{{ currentFloorLabel }}</span>
        <span v-if="nextTarget !== null">
          Next rank: {{ nextBadge }} at {{ nextTargetLabel }} • {{ toNextLabel }} more {{ unit }} needed
        </span>
        <span v-else>Max rank reached</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Generic rank indicator for reuse
// Props are formatted strings where appropriate to keep this component dumb
// about number formatting and units.
// eslint-disable-next-line no-undef
defineProps({
  badge: { type: String, default: '—' },
  currentPointsLabel: { type: String, default: '' },
  currentFloorLabel: { type: String, default: '' },
  nextTarget: { type: [Number, null], default: null },
  nextBadge: { type: String, default: '' },
  nextTargetLabel: { type: String, default: '' },
  toNextLabel: { type: String, default: '' },
  unit: { type: String, default: 'WP' },
  progressPct: { type: Number, default: 0 },
})
</script>

<style scoped>
.rank-indicator {
  margin: 8px 0 6px;
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
  background: linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--accent) 50%, var(--primary)));
}
.rank-progress .labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}
</style>

