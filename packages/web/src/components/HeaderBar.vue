<script setup>
import { useRoute } from "vue-router";
import { SignedIn } from "@clerk/vue";
import UserMenu from "@/components/UserMenu.vue";
import ModeSwitcher from "@/components/ModeSwitcher.vue";
import { isClerkEnabled } from "@/services/clerk";

// The signed-out redirect is handled in App.vue alongside the content gate.
const clerkEnabled = isClerkEnabled();
// The mode switcher lives in the title bar, shown only on routes that opt in
// via `meta.modeSwitcher` (World Tour / Ranked).
const route = useRoute();
</script>

<template>
  <div class="header-bar">
    <router-link to="/" class="brand" aria-label="Go to home">
      <img src="/logo-transparent.svg" alt="Season Sprint logo" class="brand-logo" />
      <span class="brand-text"><span class="brand-accent">THE</span>&nbsp;FINALS</span> <span class="brand-sep">|</span> <span class="brand-text">Season Sprint</span>
    </router-link>
    <ModeSwitcher v-if="route.meta.modeSwitcher" class="header-mode" />
    <div class="user-actions">
      <template v-if="clerkEnabled">
        <SignedIn>
          <UserMenu />
        </SignedIn>
      </template>
      <UserMenu v-else dev />
    </div>
  </div>
</template>

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
  border-bottom: 1px solid
    color-mix(in oklab, var(--primary) 30%, var(--surface));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.brand {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-strong);
  text-shadow: 0 0 24px color-mix(in oklab, var(--primary) 40%, transparent);
  font-size: clamp(12px, 3.5vw, 16px);
  min-width: 0;
  text-decoration: none;
  cursor: pointer;
}

.brand-text:first-of-type {
  white-space: nowrap;
  flex-shrink: 0;
}

.brand-sep {
  flex-shrink: 0;
  position: relative;
  top: -2px;
}

.brand-text:last-of-type {
  text-align: left;
}

.brand-logo {
  height: 50px;
  width: auto;
  background: #CE2C30;
  border-radius: 6px;
  padding: 0;
}

@media (max-width: 480px) {
  .header-bar {
    padding: 12px 14px;
  }
}

.brand-accent {
  color: var(--primary);
}

/* Mode switcher sits centered in the title bar; size it to its segments
   rather than the full-width pill it uses when standalone. */
.header-mode {
  flex: 0 0 auto;
}
.header-mode :deep(.mode-switch) {
  width: auto;
  margin: 0;
}

.user-actions {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .header-mode :deep(.mode-seg) {
    min-height: 32px;
    padding: 0 10px;
    font-size: 12px;
  }
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.season-dates {
  font-size: 12px;
  color: var(--muted);
  margin-right: 8px;
}

/* Toggle-style nav buttons */
.actions :deep(.nav-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 130px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--primary) 28%, var(--surface));
  background: transparent;
  color: var(--text);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  transition: transform 120ms ease, box-shadow 120ms ease,
    border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.actions :deep(.nav-btn:hover) {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--ring);
  border-color: color-mix(in oklab, var(--primary) 45%, var(--surface));
}

.actions :deep(.nav-btn.is-active) {
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--primary) 20%, #222) 0%,
    color-mix(in oklab, var(--primary) 8%, #111) 100%
  );
  color: #111;
  border-color: var(--ring-strong);
  box-shadow: 0 10px 28px rgba(255, 212, 0, 0.28), 0 0 0 3px var(--ring);
}
</style>
