import Foundation

/// A live record event from the stream. Event names + payloads mirror the server's
/// broadcast (UserStream.ts / broadcast.ts).
enum RecordEvent: Sendable {
    case upsert(APIRecord)
    case delete(String)
    case deleteAll
    case bulkUpsert([APIRecord])
}

/// Connects to the server's live stream over a **WebSocket** (`GET /me/stream`, upgraded)
/// and reconnects with a fresh stream token on drop. Replaces the old SSE client — the
/// Durable Object terminates the socket with the Hibernation API.
///
/// Messages are JSON `{ "event": ..., "data": ... }`.
@MainActor
final class SSEClient {
    private var loopTask: Task<Void, Never>?
    private var socket: URLSessionWebSocketTask?

    /// Fired for each record event.
    var onEvent: ((RecordEvent) -> Void)?
    /// Fired with true once a socket is actually receiving, false when it drops.
    var onLiveChange: ((Bool) -> Void)?

    func start() {
        guard loopTask == nil else { return }
        loopTask = Task { await self.runLoop() }
    }

    func stop() {
        loopTask?.cancel()
        loopTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        onLiveChange?(false)
    }

    private func runLoop() async {
        while !Task.isCancelled {
            guard let token = try? await APIClient.getStreamToken(),
                  let url = makeURL(token: token) else {
                try? await Task.sleep(for: .seconds(5))
                continue
            }

            let ws = URLSession.shared.webSocketTask(with: url)
            socket = ws
            ws.resume()
            // Confirm the connection is actually established (not just resumed) with a
            // ping round-trip, so the "Live" indicator lights up at launch rather than
            // waiting for the first data event. The server auto-pongs.
            ws.sendPing { [weak self] error in
                guard error == nil else { return }
                Task { @MainActor in self?.onLiveChange?(true) }
            }
            let ping = startPing(ws)

            do {
                try await receiveLoop(ws)
            } catch {
                // dropped; fall through to reconnect
            }

            ping.cancel()
            onLiveChange?(false)
            ws.cancel(with: .goingAway, reason: nil)
            socket = nil

            if Task.isCancelled { break }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    private func receiveLoop(_ ws: URLSessionWebSocketTask) async throws {
        var announcedLive = false
        while !Task.isCancelled {
            let message = try await ws.receive()
            if !announcedLive {
                announcedLive = true
                onLiveChange?(true)
            }
            switch message {
            case .string(let text):
                handle(text)
            case .data(let data):
                if let text = String(data: data, encoding: .utf8) { handle(text) }
            @unknown default:
                break
            }
        }
    }

    /// Protocol-level ping keeps the socket warm; the runtime auto-pongs.
    private func startPing(_ ws: URLSessionWebSocketTask) -> Task<Void, Never> {
        Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                if Task.isCancelled { break }
                ws.sendPing { _ in }
            }
        }
    }

    private func makeURL(token: String) -> URL? {
        guard var comps = URLComponents(
            url: Config.serverURL.appendingPathComponent("me/stream"),
            resolvingAgainstBaseURL: false
        ) else { return nil }
        comps.scheme = "wss"
        comps.queryItems = [URLQueryItem(name: "token", value: token)]
        return comps.url
    }

    private struct Envelope: Decodable {
        let event: String
    }

    private func handle(_ text: String) {
        let bytes = Data(text.utf8)
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: bytes) else {
            return // e.g. an unexpected "pong" or malformed frame
        }
        // Decode the nested `data` payload per event type.
        switch envelope.event {
        case "record:upsert":
            struct P: Decodable { let data: APIRecord }
            if let p = try? JSONDecoder().decode(P.self, from: bytes) {
                onEvent?(.upsert(p.data))
            }
        case "record:delete":
            struct Inner: Decodable { let id: String }
            struct P: Decodable { let data: Inner }
            if let p = try? JSONDecoder().decode(P.self, from: bytes) {
                onEvent?(.delete(p.data.id))
            }
        case "record:delete-all":
            onEvent?(.deleteAll)
        case "record:bulk-upsert":
            struct Inner: Decodable { let records: [APIRecord] }
            struct P: Decodable { let data: Inner }
            if let p = try? JSONDecoder().decode(P.self, from: bytes) {
                onEvent?(.bulkUpsert(p.data.records))
            }
        default:
            break
        }
    }
}
