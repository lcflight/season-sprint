<template>
  <div class="quick-actions">
    <template v-if="Array.isArray(goalOptions) && goalOptions.length">
      <label>
        Goal rank
        <select :value="selectedGoalIndex" @change="onSelectChange">
          <option :value="-1">Select rank…</option>
          <option v-for="(opt, i) in goalOptions" :key="opt.badge || i" :value="i">
            {{ opt.badge }} ({{ opt.points }} {{ unit }})
          </option>
        </select>
      </label>
      <RankIndicator
        :badge="rankInfo.badge"
        :current-points-label="pointsLabel"
        :current-floor-label="floorLabel"
        :next-target="rankInfo.nextTarget"
        :next-badge="rankInfo.nextBadge"
        :next-target-label="nextTargetLabel"
        :to-next-label="toNextLabel"
        :unit="unit"
        :progress-pct="progressPct"
      />
    </template>
    <template v-else>
      <label>
        Goal {{ unit.toLowerCase() }}
        <input :value="goalWinPoints" @input="onNumericInput" type="number" step="any" />
      </label>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import RankIndicator from '@/components/RankIndicator.vue'

// eslint-disable-next-line no-undef
const props = defineProps({
  goalOptions: { type: Array, default: () => [] },
  selectedGoalIndex: { type: Number, default: -1 },
  goalWinPoints: { type: Number, default: 0 },
  rankInfo: { type: Object, default: () => ({ badge: '—', currentFloor: 0, nextTarget: null, nextBadge: null }) },
  currentWinPoints: { type: Number, default: 0 },
  toNext: { type: Number, default: 0 },
  progressPct: { type: Number, default: 0 },
  unit: { type: String, default: 'WP' },
})

// eslint-disable-next-line no-undef
const emit = defineEmits(['select-goal', 'set-goal-win-points'])

const onSelectChange = (e) => {
  emit('select-goal', Number(e.target.value))
}

const onNumericInput = (e) => {
  const val = Number(e.target.value)
  if (Number.isFinite(val)) emit('set-goal-win-points', val)
}

const pointsLabel = computed(() => `${(props.currentWinPoints?.toLocaleString?.() || props.currentWinPoints)} ${props.unit}`)
const floorLabel = computed(() => `${(props.rankInfo.currentFloor?.toLocaleString?.() || props.rankInfo.currentFloor)} ${props.unit}`)
const nextTargetLabel = computed(() => `${(props.rankInfo.nextTarget?.toLocaleString?.() || props.rankInfo.nextTarget)} ${props.unit}`)
const toNextLabel = computed(() => `${(props.toNext?.toLocaleString?.() || props.toNext)}`)
</script>

<style scoped>
.quick-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
</style>

