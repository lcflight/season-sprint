package com.lcarthur.seasonsprint.domain

import java.time.Instant
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.sqrt

private const val SECONDS_PER_DAY = 86_400.0

private fun roundedDays(from: Instant, to: Instant): Int {
    val seconds = (to.epochSecond - from.epochSecond).toDouble()
    return (seconds / SECONDS_PER_DAY).roundToLong().toInt()
}

/** Goal-pace statistics over a season window. Ports computePace from iOS Pace.swift. */
data class PaceStats(
    val daysInSeason: Int,
    val daysRemaining: Int,
    /** Slope of the zero → goal projection, points per day. */
    val requiredPerDayZero: Double,
    /** Whether a "last point → goal" pace is meaningful. */
    val isFromLastDefined: Boolean,
    /** Points/day needed from the latest point to reach the goal by season end. */
    val requiredPerDayFromLast: Double,
)

/**
 * @param goal target win points / rank score.
 * @param seasonPoints points whose day falls within [start, end], any order.
 * @param start season start, @param end season end.
 * @param now current instant (for days-remaining).
 */
fun computePace(
    goal: Int,
    seasonPoints: List<Point>,
    start: Instant,
    end: Instant,
    now: Instant = Instant.now(),
): PaceStats {
    val daysInSeason = maxOf(1, roundedDays(start, end))
    val requiredPerDayZero = goal.toDouble() / daysInSeason.toDouble()

    val sorted = seasonPoints.sortedBy { it.instant }
    val last = sorted.lastOrNull()
    val isFromLastDefined = last != null && last.instant.isBefore(end)

    val requiredPerDayFromLast = if (last != null && isFromLastDefined) {
        val remaining = (goal - last.winPoints).toDouble()
        val left = maxOf(1, roundedDays(last.instant, end))
        remaining / left.toDouble()
    } else {
        0.0
    }

    val daysRemaining = maxOf(0, roundedDays(now, end))

    return PaceStats(
        daysInSeason = daysInSeason,
        daysRemaining = daysRemaining,
        requiredPerDayZero = requiredPerDayZero,
        isFromLastDefined = isFromLastDefined,
        requiredPerDayFromLast = requiredPerDayFromLast,
    )
}

// MARK: - Chart overlay helpers (ported from iOS Pace.swift / web utils/chart.js)

/** A dated value for the pace sub-graph. */
data class PaceSeriesPoint(val instant: Instant, val value: Double)

/** Through-origin least-squares slope (points/day): Σ(x·y)/Σ(x²), x = day offset from start. */
private fun throughOriginSlope(seasonPoints: List<Point>, start: Instant): Double? {
    var sumXX = 0.0
    var sumXY = 0.0
    for (p in seasonPoints) {
        val x = (p.instant.epochSecond - start.epochSecond) / SECONDS_PER_DAY
        val y = p.winPoints.toDouble()
        sumXX += x * x
        sumXY += x * y
    }
    return if (sumXX == 0.0) null else sumXY / sumXX
}

/** Average-pace value projected to season end: slope · totalDays. */
fun averagePaceProjectedEnd(seasonPoints: List<Point>, start: Instant, end: Instant): Double? {
    if (seasonPoints.isEmpty()) return null
    val slope = throughOriginSlope(seasonPoints, start) ?: return null
    val totalDays = (end.epochSecond - start.epochSecond) / SECONDS_PER_DAY
    return slope * totalDays
}

/** Deviation half-width at season end for the confidence wedge. */
fun deviationAtEnd(seasonPoints: List<Point>, start: Instant, end: Instant): Double? {
    if (seasonPoints.size < 2) return null
    val slope = throughOriginSlope(seasonPoints, start) ?: return null

    var sumResidualSq = 0.0
    for (p in seasonPoints) {
        val x = (p.instant.epochSecond - start.epochSecond) / SECONDS_PER_DAY
        val residual = p.winPoints - slope * x
        sumResidualSq += residual * residual
    }
    val n = seasonPoints.size
    val stdDev = if (n > 1) sqrt(sumResidualSq / (n - 1)) else sqrt(sumResidualSq)
    val tFactor = when {
        n <= 2 -> 4.303
        n <= 3 -> 3.182
        n <= 5 -> 2.776
        n <= 10 -> 2.228
        else -> 1.96
    }
    val totalDays = (end.epochSecond - start.epochSecond) / SECONDS_PER_DAY
    val projectedMag = abs(slope * totalDays)
    val minDeviation = when {
        n <= 3 -> projectedMag * 0.3
        n <= 6 -> projectedMag * 0.15
        else -> projectedMag * 0.05
    }
    return maxOf(stdDev * tFactor, minDeviation)
}

/** Required points/day to hit the goal, per point: (goal - winPoints)/daysRemaining. Skips end. */
fun requiredPaceSeries(seasonPoints: List<Point>, goal: Int, end: Instant): List<PaceSeriesPoint> =
    seasonPoints.sortedBy { it.instant }.mapNotNull { p ->
        val daysRemaining = (end.epochSecond - p.instant.epochSecond) / SECONDS_PER_DAY
        if (daysRemaining <= 0) null
        else PaceSeriesPoint(p.instant, (goal - p.winPoints) / daysRemaining)
    }

/** Points earned per entry: delta of the cumulative total. */
fun earnedPaceSeries(seasonPoints: List<Point>): List<PaceSeriesPoint> {
    var prev = 0
    return seasonPoints.sortedBy { it.instant }.map { p ->
        val delta = p.winPoints - prev
        prev = p.winPoints
        PaceSeriesPoint(p.instant, delta.toDouble())
    }
}
