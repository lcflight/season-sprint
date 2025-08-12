<template>
  <HeaderBar />
  <main class="container">
    <router-view />
  </main>
  <footer class="site-footer" role="contentinfo">
    <div>Created by Luke Arthur (Aireal) 2025</div>
    <div class="footer-note">All data is stored locally in your browser cache and will not sync between devices.</div>
  </footer>
</template>

<script>
import HeaderBar from "./components/HeaderBar.vue";

export default {
  name: "App",
  components: {
    HeaderBar,
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
