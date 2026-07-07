package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.GameMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/** Validates the ported rank logic matches the web/iOS source of truth (worldTourRanks.json). */
class RankTest {
    @Test
    fun unrankedBelowFirstThreshold() {
        val r = computeRank(10)
        assertEquals("Unranked", r.badge)
        assertEquals(0, r.currentFloor)
        assertEquals(25, r.nextTarget)
        assertEquals("Bronze 4", r.nextBadge)
    }

    @Test
    fun exactlyOnThresholdEarnsThatBadge() {
        val r = computeRank(25)
        assertEquals("Bronze 4", r.badge)
        assertEquals(25, r.currentFloor)
        assertEquals(50, r.nextTarget)
        assertEquals("Bronze 3", r.nextBadge)
    }

    @Test
    fun midBandReportsCurrentAndNext() {
        val r = computeRank(820) // between Platinum 3 (800) and Platinum 2 (900)
        assertEquals("Platinum 3", r.badge)
        assertEquals(800, r.currentFloor)
        assertEquals(900, r.nextTarget)
        assertEquals(80, r.toNext)
    }

    @Test
    fun atTopThereIsNoNext() {
        val r = computeRank(2400)
        assertEquals("Emerald 1", r.badge)
        assertNull(r.nextTarget)
        assertEquals(0, r.toNext)
    }

    @Test
    fun negativePointsClampToZero() {
        val r = computeRank(-50)
        assertEquals("Unranked", r.badge)
        assertEquals(0, r.points)
    }

    @Test
    fun progressFractionMidBand() {
        // 850 sits halfway between Platinum 3 (800) and Platinum 2 (900).
        assertEquals(0.5f, computeRank(850).progressFraction, 0.0001f)
    }

    @Test
    fun tierKeyMapsBadgeToColorBucket() {
        assertEquals("gold", tierKey("Gold 2"))
        assertEquals("emerald", tierKey("Emerald 1"))
        assertEquals("unranked", tierKey("Unranked"))
    }

    @Test
    fun rankedStartsAtBronze4Immediately() {
        // Unlike World Tour, Ranked's first threshold is 0 RS, so a placement of 0 is already
        // Bronze 4, not Unranked.
        val r = computeRank(0, rankedThresholds)
        assertEquals("Bronze 4", r.badge)
        assertEquals(0, r.currentFloor)
        assertEquals(2500, r.nextTarget)
    }

    @Test
    fun rankedMidBandReportsCurrentAndNext() {
        val r = computeRank(26_000, rankedThresholds) // between Gold 2 (25000) and Gold 1 (27500)
        assertEquals("Gold 2", r.badge)
        assertEquals(25000, r.currentFloor)
        assertEquals(27500, r.nextTarget)
    }

    @Test
    fun rankedAtTopThereIsNoNext() {
        val r = computeRank(47_500, rankedThresholds)
        assertEquals("Diamond 1", r.badge)
        assertNull(r.nextTarget)
    }

    @Test
    fun thresholdsForPicksTheRightTable() {
        assertSame(worldTourThresholds, thresholdsFor(GameMode.WorldTour))
        assertSame(rankedThresholds, thresholdsFor(GameMode.Ranked))
    }
}
