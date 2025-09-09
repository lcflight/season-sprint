<template>
<section>
  <div class="wt-layout">
    <div class="wt-main">
<LineGraph ref="graphRef" storageKey="world-tour" :goalOptions="thresholds" headerDisclaimer="Based on World Tour wiki thresholds." @win-points="onWinPoints"
>
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
          </div>
      </LineGraph>
    </div>
    <div class="wt-aside">
      <PointsCheatsheet :values="quickAddValues" @quick-add="onQuickAdd" />

      <div class="custom-point">
        <div class="cp-header">Set points</div>
        <div class="cp-row">
          <label class="toggle-row">
            <input type="checkbox" v-model="useCustomDate" />
            <span class="toggle-text">Use custom date</span>
          </label>
        </div>
        <div class="cp-row" v-if="useCustomDate">
          <input type="date" v-model="customDate" />
          <input type="number" step="any" v-model.number="customY" placeholder="points" />
          <button class="btn-primary" @click="addCustom" :disabled="!customDate || !isFinite(customY)">Add</button>
        </div>
        <div class="cp-row" v-else>
          <input type="number" step="any" v-model.number="customY" placeholder="points" />
          <button class="btn-primary" @click="addToday" :disabled="!isFinite(customY)">Add for today</button>
        </div>
      </div>
    </div>
  </div>

</section>
</template>
<script>
import LineGraph from '@/components/LineGraph.vue'
import PointsCheatsheet from '@/components/PointsCheatsheet.vue'
import WT_THRESHOLDS from '@/data/worldTourRanks.json'

export default {
  name: 'WorldTourView',
  components: { LineGraph, PointsCheatsheet },
  data() {
    return { 
      winPoints: 0,
      quickAddValues: { round1: 2, round2: 6, finalLose: 14, finalWin: 25 },
      useCustomDate: false,
      customDate: new Date().toISOString().slice(0,10),
      customY: 0,
    }
  },
  computed: {
    thresholds() {
      return WT_THRESHOLDS
    },
    rankInfo() {
      const wp = Math.max(0, Math.floor(this.winPoints))
      let prev = 0
      for (let i = 0; i < this.thresholds.length; i++) {
        const t = this.thresholds[i]
        if (wp < t.points) {
          return {
            badge: i > 0 ? this.thresholds[i - 1].badge : 'Unranked',
            currentFloor: prev,
            nextTarget: t.points,
            nextBadge: t.badge,
          }
        }
        prev = t.points
      }
      // At or beyond the top
      const top = this.thresholds[this.thresholds.length - 1]
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
    },
    onQuickAdd(inc) {
      const graph = this.$refs.graphRef
      if (graph && typeof graph.addWinPoints === 'function') {
        graph.addWinPoints(inc)
      }
    },
    addCustom() {
      const graph = this.$refs.graphRef
      if (graph && typeof graph.addPointAtDate === 'function') {
        graph.addPointAtDate(this.customDate, this.customY)
      }
    },
    addToday() {
      const graph = this.$refs.graphRef
      if (graph && typeof graph.addWinPoints === 'function') {
        graph.addWinPoints(this.customY)
      }
    }
  }
}
</script>

<style scoped>
.wt-layout {
  display: grid;
  grid-template-columns: 1fr minmax(220px, 280px);
  gap: 16px;
  align-items: start;
}

@media (max-width: 820px) {
  .wt-layout {
    grid-template-columns: 1fr;
  }
}

.wt-main {
  min-width: 0;
}

.wt-aside {
}

.custom-point {
  margin-top: 12px;
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.custom-point .cp-header {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 6px;
}
.custom-point .cp-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  flex-wrap: wrap;
}
.custom-point .cp-row input[type="date"],
.custom-point .cp-row input[type="number"] {
  flex: 1 1 110px;
  min-width: 0;
}
.custom-point .cp-row .btn-primary {
  height: 32px;
  padding: 6px 10px;
  line-height: 1;
}

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

