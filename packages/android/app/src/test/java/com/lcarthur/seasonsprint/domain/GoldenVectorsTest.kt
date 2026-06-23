package com.lcarthur.seasonsprint.domain

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration

/**
 * Golden-vector guard for the rank + pace math, shared with the web suite.
 *
 * The vectors are the cross-client contract: every implementation (web
 * useRankInfo/chart.js, iOS Domain/, Android domain/) must reproduce these
 * input→output pairs. This reads the same canonical JSON (kept byte-identical
 * to packages/web/src/data/domainVectors.json — the web test asserts that) from
 * test resources and checks computeRank/computePace against it, so a Kotlin port
 * that drifts from the web/iOS math fails here.
 */
class GoldenVectorsTest {
    @Serializable
    private data class RankVec(
        val points: Int,
        val badge: String,
        val currentFloor: Int,
        val nextTarget: Int? = null,
        val nextBadge: String? = null,
        val toNext: Int,
        val progressFraction: Float,
    )

    @Serializable
    private data class PaceVec(
        val goal: Int,
        val baselineY: Int,
        val days: Int,
        val expected: Double,
    )

    @Serializable
    private data class Vectors(val rank: List<RankVec>, val requiredPerDay: List<PaceVec>)

    private val vectors: Vectors = run {
        val text = javaClass.getResourceAsStream("/domainVectors.json")!!
            .bufferedReader()
            .use { it.readText() }
        Json { ignoreUnknownKeys = true }.decodeFromString<Vectors>(text)
    }

    @Test
    fun rankVectorsMatchComputeRank() {
        assertTrue("expected rank vectors to check", vectors.rank.isNotEmpty())
        for (v in vectors.rank) {
            val r = computeRank(v.points)
            assertEquals("badge @ ${v.points}", v.badge, r.badge)
            assertEquals("currentFloor @ ${v.points}", v.currentFloor, r.currentFloor)
            assertEquals("nextTarget @ ${v.points}", v.nextTarget, r.nextTarget)
            assertEquals("nextBadge @ ${v.points}", v.nextBadge, r.nextBadge)
            assertEquals("toNext @ ${v.points}", v.toNext, r.toNext)
            assertEquals("progressFraction @ ${v.points}", v.progressFraction, r.progressFraction, 1e-6f)
        }
    }

    @Test
    fun requiredPerDayVectorsMatchComputePace() {
        assertTrue("expected pace vectors to check", vectors.requiredPerDay.isNotEmpty())
        val start = DateKey.parseUtc("2025-01-01")!!
        for (v in vectors.requiredPerDay) {
            val end = start.plus(Duration.ofDays(v.days.toLong()))
            // A single point at season start carrying the baseline score makes
            // requiredPerDayFromLast == (goal - baselineY) / days for every vector;
            // baselineY == 0 reduces to the "from zero" case.
            val baseline = Point(
                remoteId = "baseline",
                day = "2025-01-01",
                winPoints = v.baselineY,
                instant = start,
            )
            val pace = computePace(goal = v.goal, seasonPoints = listOf(baseline), start = start, end = end)
            assertEquals(
                "requiredPerDay goal=${v.goal} baseline=${v.baselineY} days=${v.days}",
                v.expected,
                pace.requiredPerDayFromLast,
                1e-6,
            )
        }
    }
}
