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
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

.container {
  display: grid;
  gap: 24px;
  justify-items: center;
  padding: 16px;
}
</style>
