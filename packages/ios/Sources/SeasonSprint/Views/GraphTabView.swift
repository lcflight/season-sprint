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
                    CompactSummary(rank: store.rank, liveStatus: store.liveStatus, inGameReadout: store.usesFansEntry)

                    if store.isViewingPastSeason {
                        Text("Viewing a past season — read-only")
                            .font(.caption.bold())
                            .foregroundStyle(.tint)
                    }

                    let baseline = store.paceBaseline ?? PaceBaseline(date: store.viewedSeason?.start ?? store.season?.start ?? .distantPast, value: 0)

                    PointsChartView(
                        points: store.seasonPoints.sorted { $0.date < $1.date },
                        season: store.viewedSeason,
                        goal: store.goal,
                        thresholds: store.viewedThresholds,
                        baseline: baseline,
                        rank: store.rank,
                        pace: store.pace,
                        overlayPoints: store.overlayPoints,
                        todayGain: store.isViewingPastSeason ? nil : store.todayGain,
                        showRankOverlay: settings.showRankOverlay,
                        showAveragePace: settings.showAveragePace,
                        showDeviationWedge: settings.showDeviationWedge
                    )

                    if settings.showPaceGraph {
                        PaceChartView(
                            points: store.seasonPoints,
                            goal: store.goal,
                            season: store.viewedSeason,
                            baseline: baseline
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
    let liveStatus: LiveStatus
    /// Fans seasons: show "fans in this badge / fans it needs", as the game does.
    var inGameReadout = false

    var body: some View {
        let accent = tierColor(rank.badge)
        VStack(spacing: 8) {
            HStack(alignment: .center) {
                HStack(alignment: .center, spacing: 6) {
                    Text(rank.badge)
                        .font(.title3.bold())
                        .foregroundStyle(accent)
                    LiveIndicatorView(status: liveStatus)
                }
                Spacer()
                Text(rank.points.formatted())
                    .font(.title.bold())
                    .monospacedDigit()
            }

            if let next = rank.nextTarget, let nextBadge = rank.nextBadge {
                ProgressView(value: rank.progressFraction)
                    .tint(accent)
                HStack {
                    Text("\(rank.toNext.formatted()) to \(nextBadge)")
                    Spacer()
                    Text(inGameReadout
                         ? "\((rank.points - rank.currentFloor).formatted())/\((next - rank.currentFloor).formatted())"
                         : "\(rank.points)/\(next)")
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
