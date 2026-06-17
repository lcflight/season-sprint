package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lcarthur.seasonsprint.state.SettingsViewModel
import com.lcarthur.seasonsprint.data.LiveStatus
import com.lcarthur.seasonsprint.ui.theme.FinalsGold
import com.lcarthur.seasonsprint.ui.theme.FinalsMint

/** Bottom sheet for graph display toggles + live status + sign out. Port of iOS SettingsSheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    settingsViewModel: SettingsViewModel,
    liveStatus: LiveStatus,
    onSignOut: () -> Unit,
    onDismiss: () -> Unit,
) {
    val settings by settingsViewModel.state.collectAsStateWithLifecycle()

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Settings", style = MaterialTheme.typography.titleLarge)

            Text(
                "Graph",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            SettingRow(
                label = "Rank overlay",
                checked = settings.showRankOverlay,
                onChange = settingsViewModel::setRankOverlay,
            )
            SettingRow(
                label = "Average pace line",
                checked = settings.showAveragePace,
                onChange = settingsViewModel::setAveragePace,
            )
            SettingRow(
                label = "Deviation wedge",
                checked = settings.showDeviationWedge,
                enabled = settings.showAveragePace,
                onChange = settingsViewModel::setDeviationWedge,
            )
            SettingRow(
                label = "Pace sub-graph",
                checked = settings.showPaceGraph,
                onChange = settingsViewModel::setPaceGraph,
            )

            Text(
                "Rank overlay shades threshold bands. Average pace projects your points/day " +
                    "to season end; the deviation wedge adds a confidence band. The pace " +
                    "sub-graph compares required vs earned points per day.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            HorizontalDivider()

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Live updates")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    LiveIndicator(liveStatus)
                    Text(
                        when (liveStatus) {
                            LiveStatus.Connected -> "Connected"
                            LiveStatus.Connecting -> "Connecting…"
                            LiveStatus.Disconnected -> "Off"
                        },
                        color = when (liveStatus) {
                            LiveStatus.Connected -> FinalsMint
                            LiveStatus.Connecting -> FinalsGold
                            LiveStatus.Disconnected -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }

            HorizontalDivider()

            TextButton(
                onClick = {
                    onSignOut()
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign out", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun SettingRow(
    label: String,
    checked: Boolean,
    enabled: Boolean = true,
    onChange: (Boolean) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Dim the label when disabled so a disabled row reads differently from an off-but-active one.
        Text(label, color = if (enabled) scheme.onSurface else scheme.onSurface.copy(alpha = 0.38f))
        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                // ON: gold track, dark thumb.
                checkedThumbColor = scheme.onPrimary,
                checkedTrackColor = scheme.primary,
                checkedBorderColor = scheme.primary,
                // OFF (enabled): bright thumb + visible border so it clearly reads as interactive.
                uncheckedThumbColor = scheme.onSurface,
                uncheckedTrackColor = scheme.surfaceVariant,
                uncheckedBorderColor = scheme.onSurfaceVariant,
                // DISABLED: noticeably faded thumb/track, distinct from a plain "off".
                disabledCheckedThumbColor = scheme.onSurface.copy(alpha = 0.38f),
                disabledCheckedTrackColor = scheme.onSurface.copy(alpha = 0.12f),
                disabledCheckedBorderColor = scheme.onSurface.copy(alpha = 0.12f),
                disabledUncheckedThumbColor = scheme.onSurface.copy(alpha = 0.30f),
                disabledUncheckedTrackColor = scheme.surfaceVariant.copy(alpha = 0.40f),
                disabledUncheckedBorderColor = scheme.outline.copy(alpha = 0.30f),
            ),
        )
    }
}
