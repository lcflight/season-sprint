import { computed } from 'vue'

/**
 * Computes rank badge, floor, next target, and progress from a thresholds
 * array and the player's current points.
 *
 * @param {import('vue').Ref<number>|import('vue').ComputedRef<number>} currentPoints - reactive current points value
 * @param {import('vue').Ref<Array>|import('vue').ComputedRef<Array>} thresholds - reactive array of { badge, points }
 * @returns {{ rankInfo: import('vue').ComputedRef, toNext: import('vue').ComputedRef<number>, progressPct: import('vue').ComputedRef<number> }}
 */
export function useRankInfo(currentPoints, thresholds) {
  const rankInfo = computed(() => {
    const opts = Array.isArray(thresholds.value) ? thresholds.value : []
    if (!opts.length) {
      return { badge: '—', currentFloor: 0, nextTarget: null, nextBadge: null }
    }
    const wp = Math.max(0, Math.floor(Number(currentPoints.value) || 0))
    let prev = { badge: 'Unranked', points: 0 }
    for (let i = 0; i < opts.length; i++) {
      const t = opts[i]
      const pts = Number(t?.points)
      if (!Number.isFinite(pts)) continue
      if (wp < pts) {
        return {
          badge: prev.badge,
          currentFloor: prev.points,
          nextTarget: pts,
          nextBadge: t.badge ?? '',
        }
      }
      prev = { badge: t.badge ?? prev.badge, points: pts }
    }
    return {
      badge: prev.badge,
      currentFloor: prev.points,
      nextTarget: null,
      nextBadge: null,
    }
  })

  const toNext = computed(() => {
    return rankInfo.value.nextTarget === null
      ? 0
      : Math.max(
          0,
          Number(rankInfo.value.nextTarget) -
            Math.floor(Number(currentPoints.value) || 0)
        )
  })

  const progressPct = computed(() => {
    const floor = Number(rankInfo.value.currentFloor) || 0
    const ceil = rankInfo.value.nextTarget ?? floor
    const span = Math.max(1, Number(ceil) - floor)
    const clamped = Math.min(
      Number(ceil),
      Math.max(floor, Number(currentPoints.value) || 0)
    )
    return ((clamped - floor) / span) * 100
  })

  return { rankInfo, toNext, progressPct }
}
