import Foundation

/// A rank threshold: reach `points` to earn `badge`.
struct Threshold: Sendable, Equatable {
    let badge: String
    let points: Int
}

/// The rank/RS threshold table for a mode in a season (a `/seasons` name like "Season 12").
/// World Tour switched from win points to fans in Season 12; nil or an unknown name means
/// the live season, which is always a fans season now.
func thresholds(for mode: GameMode, seasonKey: String? = nil) -> [Threshold] {
    switch mode {
    case .worldTour: return usesFans(seasonKey: seasonKey) ? worldTourFansThresholds : worldTourThresholds
    case .ranked: return rankedThresholds
    }
}

// MARK: Fans (World Tour, Season 12+). Ported from packages/web/src/utils/fans.js.
//
// The game shows "X / Y": fans since entering the current badge / fans that badge needs.
// Badge n (Bronze 4 = 1 … Emerald 1 = 24) needs 2,000·n, so Y identifies the badge and the
// season total is 1,000·n·(n-1) + X. Records store that season total.

let firstFansSeason = 12
let fansStep = 2000
let fansBadges = 24

/// "Season 12" -> 12; nil for names without a trailing number.
func seasonNumber(_ name: String?) -> Int? {
    guard let name, let match = name.range(of: #"\d+\s*$"#, options: .regularExpression) else { return nil }
    return Int(name[match].trimmingCharacters(in: .whitespaces))
}

/// Whether World Tour counts fans in this season. nil/unknown = the live season = fans.
func usesFans(seasonKey: String?) -> Bool {
    guard let n = seasonNumber(seasonKey) else { return true }
    return n >= firstFansSeason
}

/// Season-total fans at the moment you enter badge n (1-based).
func fansToEnter(_ n: Int) -> Int { fansStep / 2 * n * (n - 1) }

/// Season-total fans from the in-game "X / Y" readout, or nil if it isn't a real badge.
func fansTotal(inRank: Int, required: Int) -> Int? {
    guard inRank >= 0, required > 0, required % fansStep == 0 else { return nil }
    let n = required / fansStep
    guard n >= 1, n <= fansBadges, inRank <= required else { return nil }
    return fansToEnter(n) + inRank
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

/// A World Tour goal saved on the old win-points scale, moved to the same badge's fans
/// threshold; nil if `goal` isn't an old badge threshold (a custom goal). Callers run it
/// once, keyed on a saved scale marker: the number alone is ambiguous (2,000 is Emerald 3
/// in points but Bronze 3 in fans).
func fansGoal(fromLegacy goal: Int) -> Int? {
    guard let old = worldTourThresholds.first(where: { $0.points == goal }) else { return nil }
    return worldTourFansThresholds.first(where: { $0.badge == old.badge })?.points
}

/// World Tour rank thresholds for Season 11 and earlier (win points), verbatim from
/// packages/web/src/data/worldTourRanks.json.
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

/// World Tour fans thresholds for Season 12 onward (season total to enter each badge),
/// verbatim from packages/web/src/data/worldTourRanksBySeason.json ("Season 12").
let worldTourFansThresholds: [Threshold] = [
    Threshold(badge: "Bronze 4", points: 0),
    Threshold(badge: "Bronze 3", points: 2000),
    Threshold(badge: "Bronze 2", points: 6000),
    Threshold(badge: "Bronze 1", points: 12000),
    Threshold(badge: "Silver 4", points: 20000),
    Threshold(badge: "Silver 3", points: 30000),
    Threshold(badge: "Silver 2", points: 42000),
    Threshold(badge: "Silver 1", points: 56000),
    Threshold(badge: "Gold 4", points: 72000),
    Threshold(badge: "Gold 3", points: 90000),
    Threshold(badge: "Gold 2", points: 110000),
    Threshold(badge: "Gold 1", points: 132000),
    Threshold(badge: "Platinum 4", points: 156000),
    Threshold(badge: "Platinum 3", points: 182000),
    Threshold(badge: "Platinum 2", points: 210000),
    Threshold(badge: "Platinum 1", points: 240000),
    Threshold(badge: "Diamond 4", points: 272000),
    Threshold(badge: "Diamond 3", points: 306000),
    Threshold(badge: "Diamond 2", points: 342000),
    Threshold(badge: "Diamond 1", points: 380000),
    Threshold(badge: "Emerald 4", points: 420000),
    Threshold(badge: "Emerald 3", points: 462000),
    Threshold(badge: "Emerald 2", points: 506000),
    Threshold(badge: "Emerald 1", points: 552000),
]

/// Ranked RS thresholds, verbatim from packages/web/src/views/Ranked.vue (RANKED_THRESHOLDS).
/// Bronze (0 -> 7,500), Silver (10,000 -> 17,500), Gold (20,000 -> 27,500), Platinum
/// (30,000 -> 37,500), Diamond (40,000 -> 47,500). Ruby = Top 500, not threshold-based.
let rankedThresholds: [Threshold] = [
    Threshold(badge: "Bronze 4", points: 0),
    Threshold(badge: "Bronze 3", points: 2500),
    Threshold(badge: "Bronze 2", points: 5000),
    Threshold(badge: "Bronze 1", points: 7500),
    Threshold(badge: "Silver 4", points: 10000),
    Threshold(badge: "Silver 3", points: 12500),
    Threshold(badge: "Silver 2", points: 15000),
    Threshold(badge: "Silver 1", points: 17500),
    Threshold(badge: "Gold 4", points: 20000),
    Threshold(badge: "Gold 3", points: 22500),
    Threshold(badge: "Gold 2", points: 25000),
    Threshold(badge: "Gold 1", points: 27500),
    Threshold(badge: "Platinum 4", points: 30000),
    Threshold(badge: "Platinum 3", points: 32500),
    Threshold(badge: "Platinum 2", points: 35000),
    Threshold(badge: "Platinum 1", points: 37500),
    Threshold(badge: "Diamond 4", points: 40000),
    Threshold(badge: "Diamond 3", points: 42500),
    Threshold(badge: "Diamond 2", points: 45000),
    Threshold(badge: "Diamond 1", points: 47500),
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
