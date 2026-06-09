import SwiftUI
import ClerkKit

/// Auth gate: a branded loading screen until Clerk is ready, then either the sign-in
/// screen or the dashboard depending on session state.
struct ContentView: View {
    @Environment(Clerk.self) private var clerk

    var body: some View {
        Group {
            if !clerk.isLoaded {
                LoadingView()
            } else if clerk.session == nil {
                SignInView()
            } else {
                MainTabView()
            }
        }
    }
}

/// Branded loading screen shown while Clerk fetches its environment/client. Surfaces a
/// quiet retry if it stalls.
private struct LoadingView: View {
    @Environment(Clerk.self) private var clerk
    @State private var probeError: String?
    @State private var showRetry = false

    var body: some View {
        BrandedLoadingView()
            .overlay(alignment: .bottom) {
                if showRetry {
                    VStack(spacing: 8) {
                        Text(probeError ?? "Still connecting…")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Retry") { Task { await probe() } }
                            .buttonStyle(.bordered)
                    }
                    .padding(.bottom, 32)
                    .transition(.opacity)
                }
            }
            .task { await probe() }
            .task {
                try? await Task.sleep(for: .seconds(6))
                withAnimation { showRetry = true }
            }
    }

    /// Drive the environment + client fetch so any error surfaces (and to recover on tap).
    private func probe() async {
        probeError = nil
        do {
            _ = try await clerk.refreshEnvironment()
            _ = try await clerk.refreshClient()
        } catch {
            probeError = "Couldn't connect. Check your connection and retry."
            withAnimation { showRetry = true }
        }
    }
}
