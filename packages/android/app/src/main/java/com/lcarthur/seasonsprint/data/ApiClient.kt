package com.lcarthur.seasonsprint.data

import com.lcarthur.seasonsprint.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** Thrown when the server returns a non-2xx status. */
class ApiException(val code: Int) : Exception("HTTP $code")

/**
 * Thin REST client for the season-sprint server, mirroring iOS APIClient.swift.
 * The Clerk Bearer token is attached by [AuthInterceptor]; OkHttp is also reused for
 * the live WebSocket (Phase 7).
 */
object ApiClient {
    private val json = Json { ignoreUnknownKeys = true }
    private val jsonMedia = "application/json".toMediaType()
    private val emptyBody = ByteArray(0).toRequestBody(null)

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor())
        .build()

    private fun url(path: String) = "${Config.SERVER_URL}/$path"

    /** `GET /me/records` */
    suspend fun getRecords(): List<ApiRecord> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("me/records")).get().build()
        httpClient.newCall(req).execute().use { resp ->
            check(resp)
            json.decodeFromString<List<ApiRecord>>(resp.body.string())
        }
    }

    /** `POST /me/records` — upsert a record by date; returns the saved record. */
    suspend fun upsertRecord(date: String, winPoints: Int): ApiRecord = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RecordWrite(date, winPoints)).toRequestBody(jsonMedia)
        val req = Request.Builder().url(url("me/records")).post(body).build()
        httpClient.newCall(req).execute().use { resp ->
            check(resp)
            json.decodeFromString<UpsertResponse>(resp.body.string()).record
        }
    }

    /** `PUT /me/records/:id` — edit a record in place; returns the updated record. */
    suspend fun updateRecord(id: String, date: String, winPoints: Int): ApiRecord = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RecordWrite(date, winPoints)).toRequestBody(jsonMedia)
        val req = Request.Builder().url(url("me/records/$id")).put(body).build()
        httpClient.newCall(req).execute().use { resp ->
            check(resp)
            json.decodeFromString<ApiRecord>(resp.body.string())
        }
    }

    /** `DELETE /me/records/:id` */
    suspend fun deleteRecord(id: String): Unit = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("me/records/$id")).delete().build()
        httpClient.newCall(req).execute().use { resp -> check(resp) }
    }

    /** `GET /seasons` — public (no auth); returns the current season window, or null. */
    suspend fun getSeasons(): SeasonDto? = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("seasons")).get().build()
        httpClient.newCall(req).execute().use { resp ->
            check(resp)
            json.decodeFromString<SeasonsResponse>(resp.body.string()).currentSeason
        }
    }

    /** `POST /me/stream/token` — exchanges the Clerk auth for a short-lived WebSocket token. */
    suspend fun getStreamToken(): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("me/stream/token")).post(emptyBody).build()
        httpClient.newCall(req).execute().use { resp ->
            check(resp)
            json.decodeFromString<StreamTokenResponse>(resp.body.string()).token
        }
    }

    private fun check(resp: Response) {
        if (!resp.isSuccessful) throw ApiException(resp.code)
    }
}
