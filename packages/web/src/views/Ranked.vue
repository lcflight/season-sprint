<template>
  <section>
    <LineGraph storageKey="ranked" :goalOptions="rankedThresholds" @win-points="onRankScore">
      <template #below-stats>
        <div class="rank-indicator">
          <div class="rank-header">
            <span class="rank-badge">{{ rankInfo.badge }}</span>
            <span class="rank-points">{{ rankScore }} RS</span>
          </div>
          <div class="rank-progress">
            <div class="bar">
              <div class="fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <div class="labels">
              <span>{{ rankInfo.currentFloor.toLocaleString() }} RS</span>
              <span v-if="rankInfo.nextTarget !== null">
                Next rank: {{ rankInfo.nextBadge }} at {{ rankInfo.nextTarget.toLocaleString() }} RS • {{ toNext.toLocaleString() }} more RS needed
              </span>
              <span v-else>
                Max league tier reached
              </span>
            </div>
          </div>
          <div class="rank-note">
            Ranked leagues use Rank Score (RS). Ruby is Top 500 only and not RS-based.
          </div>
        </div>
      </template>
    </LineGraph>
  </section>
</template>

<script>
import { ref, computed } from 'vue'
import LineGraph from '@/components/LineGraph.vue'
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
  components: { LineGraph },
  setup() {
    const rankScore = ref(0)
    const thresholds = computed(() => RANKED_THRESHOLDS)
    const { rankInfo, toNext, progressPct } = useRankInfo(rankScore, thresholds)
    return { rankScore, rankedThresholds: RANKED_THRESHOLDS, rankInfo, toNext, progressPct }
  },
  methods: {
    onRankScore(v) {
      this.rankScore = Number(v) || 0
    },
  },
}
</script>

