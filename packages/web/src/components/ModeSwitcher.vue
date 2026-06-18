<template>
  <nav class="mode-switch" aria-label="Game mode">
    <router-link to="/world-tour" class="mode-seg">World Tour</router-link>
    <router-link v-if="flags.ranked" to="/ranked" class="mode-seg"
      >Ranked</router-link
    >
    <router-link v-if="isAdmin" to="/admin" class="mode-seg mode-seg-admin"
      >Admin</router-link
    >
  </nav>
</template>

<script setup>
// Segmented control between the game modes. Pure navigation — vue-router
// applies `router-link-active` to the matching segment, which we style as the
// selected pill. The Ranked segment appears only when the `ranked` flag is on;
// the Admin segment only for admins.
import { useFlags } from "@/composables/useFlags";

const { flags, isAdmin } = useFlags();
</script>

<style scoped>
.mode-switch {
  display: flex;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: color-mix(in oklab, var(--surface) 88%, #000);
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.mode-seg {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  color: var(--muted);
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  border: 1px solid transparent;
}

.mode-seg:hover {
  color: var(--text-strong);
  background: color-mix(in oklab, var(--surface) 80%, #000);
}

.mode-seg.router-link-active {
  color: #0b0d12;
  background: linear-gradient(180deg, #ffd400 0%, #ffea00 100%);
  border-color: var(--ring-strong);
  box-shadow: 0 8px 24px rgba(255, 212, 0, 0.28);
}

@media (prefers-reduced-motion: no-preference) {
  .mode-seg {
    transition: color 120ms ease, background 120ms ease, box-shadow 120ms ease,
      border-color 120ms ease;
  }
}
</style>
