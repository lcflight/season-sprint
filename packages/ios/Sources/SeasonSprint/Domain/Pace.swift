import Foundation

private let secondsPerDay: Double = 86_400

private func roundedDays(_ from: Date, _ to: Date) -> Int {
    Int((to.timeIntervalSince(from) / secondsPerDay).rounded())
}

/// The anchor pace/projection math is measured from. World Tour anchors at
/// (seasonStart, 0); Ranked anchors at the first recorded point in the season (the
/// placement point), since a Ranked season starts at a placement rank, not zero.
/// Mirrors `paceBaseline` in packages/web/src/composables/useChartGeometry.js.
struct PaceBaseline: Sendable, Equatable {
    let date: Date
    let value: Double
}

/// `sortedSeasonPoints` must already be sorted ascending by `Point.date`.
func paceBaseline(for mode: GameMode, sortedSeasonPoints: [Point], seasonStart: Date) -> PaceBaseline {
    if mode == .ranked, let first = sortedSeasonPoints.first {
        return PaceBaseline(date: first.date, value: Double(first.winPoints))
    }
    return PaceBaseline(date: seasonStart, value: 0)
}

/// Goal-pace statistics over a season window. Ports the computeds in
/// packages/web/src/components/LineGraph.vue (lines ~610-641) and StatsPanel.vue.
struct PaceStats: Sendable, Equatable {
    let daysInSeason: Int
    let daysRemaining: Int
    /// Slope of the baseline -> goal projection, points per day.
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
///   - baseline: the zero-point anchor; defaults to (start, 0) — pass `paceBaseline(for:...)`'s
///     result to get Ranked's placement-point measurement.
func computePace(
    goal: Int,
    seasonPoints: [Point],
    start: Date,
    end: Date,
    today: Date = Date(),
    baseline: PaceBaseline? = nil
) -> PaceStats {
    let baseline = baseline ?? PaceBaseline(date: start, value: 0)
    let daysInSeason = max(1, roundedDays(start, end))
    let baselineDays = max(1, roundedDays(baseline.date, end))
    let requiredPerDayZero = (Double(goal) - baseline.value) / Double(baselineDays)

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

/// Through-origin least-squares slope (points/day): `Σ(x·y) / Σ(x²)`, where x/y are day/value
/// offsets *relative to `baseline`*. A point that coincides with the baseline itself (the
/// Ranked placement point) is skipped so it isn't counted twice against the synthetic origin.
private func throughOriginSlope(_ seasonPoints: [Point], baseline: PaceBaseline) -> Double? {
    var sumXX = 0.0
    var sumXY = 0.0
    for p in seasonPoints {
        let x = p.date.timeIntervalSince(baseline.date) / secondsPerDay
        let y = Double(p.winPoints) - baseline.value
        if x == 0, y == 0 { continue }
        sumXX += x * x
        sumXY += x * y
    }
    guard sumXX != 0 else { return nil }
    return sumXY / sumXX
}

/// Average-pace value projected to season end: baseline value + `slope · daysFromBaseline`.
/// (`buildAveragePacePath`)
func averagePaceProjectedEnd(
    seasonPoints: [Point],
    start: Date,
    end: Date,
    baseline: PaceBaseline? = nil
) -> Double? {
    let baseline = baseline ?? PaceBaseline(date: start, value: 0)
    guard !seasonPoints.isEmpty, let slope = throughOriginSlope(seasonPoints, baseline: baseline) else { return nil }
    let totalDays = end.timeIntervalSince(baseline.date) / secondsPerDay
    return baseline.value + slope * totalDays
}

/// Deviation half-width at season end for the confidence wedge. (`buildDeviationWedgePath`)
func deviationAtEnd(
    seasonPoints: [Point],
    start: Date,
    end: Date,
    baseline: PaceBaseline? = nil
) -> Double? {
    let baseline = baseline ?? PaceBaseline(date: start, value: 0)
    guard seasonPoints.count >= 2, let slope = throughOriginSlope(seasonPoints, baseline: baseline) else { return nil }

    var sumResidualSq = 0.0
    var n = 0
    for p in seasonPoints {
        let x = p.date.timeIntervalSince(baseline.date) / secondsPerDay
        let y = Double(p.winPoints) - baseline.value
        if x == 0, y == 0 { continue }
        let residual = y - slope * x
        sumResidualSq += residual * residual
        n += 1
    }
    guard n > 0 else { return nil }
    let stdDev = n > 1 ? (sumResidualSq / Double(n - 1)).squareRoot() : sumResidualSq.squareRoot()

    let tFactor: Double = n <= 2 ? 4.303 : n <= 3 ? 3.182 : n <= 5 ? 2.776 : n <= 10 ? 2.228 : 1.96
    let totalDays = end.timeIntervalSince(baseline.date) / secondsPerDay
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

/// Points earned per entry: delta of the cumulative total. `baselineY` seeds the running
/// total — 0 for World Tour, the placement value for Ranked, so the placement point itself
/// doesn't read as a giant "earned" spike on day one. (`buildPointsEarnedData`)
func earnedPaceSeries(seasonPoints: [Point], baselineY: Double = 0) -> [PaceSeriesPoint] {
    var prev = baselineY
    return seasonPoints.sorted { $0.date < $1.date }.map { p in
        let delta = Double(p.winPoints) - prev
        prev = Double(p.winPoints)
        return PaceSeriesPoint(date: p.date, value: delta)
    }
}
