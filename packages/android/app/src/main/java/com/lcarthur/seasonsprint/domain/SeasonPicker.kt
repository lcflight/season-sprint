package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.data.SeasonDto
import java.time.Instant

/** A selectable season in the picker: [key] is the raw season name (as `/seasons` returns it). */
data class SeasonOption(val key: String, val displayName: String, val season: Season)

/** "8" -> "Season 8"; "Season 8" stays as-is. Mirrors displayName() in useSeasons.js. */
private fun displayNameFor(rawName: String): String {
    val trimmed = rawName.trim()
    if (trimmed.isEmpty()) return trimmed
    return if (trimmed.lowercase().startsWith("season")) trimmed else "Season $trimmed"
}

/** Normalizes the full `GET /seasons` payload into pickable options, ascending by start date. */
fun seasonOptionsFrom(dtos: List<SeasonDto>): List<SeasonOption> =
    dtos.mapNotNull { dto ->
        Season.from(dto)?.let { season -> SeasonOption(key = dto.name, displayName = displayNameFor(dto.name), season = season) }
    }.sortedBy { it.season.start }

/** A record re-mapped onto another season's timeline for the "compare" overlay — not a real record. */
data class OverlayPoint(val instant: Instant, val winPoints: Int)

/**
 * Keys of the seasons the user has at least one point inside (inclusive window). Gates the
 * season picker so we never offer a past season with no data.
 * Mirrors seasonsWithDataKeys in packages/web/src/utils/chart.js.
 */
fun seasonsWithDataKeys(points: List<Point>, seasons: List<SeasonOption>): Set<String> =
    seasons.filter { option ->
        points.any { !it.instant.isBefore(option.season.start) && !it.instant.isAfter(option.season.end) }
    }.map { it.key }.toSet()

/**
 * Re-maps a previous season's points onto the viewed season's x-axis by day-of-season, so day
 * 0 of each season lines up (e.g. "where was I on day 12 last season vs this one"). Points
 * whose elapsed day falls past the viewed season's end are dropped rather than clamped.
 * Mirrors mapOverlayByDayOfSeason in packages/web/src/utils/chart.js.
 */
fun mapOverlayByDayOfSeason(
    overlayPoints: List<Point>,
    overlaySeasonStart: Instant,
    viewedSeasonStart: Instant,
    viewedSeasonEnd: Instant,
): List<OverlayPoint> {
    val offsetSeconds = viewedSeasonStart.epochSecond - overlaySeasonStart.epochSecond
    return overlayPoints.mapNotNull { p ->
        val mapped = p.instant.plusSeconds(offsetSeconds)
        if (mapped.isAfter(viewedSeasonEnd)) null else OverlayPoint(mapped, p.winPoints)
    }
}
