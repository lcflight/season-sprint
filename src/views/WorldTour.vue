<template>
<section>
    <LineGraph storageKey="world-tour" @win-points="onWinPoints">
      <template #below-stats>
        <div class="rank-indicator">
          <div class="rank-header">
            <span class="rank-badge">{{ rankInfo.badge }}</span>
            <span class="rank-points">{{ winPoints }} WP</span>
          </div>
          <div class="rank-progress">
            <div class="bar">
              <div class="fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <div class="labels">
              <span>{{ rankInfo.currentFloor }} WP</span>
              <span v-if="rankInfo.nextTarget !== null">
                Next rank: {{ rankInfo.nextBadge }} at {{ rankInfo.nextTarget }} WP • {{ toNext }} more WP needed
              </span>
              <span v-else>Max rank reached</span>
            </div>
          </div>
          <div class="rank-note">
            Based on World Tour wiki thresholds.
          </div>
        </div>
      </template>
    </LineGraph>
  </section>
</template>

<script>
import LineGraph from '@/components/LineGraph.vue'

// World Tour thresholds from the wiki (Win Points to reach tier)
const WT_THRESHOLDS = [
  { badge: 'Bronze 4', points: 25 },
  { badge: 'Bronze 3', points: 50 },
  { badge: 'Bronze 2', points: 75 },
  { badge: 'Bronze 1', points: 100 },
  { badge: 'Silver 4', points: 150 },
  { badge: 'Silver 3', points: 200 },
  { badge: 'Silver 2', points: 250 },
  { badge: 'Silver 1', points: 300 },
  { badge: 'Gold 4', points: 375 },
  { badge: 'Gold 3', points: 450 },
  { badge: 'Gold 2', points: 525 },
  { badge: 'Gold 1', points: 600 },
  { badge: 'Platinum 4', points: 700 },
  { badge: 'Platinum 3', points: 800 },
  { badge: 'Platinum 2', points: 900 },
  { badge: 'Platinum 1', points: 1000 },
  { badge: 'Diamond 4', points: 1150 },
  { badge: 'Diamond 3', points: 1300 },
  { badge: 'Diamond 2', points: 1450 },
  { badge: 'Diamond 1', points: 1600 },
  { badge: 'Emerald 4', points: 1800 },
  { badge: 'Emerald 3', points: 2000 },
  { badge: 'Emerald 2', points: 2200 },
  { badge: 'Emerald 1', points: 2400 },
]

export default {
  name: 'WorldTourView',
  components: { LineGraph },
  data() {
    return { winPoints: 0 }
  },
  computed: {
    rankInfo() {
      const wp = Math.max(0, Math.floor(this.winPoints))
      let prev = 0
      for (let i = 0; i < WT_THRESHOLDS.length; i++) {
        const t = WT_THRESHOLDS[i]
        if (wp < t.points) {
          return {
            badge: i > 0 ? WT_THRESHOLDS[i - 1].badge : 'Unranked',
            currentFloor: prev,
            nextTarget: t.points,
            nextBadge: t.badge,
          }
        }
        prev = t.points
      }
      // At or beyond the top
      const top = WT_THRESHOLDS[WT_THRESHOLDS.length - 1]
      return { badge: top.badge, currentFloor: top.points, nextTarget: null, nextBadge: null }
    },
    toNext() {
      return this.rankInfo.nextTarget === null ? 0 : Math.max(0, this.rankInfo.nextTarget - Math.floor(this.winPoints))
    },
    progressPct() {
      const floor = this.rankInfo.currentFloor
      const ceil = this.rankInfo.nextTarget ?? this.rankInfo.currentFloor
      const span = Math.max(1, ceil - floor)
      const clamped = Math.min(ceil, Math.max(floor, this.winPoints))
      return ((clamped - floor) / span) * 100
    }
  },
  methods: {
    onWinPoints(v) {
      this.winPoints = Number(v) || 0
    }
  }
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

