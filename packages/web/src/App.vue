<template>
  <HeaderBar />
  <!--
    Gate the app body behind Clerk's auth state so signed-out visitors never
    see app content flash before the sign-in redirect. While Clerk loads we
    show a placeholder; once loaded we render content only when SignedIn, and
    the SignedOut branch redirects to sign-in. In dev-auth mode (no Clerk
    plugin) the gate is bypassed.
  -->
  <template v-if="clerkEnabled">
    <ClerkLoading>
      <div class="auth-loading" role="status" aria-live="polite">
        <span class="auth-spinner" aria-hidden="true"></span>
        <span class="auth-loading-sr">Loading…</span>
      </div>
    </ClerkLoading>
    <ClerkLoaded>
      <SignedIn>
        <main class="container">
          <ModeSwitcher v-if="$route.meta.modeSwitcher" />
          <router-view />
        </main>
      </SignedIn>
      <SignedOut>
        <SignInView />
      </SignedOut>
    </ClerkLoaded>
  </template>
  <main v-else class="container">
    <ModeSwitcher v-if="$route.meta.modeSwitcher" />
    <router-view />
  </main>
  <footer class="site-footer" role="contentinfo">
    <div>Created by Luke Arthur (Aireal) 2025</div>
  </footer>
</template>

<script>
import { watch } from "vue";
import { useAuth } from "@clerk/vue";
import HeaderBar from "./components/HeaderBar.vue";
import SignInView from "./components/SignInView.vue";
import ModeSwitcher from "./components/ModeSwitcher.vue";
import {
  ClerkLoading,
  ClerkLoaded,
  SignedIn,
  SignedOut,
} from "@clerk/vue";
import { loadSeasonJson } from "@/utils/season";
import { isClerkEnabled } from "@/services/clerk";
import { useFlags } from "@/composables/useFlags";

export default {
  name: "App",
  components: {
    HeaderBar,
    SignInView,
    ClerkLoading,
    ClerkLoaded,
    SignedIn,
    SignedOut,
    ModeSwitcher,
  },
  setup() {
    const { loadFlags } = useFlags();
    // Flags depend on auth — load now, and reload when Clerk sign-in changes.
    loadFlags();
    try {
      const { isSignedIn } = useAuth();
      watch(isSignedIn, () => loadFlags());
    } catch (e) {
      // Clerk not available (e.g. dev mode) — initial load above is enough.
    }
  },
  data() {
    return { seasonInfo: null, clerkEnabled: isClerkEnabled() };
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

/* Shown while Clerk resolves auth state, in place of the app body, so
   signed-out visitors never see app content before the sign-in redirect. */
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
}
.auth-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid color-mix(in oklab, var(--primary) 25%, transparent);
  border-top-color: var(--primary);
  animation: auth-spin 0.8s linear infinite;
}
.auth-loading-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .auth-spinner {
    animation-duration: 2s;
  }
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

@media (max-width: 480px) {
  .container {
    padding: 16px 12px 32px;
    gap: 16px;
  }
  .site-footer {
    margin: 16px auto 20px;
    padding: 8px 12px;
  }
}
</style>
