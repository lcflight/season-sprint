package com.lcarthur.seasonsprint.domain

import java.time.Instant
import kotlin.math.roundToLong

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
