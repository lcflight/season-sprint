import SwiftUI
import ClerkKit

/// Auth gate: shows a loading state until Clerk is ready, then either the sign-in
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

/// Shown while Clerk fetches its environment/client. If that stalls, this view
/// surfaces the actual error (instead of spinning forever) and offers a retry.
private struct LoadingView: View {
    @Environment(Clerk.self) private var clerk
    @State private var diagnostics = Diagnostics.shared
    @State private var probeError: String?
    @State private var attempts = 0

    var body: some View {
        VStack(spacing: 16) {
            ProgressView("Connecting…")

            if let probeError {
                Text(probeError)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            if !diagnostics.lines.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(diagnostics.lines.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(.caption2, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 260)
                .padding(8)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            }

            Button("Retry") { Task { await probe() } }
                .buttonStyle(.bordered)
        }
        .padding()
        .task { await probe() }
    }

    /// Explicitly drive the environment + client fetch so any thrown error is visible.
    private func probe() async {
        attempts += 1
        probeError = nil
        do {
            _ = try await clerk.refreshEnvironment()
            _ = try await clerk.refreshClient()
        } catch {
            probeError = "Probe #\(attempts) failed: \(error.localizedDescription)"
        }
    }
}
