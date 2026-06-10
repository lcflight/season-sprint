package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lcarthur.seasonsprint.domain.PaceStats
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.domain.RankInfo
import com.lcarthur.seasonsprint.domain.Season
import com.lcarthur.seasonsprint.domain.averagePaceProjectedEnd
import com.lcarthur.seasonsprint.domain.deviationAtEnd
import com.lcarthur.seasonsprint.domain.worldTourThresholds
import com.lcarthur.seasonsprint.ui.theme.ChartAvgPace
import com.lcarthur.seasonsprint.ui.theme.GainNegative
import com.lcarthur.seasonsprint.ui.theme.GainPositive
import com.lcarthur.seasonsprint.ui.theme.rankColor
import java.time.Instant

/**
 * The hero chart: cumulative points over time with optional rank overlay, goal line,
 * pace projections, average-pace line, and deviation wedge. Ports iOS PointsChartView.
 */
@Composable
fun PointsChart(
    points: List<Point>,
    goal: Int,
    season: Season?,
    rank: RankInfo,
    pace: PaceStats?,
    todayGain: Int?,
    showRankOverlay: Boolean,
    showAveragePace: Boolean,
    showDeviationWedge: Boolean,
    modifier: Modifier = Modifier,
) {
    val sorted = points.sortedBy { it.instant }

    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (sorted.isEmpty()) {
                Text(
                    "No records this season yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().height(280.dp).padding(top = 120.dp),
                )
                return@Column
            }

            ChartCanvas(
                sorted = sorted,
                goal = goal,
                season = season,
                showRankOverlay = showRankOverlay,
                showAveragePace = showAveragePace,
                showDeviationWedge = showDeviationWedge,
                isFromLastDefined = pace?.isFromLastDefined == true,
                todayGain = todayGain,
            )
            Legend(showAveragePace = showAveragePace, showLast = pace?.isFromLastDefined == true)
        }
    }
}

@Composable
private fun ChartCanvas(
    sorted: List<Point>,
    goal: Int,
    season: Season?,
    showRankOverlay: Boolean,
    showAveragePace: Boolean,
    showDeviationWedge: Boolean,
    isFromLastDefined: Boolean,
    todayGain: Int?,
) {
    // X domain: the season window if known, else first→last point.
    val startSec = (season?.start ?: sorted.first().instant).epochSecond.toDouble()
    val endSec = (season?.end ?: sorted.last().instant).epochSecond.toDouble()
    val xSpan = (endSec - startSec).coerceAtLeast(1.0)

    // Y domain: cap at the goal unless the data exceeds it (then 5% headroom).
    val maxPoint = sorted.maxOf { it.winPoints }.toDouble()
    val yMax = if (maxPoint > goal) maxOf(1.0, maxPoint * 1.05) else maxOf(1.0, goal.toDouble())

    val lineColor = MaterialTheme.colorScheme.secondary       // cyan
    val lastProjectionColor = MaterialTheme.colorScheme.tertiary // mint
    val projectionColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
    val axisColor = MaterialTheme.colorScheme.outlineVariant
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val avgColor = ChartAvgPace

    Box {
        Canvas(modifier = Modifier.fillMaxWidth().height(300.dp)) {
            val padLeft = 8.dp.toPx()
            val padRight = 8.dp.toPx()
            val padTop = 12.dp.toPx()
            val padBottom = 22.dp.toPx()
            val plotW = size.width - padLeft - padRight
            val plotH = size.height - padTop - padBottom

            fun xOf(instant: Instant): Float {
                val f = ((instant.epochSecond.toDouble() - startSec) / xSpan).coerceIn(0.0, 1.0)
                return padLeft + (f * plotW).toFloat()
            }
            fun xAtFrac(f: Double): Float = padLeft + (f.coerceIn(0.0, 1.0) * plotW).toFloat()
            fun yOf(value: Double): Float {
                val f = (value / yMax).coerceIn(0.0, 1.0)
                return padTop + ((1.0 - f) * plotH).toFloat()
            }

            // --- Rank overlay bands (back layer) ---
            if (showRankOverlay) {
                var lower = 0
                for (t in worldTourThresholds) {
                    if (lower < yMax) {
                        val upper = minOf(t.points.toDouble(), yMax)
                        val top = yOf(upper)
                        val bottom = yOf(lower.toDouble())
                        drawRect(
                            color = rankColor(t.badge).copy(alpha = 0.22f),
                            topLeft = Offset(padLeft, top),
                            size = androidx.compose.ui.geometry.Size(plotW, bottom - top),
                        )
                    }
                    lower = t.points
                }
                // Faint tier-zone labels at each grouped tier's vertical midpoint (right-aligned).
                for (zone in tierZones(yMax)) {
                    drawZoneLabel(zone.first, padLeft + plotW, yOf(zone.second) + 4.dp.toPx(), rankColor(zone.third).copy(alpha = 0.18f).toArgb())
                }
            }

            // --- Deviation wedge ---
            if (showAveragePace && showDeviationWedge && season != null) {
                val proj = averagePaceProjectedEnd(sorted, season.start, season.end)
                val dev = deviationAtEnd(sorted, season.start, season.end)
                if (proj != null && dev != null) {
                    val steps = 24
                    val path = Path()
                    for (i in 0..steps) {
                        val f = i.toDouble() / steps
                        val x = xAtFrac(f)
                        val hi = yOf(minOf(yMax, f * (proj + dev)))
                        if (i == 0) path.moveTo(x, hi) else path.lineTo(x, hi)
                    }
                    for (i in steps downTo 0) {
                        val f = i.toDouble() / steps
                        val x = xAtFrac(f)
                        val lo = yOf(minOf(yMax, maxOf(0.0, f * (proj - dev))))
                        path.lineTo(x, lo)
                    }
                    path.close()
                    drawPath(path, color = avgColor.copy(alpha = 0.12f), style = Fill)
                }
            }

            val dash = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))

            // --- Average pace line ---
            if (showAveragePace && season != null) {
                val proj = averagePaceProjectedEnd(sorted, season.start, season.end)
                if (proj != null && proj > 0) {
                    val endFrac = if (proj > yMax) yMax / proj else 1.0
                    val endVal = if (proj > yMax) yMax else proj
                    drawLine(
                        color = avgColor,
                        start = Offset(xAtFrac(0.0), yOf(0.0)),
                        end = Offset(xAtFrac(endFrac), yOf(endVal)),
                        strokeWidth = 1.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f)),
                    )
                }
            }

            // Baseline (y = 0).
            drawLine(axisColor, Offset(padLeft, yOf(0.0)), Offset(padLeft + plotW, yOf(0.0)), strokeWidth = 1.dp.toPx())

            // --- Zero → goal projection ---
            drawLine(
                color = projectionColor,
                start = Offset(xAtFrac(0.0), yOf(0.0)),
                end = Offset(xAtFrac(1.0), yOf(goal.toDouble())),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = dash,
            )

            // --- Last → goal projection ---
            val last = sorted.last()
            if (isFromLastDefined && last.instant.epochSecond.toDouble() < endSec) {
                drawLine(
                    color = lastProjectionColor,
                    start = Offset(xOf(last.instant), yOf(last.winPoints.toDouble())),
                    end = Offset(xAtFrac(1.0), yOf(goal.toDouble())),
                    strokeWidth = 1.5.dp.toPx(),
                    pathEffect = dash,
                )
            }

            // --- Cumulative line + dots ---
            // Seed at the graph origin (x-start, 0) so the first point connects back to zero-zero.
            var prev: Offset? = Offset(xAtFrac(0.0), yOf(0.0))
            for (p in sorted) {
                val o = Offset(xOf(p.instant), yOf(p.winPoints.toDouble()))
                prev?.let { drawLine(lineColor, it, o, strokeWidth = 2.5.dp.toPx()) }
                prev = o
            }
            for (p in sorted) {
                drawCircle(lineColor, radius = 3.dp.toPx(), center = Offset(xOf(p.instant), yOf(p.winPoints.toDouble())))
            }

            // Goal / zero labels.
            drawZoneLabelRight("Goal $goal", padLeft + plotW, yOf(goal.toDouble()) - 4.dp.toPx(), labelColor.toArgb())
            drawZoneLabelLeft("0", padLeft, yOf(0.0) + 14.dp.toPx(), labelColor.toArgb())
        }

        // Today badge (top-left overlay).
        if (todayGain != null) {
            Column(modifier = Modifier.padding(6.dp)) {
                Text("Today", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    (if (todayGain >= 0) "+$todayGain" else "$todayGain"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (todayGain >= 0) GainPositive else GainNegative,
                )
            }
        }
    }
}

@Composable
private fun Legend(showAveragePace: Boolean, showLast: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        LegendItem(MaterialTheme.colorScheme.onSurfaceVariant, "Zero → goal")
        if (showLast) LegendItem(MaterialTheme.colorScheme.tertiary, "Last → goal")
        if (showAveragePace) LegendItem(ChartAvgPace, "Avg pace")
    }
}

@Composable
private fun LegendItem(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Canvas(Modifier.size(width = 14.dp, height = 3.dp)) {
            drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height)
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** One label per grouped tier (adjacent same-tier sub-tiers merge), at the band midpoint. */
private fun tierZones(yMax: Double): List<Triple<String, Double, String>> {
    val zones = mutableListOf<Triple<String, Double, String>>()
    val t = worldTourThresholds
    var lower = 0
    var i = 0
    while (i < t.size) {
        val tier = t[i].badge.substringBefore(' ')
        var j = i
        while (j + 1 < t.size && t[j + 1].badge.substringBefore(' ') == tier) j++
        val upper = t[j].points
        val mid = (lower + upper) / 2.0
        if (mid < yMax) zones.add(Triple(tier, mid, t[i].badge))
        lower = upper
        i = j + 1
    }
    return zones
}

private fun DrawScope.drawZoneLabel(text: String, x: Float, y: Float, color: Int) =
    drawText(text, x, y, color, android.graphics.Paint.Align.RIGHT)

private fun DrawScope.drawZoneLabelRight(text: String, x: Float, y: Float, color: Int) =
    drawText(text, x, y, color, android.graphics.Paint.Align.RIGHT)

private fun DrawScope.drawZoneLabelLeft(text: String, x: Float, y: Float, color: Int) =
    drawText(text, x, y, color, android.graphics.Paint.Align.LEFT)

private fun DrawScope.drawText(text: String, x: Float, y: Float, color: Int, align: android.graphics.Paint.Align) {
    drawContext.canvas.nativeCanvas.drawText(
        text, x, y,
        android.graphics.Paint().apply {
            this.color = color
            textSize = 11.sp.toPx()
            isAntiAlias = true
            textAlign = align
        },
    )
}
