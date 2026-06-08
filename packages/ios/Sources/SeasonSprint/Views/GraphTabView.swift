import SwiftUI

/// Graph-first tab: a compact rank summary, the hero chart, and (optionally) the pace
/// sub-graph. Settings are behind the toolbar gear.
struct GraphTabView: View {
    @Environment(AppSettings.self) private var settings
    let store: DashboardStore
    @Binding var showSettings: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    CompactSummary(rank: store.rank, isLive: store.isLive)

                    PointsChartView(
                        points: store.seasonPoints.sorted { $0.date < $1.date },
                        season: store.season,
                        goal: store.goal,
                        rank: store.rank,
                        pace: store.pace,
                        showRankOverlay: settings.showRankOverlay,
                        showAveragePace: settings.showAveragePace,
                        showDeviationWedge: settings.showDeviationWedge
                    )

                    if settings.showPaceGraph {
                        PaceChartView(
                            points: store.seasonPoints,
                            goal: store.goal,
                            season: store.season
                        )
                    }
                }
                .padding()
            }
            .navigationTitle("Season Sprint")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { settingsButton(showSettings: $showSettings) }
            .refreshable { await store.load() }
        }
    }
}

/// Compact rank header for the Graph tab.
private struct CompactSummary: View {
    let rank: RankInfo
    let isLive: Bool

    var body: some View {
        let accent = tierColor(rank.badge)
        VStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(rank.badge)
                    .font(.title3.bold())
                    .foregroundStyle(accent)
                if isLive {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
                Spacer()
                Text("\(rank.points)")
                    .font(.title.bold())
                    .monospacedDigit()
            }

            if let next = rank.nextTarget, let nextBadge = rank.nextBadge {
                ProgressView(value: rank.progressFraction)
                    .tint(accent)
                HStack {
                    Text("\(rank.toNext) to \(nextBadge)")
                    Spacer()
                    Text("\(rank.points)/\(next)")
                        .monospacedDigit()
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Shared toolbar gear that opens the Settings sheet.
@ToolbarContentBuilder
func settingsButton(showSettings: Binding<Bool>) -> some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
        Button {
            showSettings.wrappedValue = true
        } label: {
            Image(systemName: "gearshape")
        }
    }
}
