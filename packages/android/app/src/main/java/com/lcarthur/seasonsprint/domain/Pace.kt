package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.GameMode
import java.time.Instant
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.sqrt

private const val SECONDS_PER_DAY = 86_400.0

private fun roundedDays(from: Instant, to: Instant): Int {
    val seconds = (to.epochSecond - from.epochSecond).toDouble()
    return (seconds / SECONDS_PER_DAY).roundToLong().toInt()
}

/**
 * The anchor pace/projection math is measured from. World Tour anchors at
 * (seasonStart, 0); Ranked anchors at the first recorded point in the season (the
 * placement point), since a Ranked season starts at a placement rank, not zero.
 * Mirrors `paceBaseline` in packages/web/src/composables/useChartGeometry.js.
 */
data class PaceBaseline(val instant: Instant, val value: Double)

/** [sortedSeasonPoints] must already be sorted ascending by [Point.instant]. */
fun paceBaselineFor(mode: GameMode, sortedSeasonPoints: List<Point>, seasonStart: Instant): PaceBaseline {
    val first = sortedSeasonPoints.firstOrNull()
    return if (mode == GameMode.Ranked && first != null) {
        PaceBaseline(first.instant, first.winPoints.toDouble())
    } else {
        PaceBaseline(seasonStart, 0.0)
    }
}

/** Goal-pace statistics over a season window. Ports computePace from iOS Pace.swift. */
data class PaceStats(
    val daysInSeason: Int,
    val daysRemaining: Int,
    /** Slope of the baseline → goal projection, points per day. */
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
 * @param baseline the zero-point anchor; defaults to (start, 0) — pass [paceBaselineFor]'s
 *   result to get Ranked's placement-point measurement.
 */
fun computePace(
    goal: Int,
    seasonPoints: List<Point>,
    start: Instant,
    end: Instant,
    now: Instant = Instant.now(),
    baseline: PaceBaseline = PaceBaseline(start, 0.0),
): PaceStats {
    val daysInSeason = maxOf(1, roundedDays(start, end))
    val baselineDays = maxOf(1, roundedDays(baseline.instant, end))
    val requiredPerDayZero = (goal - baseline.value) / baselineDays.toDouble()

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

/**
 * Through-origin least-squares slope (points/day): Σ(x·y)/Σ(x²), where x/y are day/value
 * offsets *relative to [baseline]*. A point that coincides with the baseline itself (the
 * Ranked placement point) is skipped so it isn't counted twice against the synthetic origin.
 */
private fun throughOriginSlope(seasonPoints: List<Point>, baseline: PaceBaseline): Double? {
    var sumXX = 0.0
    var sumXY = 0.0
    for (p in seasonPoints) {
        val x = (p.instant.epochSecond - baseline.instant.epochSecond) / SECONDS_PER_DAY
        val y = p.winPoints - baseline.value
        if (x == 0.0 && y == 0.0) continue
        sumXX += x * x
        sumXY += x * y
    }
    return if (sumXX == 0.0) null else sumXY / sumXX
}

/** Average-pace value projected to season end: baseline value + slope · daysFromBaseline. */
fun averagePaceProjectedEnd(
    seasonPoints: List<Point>,
    start: Instant,
    end: Instant,
    baseline: PaceBaseline = PaceBaseline(start, 0.0),
): Double? {
    if (seasonPoints.isEmpty()) return null
    val slope = throughOriginSlope(seasonPoints, baseline) ?: return null
    val totalDays = (end.epochSecond - baseline.instant.epochSecond) / SECONDS_PER_DAY
    return baseline.value + slope * totalDays
}

/** Deviation half-width at season end for the confidence wedge. */
fun deviationAtEnd(
    seasonPoints: List<Point>,
    start: Instant,
    end: Instant,
    baseline: PaceBaseline = PaceBaseline(start, 0.0),
): Double? {
    if (seasonPoints.size < 2) return null
    val slope = throughOriginSlope(seasonPoints, baseline) ?: return null

    var sumResidualSq = 0.0
    var n = 0
    for (p in seasonPoints) {
        val x = (p.instant.epochSecond - baseline.instant.epochSecond) / SECONDS_PER_DAY
        val y = p.winPoints - baseline.value
        if (x == 0.0 && y == 0.0) continue
        val residual = y - slope * x
        sumResidualSq += residual * residual
        n++
    }
    if (n == 0) return null
    val stdDev = if (n > 1) sqrt(sumResidualSq / (n - 1)) else sqrt(sumResidualSq)
    val tFactor = when {
        n <= 2 -> 4.303
        n <= 3 -> 3.182
        n <= 5 -> 2.776
        n <= 10 -> 2.228
        else -> 1.96
    }
    val totalDays = (end.epochSecond - baseline.instant.epochSecond) / SECONDS_PER_DAY
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

/**
 * Points earned per entry: delta of the cumulative total. [baselineY] seeds the running
 * total — 0 for World Tour, the placement value for Ranked, so the placement point itself
 * doesn't read as a giant "earned" spike on day one.
 */
fun earnedPaceSeries(seasonPoints: List<Point>, baselineY: Double = 0.0): List<PaceSeriesPoint> {
    var prev = baselineY
    return seasonPoints.sortedBy { it.instant }.map { p ->
        val delta = p.winPoints - prev
        prev = p.winPoints.toDouble()
        PaceSeriesPoint(p.instant, delta)
    }
}
