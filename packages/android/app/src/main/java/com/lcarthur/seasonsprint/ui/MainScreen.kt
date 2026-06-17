package com.lcarthur.seasonsprint.ui

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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.state.DashboardViewModel
import com.lcarthur.seasonsprint.state.SettingsViewModel

private enum class Tab(val label: String, val icon: ImageVector) {
    Graph("Graph", Icons.AutoMirrored.Filled.ShowChart),
    Log("Log", Icons.Filled.EditNote),
    Details("Details", Icons.AutoMirrored.Filled.ListAlt),
}

/**
 * Signed-in shell: branded loading until the first fetch completes, then a 3-tab layout
 * (Graph / Log / Details) with an app-wide Settings sheet behind the toolbar gear.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onSignOut: () -> Unit,
    dashboardViewModel: DashboardViewModel = viewModel(),
    settingsViewModel: SettingsViewModel = viewModel(),
) {
    LaunchedEffect(Unit) { dashboardViewModel.load() }
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
        val contentModifier = Modifier.padding(innerPadding)
        when (selected) {
            Tab.Graph -> DashboardScreen(dashboardViewModel, settings, contentModifier)
            Tab.Log -> LogScreen(dashboardViewModel, contentModifier)
            Tab.Details -> DetailsScreen(dashboardViewModel, contentModifier)
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
