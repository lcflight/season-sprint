import Foundation
import ClerkKit

enum APIError: Error {
    case notAuthenticated
    case http(Int)
}

/// Thin REST client for the season-sprint server, authenticated with the Clerk
/// session JWT (the server accepts `Authorization: Bearer <jwt>` — see
/// packages/server/src/middleware/auth.ts).
enum APIClient {
    /// Current Clerk session JWT as an `Authorization` header value, or nil if signed out.
    @MainActor
    static func authorizationHeader() async -> String? {
        guard let session = Clerk.shared.session else { return nil }
        guard let jwt = try? await session.getToken() else { return nil }
        return "Bearer \(jwt)"
    }

    /// `GET /me/records?mode=...`
    @MainActor
    static func getRecords(mode: GameMode) async throws -> [APIRecord] {
        guard let auth = await authorizationHeader() else { throw APIError.notAuthenticated }
        var comps = URLComponents(url: Config.serverURL.appendingPathComponent("me/records"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "mode", value: mode.wireValue)]
        var req = URLRequest(url: comps.url!)
        req.setValue(auth, forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response)
        return try JSONDecoder().decode([APIRecord].self, from: data)
    }

    /// `POST /me/records` — upsert a record by date; returns the saved record.
    @MainActor
    static func upsertRecord(date: String, winPoints: Int, mode: GameMode) async throws -> APIRecord {
        guard let auth = await authorizationHeader() else { throw APIError.notAuthenticated }
        var req = URLRequest(url: Config.serverURL.appendingPathComponent("me/records"))
        req.httpMethod = "POST"
        req.setValue(auth, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(RecordWrite(date: date, winPoints: winPoints, mode: mode.wireValue))
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response)
        return try JSONDecoder().decode(UpsertResponse.self, from: data).record
    }

    /// `PUT /me/records/:id` — edit a record in place; returns the updated record.
    @MainActor
    static func updateRecord(id: String, date: String, winPoints: Int) async throws -> APIRecord {
        guard let auth = await authorizationHeader() else { throw APIError.notAuthenticated }
        var req = URLRequest(url: Config.serverURL.appendingPathComponent("me/records/\(id)"))
        req.httpMethod = "PUT"
        req.setValue(auth, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(RecordWrite(date: date, winPoints: winPoints))
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response)
        return try JSONDecoder().decode(APIRecord.self, from: data)
    }

    /// `DELETE /me/records/:id`
    @MainActor
    static func deleteRecord(id: String) async throws {
        guard let auth = await authorizationHeader() else { throw APIError.notAuthenticated }
        var req = URLRequest(url: Config.serverURL.appendingPathComponent("me/records/\(id)"))
        req.httpMethod = "DELETE"
        req.setValue(auth, forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: req)
        try check(response)
    }

    /// `GET /seasons` — public (no auth); returns the current season window, or nil.
    static func getSeasons() async throws -> Season? {
        try await getAllSeasons().currentSeason
    }

    /// `GET /seasons` — public (no auth); the full payload (every season + the current one).
    static func getAllSeasons() async throws -> SeasonsResponse {
        let req = URLRequest(url: Config.serverURL.appendingPathComponent("seasons"))
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response)
        return try seasonsDecoder.decode(SeasonsResponse.self, from: data)
    }

    /// Decoder that parses ISO-8601 timestamps with fractional seconds (e.g. `...000Z`).
    private static let seasonsDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            // Build formatters inside the closure: ISO8601DateFormatter isn't Sendable,
            // so it can't be captured by this @Sendable strategy closure.
            let withFractional = ISO8601DateFormatter()
            withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let plain = ISO8601DateFormatter()
            plain.formatOptions = [.withInternetDateTime]

            let container = try d.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = withFractional.date(from: str) ?? plain.date(from: str) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
        }
        return decoder
    }()

    /// `POST /me/stream/token` — exchanges the Clerk auth for a short-lived SSE token.
    @MainActor
    static func getStreamToken() async throws -> String {
        guard let auth = await authorizationHeader() else { throw APIError.notAuthenticated }
        var req = URLRequest(url: Config.serverURL.appendingPathComponent("me/stream/token"))
        req.httpMethod = "POST"
        req.setValue(auth, forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response)
        return try JSONDecoder().decode(StreamTokenResponse.self, from: data).token
    }

    private static func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
    }
}
