import { computed, reactive, ref } from 'vue'
import { dateToMs, formatDate, isValidDateStr, msToDateInput } from '@/utils/date'
import {
  getRecords,
  upsertRecord,
  deleteRecord,
  deleteAllRecords,
  bulkUpsertRecords,
  getAuthorizationHeader,
} from '@/services/api'

/**
 * Manages the points array and all API-backed CRUD operations.
 *
 * @param {Object} opts
 * @param {import('vue').Ref<boolean>} opts.isSeasonValid
 * @param {import('vue').Ref<string>} opts.seasonStart
 * @param {import('vue').Ref<string>} opts.seasonEnd
 * @param {import('vue').Ref<boolean>} opts.autoSetSeasonFromImport
 */
export function usePointsData({ isSeasonValid, seasonStart, seasonEnd, autoSetSeasonFromImport }) {
  const points = reactive([])
  const isLoading = ref(false)
  const loadError = ref('')
  const isAuthenticated = ref(false)

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
    const prev = [...sortedPoints.value]
      .filter((p) => p.date < todayStr)
      .pop()
    const prevY = prev ? prev.y : 0
    return Math.round((todayPoint.value.y - prevY) * 100) / 100
  })

  async function loadPointsFromAPI() {
    isLoading.value = true
    loadError.value = ''
    try {
      const authHeader = await getAuthorizationHeader()
      if (!authHeader) {
        isAuthenticated.value = false
        return
      }
      isAuthenticated.value = true
      const records = await getRecords(authHeader)
      const mapped = records.map((r) => ({
        remoteId: r.id,
        date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
        y: r.winPoints,
      }))
      points.splice(0, points.length, ...mapped)
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
      const result = await upsertRecord(dateStr, Number(yVal), authHeader)
      return result.record
    } catch (error) {
      console.warn('Failed to persist point to server', error)
      return null
    }
  }

  async function addPointAtDate(dateStr, yVal) {
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
    points.splice(0, points.length)
    try {
      const authHeader = await getAuthorizationHeader()
      if (authHeader) await deleteAllRecords(authHeader)
    } catch (e) {
      console.warn('Failed to clear points on server', e)
    }
  }

  async function onImportedRows(rows) {
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
        const result = await bulkUpsertRecords(input, authHeader)
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
    const inc = Number(increment)
    if (!isFinite(inc)) return
    const today = formatDate(new Date())
    const todayMs = dateToMs(today)
    const idxToday = points.findIndex((p) => dateToMs(p.date) === todayMs)

    let base = 0
    if (idxToday !== -1) {
      base = Number(points[idxToday].y) || 0
    } else {
      let last = null
      for (const p of sortedPoints.value) {
        const ms = dateToMs(p.date)
        if (isFinite(ms) && ms <= todayMs) last = p
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
