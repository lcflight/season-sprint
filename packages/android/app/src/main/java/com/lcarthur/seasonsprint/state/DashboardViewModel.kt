package com.lcarthur.seasonsprint.state

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lcarthur.seasonsprint.data.ApiClient
import com.lcarthur.seasonsprint.data.ApiRecord
import com.lcarthur.seasonsprint.data.LiveUpdates
import com.lcarthur.seasonsprint.data.RecordEvent
import com.lcarthur.seasonsprint.domain.PaceStats
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.domain.RankInfo
import com.lcarthur.seasonsprint.domain.Season
import com.lcarthur.seasonsprint.domain.DateKey
import com.lcarthur.seasonsprint.domain.computePace
import com.lcarthur.seasonsprint.domain.computeRank
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable dashboard state with derived values, mirroring iOS DashboardStore's computeds.
 * Records are *cumulative* season totals, so "current points" is the latest-dated record.
 */
data class DashboardState(
    val points: List<Point> = emptyList(),
    val season: Season? = null,
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val isWriting: Boolean = false,
    val error: String? = null,
    val isLive: Boolean = false,
    val goalOverride: Int? = null,
) {
    val sortedPoints: List<Point> get() = points.sortedBy { it.instant }

    /** Latest-dated record's win points (the season total so far). */
    val currentPoints: Int get() = sortedPoints.lastOrNull()?.winPoints ?: 0

    val rank: RankInfo get() = computeRank(currentPoints)

    /** Points gained today = today's total minus the most recent prior day's total. */
    val todayGain: Int?
        get() {
            val today = DateKey.today()
            val sorted = sortedPoints
            val todayPoint = sorted.firstOrNull { it.day == today } ?: return null
            val prev = sorted.lastOrNull { it.day < today }
            return todayPoint.winPoints - (prev?.winPoints ?: 0)
        }

    private val defaultGoal: Int get() = rank.nextTarget ?: maxOf(1, rank.currentFloor)

    /** The goal: a custom override, else the next rank target. */
    val goal: Int get() = goalOverride ?: defaultGoal

    val hasCustomGoal: Boolean get() = goalOverride != null

    /** Points that fall within the current season window (all points if no season). */
    val seasonPoints: List<Point>
        get() = season?.let { s -> points.filter { !it.instant.isBefore(s.start) && !it.instant.isAfter(s.end) } }
            ?: points

    val pace: PaceStats?
        get() = season?.let { computePace(goal, seasonPoints, it.start, it.end) }
}

class DashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("dashboard", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(
        DashboardState(goalOverride = if (prefs.contains(KEY_GOAL)) prefs.getInt(KEY_GOAL, 0) else null),
    )
    val state = _state.asStateFlow()

    private val live = LiveUpdates(viewModelScope)

    init {
        viewModelScope.launch { live.events.collect(::applyEvent) }
        viewModelScope.launch { live.isLive.collect { l -> _state.update { it.copy(isLive = l) } } }
    }

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            // Season is public + best-effort; don't let its failure block records.
            val season = runCatching { ApiClient.getSeasons() }.getOrNull()?.let { Season.from(it) }
            try {
                val records = ApiClient.getRecords()
                _state.update {
                    it.copy(
                        points = records.map(Point::from),
                        season = season ?: it.season,
                        isLoading = false,
                        hasLoaded = true,
                    )
                }
                live.start()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        season = season ?: it.season,
                        isLoading = false,
                        hasLoaded = true,
                        error = "Couldn't load your data. Pull to refresh.",
                    )
                }
            }
        }
    }

    /** Add or overwrite the record for a day (`POST /me/records`). */
    fun addOrSet(date: String, winPoints: Int) {
        _state.update { it.copy(isWriting = true) }
        viewModelScope.launch {
            try {
                val record = ApiClient.upsertRecord(date, winPoints)
                _state.update { it.copy(points = it.points.upserted(record), isWriting = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isWriting = false, error = "Couldn't save that point.") }
            }
        }
    }

    /** Edit an existing record in place (`PUT /me/records/:id`). */
    fun updatePoint(point: Point, date: String, winPoints: Int) {
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

    /** Delete a record (`DELETE /me/records/:id`), optimistically removing it locally. */
    fun deletePoint(point: Point) {
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
        prefs.edit().putInt(KEY_GOAL, value).apply()
        _state.update { it.copy(goalOverride = value) }
    }

    fun clearGoal() {
        prefs.edit().remove(KEY_GOAL).apply()
        _state.update { it.copy(goalOverride = null) }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    /** Merge a live event into local state (mirrors iOS DashboardStore.apply). */
    private fun applyEvent(event: RecordEvent) {
        _state.update { s ->
            when (event) {
                is RecordEvent.Upsert -> s.copy(points = s.points.upserted(event.record))
                is RecordEvent.Delete -> s.copy(points = s.points.filterNot { it.remoteId == event.id })
                RecordEvent.DeleteAll -> s.copy(points = emptyList())
                is RecordEvent.BulkUpsert -> {
                    var list = s.points
                    event.records.forEach { list = list.upserted(it) }
                    s.copy(points = list)
                }
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

    private companion object {
        const val KEY_GOAL = "goal.worldTour"
    }
}
