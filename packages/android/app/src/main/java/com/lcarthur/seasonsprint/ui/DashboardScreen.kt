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
import com.lcarthur.seasonsprint.domain.PaceBaseline
import com.lcarthur.seasonsprint.state.AppSettingsState
import com.lcarthur.seasonsprint.state.DashboardState
import com.lcarthur.seasonsprint.state.DashboardViewModel
import com.lcarthur.seasonsprint.ui.theme.rankColor
import java.time.Instant

/** Graph tab: compact rank summary + cumulative points chart + optional pace sub-graph. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    settings: AppSettingsState,
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
            if (state.isViewingPastSeason) {
                Text(
                    "Viewing a past season — read-only",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            val baseline = state.paceBaseline ?: PaceBaseline(state.viewedSeason?.start ?: state.season?.start ?: Instant.EPOCH, 0.0)
            PointsChart(
                points = state.seasonPoints,
                goal = state.goal,
                season = state.viewedSeason,
                thresholds = state.thresholds,
                baseline = baseline,
                overlayPoints = state.overlayPoints,
                rank = state.rank,
                pace = state.pace,
                todayGain = if (state.isViewingPastSeason) null else state.todayGain,
                showRankOverlay = settings.showRankOverlay,
                showAveragePace = settings.showAveragePace,
                showDeviationWedge = settings.showDeviationWedge,
            )
            if (settings.showPaceGraph) {
                PaceChart(points = state.seasonPoints, goal = state.goal, season = state.viewedSeason, baseline = baseline)
            }
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
private fun RankSummaryCard(state: DashboardState) {
    val rank = state.rank
    val accent = rankColor(rank.badge)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        rank.badge,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = accent,
                    )
                    LiveIndicator(state.liveStatus)
                }
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
                color = accent,
            )
            val toNextText = rank.nextTarget?.let { "${rank.toNext} pts to ${rank.nextBadge}  ·  ${rank.points}/$it" }
                ?: "Top rank reached"
            Text(toNextText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
