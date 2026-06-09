package com.lcarthur.seasonsprint.domain

import com.lcarthur.seasonsprint.data.ApiRecord
import com.lcarthur.seasonsprint.data.SeasonDto
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * A normalized point for the dashboard: one cumulative win-points value per day.
 * Mirrors iOS Models.swift Point — [instant] is UTC midnight of the day, used for
 * charting and ordering.
 */
data class Point(
    val remoteId: String,
    /** Day key in `yyyy-MM-dd` form (the server `date` truncated to its first 10 chars). */
    val day: String,
    val winPoints: Int,
    val instant: Instant,
) {
    companion object {
        fun from(record: ApiRecord): Point {
            val day = record.date.take(10)
            return Point(record.id, day, record.winPoints, DateKey.parseUtc(day) ?: Instant.EPOCH)
        }
    }
}

/** A season window from `GET /seasons`. */
data class Season(val name: String, val start: Instant, val end: Instant) {
    companion object {
        fun from(dto: SeasonDto): Season? {
            val start = DateKey.parseIso(dto.start) ?: return null
            val end = DateKey.parseIso(dto.end) ?: return null
            return Season(dto.name, start, end)
        }
    }
}

/** Shared `yyyy-MM-dd` (UTC) date helpers, matching the web/iOS day-keying. */
object DateKey {
    /** A day key → UTC-midnight instant. */
    fun parseUtc(day: String): Instant? = runCatching {
        LocalDate.parse(day).atStartOfDay(ZoneOffset.UTC).toInstant()
    }.getOrNull()

    /** Parse an ISO-8601 timestamp (with or without fractional seconds / offset). */
    fun parseIso(value: String): Instant? {
        runCatching { return Instant.parse(value) }
        runCatching { return OffsetDateTime.parse(value).toInstant() }
        runCatching { return LocalDate.parse(value.take(10)).atStartOfDay(ZoneOffset.UTC).toInstant() }
        return null
    }

    /** Today's local day key (matches the web app, which keys "today" by local date). */
    fun today(): String = LocalDate.now().toString()

    /** Local `yyyy-MM-dd` day key for a local date (for the entry date picker). */
    fun dayString(date: LocalDate): String = date.toString()

    /** Parse a `yyyy-MM-dd` key into a LocalDate (to seed a date picker). */
    fun localDate(day: String): LocalDate? = runCatching { LocalDate.parse(day) }.getOrNull()

    /** Material3 DatePicker uses UTC-midnight millis; convert to/from our day key. */
    fun dayStringFromUtcMillis(millis: Long): String =
        Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    fun utcMillisFromDay(day: String): Long? =
        parseUtc(day)?.toEpochMilli()

    fun todayUtcMillis(): Long =
        LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    /** Convert a UTC-midnight instant back to its local-zone LocalDate for display. */
    fun localDateOf(instant: Instant): LocalDate = instant.atZone(ZoneId.of("UTC")).toLocalDate()
}
