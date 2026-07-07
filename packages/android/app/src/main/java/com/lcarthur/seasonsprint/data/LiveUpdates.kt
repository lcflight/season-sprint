package com.lcarthur.seasonsprint.data

import com.lcarthur.seasonsprint.Config
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

/**
 * Connects to the server's live stream over a WebSocket (`GET /me/stream`, upgraded) and
 * reconnects with a fresh stream token on drop. Mirrors iOS SSEClient: a text "ping" every
 * 25s keeps the hibernating Durable Object's socket warm (the server auto-"pong"s).
 *
 * OkHttp performs the upgrade from the https URL, so we pass the plain server URL.
 */
/** Live-link state for the connection indicator. `Disconnected` means no link (hidden). */
enum class LiveStatus { Disconnected, Connecting, Connected }

class LiveUpdates(private val scope: CoroutineScope) {
    private val json = Json { ignoreUnknownKeys = true }

    private val _events = MutableSharedFlow<RecordEvent>(extraBufferCapacity = 64)
    val events = _events.asSharedFlow()

    private val _status = MutableStateFlow(LiveStatus.Disconnected)
    val status = _status.asStateFlow()

    private var loopJob: Job? = null

    /** Idempotent: starts the connect/reconnect loop if not already running. */
    fun start() {
        if (loopJob?.isActive == true) return
        loopJob = scope.launch { runLoop() }
    }

    fun stop() {
        loopJob?.cancel()
        loopJob = null
        _status.value = LiveStatus.Disconnected
    }

    private suspend fun runLoop() {
        while (scope.isActive) {
            // Attempting a link: indicator shows the connecting state.
            _status.value = LiveStatus.Connecting
            val token = runCatching { ApiClient.getStreamToken() }.getOrNull()
            if (token == null) {
                delay(5_000)
                continue
            }

            val request = Request.Builder()
                .url("${Config.SERVER_URL}/me/stream?token=$token")
                .build()

            val closed = CompletableDeferred<Unit>()
            val ws = ApiClient.httpClient.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    _status.value = LiveStatus.Connected
                }

                override fun onMessage(webSocket: WebSocket, text: String) = handle(text)

                override fun onMessage(webSocket: WebSocket, bytes: ByteString) = handle(bytes.utf8())

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    if (!closed.isCompleted) closed.complete(Unit)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (!closed.isCompleted) closed.complete(Unit)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (!closed.isCompleted) closed.complete(Unit)
                }
            })

            // Application-level keep-alive, matching the web client.
            val pingJob = scope.launch {
                while (isActive) {
                    delay(25_000)
                    if (!ws.send("ping")) break
                }
            }

            closed.await()
            pingJob.cancel()
            ws.cancel()

            if (!scope.isActive) break
            // Back to connecting while we wait to retry.
            _status.value = LiveStatus.Connecting
            delay(2_000)
        }
    }

    private fun handle(text: String) {
        val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val event = root["event"]?.jsonPrimitive?.content ?: return
        val data = root["data"]
        val parsed: RecordEvent? = when (event) {
            "record:upsert" -> data?.let {
                RecordEvent.Upsert(json.decodeFromJsonElement(ApiRecord.serializer(), it))
            }
            "record:delete" -> data?.jsonObject?.get("id")?.jsonPrimitive?.content?.let {
                RecordEvent.Delete(it)
            }
            "record:delete-all" -> RecordEvent.DeleteAll(data?.jsonObject?.get("mode")?.jsonPrimitive?.content)
            "record:bulk-upsert" -> data?.jsonObject?.get("records")?.let {
                RecordEvent.BulkUpsert(
                    json.decodeFromJsonElement(ListSerializer(ApiRecord.serializer()), it),
                    data.jsonObject["mode"]?.jsonPrimitive?.content,
                )
            }
            else -> null
        }
        parsed?.let { _events.tryEmit(it) }
    }
}
