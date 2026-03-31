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


