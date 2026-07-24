import { computed, reactive, ref, onScopeDispose } from 'vue'
import { dateToMs, formatDate, isValidDateStr, msToDateInput } from '@/utils/date'
import {
  getRecords,
  upsertRecord,
  deleteRecord,
  deleteAllRecords,
  bulkUpsertRecords,
  getAuthorizationHeader,
} from '@/services/api'
import { connectLiveUpdates } from '@/services/liveUpdates'
import { takeRecords } from '@/services/recordsCache'

/**
 * Manages the points array and all API-backed CRUD operations.
 *
 * @param {Object} opts
 * @param {import('vue').Ref<boolean>} opts.isSeasonValid
 * @param {import('vue').Ref<string>} opts.seasonStart
 * @param {import('vue').Ref<string>} opts.seasonEnd
 * @param {import('vue').Ref<boolean>} opts.autoSetSeasonFromImport
 */
export function usePointsData({ isSeasonValid, seasonStart, seasonEnd, autoSetSeasonFromImport, mode = 'world-tour', isReadOnly }) {
  // When viewing a previous (read-only) season, all mutations are inert — the
  // graph still shows that season's data, but nothing can be edited or saved.
  const readOnly = () => !!(isReadOnly && isReadOnly.value)
  // Live events carry a `mode`; ignore any that belong to a different graph.
  // Treat a missing mode as 'world-tour' for backward-compat with old payloads.
  const matchesMode = (payload) => (payload?.mode ?? 'world-tour') === mode
  const points = reactive([])
  const isLoading = ref(false)
  const loadError = ref('')
  const isAuthenticated = ref(false)
  // 'disconnected' | 'connecting' | 'connected'
  const liveStatus = ref('disconnected')

  const sortedPoints = computed(() =>
    [...points].sort((a, b) => dateToMs(a.date) - dateToMs(b.date))
  )

  const sortedPointsReverse = computed(() =>
    [...points].sort((a, b) => dateToMs(b.date) - dateToMs(a.date))
  )

  const currentWinPoints = computed(() => {
    const pts = sortedPoints.value
    return pts.length ? Number(pts[pts.length - 1].y) : 0
  })

  const todayStr = formatDate(new Date())
  const todayPoint = computed(() => {
    return sortedPoints.value.find((p) => p.date === todayStr) || null
  })
  const todayGain = computed(() => {
    if (!todayPoint.value) return 0
    const seasonStartMs = dateToMs(seasonStart?.value)
    const prev = [...sortedPoints.value]
      .filter((p) => p.date < todayStr)
      // Points reset to (near) zero at the start of a new season, so a prior
      // point from a previous season isn't a real "previous day" to diff
      // against — without this, the first log of a new season reads as a
      // huge drop (e.g. -2400) instead of a fresh start.
      .filter((p) => !isFinite(seasonStartMs) || dateToMs(p.date) >= seasonStartMs)
      .pop()
    // In ranked the first point is the placement rank, not earned progress, so
    // when there's no prior point treat the placement as the baseline (0 gain)
    // rather than a jump from 0. World Tour genuinely starts at 0.
    const prevY = prev ? prev.y : (mode === 'ranked' ? todayPoint.value.y : 0)
    return Math.round((todayPoint.value.y - prevY) * 100) / 100
  })

  let liveConnection = null

  function upsertPoint(record) {
    const dateStr = typeof record.date === 'string' ? record.date.slice(0, 10) : ''
    const idx = points.findIndex((p) => p.remoteId === record.id || p.date === dateStr)
    const point = { remoteId: record.id, date: dateStr, y: record.winPoints }
    if (idx !== -1) {
      points[idx] = point
    } else {
      points.push(point)
    }
  }

  async function openLiveUpdates() {
    if (liveConnection) liveConnection.close()
    try {
      liveConnection = await connectLiveUpdates({
        onStatus(s) {
          liveStatus.value = s
        },
        onUpsert(record) {
          if (!matchesMode(record)) return
          upsertPoint(record)
        },
        onDelete({ id, mode: m }) {
          if (!matchesMode({ mode: m })) return
          const idx = points.findIndex((p) => p.remoteId === id)
          if (idx !== -1) points.splice(idx, 1)
        },
        onDeleteAll(payload) {
          if (!matchesMode(payload)) return
          points.splice(0, points.length)
        },
        onBulkUpsert({ records, mode: m }) {
          if (!matchesMode({ mode: m })) return
          if (Array.isArray(records)) records.forEach(upsertPoint)
        },
      })
    } catch {
      // Live updates are optional — REST still works
    }
  }

  onScopeDispose(() => {
    liveConnection?.close()
    liveConnection = null
    liveStatus.value = 'disconnected'
  })

  async function loadPointsFromAPI() {
    isLoading.value = true
    loadError.value = ''
    try {
      // The onboarding check fetches records moments before the dashboard
      // mounts; take those rather than asking for them a second time. Reaching
      // them means we were authenticated, since the check needed a token too.
      let records = takeRecords(mode)
      if (records) {
        isAuthenticated.value = true
      } else {
        const authHeader = await getAuthorizationHeader()
        if (!authHeader) {
          isAuthenticated.value = false
          return
        }
        isAuthenticated.value = true
        records = await getRecords(authHeader, mode)
      }
      const mapped = records.map((r) => ({
        remoteId: r.id,
        date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
        y: r.winPoints,
      }))
      points.splice(0, points.length, ...mapped)
      // Delay live updates until after page is fully loaded to avoid Firefox aborting
      if (document.readyState === 'complete') {
        openLiveUpdates()
      } else {
        window.addEventListener('load', () => setTimeout(openLiveUpdates, 500), { once: true })
      }
    } catch (e) {
      loadError.value = 'Failed to load data. Please refresh to try again.'
      console.error('Failed to load points from API', e)
    } finally {
      isLoading.value = false
    }
  }

  async function persistPoint(dateStr, yVal) {
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) return null
      const result = await upsertRecord(dateStr, Number(yVal), authHeader, mode)
      return result.record
    } catch (error) {
      console.warn('Failed to persist point to server', error)
      return null
    }
  }

  async function addPointAtDate(dateStr, yVal) {
    if (readOnly()) return
    if (!isSeasonValid.value) return
    if (!isValidDateStr(dateStr)) return
    const yNum = Number(yVal)
    if (!isFinite(yNum)) return
    const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(dateStr))
    if (idx !== -1) {
      points[idx] = { ...points[idx], date: dateStr, y: yNum }
    } else {
      points.push({ date: dateStr, y: yNum })
    }
    const record = await persistPoint(dateStr, yNum)
    if (record) {
      const updatedIdx = points.findIndex((p) => dateToMs(p.date) === dateToMs(dateStr))
      if (updatedIdx !== -1) {
        points[updatedIdx] = { ...points[updatedIdx], remoteId: record.id }
      }
    }
  }

  async function removePoint(index) {
    if (readOnly()) return
    const point = points[index]
    points.splice(index, 1)
    if (point?.remoteId) {
      try {
        const authHeader = await getAuthorizationHeader()
        if (authHeader) await deleteRecord(point.remoteId, authHeader)
      } catch (e) {
        console.warn('Failed to delete point from server', e)
      }
    }
  }

  async function onSaveEdit({ index, date, y }) {
    if (readOnly()) return
    const yNum = Number(y)
    if (!isFinite(yNum)) return
    points[index] = { ...points[index], date, y: yNum }
    const record = await persistPoint(date, yNum)
    if (record) {
      const updatedIdx = points.findIndex((p) => dateToMs(p.date) === dateToMs(date))
      if (updatedIdx !== -1) {
        points[updatedIdx] = { ...points[updatedIdx], remoteId: record.id }
      }
    }
  }

  async function clearPoints() {
    if (readOnly()) return
    points.splice(0, points.length)
    try {
      const authHeader = await getAuthorizationHeader()
      if (authHeader) await deleteAllRecords(authHeader, mode)
    } catch (e) {
      console.warn('Failed to clear points on server', e)
    }
  }

  async function onImportedRows(rows) {
    if (readOnly()) return
    if (!Array.isArray(rows) || !rows.length) return
    points.splice(0, points.length, ...rows)
    if (autoSetSeasonFromImport.value) {
      const dates = rows.map((r) => dateToMs(r.date))
      const min = Math.min(...dates)
      const max = Math.max(...dates)
      seasonStart.value = msToDateInput(min)
      seasonEnd.value = msToDateInput(max)
    }
    try {
      const authHeader = await getAuthorizationHeader()
      if (authHeader) {
        const input = rows.map((r) => ({ date: r.date, winPoints: r.y }))
        const result = await bulkUpsertRecords(input, authHeader, mode)
        if (result.records) {
          for (const rec of result.records) {
            const dateStr = typeof rec.date === 'string' ? rec.date.slice(0, 10) : ''
            const idx = points.findIndex((p) => p.date === dateStr)
            if (idx !== -1) {
              points[idx] = { ...points[idx], remoteId: rec.id }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to bulk upsert imported points', e)
    }
  }

  async function addWinPoints(value) {
    if (readOnly()) return
    const val = Number(value)
    if (!isFinite(val)) return
    const today = formatDate(new Date())
    const idxToday = points.findIndex(
      (p) => dateToMs(p.date) === dateToMs(today)
    )
    if (idxToday !== -1) {
      points[idxToday] = { ...points[idxToday], date: today, y: val }
    } else {
      points.push({ date: today, y: val })
    }
    const record = await persistPoint(today, val)
    if (record) {
      const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(today))
      if (idx !== -1) points[idx] = { ...points[idx], remoteId: record.id }
    }
  }

  async function incrementWinPoints(increment) {
    if (readOnly()) return
    const inc = Number(increment)
    if (!isFinite(inc)) return
    const today = formatDate(new Date())
    const todayMs = dateToMs(today)
    const idxToday = points.findIndex((p) => dateToMs(p.date) === todayMs)

    let base = 0
    if (idxToday !== -1) {
      base = Number(points[idxToday].y) || 0
    } else {
      // Only base off a point within the current season — otherwise the
      // first "+points" of a new season adds on top of last season's final
      // total instead of starting fresh from zero.
      const seasonStartMs = dateToMs(seasonStart?.value)
      let last = null
      for (const p of sortedPoints.value) {
        const ms = dateToMs(p.date)
        if (isFinite(ms) && ms <= todayMs && (!isFinite(seasonStartMs) || ms >= seasonStartMs)) {
          last = p
        }
      }
      base = last ? Number(last.y) || 0 : 0
    }

    const newVal = base + inc
    if (idxToday !== -1) {
      points[idxToday] = { ...points[idxToday], date: today, y: newVal }
    } else {
      points.push({ date: today, y: newVal })
    }
    const record = await persistPoint(today, newVal)
    if (record) {
      const idx = points.findIndex((p) => dateToMs(p.date) === dateToMs(today))
      if (idx !== -1) points[idx] = { ...points[idx], remoteId: record.id }
    }
  }

  return {
    points,
    isLoading,
    loadError,
    isAuthenticated,
    liveStatus,
    sortedPoints,
    sortedPointsReverse,
    currentWinPoints,
    todayPoint,
    todayGain,
    loadPointsFromAPI,
    addPointAtDate,
    removePoint,
    onSaveEdit,
    clearPoints,
    onImportedRows,
    addWinPoints,
    incrementWinPoints,
  }
}
