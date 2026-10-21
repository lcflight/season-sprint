import { ref } from 'vue'
import { loadSeasonJson } from '@/utils/season'
import { msToDateInput, dateToMs } from '@/utils/date'

/**
 * Loads the full season list (current + historical) once and exposes it in a
 * normalized, date-input-friendly shape for the graph to point at.
 *
 * The backend already returns every season from the wiki, and the user's
 * records span all of them, so "viewing a past season" is just pointing the
 * existing chart geometry at a different [start, end] window.
 */
// Key of the placeholder season shown when we're past the end of every
// season the server knows about (the wiki hasn't listed the new one yet).
export const UPCOMING_SEASON_KEY = '__upcoming__'

export function useSeasons() {
  const seasons = ref([]) // normalized, ascending by start date
  const currentSeasonKey = ref('')
  const loading = ref(false)
  const error = ref('')

  function displayName(name) {
    const nm = String(name || '').trim()
    if (!nm) return ''
    return nm.toLowerCase().startsWith('season') ? nm : `Season ${nm}`
  }

  // Convert a wiki season ({ name, start, end }) into a window the chart can
  // consume directly. Dates are normalized to YYYY-MM-DD the same way the
  // current-season default is (new Date(iso) -> msToDateInput) so a selected
  // past season lines up with the existing seasonStart/seasonEnd handling.
  function normalize(s) {
    if (!s || !s.start || !s.end) return null
    const startMs = new Date(s.start).getTime()
    const endMs = new Date(s.end).getTime()
    if (isNaN(startMs) || isNaN(endMs)) return null
    const start = msToDateInput(startMs)
    const end = msToDateInput(endMs)
    return {
      key: String(s.name),
      name: displayName(s.name),
      start,
      end,
      startMs: dateToMs(start),
      endMs: dateToMs(end),
    }
  }

  async function load(signal) {
    loading.value = true
    error.value = ''
    try {
      const data = await loadSeasonJson(signal)
      const list = Array.isArray(data?.seasons)
        ? data.seasons.map(normalize).filter(Boolean)
        : []
      list.sort((a, b) => a.startMs - b.startMs)
      seasons.value = list

      const cs = data?.currentSeason
      const match = cs?.name
        ? list.find((s) => s.key === String(cs.name))
        : null
      const last = list.length ? list[list.length - 1] : null

      if (match) {
        currentSeasonKey.value = match.key
      } else if (last && Date.now() > last.endMs) {
        // Past the end of every known season: a new season has started but
        // the server hasn't picked it up yet. Show an empty "Upcoming season"
        // rather than falling back to the old one, whose window would compare
        // new-season points against last season's. It has no real dates;
        // startMs/endMs only make it own any points logged after the last
        // known season, so they aren't offered as past-season data.
        list.push({
          key: UPCOMING_SEASON_KEY,
          name: 'Upcoming season',
          start: '',
          end: '',
          startMs: last.endMs + 1,
          endMs: Infinity,
          upcoming: true,
        })
        currentSeasonKey.value = UPCOMING_SEASON_KEY
      } else {
        // No active season but the last one hasn't ended (e.g. a gap in the
        // data) — show the latest known season.
        currentSeasonKey.value = last ? last.key : ''
      }
      return data
    } catch (e) {
      error.value = 'Failed to load seasons'
      return null
    } finally {
      loading.value = false
    }
  }

  return { seasons, currentSeasonKey, loading, error, load }
}
