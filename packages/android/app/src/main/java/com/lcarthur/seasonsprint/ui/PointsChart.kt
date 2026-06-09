package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.domain.Season
import java.time.Instant

/**
 * Cumulative win-points chart with goal projections, mirroring iOS PointsChartView:
 *   - solid line + dots: cumulative points over time
 *   - gray dashed: zero → goal projection (the required pace)
 *   - green dashed: latest point → goal projection
 */
@Composable
fun PointsChart(
    points: List<Point>,
    goal: Int,
    season: Season?,
    modifier: Modifier = Modifier,
) {
    val sorted = points.sortedBy { it.instant }
    if (sorted.isEmpty()) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(280.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "No points yet — add your first in the Log tab.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    // X domain: the season window if known, else first→last point.
    val startSec = (season?.start ?: sorted.first().instant).epochSecond.toDouble()
    val endSec = (season?.end ?: sorted.last().instant).epochSecond.toDouble()
    val xSpan = (endSec - startSec).coerceAtLeast(1.0)

    // Y domain: 0 → max(goal, highest point) with 8% headroom.
    val maxPoint = sorted.maxOf { it.winPoints }
    val yMax = (maxOf(goal, maxPoint).toDouble() * 1.08).coerceAtLeast(1.0)

    val lineColor = MaterialTheme.colorScheme.secondary // electric cyan
    val lastProjectionColor = MaterialTheme.colorScheme.tertiary // mint
    val projectionColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
    val axisColor = MaterialTheme.colorScheme.outlineVariant
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp),
    ) {
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
        fun xOfSec(sec: Double): Float {
            val f = ((sec - startSec) / xSpan).coerceIn(0.0, 1.0)
            return padLeft + (f * plotW).toFloat()
        }
        fun yOf(value: Double): Float {
            val f = (value / yMax).coerceIn(0.0, 1.0)
            return padTop + ((1.0 - f) * plotH).toFloat()
        }

        // Baseline (y = 0).
        drawLine(axisColor, Offset(padLeft, yOf(0.0)), Offset(padLeft + plotW, yOf(0.0)), strokeWidth = 1.dp.toPx())

        val dash = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))

        // Zero → goal projection.
        drawLine(
            color = projectionColor,
            start = Offset(xOfSec(startSec), yOf(0.0)),
            end = Offset(xOfSec(endSec), yOf(goal.toDouble())),
            strokeWidth = 1.5.dp.toPx(),
            pathEffect = dash,
        )

        // Latest point → goal projection (only if the latest point predates season end).
        val last = sorted.last()
        if (last.instant.epochSecond.toDouble() < endSec) {
            drawLine(
                color = lastProjectionColor,
                start = Offset(xOf(last.instant), yOf(last.winPoints.toDouble())),
                end = Offset(xOfSec(endSec), yOf(goal.toDouble())),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = dash,
            )
        }

        // Cumulative line + dots.
        var prev: Offset? = null
        for (p in sorted) {
            val o = Offset(xOf(p.instant), yOf(p.winPoints.toDouble()))
            prev?.let { drawLine(lineColor, it, o, strokeWidth = 2.5.dp.toPx()) }
            prev = o
        }
        for (p in sorted) {
            drawCircle(lineColor, radius = 3.dp.toPx(), center = Offset(xOf(p.instant), yOf(p.winPoints.toDouble())))
        }

        // Goal label at the top-right.
        drawAxisLabel("Goal $goal", padLeft + plotW, yOf(goal.toDouble()) - 4.dp.toPx(), labelColor.toArgb(), alignRight = true)
        drawAxisLabel("0", padLeft, yOf(0.0) + 14.dp.toPx(), labelColor.toArgb(), alignRight = false)
    }
}

private fun DrawScope.drawAxisLabel(text: String, x: Float, y: Float, color: Int, alignRight: Boolean) {
    drawContext.canvas.nativeCanvas.apply {
        val paint = android.graphics.Paint().apply {
            this.color = color
            textSize = 11.sp.toPx()
            isAntiAlias = true
            textAlign = if (alignRight) android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.LEFT
        }
        drawText(text, x, y, paint)
    }
}
