import SwiftUI
import ClerkKit

private let lastModeKey = "ui.lastMode"

/// Signed-in root: a mode switcher (World Tour / Ranked) above a Graph/Log/Details tab
/// view. Both modes get their own `DashboardStore`/`AppSettings` instance (mirroring the
/// web app's separate WorldTour.vue/Ranked.vue view instances), so each mode keeps its own
/// goal, settings, and loaded records independently. Only the *active* mode's live
/// connection is kept open.
struct MainTabView: View {
    @Environment(Clerk.self) private var clerk
    @State private var mode: GameMode
    @State private var stores: [GameMode: DashboardStore]
    @State private var settingsByMode: [GameMode: AppSettings]
    @State private var showSettings = false

    init() {
        let saved = UserDefaults.standard.string(forKey: lastModeKey).flatMap(GameMode.init(rawValue:)) ?? .worldTour
        _mode = State(initialValue: saved)
        _stores = State(initialValue: Dictionary(uniqueKeysWithValues: GameMode.allCases.map { ($0, DashboardStore(mode: $0)) }))
        _settingsByMode = State(initialValue: Dictionary(uniqueKeysWithValues: GameMode.allCases.map { ($0, AppSettings(mode: $0)) }))
    }

    private var store: DashboardStore { stores[mode]! }
    private var settings: AppSettings { settingsByMode[mode]! }

    var body: some View {
        Group {
            if store.hasLoaded {
                VStack(spacing: 0) {
                    ModeSwitcherView(selected: $mode)
                    TabView {
                        GraphTabView(store: store, showSettings: $showSettings)
                            .environment(settings)
                            .tabItem { Label("Graph", systemImage: "chart.xyaxis.line") }
                        LogTabView(store: store, showSettings: $showSettings)
                            .tabItem { Label("Log", systemImage: "square.and.pencil") }
                        DetailsTabView(store: store, showSettings: $showSettings)
                            .tabItem { Label("Details", systemImage: "list.bullet") }
                    }
                }
            } else {
                BrandedLoadingView(message: "Loading your season…")
            }
        }
        .task(id: mode) {
            UserDefaults.standard.set(mode.rawValue, forKey: lastModeKey)
            for (m, s) in stores where m != mode { s.pauseLive() }
            await store.load()
            store.resumeLive()
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(settings: settings, liveStatus: store.liveStatus) {
                for s in stores.values { s.stop() }
                try? await clerk.auth.signOut()
            }
        }
    }
}
