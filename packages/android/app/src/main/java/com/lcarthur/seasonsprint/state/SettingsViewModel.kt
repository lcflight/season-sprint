package com.lcarthur.seasonsprint.state

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Graph display toggles, mirroring iOS AppSettings (persisted in SharedPreferences). */
data class AppSettingsState(
    val showRankOverlay: Boolean = true,
    val showAveragePace: Boolean = false,
    val showDeviationWedge: Boolean = false,
    val showPaceGraph: Boolean = false,
)

class SettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(
        AppSettingsState(
            showRankOverlay = prefs.getBoolean(K_RANK, true),
            showAveragePace = prefs.getBoolean(K_AVG, false),
            showDeviationWedge = prefs.getBoolean(K_DEV, false),
            showPaceGraph = prefs.getBoolean(K_PACE, false),
        ),
    )
    val state = _state.asStateFlow()

    fun setRankOverlay(value: Boolean) = put(K_RANK) { it.copy(showRankOverlay = value) }
    fun setAveragePace(value: Boolean) = put(K_AVG) { it.copy(showAveragePace = value) }
    fun setDeviationWedge(value: Boolean) = put(K_DEV) { it.copy(showDeviationWedge = value) }
    fun setPaceGraph(value: Boolean) = put(K_PACE) { it.copy(showPaceGraph = value) }

    private fun put(key: String, transform: (AppSettingsState) -> AppSettingsState) {
        val next = transform(_state.value)
        val value = when (key) {
            K_RANK -> next.showRankOverlay
            K_AVG -> next.showAveragePace
            K_DEV -> next.showDeviationWedge
            else -> next.showPaceGraph
        }
        prefs.edit().putBoolean(key, value).apply()
        _state.update { next }
    }

    private companion object {
        const val K_RANK = "settings.showRankOverlay"
        const val K_AVG = "settings.showAveragePace"
        const val K_DEV = "settings.showDeviationWedge"
        const val K_PACE = "settings.showPaceGraph"
    }
}
