<template>
  <nav class="mode-switch" aria-label="Game mode">
    <router-link to="/world-tour" class="mode-seg">World Tour</router-link>
    <router-link v-if="flags.ranked" to="/ranked" class="mode-seg"
      >Ranked</router-link
    >
    <!-- When the flag is off, Ranked is shown disabled rather than hidden, so
         players can see it's on the way. -->
    <span
      v-else
      class="mode-seg is-disabled"
      aria-disabled="true"
      title="Ranked is coming soon"
    >
      Ranked
      <span class="mode-soon">Soon</span>
    </span>
  </nav>
</template>

<script setup>
// Segmented control between the game modes. Pure navigation — vue-router
// applies `router-link-active` to the matching segment, which we style as the
// selected pill. The Ranked segment appears only when the `ranked` flag is on.
// (Admin is reached from the user dropdown, not here.)
import { useFlags } from "@/composables/useFlags";

const { flags } = useFlags();
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

/* Disabled "coming soon" segment — visibly inert: muted, no pointer, and it
   ignores the hover treatment above. */
.mode-seg.is-disabled,
.mode-seg.is-disabled:hover {
  gap: 6px;
  color: color-mix(in oklab, var(--muted) 70%, transparent);
  background: transparent;
  cursor: not-allowed;
  opacity: 0.6;
}

.mode-soon {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 16%, transparent);
  border: 1px solid color-mix(in oklab, var(--primary) 30%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .mode-seg {
    transition: color 120ms ease, background 120ms ease, box-shadow 120ms ease,
      border-color 120ms ease;
  }
}
</style>
