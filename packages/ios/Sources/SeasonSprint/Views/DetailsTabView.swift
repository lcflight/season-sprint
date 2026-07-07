import SwiftUI

/// Details tab: season info, stats, goal control, and the reference tables.
struct DetailsTabView: View {
    let store: DashboardStore
    @Binding var showSettings: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    SeasonBannerView(season: store.season)
                    SeasonsCardView(store: store)
                    StatsGridView(store: store)
                    GoalControlView(store: store)
                    RankReferenceView(thresholds: store.thresholds, rank: store.rank)
                    if store.mode == .worldTour {
                        CheatsheetView()
                    }

                    if let errorMessage = store.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Details")
            .toolbar { settingsButton(showSettings: $showSettings) }
            .refreshable { await store.load() }
        }
    }
}
