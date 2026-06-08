import Foundation

private let secondsPerDay: Double = 86_400

private func roundedDays(_ from: Date, _ to: Date) -> Int {
    Int((to.timeIntervalSince(from) / secondsPerDay).rounded())
}

/// Goal-pace statistics over a season window. Ports the computeds in
/// packages/web/src/components/LineGraph.vue (lines ~610-641) and StatsPanel.vue.
struct PaceStats: Sendable, Equatable {
    let daysInSeason: Int
    let daysRemaining: Int
    /// Slope of the zero -> goal projection, points per day.
    let requiredPerDayZero: Double
    /// Whether a "last point -> goal" pace is meaningful (≥1 point in season and the
    /// latest point predates the season end).
    let isFromLastDefined: Bool
    /// Points/day needed from the latest point to reach the goal by season end.
    let requiredPerDayFromLast: Double
}

/// - Parameters:
///   - goal: target win points / rank score.
///   - seasonPoints: points whose day falls within [start, end], any order.
///   - start, end: season window.
///   - today: current date (for days-remaining).
func computePace(
    goal: Int,
    seasonPoints: [Point],
    start: Date,
    end: Date,
    today: Date = Date()
) -> PaceStats {
    let daysInSeason = max(1, roundedDays(start, end))
    let requiredPerDayZero = Double(goal) / Double(daysInSeason)

    let sorted = seasonPoints.sorted { $0.date < $1.date }
    let last = sorted.last
    let isFromLastDefined = (last != nil) && (last!.date < end)

    let requiredPerDayFromLast: Double
    if let last, isFromLastDefined {
        let remaining = Double(goal - last.winPoints)
        let left = max(1, roundedDays(last.date, end))
        requiredPerDayFromLast = remaining / Double(left)
    } else {
        requiredPerDayFromLast = 0
    }

    let daysRemaining = max(0, roundedDays(today, end))

    return PaceStats(
        daysInSeason: daysInSeason,
        daysRemaining: daysRemaining,
        requiredPerDayZero: requiredPerDayZero,
        isFromLastDefined: isFromLastDefined,
        requiredPerDayFromLast: requiredPerDayFromLast
    )
}

// MARK: - Chart overlay helpers (ported from packages/web/src/utils/chart.js)

/// Through-origin least-squares slope (points/day): `Σ(x·y) / Σ(x²)` with x = day offset
/// from season start, including the implicit origin (0,0). Returns nil if undefined.
private func throughOriginSlope(_ seasonPoints: [Point], start: Date) -> Double? {
    var sumXX = 0.0
    var sumXY = 0.0
    for p in seasonPoints {
        let x = p.date.timeIntervalSince(start) / secondsPerDay
        let y = Double(p.winPoints)
        sumXX += x * x
        sumXY += x * y
    }
    guard sumXX != 0 else { return nil }
    return sumXY / sumXX
}

/// Average-pace value projected to season end: `slope · totalDays`. (`buildAveragePacePath`)
func averagePaceProjectedEnd(seasonPoints: [Point], start: Date, end: Date) -> Double? {
    guard !seasonPoints.isEmpty, let slope = throughOriginSlope(seasonPoints, start: start) else { return nil }
    let totalDays = end.timeIntervalSince(start) / secondsPerDay
    return slope * totalDays
}

/// Deviation half-width at season end for the confidence wedge. (`buildDeviationWedgePath`)
func deviationAtEnd(seasonPoints: [Point], start: Date, end: Date) -> Double? {
    guard seasonPoints.count >= 2, let slope = throughOriginSlope(seasonPoints, start: start) else { return nil }

    var sumResidualSq = 0.0
    for p in seasonPoints {
        let x = p.date.timeIntervalSince(start) / secondsPerDay
        let residual = Double(p.winPoints) - slope * x
        sumResidualSq += residual * residual
    }
    let n = seasonPoints.count
    let stdDev = n > 1 ? (sumResidualSq / Double(n - 1)).squareRoot() : sumResidualSq.squareRoot()

    let tFactor: Double = n <= 2 ? 4.303 : n <= 3 ? 3.182 : n <= 5 ? 2.776 : n <= 10 ? 2.228 : 1.96
    let totalDays = end.timeIntervalSince(start) / secondsPerDay
    let projectedMag = abs(slope * totalDays)
    let minDeviation = n <= 3 ? projectedMag * 0.3 : n <= 6 ? projectedMag * 0.15 : projectedMag * 0.05
    return max(stdDev * tFactor, minDeviation)
}

/// A dated value for the pace sub-graph.
struct PaceSeriesPoint: Identifiable, Sendable {
    let date: Date
    let value: Double
    var id: Date { date }
}

/// Required points/day to hit the goal, per point: `(goal - p.winPoints)/daysRemaining`.
/// Skips points at/after season end. (`buildRequiredPaceData`)
func requiredPaceSeries(seasonPoints: [Point], goal: Int, end: Date) -> [PaceSeriesPoint] {
    seasonPoints.sorted { $0.date < $1.date }.compactMap { p in
        let daysRemaining = end.timeIntervalSince(p.date) / secondsPerDay
        guard daysRemaining > 0 else { return nil }
        return PaceSeriesPoint(date: p.date, value: Double(goal - p.winPoints) / daysRemaining)
    }
}

/// Points earned per entry: delta of the cumulative total. (`buildPointsEarnedData`)
func earnedPaceSeries(seasonPoints: [Point]) -> [PaceSeriesPoint] {
    var prev = 0
    return seasonPoints.sorted { $0.date < $1.date }.map { p in
        let delta = p.winPoints - prev
        prev = p.winPoints
        return PaceSeriesPoint(date: p.date, value: Double(delta))
    }
}
