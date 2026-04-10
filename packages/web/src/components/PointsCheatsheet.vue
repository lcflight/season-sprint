<template>
  <aside class="points-cheatsheet" aria-label="World Tour win points cheatsheet">
    <div class="sheet-card">
      <button class="sheet-header" @click="open = !open" :aria-expanded="open">
        <h3 class="sheet-title">World Tour Win Points</h3>
        <span class="chevron" :class="{ rotated: open }">&#9650;</span>
      </button>
      <div v-show="open" class="sheet-body">
        <div class="sheet-list">
          <button class="sheet-item" @click="$emit('quick-add', values.round1)">
            <span class="label">Knocked out of round one</span>
            <span class="value">+{{ values.round1 }}</span>
          </button>
          <button class="sheet-item" @click="$emit('quick-add', values.round2)">
            <span class="label">Knocked out of round two</span>
            <span class="value">+{{ values.round2 }}</span>
          </button>
          <button class="sheet-item" @click="$emit('quick-add', values.finalLose)">
            <span class="label">Lose the final round</span>
            <span class="value">+{{ values.finalLose }}</span>
          </button>
          <button class="sheet-item" @click="$emit('quick-add', values.finalWin)">
            <span class="label">Win the final round</span>
            <span class="value">+{{ values.finalWin }}</span>
          </button>
        </div>
        <div class="sheet-note">Tap to quick-add points.</div>
      </div>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'PointsCheatsheet',
  emits: ['quick-add'],
  props: {
    values: {
      type: Object,
      default: () => ({ round1: 2, round2: 6, finalLose: 14, finalWin: 25 })
    }
  },
  data() {
    return {
      open: window.innerWidth > 768
    }
  }
}
</script>

<style scoped>
.points-cheatsheet {
  width: 100%;
}

.sheet-card {
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 12px;
  background: color-mix(in oklab, var(--surface) 92%, #000);
  padding: 12px;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0 8px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.sheet-title {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 900;
  color: var(--text-strong);
}

.chevron {
  font-size: 10px;
  color: var(--muted);
  transition: transform 0.2s ease;
  transform: rotate(180deg);
}

.chevron.rotated {
  transform: rotate(0deg);
}

.sheet-body {
  margin-top: 8px;
}

.sheet-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sheet-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
  border: 1px solid color-mix(in oklab, var(--primary) 12%, var(--surface));
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.sheet-item:hover {
  border-color: color-mix(in oklab, var(--primary) 40%, var(--surface));
  background: color-mix(in oklab, var(--surface) 85%, #000);
}

.sheet-item:active {
  background: color-mix(in oklab, var(--primary) 15%, var(--surface));
}

.label {
  text-align: left;
}

.value {
  font-weight: 800;
  color: var(--text-strong);
}

.sheet-note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
</style>
