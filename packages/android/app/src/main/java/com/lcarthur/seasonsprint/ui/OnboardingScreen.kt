package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.domain.fansTotal
import com.lcarthur.seasonsprint.state.OnboardingViewModel

/**
 * First-launch prompt asking a new user for their current season totals, so their graph starts
 * from where they actually are instead of zero. Either mode may be left blank.
 * Mirrors iOS OnboardingView.swift and the web's OnboardingPrompt.vue.
 */
@Composable
fun OnboardingScreen(viewModel: OnboardingViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Kept as strings so a blank field stays blank ("don't record this mode") rather than
    // coercing to 0, which would anchor that mode's graph and pace at zero.
    val entries = remember { mutableStateMapOf<GameMode, String>() }
    // World Tour counts fans (Season 12+): entries[WorldTour] is the X of the in-game
    // "X / Y" and this is the Y. Saved as the season total.
    var worldTourRequired by remember { mutableStateOf("") }

    val values = GameMode.entries.mapNotNull { mode ->
        val x = entries[mode]?.trim()?.toIntOrNull() ?: return@mapNotNull null
        if (mode == GameMode.WorldTour) {
            worldTourRequired.trim().toIntOrNull()?.let { y -> fansTotal(x, y) }?.let { mode to it }
        } else {
            mode to x
        }
    }.toMap()

    // At least one total is needed — otherwise "Get started" would do nothing that
    // "Skip for now" doesn't already do.
    val canSave = values.isNotEmpty() && !state.isSaving

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Welcome to Season Sprint", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Enter where you are now so your graph starts from there. For World Tour, copy the " +
                "fans shown on the World Tour panel (e.g. 1,250 / 6,000). You can leave a mode " +
                "blank if you don't play it.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(4.dp))

        GameMode.entries.forEach { mode ->
            if (mode == GameMode.WorldTour) {
                FansReadoutField(
                    inRank = entries[mode] ?: "",
                    onInRankChange = { entries[mode] = it },
                    required = worldTourRequired,
                    onRequiredChange = { worldTourRequired = it },
                    label = "${mode.label} fans",
                )
            } else {
                WinPointsField(
                    value = entries[mode] ?: "",
                    onValueChange = { entries[mode] = it },
                    label = mode.label,
                )
            }
        }

        state.error?.let { error ->
            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        Text(
            "Saved as today's entry — you can edit it any time.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(8.dp))

        Button(
            onClick = { viewModel.save(values) },
            enabled = canSave,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.height(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Get started")
            }
        }

        TextButton(
            onClick = { viewModel.skip() },
            enabled = !state.isSaving,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        ) {
            Text("Skip for now")
        }
    }
}
