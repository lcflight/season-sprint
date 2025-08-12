<template>
  <HeaderBar />
  <main class="container">
    <img alt="Vue logo" src="./assets/logo.png" />
    <LineGraph />
  </main>
</template>

<script>
import HeaderBar from "./components/HeaderBar.vue";
import LineGraph from "./components/LineGraph.vue";

export default {
  name: "App",
  components: {
    HeaderBar,
    LineGraph,
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

img[alt="Vue logo"] {
  width: 84px;
  height: auto;
  filter: drop-shadow(0 0 12px rgba(255, 212, 0, 0.35));
}
</style>
