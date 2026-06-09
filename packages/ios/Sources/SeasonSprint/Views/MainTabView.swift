import SwiftUI
import ClerkKit

/// Signed-in root: a Graph tab and a Details tab sharing one DashboardStore (so both
/// reflect the same data + live SSE), with an app-wide Settings sheet behind a gear.
struct MainTabView: View {
    @Environment(Clerk.self) private var clerk
    @Environment(AppSettings.self) private var settings
    @State private var store = DashboardStore()
    @State private var showSettings = false

    var body: some View {
        TabView {
            GraphTabView(store: store, showSettings: $showSettings)
                .tabItem { Label("Graph", systemImage: "chart.xyaxis.line") }
            LogTabView(store: store, showSettings: $showSettings)
                .tabItem { Label("Log", systemImage: "square.and.pencil") }
            DetailsTabView(store: store, showSettings: $showSettings)
                .tabItem { Label("Details", systemImage: "list.bullet") }
        }
        .task { await store.load() }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(settings: settings, isLive: store.isLive) {
                store.stop()
                try? await clerk.auth.signOut()
            }
        }
    }
}
