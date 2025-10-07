<template>
  <HeaderBar />
  <main class="container">
    <router-view />
  </main>
  <footer class="site-footer" role="contentinfo">
    <div>Created by Luke Arthur (Aireal) 2025</div>
    <div class="footer-note">
      All data is stored locally in your browser cache and will not sync between
      devices.
    </div>
  </footer>
</template>

<script>
import HeaderBar from "./components/HeaderBar.vue";
import { loadSeasonJson } from "@/utils/season";
import { getClerkUser, getAuthToken } from "@/services/clerk";

export default {
  name: "App",
  components: {
    HeaderBar,
  },
  data() {
    getClerkUser().then((user) => {
      console.log(user, { depth: null });
    });
    getAuthToken().then((token) => {
      console.log(token, { depth: null });
    });
    return { seasonInfo: null };
  },
  computed: {
    seasonName() {
      return this.seasonInfo?.name || "";
    },
    startDate() {
      return this.seasonInfo
        ? new Date(this.seasonInfo.start).toLocaleDateString()
        : "";
    },
    endDate() {
      return this.seasonInfo
        ? new Date(this.seasonInfo.end).toLocaleDateString()
        : "";
    },
  },
  async created() {
    try {
      const data = await loadSeasonJson();
      this.seasonInfo = data?.currentSeason || null;
    } catch (e) {
      // ignore; banner will just not show
    }
  },
};
</script>

<style>
#app {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--text);
  margin-top: 0;
}

/* Global button styles to clearly differentiate interactive elements */
button,
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--primary) 36%, var(--surface));
  background: linear-gradient(180deg, #1e2430 0%, #131821 100%);
  color: var(--text-strong);
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease,
    border-color 120ms ease, background 120ms ease, color 120ms ease;
}
button:hover,
.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45), 0 0 0 3px var(--ring);
  border-color: color-mix(in oklab, var(--primary) 52%, var(--surface));
}
button:focus-visible,
.button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ring), 0 10px 28px rgba(0, 0, 0, 0.5);
}
button:disabled,
.button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Variants */
.btn-primary {
  background: linear-gradient(180deg, #ffd400 0%, #ffea00 100%);
  color: #0b0d12;
  border-color: var(--ring-strong);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06),
    0 10px 30px rgba(255, 212, 0, 0.35);
}
.btn-primary:hover {
  filter: saturate(1.05);
  box-shadow: 0 12px 34px rgba(255, 212, 0, 0.45), 0 0 0 3px var(--ring);
}

.btn-ghost {
  background: transparent;
  color: var(--text-strong);
}
.btn-ghost:hover {
  background: color-mix(in oklab, var(--surface) 92%, #000);
}

.season-banner {
  max-width: 1000px;
  margin: 8px auto 0;
  padding: 10px 14px;
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 10px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.season-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  justify-content: center;
}
.season-banner .badge {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.season-banner .season-name {
  color: var(--text-strong);
  margin: 0 6px;
}
.season-banner .dates {
  color: var(--text-strong);
}
.season-banner .disclaimer {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

.container {
  display: grid;
  gap: 24px;
  justify-items: center;
  padding: 24px 16px 48px;
  max-width: 1000px;
  margin: 0 auto;
}

.site-footer {
  margin: 24px auto 32px;
  max-width: 1000px;
  padding: 8px 16px;
  color: var(--muted);
  border-top: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
}
.site-footer .footer-note {
  margin-top: 6px;
  font-size: 12px;
}
</style>
