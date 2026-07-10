package com.lcarthur.seasonsprint.state

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.data.ApiClient
import com.lcarthur.seasonsprint.data.ApiRecord
import com.lcarthur.seasonsprint.data.LiveStatus
import com.lcarthur.seasonsprint.data.LiveUpdates
import com.lcarthur.seasonsprint.data.RecordEvent
import com.lcarthur.seasonsprint.domain.DateKey
import com.lcarthur.seasonsprint.domain.OverlayPoint
import com.lcarthur.seasonsprint.domain.PaceBaseline
import com.lcarthur.seasonsprint.domain.PaceStats
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.domain.RankInfo
import com.lcarthur.seasonsprint.domain.Season
import com.lcarthur.seasonsprint.domain.SeasonOption
import com.lcarthur.seasonsprint.domain.Threshold
import com.lcarthur.seasonsprint.domain.computePace
import com.lcarthur.seasonsprint.domain.computeRank
import com.lcarthur.seasonsprint.domain.mapOverlayByDayOfSeason
import com.lcarthur.seasonsprint.domain.paceBaselineFor
import com.lcarthur.seasonsprint.domain.seasonOptionsFrom
import com.lcarthur.seasonsprint.domain.seasonsWithDataKeys
import com.lcarthur.seasonsprint.domain.thresholdsFor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable dashboard state with derived values, mirroring iOS DashboardStore's computeds.
 * Records are *cumulative* season totals, so "current points" is the latest-dated record
 * for [mode] — independent of which season is being *viewed* (only the chart/pace look back).
 */
data class DashboardState(
    val mode: GameMode,
    val points: List<Point> = emptyList(),
    /** The live/current season window (unaffected by [viewedSeasonKey]). */
    val season: Season? = null,
    /** The full `/seasons` list, same for every mode. */
    val seasonOptionsAll: List<SeasonOption> = emptyList(),
    /** Raw season name the server reports as current (matches a [SeasonOption.key]). */
    val currentSeasonKey: String? = null,
    /** null = viewing the live/current season. */
    val viewedSeasonKey: String? = null,
    val overlaySeasonKey: String? = null,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isWriting: Boolean = false,
    val error: String? = null,
    val liveStatus: LiveStatus = LiveStatus.Disconnected,
    val goalOverride: Int? = null,
) {
    val thresholds: List<Threshold> get() = thresholdsFor(mode)

    val sortedPoints: List<Point> get() = points.sortedBy { it.instant }

    /** Latest-dated record's win points (the season total so far) — always the live total. */
    val currentPoints: Int get() = sortedPoints.lastOrNull()?.winPoints ?: 0

    val rank: RankInfo get() = computeRank(currentPoints, thresholds)

    /**
     * Points gained today = today's total minus the most recent prior day's total, restricted to
     * the live season -- points reset to (near) zero at season start, so a point from a previous
     * season isn't a real "yesterday" to diff against (it would otherwise read as a huge drop,
     * e.g. -2400, on the first log of a new season). In Ranked, a today-entry with no in-season
     * prior point is the placement itself, not earned progress, so it reads as 0 gain rather than
     * a jump from 0 (World Tour genuinely starts at 0).
     */
    val todayGain: Int?
        get() {
            val today = DateKey.today()
            val sorted = sortedPoints
            val todayPoint = sorted.firstOrNull { it.day == today } ?: return null
            val seasonStart = season?.start
            val prev = sorted.lastOrNull { it.day < today && (seasonStart == null || !it.instant.isBefore(seasonStart)) }
            val prevValue = prev?.winPoints ?: (if (mode == GameMode.Ranked) todayPoint.winPoints else 0)
            return todayPoint.winPoints - prevValue
        }

    private val defaultGoal: Int get() = rank.nextTarget ?: maxOf(1, rank.currentFloor)

    /** The goal: a custom override, else the next rank target. */
    val goal: Int get() = goalOverride ?: defaultGoal

    val hasCustomGoal: Boolean get() = goalOverride != null

    private val dataSeasonKeys: Set<String> get() = seasonsWithDataKeys(points, seasonOptionsAll)

    /** Season picker entries, newest first: the current season, plus any past season with data. */
    val seasonOptions: List<SeasonOption>
        get() = seasonOptionsAll.sortedByDescending { it.season.start }
            .filter { it.key == currentSeasonKey || dataSeasonKeys.contains(it.key) }

    /** Compare-overlay entries, newest first: any season with data, excluding the viewed one. */
    val overlayOptions: List<SeasonOption>
        get() {
            val viewed = viewedSeasonKey ?: currentSeasonKey
            return seasonOptionsAll.sortedByDescending { it.season.start }
                .filter { it.key != viewed && dataSeasonKeys.contains(it.key) }
        }

    /** True once there's at least one past season with data — otherwise the picker has nothing to offer. */
    val seasonModuleDisabled: Boolean
        get() = seasonOptionsAll.none { it.key != currentSeasonKey && dataSeasonKeys.contains(it.key) }

    val viewedSeason: Season?
        get() = viewedSeasonKey?.let { key -> seasonOptionsAll.firstOrNull { it.key == key }?.season } ?: season

    /** Read-only: looking at any season other than the live one. */
    val isViewingPastSeason: Boolean
        get() = viewedSeasonKey != null && currentSeasonKey != null && viewedSeasonKey != currentSeasonKey

    val overlaySeason: Season?
        get() = overlaySeasonKey?.let { key -> seasonOptionsAll.firstOrNull { it.key == key }?.season }

    /** Points that fall within the *viewed* season window (all points if no season known). */
    val seasonPoints: List<Point>
        get() = viewedSeason?.let { s -> points.filter { !it.instant.isBefore(s.start) && !it.instant.isAfter(s.end) } }
            ?: points

    /** The compare season's points, re-mapped onto the viewed season's day-of-season axis. */
    val overlayPoints: List<OverlayPoint>
        get() {
            val overlay = overlaySeason ?: return emptyList()
            val viewed = viewedSeason ?: return emptyList()
            val overlayRecords = points.filter { !it.instant.isBefore(overlay.start) && !it.instant.isAfter(overlay.end) }
            return mapOverlayByDayOfSeason(overlayRecords, overlay.start, viewed.start, viewed.end)
        }

    val paceBaseline: PaceBaseline?
        get() = viewedSeason?.let { s -> paceBaselineFor(mode, seasonPoints.sortedBy { it.instant }, s.start) }

    val pace: PaceStats?
        get() = viewedSeason?.let { s -> computePace(goal, seasonPoints, s.start, s.end, baseline = paceBaseline ?: PaceBaseline(s.start, 0.0)) }
}

class DashboardViewModel(private val mode: GameMode, app: Application) : AndroidViewModel(app) {
    // World Tour keeps the original "dashboard" file/key so existing installs don't lose their
    // saved goal; Ranked gets its own file, matching the web's per-mode storageKey.
    private val prefs = app.getSharedPreferences(
        if (mode == GameMode.WorldTour) "dashboard" else "dashboard.${mode.prefsSuffix}",
        Context.MODE_PRIVATE,
    )
    private val goalKey = if (mode == GameMode.WorldTour) "goal.worldTour" else "goal.${mode.prefsSuffix}"

    private val _state = MutableStateFlow(
        DashboardState(
            mode = mode,
            goalOverride = if (prefs.contains(goalKey)) prefs.getInt(goalKey, 0) else null,
        ),
    )
    val state = _state.asStateFlow()

    private val live = LiveUpdates(viewModelScope)

    init {
        viewModelScope.launch { live.events.collect(::applyEvent) }
        viewModelScope.launch { live.status.collect { s -> _state.update { it.copy(liveStatus = s) } } }
    }

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            // Seasons are public + best-effort; don't let their failure block records.
            val seasonsPayload = runCatching { ApiClient.getAllSeasons() }.getOrNull()
            val seasonOptions = seasonsPayload?.seasons?.let { seasonOptionsFrom(it) }
            val currentSeason = seasonsPayload?.currentSeason?.let { Season.from(it) }
            try {
                val records = ApiClient.getRecords(mode)
                _state.update {
                    it.copy(
                        points = records.map(Point::from),
                        season = currentSeason ?: it.season,
                        seasonOptionsAll = seasonOptions ?: it.seasonOptionsAll,
                        currentSeasonKey = seasonsPayload?.currentSeason?.name ?: it.currentSeasonKey,
                        isLoading = false,
                        hasLoaded = true,
                    )
                }
                live.start()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        season = currentSeason ?: it.season,
                        seasonOptionsAll = seasonOptions ?: it.seasonOptionsAll,
                        currentSeasonKey = seasonsPayload?.currentSeason?.name ?: it.currentSeasonKey,
                        isLoading = false,
                        hasLoaded = true,
                        error = "Couldn't load your data. Pull to refresh.",
                    )
                }
            }
        }
    }

    /** Resume the live-update connection (call when this mode becomes the active tab). */
    fun resumeLive() = live.start()

    /** Pause the live-update connection (call when this mode is backgrounded, to avoid a
     * dangling socket for a mode the user isn't looking at). */
    fun pauseLive() = live.stop()

    /** View a past season read-only, or pass null to return to the live season. */
    fun viewSeason(key: String?) {
        _state.update {
            it.copy(
                viewedSeasonKey = key,
                overlaySeasonKey = if (it.overlaySeasonKey == key) null else it.overlaySeasonKey,
            )
        }
    }

    fun overlaySeason(key: String?) = _state.update { it.copy(overlaySeasonKey = key) }

    /** Add or overwrite the record for a day (`POST /me/records`). No-op while read-only. */
    fun addOrSet(date: String, winPoints: Int) {
        if (_state.value.isViewingPastSeason) return
        _state.update { it.copy(isWriting = true) }
        viewModelScope.launch {
            try {
                val record = ApiClient.upsertRecord(date, winPoints, mode)
                _state.update { it.copy(points = it.points.upserted(record), isWriting = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isWriting = false, error = "Couldn't save that point.") }
            }
        }
    }

    /** Edit an existing record in place (`PUT /me/records/:id`). No-op while read-only. */
    fun updatePoint(point: Point, date: String, winPoints: Int) {
        if (_state.value.isViewingPastSeason) return
        _state.update { it.copy(isWriting = true) }
        viewModelScope.launch {
            try {
                val updated = ApiClient.updateRecord(point.remoteId, date, winPoints)
                _state.update { s ->
                    var list = s.points
                    if (point.day != updated.date.take(10)) {
                        list = list.filterNot { it.remoteId == point.remoteId }
                    }
                    s.copy(points = list.upserted(updated), isWriting = false)
                }
            } catch (e: Exception) {
                _state.update { it.copy(isWriting = false, error = "Couldn't update that point.") }
                load()
            }
        }
    }

    /** Delete a record (`DELETE /me/records/:id`), optimistically removing it locally. No-op while read-only. */
    fun deletePoint(point: Point) {
        if (_state.value.isViewingPastSeason) return
        _state.update { it.copy(points = it.points.filterNot { p -> p.remoteId == point.remoteId }) }
        viewModelScope.launch {
            try {
                ApiClient.deleteRecord(point.remoteId)
            } catch (e: Exception) {
                _state.update { it.copy(error = "Couldn't delete that point.") }
                load()
            }
        }
    }

    fun setGoal(value: Int) {
        prefs.edit().putInt(goalKey, value).apply()
        _state.update { it.copy(goalOverride = value) }
    }

    fun clearGoal() {
        prefs.edit().remove(goalKey).apply()
        _state.update { it.copy(goalOverride = null) }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    /** Whether a live event (missing `mode` means `"world-tour"`) belongs to this VM's mode. */
    private fun matchesMode(raw: String?): Boolean {
        val eventMode = if (raw == GameMode.Ranked.wireValue) GameMode.Ranked else GameMode.WorldTour
        return eventMode == mode
    }

    /** Merge a live event into local state (mirrors iOS DashboardStore.apply). Cross-mode events are ignored. */
    private fun applyEvent(event: RecordEvent) {
        _state.update { s ->
            when (event) {
                is RecordEvent.Upsert ->
                    if (matchesMode(event.record.mode)) s.copy(points = s.points.upserted(event.record)) else s
                is RecordEvent.Delete ->
                    if (matchesMode(event.mode)) s.copy(points = s.points.filterNot { it.remoteId == event.id }) else s
                is RecordEvent.DeleteAll ->
                    if (matchesMode(event.mode)) s.copy(points = emptyList()) else s
                is RecordEvent.BulkUpsert ->
                    if (matchesMode(event.mode)) {
                        var list = s.points
                        event.records.forEach { list = list.upserted(it) }
                        s.copy(points = list)
                    } else s
            }
        }
    }

    override fun onCleared() {
        live.stop()
        super.onCleared()
    }

    /** Upsert by remoteId or day (mirrors iOS DashboardStore.upsert). */
    private fun List<Point>.upserted(record: ApiRecord): List<Point> {
        val point = Point.from(record)
        val idx = indexOfFirst { it.remoteId == point.remoteId || it.day == point.day }
        return if (idx >= 0) toMutableList().also { it[idx] = point } else this + point
    }

    /** Custom factory since [DashboardViewModel] needs a [GameMode] the default AndroidViewModel factory can't supply. */
    class Factory(private val mode: GameMode, private val app: Application) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
            DashboardViewModel(mode, app) as T
    }
}
