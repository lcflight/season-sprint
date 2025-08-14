<template>
  <aside class="points-cheatsheet" aria-label="World Tour win points cheatsheet">
    <div class="sheet-card">
      <h3 class="sheet-title">World Tour Win Points</h3>
      <ul class="sheet-list">
        <li>
          <span class="label">Knocked out of round one</span>
          <span class="value">+{{ values.round1 }}</span>
        </li>
        <li>
          <span class="label">Knocked out of round two</span>
          <span class="value">+{{ values.round2 }}</span>
        </li>
        <li>
          <span class="label">Lose the final round</span>
          <span class="value">+{{ values.finalLose }}</span>
        </li>
        <li>
          <span class="label">Win the final round</span>
          <span class="value">+{{ values.finalWin }}</span>
        </li>
      </ul>
      <div class="sheet-note">Quick reference for THE FINALS World Tour placement points.</div>
      <div class="quick-add">
        <button class="qa-btn" @click="$emit('quick-add', values.round1)">Add R1 KO (+{{ values.round1 }})</button>
        <button class="qa-btn" @click="$emit('quick-add', values.round2)">Add R2 KO (+{{ values.round2 }})</button>
        <button class="qa-btn" @click="$emit('quick-add', values.finalLose)">Add Final Loss (+{{ values.finalLose }})</button>
        <button class="qa-btn" @click="$emit('quick-add', values.finalWin)">Add Final Win (+{{ values.finalWin }})</button>
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

.sheet-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 900;
  color: var(--text-strong);
}

.sheet-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sheet-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--surface) 88%, #000);
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
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

.quick-add {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.qa-btn {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--primary) 22%, var(--surface));
  background: color-mix(in oklab, var(--surface) 88%, #000);
  color: var(--text);
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
</style>

