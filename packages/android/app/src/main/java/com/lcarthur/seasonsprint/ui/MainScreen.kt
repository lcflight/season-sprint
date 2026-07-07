package com.lcarthur.seasonsprint.ui

import android.app.Application
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.state.DashboardViewModel
import com.lcarthur.seasonsprint.state.SettingsViewModel

private enum class Tab(val label: String, val icon: ImageVector) {
    Graph("Graph", Icons.AutoMirrored.Filled.ShowChart),
    Log("Log", Icons.Filled.EditNote),
    Details("Details", Icons.AutoMirrored.Filled.ListAlt),
}

private const val UI_PREFS = "ui"
private const val KEY_LAST_MODE = "lastMode"

/**
 * Signed-in shell: branded loading until the first fetch completes, then a mode switcher
 * (World Tour / Ranked) above a 3-tab layout (Graph / Log / Details), with an app-wide
 * Settings sheet behind the toolbar gear.
 *
 * Both modes get their own [DashboardViewModel]/[SettingsViewModel] instance (keyed by mode,
 * mirroring the web app's separate WorldTour.vue/Ranked.vue view instances) so each mode keeps
 * its own goal, settings, and loaded records independently. Only the *active* mode's live
 * connection is kept open.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(onSignOut: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as Application
    val uiPrefs = remember { context.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE) }

    var mode by remember {
        val saved = uiPrefs.getString(KEY_LAST_MODE, null)?.let { runCatching { GameMode.valueOf(it) }.getOrNull() }
        mutableStateOf(saved ?: GameMode.WorldTour)
    }

    val dashboardViewModels = GameMode.entries.associateWith { m ->
        viewModel<DashboardViewModel>(key = "dashboard-${m.name}", factory = DashboardViewModel.Factory(m, app))
    }
    val settingsViewModels = GameMode.entries.associateWith { m ->
        viewModel<SettingsViewModel>(key = "settings-${m.name}", factory = SettingsViewModel.Factory(m, app))
    }

    val dashboardViewModel = dashboardViewModels.getValue(mode)
    val settingsViewModel = settingsViewModels.getValue(mode)

    // Only the active mode's VM keeps its records fresh and its WebSocket open; the inactive
    // one is paused (it still holds its last-loaded state, so switching back is instant).
    LaunchedEffect(mode) {
        dashboardViewModels.forEach { (m, vm) -> if (m != mode) vm.pauseLive() }
        dashboardViewModel.load()
        dashboardViewModel.resumeLive()
    }

    val state by dashboardViewModel.state.collectAsStateWithLifecycle()
    val settings by settingsViewModel.state.collectAsStateWithLifecycle()
    var selected by remember { mutableStateOf(Tab.Graph) }
    var showSettings by remember { mutableStateOf(false) }

    if (!state.hasLoaded) {
        BrandedLoadingScreen(message = "Loading your season…")
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Season Sprint") },
                actions = {
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selected == tab,
                        onClick = { selected = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding)) {
            ModeSwitcher(
                selected = mode,
                onSelect = { next ->
                    mode = next
                    uiPrefs.edit().putString(KEY_LAST_MODE, next.name).apply()
                },
            )
            val contentModifier = Modifier
            when (selected) {
                Tab.Graph -> DashboardScreen(dashboardViewModel, settings, contentModifier)
                Tab.Log -> LogScreen(dashboardViewModel, contentModifier)
                Tab.Details -> DetailsScreen(dashboardViewModel, contentModifier)
            }
        }
    }

    if (showSettings) {
        SettingsSheet(
            settingsViewModel = settingsViewModel,
            liveStatus = state.liveStatus,
            onSignOut = onSignOut,
            onDismiss = { showSettings = false },
        )
    }
}
