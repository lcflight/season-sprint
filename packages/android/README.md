# Season Sprint — Android

Native Android client for Season Sprint, mirroring the iOS app (`packages/ios`) against the
same Cloudflare Worker backend (`packages/server`). No server changes are required.

## Stack
- **Kotlin + Jetpack Compose** (Material 3), single-Activity
- **Clerk Android SDK** — email-code (OTP) auth, session JWTs
- **OkHttp + kotlinx-serialization** — REST client + live WebSocket
- Custom Compose **`Canvas`** points chart (goal-projection overlays)
- Domain logic (`Rank`/`Pace`) ported from the iOS `Domain/` files + `worldTourRanks.json`,
  covered by JUnit tests

## MVP scope
Sign-in, points graph with pace projections, add/edit/delete records, and live WebSocket sync
(`● Live` indicator). Parity extras (pace sub-graph, settings toggles, cheatsheet, CSV import,
API-key UI) are intentionally deferred.

## Prerequisites
- JDK 17+
- Android SDK with **platform 36** and **build-tools** (compileSdk 36); targetSdk 35, minSdk 26
- A `local.properties` with `sdk.dir=/path/to/Android/Sdk` (gitignored)

> Version floors are driven by the Clerk SDK: **Kotlin ≥ 2.4**, **compileSdk 36 / AGP ≥ 8.9.1**
> (Clerk pulls `androidx.browser:1.10.0`).

## Build & test
```bash
cd packages/android
./gradlew :app:assembleDebug      # build APK
./gradlew :app:testDebugUnitTest  # run unit tests
./gradlew :app:lintDebug          # lint
```

## Run on an emulator
```bash
# create an AVD once (API 35 google_apis image), then:
$ANDROID_HOME/emulator/emulator -avd <name> &
./gradlew :app:installDebug
adb shell am start -n com.lcarthur.seasonsprint/.MainActivity
```
Sign in with a real Clerk account — the verification code arrives by email.

## Configuration
`Config.kt` holds the server URL and Clerk publishable key (the same live key used by web/iOS).
