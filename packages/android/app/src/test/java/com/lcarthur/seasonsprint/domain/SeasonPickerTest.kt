package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.data.SeasonDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Validates the ported season-picker gating/remap logic matches utils/chart.js. */
class SeasonPickerTest {
    private fun point(day: String, winPoints: Int) =
        Point(remoteId = day, day = day, winPoints = winPoints, instant = DateKey.parseUtc(day)!!)

    private val season1 = SeasonDto(name = "1", start = "2024-01-01T00:00:00Z", end = "2024-01-10T00:00:00Z")
    private val season2 = SeasonDto(name = "2", start = "2024-02-01T00:00:00Z", end = "2024-02-10T00:00:00Z")

    @Test
    fun seasonOptionsFromNormalizesNameAndSortsAscending() {
        val options = seasonOptionsFrom(listOf(season2, season1))
        assertEquals(listOf("1", "2"), options.map { it.key })
        assertEquals("Season 1", options[0].displayName)
    }

    @Test
    fun seasonOptionsFromKeepsAlreadyPrefixedNames() {
        val named = SeasonDto(name = "Season 3", start = "2024-03-01T00:00:00Z", end = "2024-03-10T00:00:00Z")
        val options = seasonOptionsFrom(listOf(named))
        assertEquals("Season 3", options[0].displayName)
    }

    @Test
    fun seasonsWithDataKeysOnlyIncludesSeasonsWithAtLeastOnePoint() {
        val options = seasonOptionsFrom(listOf(season1, season2))
        val points = listOf(point("2024-01-05", 100))
        val keys = seasonsWithDataKeys(points, options)
        assertEquals(setOf("1"), keys)
    }

    @Test
    fun mapOverlayByDayOfSeasonShiftsPointsByStartOffset() {
        val overlayStart = DateKey.parseUtc("2024-01-01")!!
        val viewedStart = DateKey.parseUtc("2024-02-01")!!
        val viewedEnd = DateKey.parseUtc("2024-02-10")!!
        val overlayPoints = listOf(point("2024-01-03", 500)) // day offset 2 into its own season

        val mapped = mapOverlayByDayOfSeason(overlayPoints, overlayStart, viewedStart, viewedEnd)

        assertEquals(1, mapped.size)
        assertEquals(DateKey.parseUtc("2024-02-03"), mapped[0].instant)
        assertEquals(500, mapped[0].winPoints)
    }

    @Test
    fun mapOverlayByDayOfSeasonDropsPointsPastViewedEnd() {
        val overlayStart = DateKey.parseUtc("2024-01-01")!!
        val viewedStart = DateKey.parseUtc("2024-02-01")!!
        val viewedEnd = DateKey.parseUtc("2024-02-05")!! // shorter than the overlay season
        val overlayPoints = listOf(point("2024-01-08", 999)) // day offset 7, past the viewed end

        val mapped = mapOverlayByDayOfSeason(overlayPoints, overlayStart, viewedStart, viewedEnd)

        assertTrue(mapped.isEmpty())
    }
}
