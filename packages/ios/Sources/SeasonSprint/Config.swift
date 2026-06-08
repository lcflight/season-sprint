import Foundation

/// Static configuration mirroring the web app's environment values.
/// - serverURL: the deployed Cloudflare Worker (see packages/local-win/season_tracker.py).
/// - clerkPublishableKey: the live Clerk key (see packages/web/.env).
enum Config {
    static let serverURL = URL(string: "https://season-sprint-server.lcarthur747.workers.dev")!
    static let clerkPublishableKey = "pk_live_Y2xlcmsuc2Vhc29uc3ByaW50LmNvbSQ"
}
