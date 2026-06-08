import SwiftUI

/// A single labelled stat card.
private struct StatCard: View {
    let label: String
    let value: String
    var accent: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2, reservesSpace: true)
            Text(value)
                .font(.title3.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Grid of dashboard stats. Ports StatsPanel.vue (required/day figures) plus extras.
struct StatsGridView: View {
    let store: DashboardStore

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            StatCard(label: "Current win points", value: "\(store.currentPoints)")

            if let gain = store.todayGain {
                StatCard(
                    label: "Today",
                    value: "\(gain >= 0 ? "+" : "")\(gain)",
                    accent: gain >= 0 ? .green : .red
                )
            } else {
                StatCard(label: "Today", value: "—")
            }

            if let pace = store.pace {
                StatCard(
                    label: "Required/day (zero → goal)",
                    value: format(pace.requiredPerDayZero)
                )
                StatCard(
                    label: "Required/day (last → goal)",
                    value: pace.isFromLastDefined ? format(pace.requiredPerDayFromLast) : "—",
                    accent: pace.isFromLastDefined ? .green : .secondary
                )
                StatCard(label: "Days left", value: "\(pace.daysRemaining)")
                StatCard(label: "Goal", value: "\(store.goal)", accent: .orange)
            }
        }
    }

    private func format(_ value: Double) -> String {
        String(format: "%.2f", value)
    }
}
