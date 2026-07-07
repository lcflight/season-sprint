import Foundation

/// A record as returned by the server (`GET /me/records`).
/// Matches the Prisma `Record` model: { id, date (ISO), winPoints, mode, ... }.
struct APIRecord: Codable, Identifiable, Sendable {
    let id: String
    let date: String
    let winPoints: Int
    /// Missing/nil means `"world-tour"`, matching the server default.
    let mode: String?
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

/// `GET /seasons` payload — the full scraped list, same for every mode.
struct SeasonsResponse: Codable, Sendable {
    let seasons: [Season]
    let currentSeason: Season?
}

/// Request body for creating/updating a record.
struct RecordWrite: Encodable, Sendable {
    let date: String
    let winPoints: Int
    var mode: String? = nil
}

/// Response from `POST /me/records`.
struct UpsertResponse: Decodable, Sendable {
    let record: APIRecord
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
        dayString(from: Date())
    }

    private static let localDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Local `yyyy-MM-dd` day key for an arbitrary date (for the entry DatePicker).
    static func dayString(from date: Date) -> String {
        localDayFormatter.string(from: date)
    }

    /// Parse a `yyyy-MM-dd` day key into a local-midnight Date (to seed a DatePicker).
    static func localDate(from day: String) -> Date? {
        localDayFormatter.date(from: day)
    }
}
