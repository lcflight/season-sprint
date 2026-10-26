package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.GameMode

/** A rank threshold: reach [points] to earn [badge]. */
data class Threshold(val badge: String, val points: Int)

/**
 * The rank/RS threshold table for a mode in a season (a `/seasons` name like "Season 12").
 * World Tour switched from win points to fans in Season 12; null or an unknown name means the
 * live season, which is always a fans season now.
 */
fun thresholdsFor(mode: GameMode, seasonKey: String? = null): List<Threshold> = when (mode) {
    GameMode.WorldTour -> if (usesFans(seasonKey)) worldTourFansThresholds else worldTourThresholds
    GameMode.Ranked -> rankedThresholds
}

// Fans (World Tour, Season 12+). Ported from packages/web/src/utils/fans.js + iOS Rank.swift.
//
// The game shows "X / Y": fans since entering the current badge / fans that badge needs.
// Badge n (Bronze 4 = 1 … Emerald 1 = 24) needs 2,000·(n+1) (Bronze 2 = 8,000, Silver 1 =
// 18,000 in game), so Y identifies the badge and the season total is 1,000·(n-1)·(n+2) + X.
// Records store that season total.

const val FIRST_FANS_SEASON = 12
const val FANS_STEP = 2000
const val FANS_BADGES = 24

/** "Season 12" -> 12; null for names without a trailing number. */
fun seasonNumber(name: String?): Int? =
    name?.let { Regex("""(\d+)\s*$""").find(it)?.groupValues?.get(1)?.toIntOrNull() }

/** Whether World Tour counts fans in this season. null/unknown = the live season = fans. */
fun usesFans(seasonKey: String?): Boolean = seasonNumber(seasonKey)?.let { it >= FIRST_FANS_SEASON } ?: true

/** Season-total fans at the moment you enter badge [n] (1-based). */
fun fansToEnter(n: Int): Int = FANS_STEP / 2 * (n - 1) * (n + 2)

/**
 * Where the first fans table (before Oct 2026's fix) put badge [n]: every badge one
 * requirement too low. Only used to move goals saved on it.
 */
fun legacyFansToEnter(n: Int): Int = FANS_STEP / 2 * n * (n - 1)

/** Season-total fans from the in-game "X / Y" readout, or null if it isn't a real badge. */
fun fansTotal(inRank: Int, required: Int): Int? {
    if (inRank < 0 || required <= 0 || required % FANS_STEP != 0) return null
    val n = required / FANS_STEP - 1
    if (n < 1 || n > FANS_BADGES || inRank > required) return null
    return fansToEnter(n) + inRank
}

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

/**
 * A World Tour goal saved on the old win-points scale, moved to the same badge's fans
 * threshold; null if [goal] isn't an old badge threshold (a custom goal). Callers run it
 * once, keyed on a saved scale marker: the number alone is ambiguous (2,000 is Emerald 3 in
 * points but Bronze 3 in fans).
 */
fun fansGoalFromLegacy(goal: Int): Int? {
    val old = worldTourThresholds.firstOrNull { it.points == goal } ?: return null
    return worldTourFansThresholds.firstOrNull { it.badge == old.badge }?.points
}

/**
 * A World Tour goal saved on the first fans table, moved to the same badge on the corrected
 * one; null if [goal] isn't one of its badge thresholds (a custom goal).
 */
fun fansGoalFromFirstFansTable(goal: Int): Int? {
    val n = (1..FANS_BADGES).firstOrNull { legacyFansToEnter(it) == goal } ?: return null
    return worldTourFansThresholds[n - 1].points
}

/**
 * World Tour rank thresholds for Season 11 and earlier (win points), verbatim from
 * packages/web/src/data/worldTourRanks.json.
 */
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

/**
 * World Tour fans thresholds for Season 12 onward (season total to enter each badge), verbatim
 * from packages/web/src/data/worldTourRanksBySeason.json ("Season 12").
 */
val worldTourFansThresholds: List<Threshold> = listOf(
    Threshold("Bronze 4", 0),
    Threshold("Bronze 3", 4000),
    Threshold("Bronze 2", 10000),
    Threshold("Bronze 1", 18000),
    Threshold("Silver 4", 28000),
    Threshold("Silver 3", 40000),
    Threshold("Silver 2", 54000),
    Threshold("Silver 1", 70000),
    Threshold("Gold 4", 88000),
    Threshold("Gold 3", 108000),
    Threshold("Gold 2", 130000),
    Threshold("Gold 1", 154000),
    Threshold("Platinum 4", 180000),
    Threshold("Platinum 3", 208000),
    Threshold("Platinum 2", 238000),
    Threshold("Platinum 1", 270000),
    Threshold("Diamond 4", 304000),
    Threshold("Diamond 3", 340000),
    Threshold("Diamond 2", 378000),
    Threshold("Diamond 1", 418000),
    Threshold("Emerald 4", 460000),
    Threshold("Emerald 3", 504000),
    Threshold("Emerald 2", 550000),
    Threshold("Emerald 1", 598000),
)

/**
 * Ranked RS thresholds, verbatim from packages/web/src/views/Ranked.vue (RANKED_THRESHOLDS).
 * Bronze (0 → 7,500), Silver (10,000 → 17,500), Gold (20,000 → 27,500), Platinum
 * (30,000 → 37,500), Diamond (40,000 → 47,500). Ruby = Top 500, not threshold-based.
 */
val rankedThresholds: List<Threshold> = listOf(
    Threshold("Bronze 4", 0),
    Threshold("Bronze 3", 2500),
    Threshold("Bronze 2", 5000),
    Threshold("Bronze 1", 7500),
    Threshold("Silver 4", 10000),
    Threshold("Silver 3", 12500),
    Threshold("Silver 2", 15000),
    Threshold("Silver 1", 17500),
    Threshold("Gold 4", 20000),
    Threshold("Gold 3", 22500),
    Threshold("Gold 2", 25000),
    Threshold("Gold 1", 27500),
    Threshold("Platinum 4", 30000),
    Threshold("Platinum 3", 32500),
    Threshold("Platinum 2", 35000),
    Threshold("Platinum 1", 37500),
    Threshold("Diamond 4", 40000),
    Threshold("Diamond 3", 42500),
    Threshold("Diamond 2", 45000),
    Threshold("Diamond 1", 47500),
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
