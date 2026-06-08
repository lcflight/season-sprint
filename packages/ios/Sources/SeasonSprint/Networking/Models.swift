import Foundation

/// A record as returned by the server (`GET /me/records`).
/// Matches the Prisma `Record` model: { id, date (ISO), winPoints, ... }.
struct APIRecord: Codable, Identifiable, Sendable {
    let id: String
    let date: String
    let winPoints: Int
}

/// Response from `POST /me/stream/token`.
struct StreamTokenResponse: Codable, Sendable {
    let token: String
    let expiresIn: Int
}

/// A season window from `GET /seasons` (`currentSeason`). Dates are ISO-8601 UTC.
struct Season: Codable, Sendable, Equatable {
    let name: String
    let start: Date
    let end: Date
}

/// `GET /seasons` payload (we only need `currentSeason`).
struct SeasonsResponse: Codable, Sendable {
    let currentSeason: Season?
}

/// A normalized point for the dashboard: one cumulative win-points value per day.
/// Mirrors the `{ remoteId, date, y }` shape used in the web app's usePointsData.js.
struct Point: Identifiable, Sendable, Equatable {
    let remoteId: String
    /// Day key in `yyyy-MM-dd` form (the server `date` truncated to its first 10 chars).
    let day: String
    let winPoints: Int
    /// `day` parsed to a `Date` (UTC midnight) for charting / ordering.
    let date: Date

    var id: String { remoteId }

    init(record: APIRecord) {
        self.remoteId = record.id
        self.day = String(record.date.prefix(10))
        self.winPoints = record.winPoints
        self.date = DateKey.parse(self.day) ?? .distantPast
    }
}

/// Shared `yyyy-MM-dd` (UTC) date helpers, matching the web app's day-keying.
enum DateKey {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ day: String) -> Date? {
        formatter.date(from: day)
    }

    /// Today's local day key (matches the web app, which keys "today" by local date).
    static func today() -> String {
        let local = DateFormatter()
        local.calendar = Calendar(identifier: .gregorian)
        local.locale = Locale(identifier: "en_US_POSIX")
        local.dateFormat = "yyyy-MM-dd"
        return local.string(from: Date())
    }
}
