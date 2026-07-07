package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.GameMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** Validates the ported pace math matches iOS Pace.swift (computePace). */
class PaceTest {
    private fun point(day: String, winPoints: Int) =
        Point(remoteId = day, day = day, winPoints = winPoints, instant = DateKey.parseUtc(day)!!)

    private val start = DateKey.parseUtc("2025-01-01")!!
    private val end = DateKey.parseUtc("2025-01-11")!! // 10-day season

    @Test
    fun requiredPerDayZeroIsGoalOverSeasonDays() {
        val pace = computePace(goal = 1000, seasonPoints = emptyList(), start = start, end = end)
        assertEquals(10, pace.daysInSeason)
        assertEquals(100.0, pace.requiredPerDayZero, 0.0001)
        assertFalse(pace.isFromLastDefined)
        assertEquals(0.0, pace.requiredPerDayFromLast, 0.0001)
    }

    @Test
    fun requiredPerDayFromLastUsesLatestPoint() {
        val points = listOf(point("2025-01-03", 200), point("2025-01-06", 400))
        val pace = computePace(goal = 1000, seasonPoints = points, start = start, end = end)
        assertTrue(pace.isFromLastDefined)
        // remaining 600 over 5 days (01-06 → 01-11) = 120/day
        assertEquals(120.0, pace.requiredPerDayFromLast, 0.0001)
    }

    @Test
    fun daysRemainingFromNow() {
        val now = Instant.parse("2025-01-09T00:00:00Z")
        val pace = computePace(goal = 1000, seasonPoints = emptyList(), start = start, end = end, now = now)
        assertEquals(2, pace.daysRemaining)
    }

    @Test
    fun daysRemainingNeverNegative() {
        val now = Instant.parse("2025-02-01T00:00:00Z") // past season end
        val pace = computePace(goal = 1000, seasonPoints = emptyList(), start = start, end = end, now = now)
        assertEquals(0, pace.daysRemaining)
    }

    // --- Ranked placement baseline ---

    @Test
    fun requiredPerDayZeroUsesBaselineWhenProvided() {
        val baseline = PaceBaseline(DateKey.parseUtc("2025-01-03")!!, 30_000.0)
        val pace = computePace(goal = 40_000, seasonPoints = emptyList(), start = start, end = end, baseline = baseline)
        // 8 days from the placement (01-03) to season end (01-11).
        assertEquals(1250.0, pace.requiredPerDayZero, 0.0001)
    }

    @Test
    fun paceBaselineForRankedUsesFirstSeasonPoint() {
        val points = listOf(point("2025-01-03", 30_000), point("2025-01-05", 31_000))
        val baseline = paceBaselineFor(GameMode.Ranked, points.sortedBy { it.instant }, start)
        assertEquals(DateKey.parseUtc("2025-01-03"), baseline.instant)
        assertEquals(30_000.0, baseline.value, 0.0001)
    }

    @Test
    fun paceBaselineForWorldTourIsAlwaysSeasonStartZero() {
        val points = listOf(point("2025-01-03", 200))
        val baseline = paceBaselineFor(GameMode.WorldTour, points, start)
        assertEquals(start, baseline.instant)
        assertEquals(0.0, baseline.value, 0.0001)
    }

    @Test
    fun paceBaselineForRankedFallsBackToSeasonStartZeroWhenNoPoints() {
        val baseline = paceBaselineFor(GameMode.Ranked, emptyList(), start)
        assertEquals(start, baseline.instant)
        assertEquals(0.0, baseline.value, 0.0001)
    }

    @Test
    fun averagePaceProjectedEndAnchorsAtBaseline() {
        val baseline = PaceBaseline(DateKey.parseUtc("2025-01-03")!!, 30_000.0)
        // Relative to baseline: (day 2, +1000), (day 4, +2000) -> slope 500/day.
        val points = listOf(point("2025-01-05", 31_000), point("2025-01-07", 32_000))
        val proj = averagePaceProjectedEnd(points, start, end, baseline)
        // 8 days from baseline to season end: 30000 + 500 * 8 = 34000.
        assertEquals(34_000.0, proj!!, 0.01)
    }
}
