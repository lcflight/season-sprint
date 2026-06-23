# Season Sprint — iOS

Native iOS client for Season Sprint, mirroring the Android app
(`packages/android`) against the same Cloudflare Worker backend
(`packages/server`). No server changes are required.

## Stack
- **SwiftUI** + Apple's **Charts** framework (single source of truth via
  `@Observable` stores), iOS 17+, Swift tools 6.0
- **Clerk iOS SDK** (`clerk-ios`, `ClerkKit` product) — email-code (OTP) auth,
  session JWTs
- **URLSession** REST client + a live **WebSocket** stream
- Domain logic (`Rank`/`Pace`) ported from the web app and shared with Android,
  driven by the same `worldTourRanks.json` thresholds
- Built with **[xtool](https://github.com/xtool-org/xtool)** (SwiftPM-based, no
  `.xcodeproj`) — so the app can be built from Linux as well as macOS

## App layout (`Sources/SeasonSprint/`)
- **`Views/`** — all SwiftUI screens. `ContentView` is the auth gate;
  `MainTabView` hosts the Graph / Log / Details tabs + `SettingsSheet`.
  `PointsChartView` is the hero chart (rank overlay, goal + pace projections,
  deviation wedge); `PaceChartView` is the required/earned pace sub-graph.
- **`State/`** — `DashboardStore` (loads records, merges live events, derives
  rank/pace/goal, handles writes) and `AppSettings` (UserDefaults-backed toggles).
- **`Networking/`** — `APIClient` (REST: records, seasons, stream token),
  `SSEClient` (WebSocket with auto-reconnect + heartbeat; name is legacy),
  `Models` (Codable DTOs).
- **`Domain/`** — `Rank.swift` (threshold table + rank computation) and
  `Pace.swift` (required pace, average-pace projection, deviation wedge).
- **Root** — `SeasonSprintApp` (`@main`, Clerk init), `Config.swift` (server URL
  + Clerk publishable key), `Diagnostics`.

## Prerequisites
- **xtool** installed and on `PATH` (see the
  [xtool docs](https://github.com/xtool-org/xtool) for setup, including device
  pairing / signing).
- A real **Clerk** account to sign in — the verification code arrives by email.

## Build & run
This is an xtool project (`xtool.yml` + `Package.swift`), not an Xcode project.
The typical loop:

```bash
cd packages/ios
xtool dev        # build and run on the paired device / simulator
xtool build      # produce an installable build
```

> The app links **`ClerkKit` only**, not `ClerkKitUI` — `ClerkKitUI`'s
> `#Preview` macros can't cross-compile under xtool, so the sign-in UI
> (`SignInView`) is built by hand against the email-code flow.

## Configuration
`Config.swift` holds the server URL (the deployed Cloudflare Worker) and the
live Clerk publishable key — the same values used by `packages/web` and
`packages/android`. Changing them requires a recompile.
