<script setup>
import { SignIn } from "@clerk/vue";

// Brand-matched theming layered on the global dark Clerk theme (set in main.js).
// Kept light-touch so Clerk's component stays intact — we just align the accent
// and font, and hide Clerk's own header since our branding above is the title.
const appearance = {
  variables: {
    colorPrimary: "#ffd400", // --primary (THE FINALS gold)
    fontFamily: "var(--font-sans)",
    borderRadius: "10px",
  },
  elements: {
    header: { display: "none" },
  },
};
</script>

<template>
  <main class="signin-view">
    <div class="signin-brand">
      <img src="/logo-transparent.svg" alt="" class="signin-logo" />
      <h1 class="signin-title">Welcome to Season Sprint</h1>
      <p class="signin-tagline">
        Track your World Tour points and sync across all your devices.
      </p>
    </div>
    <div class="signin-widget">
      <!-- routing="hash" keeps the whole flow on app.seasonsprint.com without a
           dedicated route, so the user never leaves the site to sign in.
           with-sign-up enables Clerk's combined flow: sign-up (email + password
           + email-code verification) happens in this same widget. -->
      <SignIn routing="hash" with-sign-up :appearance="appearance" />
    </div>
  </main>
</template>

<style scoped>
.signin-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 48px 16px 64px;
  max-width: 480px;
  margin: 0 auto;
}
.signin-brand {
  text-align: center;
}
.signin-logo {
  height: 64px;
  width: auto;
  background: #ce2c30;
  border-radius: 10px;
  padding: 6px;
}
.signin-title {
  margin: 16px 0 6px;
  font-size: clamp(22px, 5vw, 28px);
  color: var(--text-strong);
  letter-spacing: 0.02em;
}
.signin-tagline {
  margin: 0 auto;
  color: var(--muted);
  font-size: 14px;
  max-width: 36ch;
}
.signin-widget {
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
