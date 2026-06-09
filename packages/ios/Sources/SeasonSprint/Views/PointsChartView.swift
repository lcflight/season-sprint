import SwiftUI
import Charts

/// A 2-point projection segment for the chart.
private struct ProjPoint: Identifiable {
    let id: Int
    let date: Date
    let value: Double
}

/// A rank band (translucent region between two thresholds) for the overlay.
private struct RankBand: Identifiable {
    let id: Int
    let lower: Double
    let upper: Double
    let badge: String
}

/// A two-point sample for the deviation wedge (a band that fans from the origin).
private struct WedgePoint: Identifiable {
    let id: Int
    let date: Date
    let low: Double
    let high: Double
}

/// The hero chart: cumulative points over time with optional rank overlay, goal line,
/// pace projections, average-pace line, and deviation wedge.
/// Ports the overlays from packages/web/src/components/LineGraph.vue.
struct PointsChartView: View {
    let points: [Point]
    let season: Season?
    let goal: Int
    let rank: RankInfo
    let pace: PaceStats?
    var todayGain: Int? = nil
    var showRankOverlay = false
    var showAveragePace = false
    var showDeviationWedge = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if points.isEmpty {
                Text("No records this season yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 280)
            } else {
                chart
                legend
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private var chart: some View {
        Chart {
            // Rank overlay bands.
            if showRankOverlay, let season {
                ForEach(rankBands) { band in
                    RectangleMark(
                        xStart: .value("Start", season.start),
                        xEnd: .value("End", season.end),
                        yStart: .value("Lower", band.lower),
                        yEnd: .value("Upper", band.upper)
                    )
                    .foregroundStyle(tierColor(band.badge).opacity(0.28))
                }
            }

            // Deviation wedge (under everything else).
            if showAveragePace, showDeviationWedge {
                ForEach(wedgePoints) { w in
                    AreaMark(
                        x: .value("Date", w.date),
                        yStart: .value("Low", w.low),
                        yEnd: .value("High", w.high)
                    )
                    .foregroundStyle(.purple.opacity(0.12))
                }
            }

            // Average pace line.
            if showAveragePace {
                ForEach(averagePaceLine) { p in
                    LineMark(x: .value("Date", p.date), y: .value("Points", p.value),
                             series: .value("Series", "avg"))
                        .foregroundStyle(.purple)
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                }
            }

            // Zero -> goal projection.
            ForEach(zeroProjection) { p in
                LineMark(x: .value("Date", p.date), y: .value("Points", p.value),
                         series: .value("Series", "zero"))
                    .foregroundStyle(.gray)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            }

            // Last point -> goal projection.
            ForEach(lastProjection) { p in
                LineMark(x: .value("Date", p.date), y: .value("Points", p.value),
                         series: .value("Series", "last"))
                    .foregroundStyle(.green)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            }

            // Actual cumulative points.
            ForEach(points) { p in
                LineMark(x: .value("Date", p.date), y: .value("Points", Double(p.winPoints)),
                         series: .value("Series", "points"))
                    .foregroundStyle(.tint)
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Date", p.date), y: .value("Points", Double(p.winPoints)))
                    .foregroundStyle(.tint)
                    .symbolSize(16)
            }
        }
        .chartYScale(domain: 0...yMax)
        .chartYAxis(.hidden)
        .modifier(XScale(domain: xDomain))
        .frame(height: 300)
        .clipped()
        .overlay(alignment: .topLeading) { todayBadge }
    }

    @ViewBuilder private var todayBadge: some View {
        if let todayGain {
            VStack(alignment: .leading, spacing: 0) {
                Text("Today")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(todayGain >= 0 ? "+" : "")\(todayGain)")
                    .font(.headline.bold())
                    .monospacedDigit()
                    .foregroundStyle(todayGain >= 0 ? .green : .red)
            }
            .padding(6)
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem(color: .gray, label: "Zero → goal")
            if pace?.isFromLastDefined == true {
                legendItem(color: .green, label: "Last → goal")
            }
            if showAveragePace {
                legendItem(color: .purple, label: "Avg pace")
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Rectangle().fill(color).frame(width: 14, height: 2)
            Text(label)
        }
    }

    // MARK: Derived chart data

    private var rankBands: [RankBand] {
        var bands: [RankBand] = []
        var lower = 0
        for (i, t) in worldTourThresholds.enumerated() {
            // Only bands below the goal cap; clamp the top band to the goal.
            if Double(lower) < yMax {
                bands.append(RankBand(id: i, lower: Double(lower), upper: min(Double(t.points), yMax), badge: t.badge))
            }
            lower = t.points
        }
        return bands
    }

    private var zeroProjection: [ProjPoint] {
        guard let season else { return [] }
        return [
            ProjPoint(id: 0, date: season.start, value: 0),
            ProjPoint(id: 1, date: season.end, value: Double(goal)),
        ]
    }

    private var lastProjection: [ProjPoint] {
        guard let season, pace?.isFromLastDefined == true,
              let last = points.sorted(by: { $0.date < $1.date }).last else { return [] }
        return [
            ProjPoint(id: 0, date: last.date, value: Double(last.winPoints)),
            ProjPoint(id: 1, date: season.end, value: Double(goal)),
        ]
    }

    private var averagePaceLine: [ProjPoint] {
        guard let season,
              let end = averagePaceProjectedEnd(seasonPoints: points, start: season.start, end: season.end)
        else { return [] }
        return clampToCap([
            ProjPoint(id: 0, date: season.start, value: 0),
            ProjPoint(id: 1, date: season.end, value: end),
        ])
    }

    /// Truncates a 2-point projection segment at the goal cap (yMax) so it never draws
    /// above the plot. Returns [] if the whole segment is above the cap.
    private func clampToCap(_ pts: [ProjPoint]) -> [ProjPoint] {
        guard pts.count == 2 else { return pts }
        let a = pts[0], b = pts[1]
        if a.value > yMax && b.value > yMax { return [] }
        if a.value <= yMax && b.value <= yMax { return pts }
        if b.value > yMax {
            let t = (yMax - a.value) / (b.value - a.value)
            let crossDate = a.date.addingTimeInterval(b.date.timeIntervalSince(a.date) * t)
            return [a, ProjPoint(id: b.id, date: crossDate, value: yMax)]
        } else {
            let t = (yMax - b.value) / (a.value - b.value)
            let crossDate = b.date.addingTimeInterval(a.date.timeIntervalSince(b.date) * t)
            return [ProjPoint(id: a.id, date: crossDate, value: yMax), b]
        }
    }

    private var wedgePoints: [WedgePoint] {
        guard let season,
              let projected = averagePaceProjectedEnd(seasonPoints: points, start: season.start, end: season.end),
              let dev = deviationAtEnd(seasonPoints: points, start: season.start, end: season.end)
        else { return [] }
        // Sample the fan at multiple points so AreaMark renders a band *between* the
        // lower and upper pace lines, not a fill down to the baseline.
        let steps = 24
        let total = season.end.timeIntervalSince(season.start)
        return (0...steps).map { i in
            let f = Double(i) / Double(steps)
            let date = season.start.addingTimeInterval(total * f)
            return WedgePoint(
                id: i,
                date: date,
                low: min(yMax, max(0, f * (projected - dev))),
                high: min(yMax, f * (projected + dev))
            )
        }
    }

    /// Y axis caps at the goal when the data is below it (no empty headroom above the
    /// goal), but expands to fit the data — plus a little headroom — when any point
    /// exceeds the goal, so the line never draws outside the plot.
    private var yMax: Double {
        let maxPoint = Double(points.map(\.winPoints).max() ?? 0)
        if maxPoint > Double(goal) {
            return max(1, maxPoint * 1.05)
        }
        return max(1, Double(goal))
    }

    private var xDomain: ClosedRange<Date>? {
        guard let season else { return nil }
        return season.start...season.end
    }
}

/// Applies a chart X domain only when one is available (no season → auto domain).
private struct XScale: ViewModifier {
    let domain: ClosedRange<Date>?
    func body(content: Content) -> some View {
        if let domain {
            content.chartXScale(domain: domain)
        } else {
            content
        }
    }
}
