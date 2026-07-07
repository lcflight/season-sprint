import Foundation

/// A selectable season in the picker: `key` is the raw season name (as `/seasons` returns it).
struct SeasonOption: Identifiable, Sendable, Equatable {
    let key: String
    let displayName: String
    let season: Season
    var id: String { key }
}

/// "8" -> "Season 8"; "Season 8" stays as-is. Mirrors displayName() in useSeasons.js.
private func displayName(for rawName: String) -> String {
    let trimmed = rawName.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return trimmed }
    return trimmed.lowercased().hasPrefix("season") ? trimmed : "Season \(trimmed)"
}

/// Normalizes the full `GET /seasons` payload into pickable options, ascending by start date.
func seasonOptions(from seasons: [Season]) -> [SeasonOption] {
    seasons
        .map { SeasonOption(key: $0.name, displayName: displayName(for: $0.name), season: $0) }
        .sorted { $0.season.start < $1.season.start }
}

/// A record re-mapped onto another season's timeline for the "compare" overlay — not a real record.
struct OverlayPoint: Identifiable, Sendable {
    let date: Date
    let winPoints: Int
    var id: Date { date }
}

/// Keys of the seasons the user has at least one point inside (inclusive window). Gates the
/// season picker so we never offer a past season with no data.
/// Mirrors seasonsWithDataKeys in packages/web/src/utils/chart.js.
func seasonsWithDataKeys(points: [Point], seasons: [SeasonOption]) -> Set<String> {
    Set(seasons.filter { option in
        points.contains { $0.date >= option.season.start && $0.date <= option.season.end }
    }.map(\.key))
}

/// Re-maps a previous season's points onto the viewed season's x-axis by day-of-season, so day
/// 0 of each season lines up (e.g. "where was I on day 12 last season vs this one"). Points
/// whose elapsed day falls past the viewed season's end are dropped rather than clamped.
/// Mirrors mapOverlayByDayOfSeason in packages/web/src/utils/chart.js.
func mapOverlayByDayOfSeason(
    overlayPoints: [Point],
    overlaySeasonStart: Date,
    viewedSeasonStart: Date,
    viewedSeasonEnd: Date
) -> [OverlayPoint] {
    let offset = viewedSeasonStart.timeIntervalSince(overlaySeasonStart)
    return overlayPoints.compactMap { p in
        let mapped = p.date.addingTimeInterval(offset)
        guard mapped <= viewedSeasonEnd else { return nil }
        return OverlayPoint(date: mapped, winPoints: p.winPoints)
    }
}
