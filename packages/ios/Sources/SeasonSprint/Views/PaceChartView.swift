import SwiftUI
import Charts

/// Secondary mini-chart: required points/day to hit the goal (line) vs points earned
/// each day (bars). Ports the pace graph from packages/web/src/components/LineGraph.vue.
struct PaceChartView: View {
    let points: [Point]
    let goal: Int
    let season: Season?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Daily pace")
                .font(.headline)

            if let end = season?.end {
                let required = requiredPaceSeries(seasonPoints: points, goal: goal, end: end)
                let earned = earnedPaceSeries(seasonPoints: points)

                if required.isEmpty && earned.isEmpty {
                    placeholder("No pace data yet.")
                } else {
                    Chart {
                        ForEach(earned) { p in
                            BarMark(x: .value("Date", p.date), y: .value("Earned", p.value), width: .fixed(5))
                                .foregroundStyle(.tint.opacity(0.5))
                        }
                        ForEach(required) { p in
                            LineMark(x: .value("Date", p.date), y: .value("Required", p.value),
                                     series: .value("Series", "required"))
                                .foregroundStyle(.orange)
                                .interpolationMethod(.monotone)
                        }
                    }
                    .frame(height: 130)

                    HStack(spacing: 14) {
                        legendItem(color: .orange, label: "Required/day")
                        legendItem(color: .accentColor.opacity(0.6), label: "Earned/day")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            } else {
                placeholder("Season data needed.")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func placeholder(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 120)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Rectangle().fill(color).frame(width: 14, height: 2)
            Text(label)
        }
    }
}
