<template>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Required/day (zero → goal)</div>
      <div class="stat-value">{{ requiredPerDayZero.toFixed(2) }}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Required/day (last → goal)</div>
      <div class="stat-value">
        <template v-if="isFromLastDefined">{{ requiredPerDayFromLast.toFixed(2) }}</template>
        <template v-else>—</template>
      </div>
    </div>
  </div>
</template>

<script setup>
// eslint-disable-next-line no-undef
defineProps({
  requiredPerDayZero: { type: Number, required: true },
  requiredPerDayFromLast: { type: Number, required: true },
  isFromLastDefined: { type: Boolean, required: true },
})
</script>

<style scoped>
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
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02), 0 6px 24px rgba(0,0,0,0.35);
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
</style>

