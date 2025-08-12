<template>
  <div class="header-bar">
    <div class="brand">
      <span class="brand-accent">THE</span> FINALS | Season Sprint
    </div>
    <div class="actions">
      <button class="btn btn-primary world-tour">World Tour</button>
      <button class="btn btn-ghost ranked">Ranked</button>
    </div>
  </div>
</template>

<script>
export default {};
</script>

<style scoped>
.header-bar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: color-mix(in oklab, var(--surface) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 30%, var(--surface));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.brand {
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-strong);
  text-shadow: 0 0 24px color-mix(in oklab, var(--primary) 40%, transparent);
}

.brand-accent {
  color: var(--primary);
}

.actions {
  display: flex;
  gap: 10px;
}
</style>
