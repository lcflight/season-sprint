package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.domain.Season
import com.lcarthur.seasonsprint.domain.earnedPaceSeries
import com.lcarthur.seasonsprint.domain.requiredPaceSeries
import com.lcarthur.seasonsprint.ui.theme.ChartRequired
import java.time.Instant

/**
 * Secondary mini-chart: required points/day to hit the goal (line) vs points earned each
 * day (bars). Shares the main chart's season x-domain. Ports iOS PaceChartView.
 */
@Composable
fun PaceChart(
    points: List<Point>,
    goal: Int,
    season: Season?,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Daily pace", style = MaterialTheme.typography.titleMedium)

            if (season == null) {
                Placeholder("Season data needed.")
                return@Column
            }

            val required = requiredPaceSeries(points, goal, season.end)
            val earned = earnedPaceSeries(points)
            if (required.isEmpty() && earned.isEmpty()) {
                Placeholder("No pace data yet.")
                return@Column
            }

            val barColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.5f) // cyan bars
            val lineColor = ChartRequired // amber required-pace line
            val axisColor = MaterialTheme.colorScheme.outlineVariant

            val startSec = season.start.epochSecond.toDouble()
            val endSec = season.end.epochSecond.toDouble()
            val xSpan = (endSec - startSec).coerceAtLeast(1.0)
            val maxVal = (required.maxOfOrNull { it.value } ?: 0.0)
                .coerceAtLeast(earned.maxOfOrNull { it.value } ?: 0.0)
                .coerceAtLeast(1.0)

            Canvas(modifier = Modifier.fillMaxWidth().height(130.dp)) {
                val padLeft = 8.dp.toPx()
                val padRight = 8.dp.toPx()
                val padTop = 8.dp.toPx()
                val padBottom = 8.dp.toPx()
                val plotW = size.width - padLeft - padRight
                val plotH = size.height - padTop - padBottom

                fun xOf(instant: Instant): Float {
                    val f = ((instant.epochSecond.toDouble() - startSec) / xSpan).coerceIn(0.0, 1.0)
                    return padLeft + (f * plotW).toFloat()
                }
                fun yOf(value: Double): Float {
                    val f = (value / maxVal).coerceIn(0.0, 1.0)
                    return padTop + ((1.0 - f) * plotH).toFloat()
                }

                val baseY = yOf(0.0)
                drawLine(axisColor, Offset(padLeft, baseY), Offset(padLeft + plotW, baseY), strokeWidth = 1.dp.toPx())

                // Earned/day bars — width adapts to the tightest day-to-day spacing so dense
                // seasons don't overlap (with a small gap), capped so sparse data isn't blocky.
                val xs = earned.map { xOf(it.instant) }.sorted()
                val minGap = xs.zipWithNext { a, b -> b - a }.filter { it > 0f }.minOrNull() ?: plotW
                val barW = (minGap * 0.8f).coerceIn(1.5.dp.toPx(), 6.dp.toPx())
                for (p in earned) {
                    if (p.value <= 0) continue
                    val x = xOf(p.instant)
                    val top = yOf(p.value)
                    drawRect(
                        color = barColor,
                        topLeft = Offset(x - barW / 2, top),
                        size = androidx.compose.ui.geometry.Size(barW, baseY - top),
                    )
                }

                // Required/day line.
                var prev: Offset? = null
                for (p in required) {
                    val o = Offset(xOf(p.instant), yOf(p.value))
                    prev?.let { drawLine(lineColor, it, o, strokeWidth = 2.dp.toPx()) }
                    prev = o
                }
                // If the goal isn't reached yet (last required value > 0), extend the line flat
                // to the right edge at that last value, so the current pace reads to season end.
                val lastReq = required.lastOrNull()
                if (lastReq != null && lastReq.value > 0) {
                    val y = yOf(lastReq.value)
                    drawLine(
                        color = lineColor,
                        start = Offset(xOf(lastReq.instant), y),
                        end = Offset(padLeft + plotW, y),
                        strokeWidth = 2.dp.toPx(),
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendSwatch(ChartRequired, "Required/day")
                LegendSwatch(MaterialTheme.colorScheme.secondary.copy(alpha = 0.6f), "Earned/day")
            }
        }
    }
}

@Composable
private fun Placeholder(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().height(120.dp).padding(top = 48.dp),
    )
}

@Composable
private fun LegendSwatch(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Canvas(Modifier.size(width = 14.dp, height = 3.dp)) {
            drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height)
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
