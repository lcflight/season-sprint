<template>
  <HeaderBar />
  <main class="container">
    <router-view />
  </main>
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
</style>
