package com.lcarthur.seasonsprint.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
}
