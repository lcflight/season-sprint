import { ref, watch } from 'vue'
import { isValidDateStr, formatDate, addDays } from '@/utils/date'
import { saveStateWithKey, loadStateWithKey } from '@/utils/storage'

/**
 * Manages graph settings persistence (localStorage).
 *
 * @param {string} storageKey - storage key prefix for this graph instance
 */
export function useGraphSettings(storageKey) {
  const today = new Date()
  const seasonStart = ref(formatDate(today))
  const seasonEnd = ref(formatDate(addDays(today, 30)))
  const seasonTitle = ref('')

  const goalWinPoints = ref(10)
  const selectedGoalIndex = ref(-1)

  const autoSetSeasonFromImport = ref(true)
  const simplifyImport = ref(false)

  const navSensitivity = ref(1)
  const enableNavigation = ref(false)
  const showRankOverlay = ref(true)
  const showAveragePace = ref(false)
  const showDeviationWedge = ref(false)
  const showPaceGraph = ref(true)

  function buildKey() {
    return storageKey
      ? `season-sprint:${storageKey}:v1`
      : `season-sprint:line-graph:v1`
  }

  function saveSettings() {
    const state = {
      seasonStart: seasonStart.value,
      seasonEnd: seasonEnd.value,
      goalWinPoints: goalWinPoints.value,
      autoSetSeasonFromImport: autoSetSeasonFromImport.value,
      simplifyImport: simplifyImport.value,
      navSensitivity: navSensitivity.value,
      enableNavigation: enableNavigation.value,
      showRankOverlay: showRankOverlay.value,
      showAveragePace: showAveragePace.value,
      showDeviationWedge: showDeviationWedge.value,
      showPaceGraph: showPaceGraph.value,
    }
    saveStateWithKey(buildKey(), state)
  }

  function loadSettings() {
    const parsed = loadStateWithKey(buildKey())
    if (!parsed || typeof parsed !== 'object') return
    if (typeof parsed.seasonStart === 'string' && isValidDateStr(parsed.seasonStart))
      seasonStart.value = parsed.seasonStart
    if (typeof parsed.seasonEnd === 'string' && isValidDateStr(parsed.seasonEnd))
      seasonEnd.value = parsed.seasonEnd
    if (typeof parsed.goalWinPoints === 'number' && isFinite(parsed.goalWinPoints))
      goalWinPoints.value = parsed.goalWinPoints
    if (typeof parsed.autoSetSeasonFromImport === 'boolean')
      autoSetSeasonFromImport.value = parsed.autoSetSeasonFromImport
    if (typeof parsed.simplifyImport === 'boolean')
      simplifyImport.value = parsed.simplifyImport
    if (typeof parsed.navSensitivity === 'number' && isFinite(parsed.navSensitivity))
      navSensitivity.value = parsed.navSensitivity
    if (typeof parsed.enableNavigation === 'boolean')
      enableNavigation.value = parsed.enableNavigation
    if (typeof parsed.showRankOverlay === 'boolean')
      showRankOverlay.value = parsed.showRankOverlay
    if (typeof parsed.showAveragePace === 'boolean')
      showAveragePace.value = parsed.showAveragePace
    if (typeof parsed.showDeviationWedge === 'boolean')
      showDeviationWedge.value = parsed.showDeviationWedge
    if (typeof parsed.showPaceGraph === 'boolean')
      showPaceGraph.value = parsed.showPaceGraph
  }

  // Auto-persist on changes
  watch(
    [seasonStart, seasonEnd, goalWinPoints, autoSetSeasonFromImport, simplifyImport],
    saveSettings
  )
  watch([navSensitivity, enableNavigation, showRankOverlay, showAveragePace, showDeviationWedge, showPaceGraph], saveSettings)

  return {
    seasonStart,
    seasonEnd,
    seasonTitle,
    goalWinPoints,
    selectedGoalIndex,
    autoSetSeasonFromImport,
    simplifyImport,
    navSensitivity,
    enableNavigation,
    showRankOverlay,
    showAveragePace,
    showDeviationWedge,
    showPaceGraph,
    saveSettings,
    loadSettings,
  }
}
