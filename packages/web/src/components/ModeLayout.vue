<template>
  <section class="mode-layout">
    <div class="ml-main">
      <slot name="main" />
    </div>
    <div class="ml-aside">
      <slot name="aside" />
    </div>
  </section>
</template>

<script setup>
// Shared two-column layout (chart + aside) used by both game-mode views so the
// grid lives in exactly one place.
</script>

<style scoped>
.mode-layout {
  display: grid;
  grid-template-columns: 1fr minmax(220px, 280px);
  gap: 16px;
  align-items: start;
  width: 100%;
  text-align: left;
}

.ml-main {
  min-width: 0;
}

.ml-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 820px) {
  .mode-layout {
    grid-template-columns: 1fr;
  }
}
</style>
