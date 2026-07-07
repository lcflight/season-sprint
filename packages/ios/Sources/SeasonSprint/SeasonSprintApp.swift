import SwiftUI
import ClerkKit

@main
struct SeasonSprintApp: App {
    // `Clerk.configure` returns the configured shared instance. We must configure
    // *before* anything touches `Clerk.shared`, so we do it here in init and seed
    // the @State from the return value rather than reading `Clerk.shared` directly.
    @State private var clerk: Clerk

    init() {
        let options = Clerk.Options(
            logLevel: .debug,
            loggerHandler: { entry in
                var line = "[\(entry.level.rawValue)] \(entry.message)"
                if let error = entry.error {
                    line += " — \(error.localizedDescription)"
                }
                Task { @MainActor in Diagnostics.shared.add(line) }
            }
        )
        let configured = Clerk.configure(
            publishableKey: Config.clerkPublishableKey,
            options: options
        )
        _clerk = State(initialValue: configured)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(clerk)
        }
    }
}
