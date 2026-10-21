import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSeasons, UPCOMING_SEASON_KEY } from '@/composables/useSeasons'
import { loadSeasonJson } from '@/utils/season'
import { seasonsWithDataKeys } from '@/utils/chart'

vi.mock('@/utils/season', () => ({ loadSeasonJson: vi.fn() }))

const DAY = 24 * 60 * 60 * 1000
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString()

describe('useSeasons — current season selection', () => {
  beforeEach(() => vi.mocked(loadSeasonJson).mockReset())

  it('uses the season the server reports as current', async () => {
    vi.mocked(loadSeasonJson).mockResolvedValue({
      seasons: [
        { name: 'Season 11', start: iso(-200), end: iso(-100) },
        { name: 'Season 12', start: iso(-100), end: iso(10) },
      ],
      currentSeason: { name: 'Season 12', start: iso(-100), end: iso(10) },
    })
    const { seasons, currentSeasonKey, load } = useSeasons()
    await load()
    expect(currentSeasonKey.value).toBe('Season 12')
    expect(seasons.value.some((s) => s.upcoming)).toBe(false)
  })

  // The wiki lags behind a new season: the server knows only seasons that
  // have ended. Falling back to the last one would plot new-season points
  // against last season's window, so an empty "Upcoming season" is shown.
  it('adds an upcoming placeholder when every known season has ended', async () => {
    vi.mocked(loadSeasonJson).mockResolvedValue({
      seasons: [
        { name: 'Season 10', start: iso(-200), end: iso(-100) },
        { name: 'Season 11', start: iso(-100), end: iso(-1) },
      ],
      currentSeason: null,
    })
    const { seasons, currentSeasonKey, load } = useSeasons()
    await load()
    expect(currentSeasonKey.value).toBe(UPCOMING_SEASON_KEY)
    const upcoming = seasons.value.at(-1)
    expect(upcoming).toMatchObject({ key: UPCOMING_SEASON_KEY, name: 'Upcoming season', upcoming: true })

    // A point logged today belongs to the placeholder, not last season — so
    // last season isn't credited with new-season data.
    const s11 = seasons.value.find((s) => s.key === 'Season 11')
    const keys = seasonsWithDataKeys([{ date: iso(0).slice(0, 10), y: 5736 }], seasons.value)
    expect(keys.has(UPCOMING_SEASON_KEY)).toBe(true)
    expect(keys.has(s11.key)).toBe(false)
  })

  it('falls back to the latest season when none is current but it has not ended', async () => {
    vi.mocked(loadSeasonJson).mockResolvedValue({
      seasons: [{ name: 'Season 11', start: iso(5), end: iso(100) }],
      currentSeason: null,
    })
    const { seasons, currentSeasonKey, load } = useSeasons()
    await load()
    expect(currentSeasonKey.value).toBe('Season 11')
    expect(seasons.value.some((s) => s.upcoming)).toBe(false)
  })
})
