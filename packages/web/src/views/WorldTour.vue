<template>
  <section>
    <ModeLayout>
      <template #main>
        <LineGraph
          ref="graphRef"
          storageKey="world-tour"
          gamemode="World Tour"
          :goalOptions="thresholds"
          headerDisclaimer="Based on World Tour wiki thresholds."
          @win-points="onWinPoints"
        />
      </template>
      <template #aside>
        <PointsCheatsheet :values="quickAddValues" @quick-add="onQuickAdd" />
        <SetPointsCard @add-at-date="addCustom" @add-today="addToday" />
      </template>
    </ModeLayout>
  </section>
</template>
<script>
import { ref, computed } from "vue";
import LineGraph from "@/components/LineGraph.vue";
import PointsCheatsheet from "@/components/PointsCheatsheet.vue";
import SetPointsCard from "@/components/SetPointsCard.vue";
import ModeLayout from "@/components/ModeLayout.vue";
import { useRankInfo } from "@/composables/useRankInfo";
import WT_THRESHOLDS from "@/data/worldTourRanks.json";

export default {
  name: "WorldTourView",
  components: { LineGraph, PointsCheatsheet, SetPointsCard, ModeLayout },
  setup() {
    const winPoints = ref(0);
    const thresholds = computed(() => WT_THRESHOLDS);
    const { rankInfo, toNext, progressPct } = useRankInfo(winPoints, thresholds);
    return { winPoints, thresholds, rankInfo, toNext, progressPct };
  },
  data() {
    return {
      quickAddValues: { round1: 2, round2: 6, finalLose: 14, finalWin: 25 },
    };
  },
  methods: {
    onWinPoints(v) {
      this.winPoints = Number(v) || 0;
    },
    onQuickAdd(inc) {
      const graph = this.$refs.graphRef;
      if (graph && typeof graph.incrementWinPoints === "function") {
        graph.incrementWinPoints(inc);
      } else if (graph && typeof graph.addWinPoints === "function") {
        graph.addWinPoints(inc);
      }
    },
    addCustom({ date, y }) {
      const graph = this.$refs.graphRef;
      if (graph && typeof graph.addPointAtDate === "function") {
        graph.addPointAtDate(date, y);
      }
    },
    addToday({ y }) {
      const graph = this.$refs.graphRef;
      if (graph && typeof graph.addWinPoints === "function") {
        graph.addWinPoints(y);
      }
    },
  },
};
</script>
