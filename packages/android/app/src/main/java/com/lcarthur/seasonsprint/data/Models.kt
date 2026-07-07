package com.lcarthur.seasonsprint.data

import kotlinx.serialization.Serializable

/** A record as returned by the server (`GET /me/records`). Mirrors iOS APIRecord. */
@Serializable
data class ApiRecord(
    val id: String,
    val date: String,
    val winPoints: Int,
    /** Missing/null means `"world-tour"`, matching the server default. */
    val mode: String? = null,
)

/** Request body for creating/updating a record (`POST`/`PUT /me/records`). */
@Serializable
data class RecordWrite(
    val date: String,
    val winPoints: Int,
    val mode: String? = null,
)

/** Response from `POST /me/records`. */
@Serializable
data class UpsertResponse(
    val record: ApiRecord,
)

/** Response from `POST /me/stream/token`. */
@Serializable
data class StreamTokenResponse(
    val token: String,
    val expiresIn: Int = 0,
)

/** A season window as returned in `GET /seasons` (`currentSeason`). ISO-8601 UTC dates. */
@Serializable
data class SeasonDto(
    val name: String,
    val start: String,
    val end: String,
)

/** `GET /seasons` payload — the full scraped list, same for every mode. */
@Serializable
data class SeasonsResponse(
    val seasons: List<SeasonDto> = emptyList(),
    val currentSeason: SeasonDto? = null,
)

/**
 * A live-update event pushed over the WebSocket. Mirrors the server envelope
 * `{ "event": "...", "data": {...} }`. Parsed leniently in LiveUpdates (Phase 7).
 */
sealed interface RecordEvent {
    data class Upsert(val record: ApiRecord) : RecordEvent
    /** [mode] is missing/null for `"world-tour"`, matching the server's broadcast payload. */
    data class Delete(val id: String, val mode: String? = null) : RecordEvent
    data class DeleteAll(val mode: String? = null) : RecordEvent
    data class BulkUpsert(val records: List<ApiRecord>, val mode: String? = null) : RecordEvent
}
