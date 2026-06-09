package com.lcarthur.seasonsprint.domain

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
}
