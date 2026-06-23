<template>
  <section>
    <ModeLayout>
      <template #main>
        <LineGraph
          ref="graphRef"
          storageKey="ranked"
          gamemode="Ranked"
          mode="ranked"
          yAxisLabel="Rank Score"
          unit="RS"
          :goalOptions="rankedThresholds"
          season-controls-to="#season-controls-ranked"
          @win-points="onRankScore"
          @read-only="onReadOnly"
        />
      </template>
      <template #aside>
        <!-- Season picker + overlay teleport here from LineGraph -->
        <div class="season-card">
          <div class="season-card-header">Seasons</div>
          <div id="season-controls-ranked"></div>
        </div>
        <SetPointsCard
          v-if="!readOnly"
          @add-at-date="addCustom"
          @add-today="addToday"
        />
        <p v-else class="past-season-note">
          Viewing a past season — read-only. Switch back to the current season to
          log points.
        </p>
      </template>
    </ModeLayout>
  </section>
</template>

<script>
import { ref, computed } from 'vue'
import LineGraph from '@/components/LineGraph.vue'
import SetPointsCard from '@/components/SetPointsCard.vue'
import ModeLayout from '@/components/ModeLayout.vue'
import { useRankInfo } from '@/composables/useRankInfo'

// Ranked RS thresholds from THE FINALS wiki (Rank Score to reach tier)
// Bronze (0 → 7,500), Silver (10,000 → 17,500), Gold (20,000 → 27,500),
// Platinum (30,000 → 37,500), Diamond (40,000 → 47,500). Ruby = Top 500.
const RANKED_THRESHOLDS = [
  { badge: 'Bronze 4', points: 0 },
  { badge: 'Bronze 3', points: 2500 },
  { badge: 'Bronze 2', points: 5000 },
  { badge: 'Bronze 1', points: 7500 },
  { badge: 'Silver 4', points: 10000 },
  { badge: 'Silver 3', points: 12500 },
  { badge: 'Silver 2', points: 15000 },
  { badge: 'Silver 1', points: 17500 },
  { badge: 'Gold 4', points: 20000 },
  { badge: 'Gold 3', points: 22500 },
  { badge: 'Gold 2', points: 25000 },
  { badge: 'Gold 1', points: 27500 },
  { badge: 'Platinum 4', points: 30000 },
  { badge: 'Platinum 3', points: 32500 },
  { badge: 'Platinum 2', points: 35000 },
  { badge: 'Platinum 1', points: 37500 },
  { badge: 'Diamond 4', points: 40000 },
  { badge: 'Diamond 3', points: 42500 },
  { badge: 'Diamond 2', points: 45000 },
  { badge: 'Diamond 1', points: 47500 },
]

export default {
  name: 'RankedView',
  components: { LineGraph, SetPointsCard, ModeLayout },
  setup() {
    const rankScore = ref(0)
    const thresholds = computed(() => RANKED_THRESHOLDS)
    const { rankInfo, toNext, progressPct } = useRankInfo(rankScore, thresholds)
    return { rankScore, rankedThresholds: RANKED_THRESHOLDS, rankInfo, toNext, progressPct }
  },
  data() {
    return { readOnly: false }
  },
  methods: {
    onRankScore(v) {
      this.rankScore = Number(v) || 0
    },
    onReadOnly(v) {
      this.readOnly = !!v
    },
    addCustom({ date, y }) {
      const graph = this.$refs.graphRef
      if (graph && typeof graph.addPointAtDate === 'function') {
        graph.addPointAtDate(date, y)
      }
    },
    addToday({ y }) {
      const graph = this.$refs.graphRef
      if (graph && typeof graph.addWinPoints === 'function') {
        graph.addWinPoints(y)
      }
    },
  },
}
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
