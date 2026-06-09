package com.lcarthur.seasonsprint.domain

/** A rank threshold: reach [points] to earn [badge]. */
data class Threshold(val badge: String, val points: Int)

/** Derived rank state. Ported from packages/web/src/composables/useRankInfo.js + iOS Rank.swift. */
data class RankInfo(
    val badge: String,
    val currentFloor: Int,
    val nextTarget: Int?,
    val nextBadge: String?,
    val points: Int,
) {
    /** Points remaining to reach the next rank (0 if already at the top). */
    val toNext: Int get() = nextTarget?.let { maxOf(0, it - points) } ?: 0

    /** Progress through the current band, 0..1 (floor → next target). */
    val progressFraction: Float
        get() {
            val floor = currentFloor.toFloat()
            val ceil = (nextTarget ?: currentFloor).toFloat()
            val span = maxOf(1f, ceil - floor)
            val clamped = minOf(ceil, maxOf(floor, points.toFloat()))
            return (clamped - floor) / span
        }
}

/** Highest threshold ≤ points is the current badge. Mirrors the loop in useRankInfo.js exactly. */
fun computeRank(points: Int, thresholds: List<Threshold> = worldTourThresholds): RankInfo {
    val wp = maxOf(0, points)
    var prevBadge = "Unranked"
    var prevPoints = 0
    for (t in thresholds) {
        if (wp < t.points) {
            return RankInfo(prevBadge, prevPoints, t.points, t.badge, wp)
        }
        prevBadge = t.badge
        prevPoints = t.points
    }
    return RankInfo(prevBadge, prevPoints, null, null, wp)
}

/** World Tour rank thresholds, verbatim from packages/web/src/data/worldTourRanks.json. */
val worldTourThresholds: List<Threshold> = listOf(
    Threshold("Bronze 4", 25),
    Threshold("Bronze 3", 50),
    Threshold("Bronze 2", 75),
    Threshold("Bronze 1", 100),
    Threshold("Silver 4", 150),
    Threshold("Silver 3", 200),
    Threshold("Silver 2", 250),
    Threshold("Silver 1", 300),
    Threshold("Gold 4", 375),
    Threshold("Gold 3", 450),
    Threshold("Gold 2", 525),
    Threshold("Gold 1", 600),
    Threshold("Platinum 4", 700),
    Threshold("Platinum 3", 800),
    Threshold("Platinum 2", 900),
    Threshold("Platinum 1", 1000),
    Threshold("Diamond 4", 1150),
    Threshold("Diamond 3", 1300),
    Threshold("Diamond 2", 1450),
    Threshold("Diamond 1", 1600),
    Threshold("Emerald 4", 1800),
    Threshold("Emerald 3", 2000),
    Threshold("Emerald 2", 2200),
    Threshold("Emerald 1", 2400),
)

/** World Tour win-points cheatsheet, from packages/web/src/components/PointsCheatsheet.vue. */
data class CheatsheetRow(val label: String, val value: Int)

val worldTourCheatsheet: List<CheatsheetRow> = listOf(
    CheatsheetRow("Knocked out of round one", 2),
    CheatsheetRow("Knocked out of round two", 6),
    CheatsheetRow("Lose the final round", 14),
    CheatsheetRow("Win the final round", 25),
)

/** Tier key for a badge string (e.g. "Gold 2" → "gold"). Maps to colors in ui/theme/Color.kt. */
fun tierKey(badge: String): String = when (badge.substringBefore(' ')) {
    "Bronze" -> "bronze"
    "Silver" -> "silver"
    "Gold" -> "gold"
    "Platinum" -> "platinum"
    "Diamond" -> "diamond"
    "Emerald" -> "emerald"
    else -> "unranked"
}
