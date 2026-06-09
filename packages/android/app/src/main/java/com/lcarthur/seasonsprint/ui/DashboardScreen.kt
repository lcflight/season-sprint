package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lcarthur.seasonsprint.state.DashboardState
import com.lcarthur.seasonsprint.state.DashboardViewModel
import com.lcarthur.seasonsprint.ui.theme.RankEmerald
import com.lcarthur.seasonsprint.ui.theme.rankColor

/** Graph tab: compact rank summary + cumulative points chart + pace figures. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    PullToRefreshBox(
        isRefreshing = state.isLoading,
        onRefresh = viewModel::load,
        modifier = modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            RankSummaryCard(state)
            LiveIndicator(isLive = state.isLive)
            PointsChart(points = state.seasonPoints, goal = state.goal, season = state.season)
            PaceCard(state)
            if (state.error != null) {
                Text(
                    state.error!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun LiveIndicator(isLive: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(if (isLive) "●" else "○", color = if (isLive) RankEmerald else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            if (isLive) "Live" else "Offline",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun RankSummaryCard(state: DashboardState) {
    val rank = state.rank
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    rank.badge,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = rankColor(rank.badge),
                )
                Column(horizontalAlignment = Alignment.End) {
                    Text("${state.currentPoints} pts", style = MaterialTheme.typography.titleMedium)
                    state.todayGain?.let { gain ->
                        Text(
                            (if (gain >= 0) "+$gain today" else "$gain today"),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            LinearProgressIndicator(
                progress = { rank.progressFraction },
                modifier = Modifier.fillMaxWidth(),
                color = rankColor(rank.nextBadge ?: rank.badge),
            )
            val toNextText = rank.nextTarget?.let { "${rank.toNext} pts to ${rank.nextBadge}" }
                ?: "Top rank reached"
            Text(toNextText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PaceCard(state: DashboardState) {
    val pace = state.pace ?: return
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Pace to goal ${state.goal}", style = MaterialTheme.typography.titleSmall)
            Text(
                "Required/day (zero → goal): ${"%.1f".format(pace.requiredPerDayZero)}",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (pace.isFromLastDefined) {
                Text(
                    "Required/day (last → goal): ${"%.1f".format(pace.requiredPerDayFromLast)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Text(
                "${pace.daysRemaining} days remaining",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
