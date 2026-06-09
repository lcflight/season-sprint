package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.state.DashboardViewModel

private enum class Tab(val label: String, val icon: ImageVector) {
    Graph("Graph", Icons.AutoMirrored.Filled.ShowChart),
    Log("Log", Icons.Filled.EditNote),
}

/** Signed-in shell: top bar with sign-out + bottom nav between the Graph and Log tabs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onSignOut: () -> Unit,
    dashboardViewModel: DashboardViewModel = viewModel(),
) {
    LaunchedEffect(Unit) { dashboardViewModel.load() }
    var selected by remember { mutableStateOf(Tab.Graph) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Season Sprint") },
                actions = {
                    IconButton(onClick = onSignOut) {
                        Icon(Icons.Filled.Logout, contentDescription = "Sign out")
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
            Tab.Graph -> DashboardScreen(viewModel = dashboardViewModel, modifier = contentModifier)
            Tab.Log -> LogScreen(viewModel = dashboardViewModel, modifier = contentModifier)
        }
    }
}
