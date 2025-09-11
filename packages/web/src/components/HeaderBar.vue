<script setup>
import { RedirectToSignIn, SignedIn, SignedOut, UserButton } from "@clerk/vue";
</script>

<template>
  <div class="header-bar">
    <div class="brand">
      <span class="brand-accent">THE</span> FINALS | Season Sprint
    </div>
    <div class="user-actions">
      <SignedIn>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </div>
  </div>
</template>

<script>
import { loadSeasonJson } from "@/utils/season";

export default {
  name: "HeaderBar",
  data() {
    return {
      seasonInfo: null,
      seasonError: null,
      abortCtl: null,
    };
  },
  async created() {
    try {
      this.abortCtl = new AbortController();
      const data = await loadSeasonJson(this.abortCtl.signal);
      this.seasonInfo = data?.currentSeason || null;
    } catch (e) {
      this.seasonError = e?.message || String(e);
    }
  },
  beforeUnmount() {
    if (this.abortCtl && typeof this.abortCtl.abort === "function") {
      this.abortCtl.abort();
    }
  },
};
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
  border-bottom: 1px solid
    color-mix(in oklab, var(--primary) 30%, var(--surface));
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
