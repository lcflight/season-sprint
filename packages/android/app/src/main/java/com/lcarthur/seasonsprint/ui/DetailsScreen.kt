package com.lcarthur.seasonsprint.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Adjust
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.domain.Season
import com.lcarthur.seasonsprint.domain.SeasonOption
import com.lcarthur.seasonsprint.domain.worldTourCheatsheet
import com.lcarthur.seasonsprint.state.DashboardState
import com.lcarthur.seasonsprint.state.DashboardViewModel
import com.lcarthur.seasonsprint.ui.theme.FinalsGold
import com.lcarthur.seasonsprint.ui.theme.GainNegative
import com.lcarthur.seasonsprint.ui.theme.GainPositive
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlin.math.roundToLong

/** Details tab: season banner, stats grid, goal control, and collapsible references. Ported from iOS DetailsTabView. */
@Composable
fun DetailsScreen(
    viewModel: DashboardViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        state.season?.let { SeasonBanner(it) }
        SeasonsCard(state, viewModel)
        StatsGrid(state)
        GoalControl(state, viewModel)
        RankReference(state)
        if (state.mode == GameMode.WorldTour) Cheatsheet()
        if (state.error != null) {
            Text(
                state.error!!,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

private val monthDayFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d")

@Composable
private fun SeasonBanner(season: Season) {
    val end = season.end.atZone(ZoneId.systemDefault())
    val endLabel = end.format(monthDayFormatter)
    val daysLeft = max(0L, ((season.end.epochSecond - Instant.now().epochSecond) / 86400.0).roundToLong())
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(season.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                "  · ends $endLabel",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            Text(
                "$daysLeft days left",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun StatsGrid(state: DashboardState) {
    val gain = state.todayGain
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard(
                label = "Current win points",
                value = "${state.currentPoints}",
                accent = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            StatCard(
                label = "Today",
                value = when {
                    gain == null -> "—"
                    gain >= 0 -> "+$gain"
                    else -> "$gain"
                },
                accent = when {
                    gain == null -> MaterialTheme.colorScheme.onSurfaceVariant
                    gain >= 0 -> GainPositive
                    else -> GainNegative
                },
                modifier = Modifier.weight(1f),
            )
        }
        state.pace?.let { pace ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(
                    label = "Required/day (zero → goal)",
                    value = String.format("%.2f", pace.requiredPerDayZero),
                    accent = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = "Required/day (last → goal)",
                    value = if (pace.isFromLastDefined) String.format("%.2f", pace.requiredPerDayFromLast) else "—",
                    accent = if (pace.isFromLastDefined) GainPositive else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, accent: Color, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = accent)
        }
    }
}

/**
 * Season picker + compare overlay. Mirrors SeasonControls.vue: the current season is always
 * selectable, past seasons appear once they have data, and the whole module explains itself
 * (rather than showing empty dropdowns) until there's a past season to look at.
 */
@Composable
private fun SeasonsCard(state: DashboardState, viewModel: DashboardViewModel) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Seasons", style = MaterialTheme.typography.titleMedium)
            if (state.seasonModuleDisabled) {
                Text(
                    "Log points across more than the current season to unlock historical comparisons.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                SeasonPickerRow(
                    label = "Season",
                    options = state.seasonOptions,
                    selectedKey = state.viewedSeasonKey ?: state.currentSeasonKey,
                    placeholder = null,
                    onSelect = { viewModel.viewSeason(if (it == state.currentSeasonKey) null else it) },
                )
                SeasonPickerRow(
                    label = "Compare",
                    options = state.overlayOptions,
                    selectedKey = state.overlaySeasonKey,
                    placeholder = "None",
                    onSelect = { viewModel.overlaySeason(it) },
                )
                if (state.isViewingPastSeason) {
                    Text(
                        "Viewing a past season — read-only. Switch back to the current season to log points.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SeasonPickerRow(
    label: String,
    options: List<SeasonOption>,
    selectedKey: String?,
    placeholder: String?,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.key == selectedKey }?.displayName ?: placeholder ?: "—"

    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Box {
            OutlinedButton(onClick = { expanded = true }) {
                Text(selectedLabel)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Filled.ExpandMore, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                if (placeholder != null) {
                    DropdownMenuItem(text = { Text(placeholder) }, onClick = { onSelect(null); expanded = false })
                }
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.displayName) },
                        onClick = { onSelect(option.key); expanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun GoalControl(state: DashboardState, viewModel: DashboardViewModel) {
    var expanded by remember { mutableStateOf(false) }
    var editingCustom by remember { mutableStateOf(false) }
    var customText by remember { mutableStateOf("") }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Goal", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Tap to change",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                Box {
                    FilledTonalButton(onClick = { expanded = true }) {
                        Icon(Icons.Filled.Adjust, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("${state.goal}")
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Filled.ExpandMore, contentDescription = null)
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        state.thresholds.reversed().forEach { t ->
                            DropdownMenuItem(
                                text = { Text("${t.badge} — ${t.points}") },
                                onClick = {
                                    viewModel.setGoal(t.points)
                                    expanded = false
                                },
                            )
                        }
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Custom…") },
                            onClick = {
                                customText = state.goal.toString()
                                editingCustom = true
                                expanded = false
                            },
                        )
                    }
                }
            }
            if (editingCustom) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = customText,
                        onValueChange = { input -> customText = input.filter { it.isDigit() } },
                        label = { Text("Custom goal") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    Button(onClick = {
                        val v = customText.trim().toIntOrNull()
                        if (v != null && v > 0) {
                            viewModel.setGoal(v)
                            editingCustom = false
                        }
                    }) { Text("Set") }
                }
            }
        }
    }
}

@Composable
private fun RankReference(state: DashboardState) {
    ExpandableCard(title = "Rank thresholds") {
        state.thresholds.reversed().forEach { t ->
            val isCurrent = t.points == state.rank.currentFloor && state.rank.badge == t.badge
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .then(if (isCurrent) Modifier.background(FinalsGold.copy(alpha = 0.15f)) else Modifier)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(t.badge, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal)
                Spacer(Modifier.weight(1f))
                Text("${t.points}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Cheatsheet() {
    ExpandableCard(title = "World Tour win points") {
        worldTourCheatsheet.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(row.label)
                Spacer(Modifier.weight(1f))
                Text("+${row.value}", fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** Collapsible card with a clickable header row and chevron, used by the rank and cheatsheet sections. */
@Composable
private fun ExpandableCard(title: String, content: @Composable () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.weight(1f))
                Icon(
                    if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(modifier = Modifier.padding(top = 8.dp)) { content() }
            }
        }
    }
}
