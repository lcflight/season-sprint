<template>
  <section>
    <LineGraph storageKey="ranked" @win-points="onRankScore">
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
import LineGraph from '@/components/LineGraph.vue'

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
  data() {
    return { rankScore: 0 }
  },
  computed: {
    rankInfo() {
      const rs = Math.max(0, Math.floor(this.rankScore))
      for (let i = 0; i < RANKED_THRESHOLDS.length; i++) {
        const t = RANKED_THRESHOLDS[i]
        if (rs < t.points) {
          // Handle base case when thresholds start at 0
          const last = i > 0 ? RANKED_THRESHOLDS[i - 1] : { badge: 'Unranked', points: 0 }
          return {
            badge: last.badge,
            currentFloor: last.points,
            nextTarget: t.points,
            nextBadge: t.badge,
          }
        }
      }
      // At or beyond Diamond 1; Ruby is Top 500 only
      const top = RANKED_THRESHOLDS[RANKED_THRESHOLDS.length - 1]
      return { badge: top.badge, currentFloor: top.points, nextTarget: null, nextBadge: null }
    },
    toNext() {
      return this.rankInfo.nextTarget === null ? 0 : Math.max(0, this.rankInfo.nextTarget - Math.floor(this.rankScore))
    },
    progressPct() {
      const floor = this.rankInfo.currentFloor
      const ceil = this.rankInfo.nextTarget ?? this.rankInfo.currentFloor
      const span = Math.max(1, ceil - floor)
      const clamped = Math.min(ceil, Math.max(floor, this.rankScore))
      return ((clamped - floor) / span) * 100
    },
  },
  methods: {
    onRankScore(v) {
      this.rankScore = Number(v) || 0
    },
  },
}
</script>

<style scoped>
.rank-indicator {
  margin: 8px 0 6px;
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in oklab, var(--surface) 92%, black);
}
.rank-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.rank-badge {
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-strong);
}
.rank-points {
  color: var(--muted);
}
.rank-progress .bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--surface) 85%, #000);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
}
.rank-progress .fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--accent) 50%, var(--primary)));
}
.rank-progress .labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}
.rank-note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
</style>
