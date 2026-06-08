import Foundation

/// A rank threshold: reach `points` to earn `badge`.
struct Threshold: Sendable, Equatable {
    let badge: String
    let points: Int
}

/// Derived rank state for a given points total against a threshold table.
/// Ported from packages/web/src/composables/useRankInfo.js.
struct RankInfo: Sendable, Equatable {
    let badge: String
    let currentFloor: Int
    let nextTarget: Int?
    let nextBadge: String?
    let points: Int

    /// Points remaining to reach the next rank (0 if already at the top).
    var toNext: Int {
        guard let nextTarget else { return 0 }
        return max(0, nextTarget - points)
    }

    /// Progress through the current band, 0...1 (floor -> next target).
    var progressFraction: Double {
        let floor = Double(currentFloor)
        let ceil = Double(nextTarget ?? currentFloor)
        let span = max(1, ceil - floor)
        let clamped = min(ceil, max(floor, Double(points)))
        return (clamped - floor) / span
    }
}

/// Walk an ascending threshold table; current badge is the highest threshold <= points.
/// Mirrors the loop in useRankInfo.js exactly.
func computeRank(points: Int, thresholds: [Threshold]) -> RankInfo {
    let wp = max(0, points)
    var prevBadge = "Unranked"
    var prevPoints = 0
    for t in thresholds {
        if wp < t.points {
            return RankInfo(
                badge: prevBadge,
                currentFloor: prevPoints,
                nextTarget: t.points,
                nextBadge: t.badge,
                points: wp
            )
        }
        prevBadge = t.badge
        prevPoints = t.points
    }
    return RankInfo(
        badge: prevBadge,
        currentFloor: prevPoints,
        nextTarget: nil,
        nextBadge: nil,
        points: wp
    )
}

/// World Tour rank thresholds, verbatim from packages/web/src/data/worldTourRanks.json.
let worldTourThresholds: [Threshold] = [
    Threshold(badge: "Bronze 4", points: 25),
    Threshold(badge: "Bronze 3", points: 50),
    Threshold(badge: "Bronze 2", points: 75),
    Threshold(badge: "Bronze 1", points: 100),
    Threshold(badge: "Silver 4", points: 150),
    Threshold(badge: "Silver 3", points: 200),
    Threshold(badge: "Silver 2", points: 250),
    Threshold(badge: "Silver 1", points: 300),
    Threshold(badge: "Gold 4", points: 375),
    Threshold(badge: "Gold 3", points: 450),
    Threshold(badge: "Gold 2", points: 525),
    Threshold(badge: "Gold 1", points: 600),
    Threshold(badge: "Platinum 4", points: 700),
    Threshold(badge: "Platinum 3", points: 800),
    Threshold(badge: "Platinum 2", points: 900),
    Threshold(badge: "Platinum 1", points: 1000),
    Threshold(badge: "Diamond 4", points: 1150),
    Threshold(badge: "Diamond 3", points: 1300),
    Threshold(badge: "Diamond 2", points: 1450),
    Threshold(badge: "Diamond 1", points: 1600),
    Threshold(badge: "Emerald 4", points: 1800),
    Threshold(badge: "Emerald 3", points: 2000),
    Threshold(badge: "Emerald 2", points: 2200),
    Threshold(badge: "Emerald 1", points: 2400),
]

/// World Tour win-points cheatsheet, from packages/web/src/components/PointsCheatsheet.vue.
struct CheatsheetRow: Identifiable, Sendable {
    let label: String
    let value: Int
    var id: String { label }
}

let worldTourCheatsheet: [CheatsheetRow] = [
    CheatsheetRow(label: "Knocked out of round one", value: 2),
    CheatsheetRow(label: "Knocked out of round two", value: 6),
    CheatsheetRow(label: "Lose the final round", value: 14),
    CheatsheetRow(label: "Win the final round", value: 25),
]

/// Tier accent color for a badge string (e.g. "Gold 2" -> gold). Used by the UI.
func tierColorName(for badge: String) -> String {
    let tier = badge.split(separator: " ").first.map(String.init) ?? badge
    switch tier {
    case "Bronze": return "bronze"
    case "Silver": return "silver"
    case "Gold": return "gold"
    case "Platinum": return "platinum"
    case "Diamond": return "diamond"
    case "Emerald": return "emerald"
    default: return "unranked"
    }
}
