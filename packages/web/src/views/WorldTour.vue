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
          season-controls-to="#season-controls-world-tour"
          @win-points="onWinPoints"
          @read-only="onReadOnly"
        />
      </template>
      <template #aside>
        <!-- Season picker + overlay teleport here from LineGraph -->
        <div class="season-card">
          <div class="season-card-header">Seasons</div>
          <div id="season-controls-world-tour"></div>
        </div>
        <template v-if="!readOnly">
          <PointsCheatsheet :values="quickAddValues" @quick-add="onQuickAdd" />
          <SetPointsCard @add-at-date="addCustom" @add-today="addToday" />
        </template>
        <p v-else class="past-season-note">
          Viewing a past season — read-only. Switch back to the current season to
          log points.
        </p>
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
      readOnly: false,
    };
  },
  methods: {
    onWinPoints(v) {
      this.winPoints = Number(v) || 0;
    },
    onReadOnly(v) {
      this.readOnly = !!v;
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

<style scoped>
.past-season-note {
  font-size: 0.85rem;
  opacity: 0.75;
  line-height: 1.4;
}
.season-card {
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.season-card-header {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 900;
  margin-bottom: 8px;
}
</style>
