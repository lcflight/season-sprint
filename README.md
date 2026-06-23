# Season Sprint

Track your season progress in **THE FINALS**. Season Sprint records your World
Tour points (and Ranked score) over the course of a season and shows how you're
pacing toward a goal — rank-threshold overlays, projection lines, and a
required-vs-earned pace graph — with your data synced live across web, iOS, and
Android. Optional desktop trackers (Linux/Windows) read your score straight off
the in-game screen via OCR and push it automatically while you play.

Live at **https://app.seasonsprint.com** (marketing site:
**https://www.seasonsprint.com**).

## Monorepo layout

pnpm workspace; every package lives under `packages/*` and is developed and
deployed independently.

| Package | What it is | Stack |
|---------|-----------|-------|
| [`web`](packages/web) | The main app (the SPA at `app.seasonsprint.com`) | Vue 3 (Vue CLI), Vitest |
| [`server`](packages/server) | The backend API + realtime + persistence | Cloudflare Worker, Hono, D1 (SQLite), Clerk, Durable Objects |
| [`ios`](packages/ios) | Native iOS client | SwiftUI, SwiftPM, built with xtool |
| [`android`](packages/android) | Native Android client | Kotlin + Jetpack Compose |
| [`landing`](packages/landing) | Marketing + downloads site (`www`/apex) | Static HTML/CSS/JS |
| [`local-linux`](packages/local-linux) | Local desktop tracker that OCRs the in-game score | C + Python (EasyOCR), X11 |
| [`local-win`](packages/local-win) | Windows desktop tracker (counterpart to `local-linux`) | Python (EasyOCR), Inno Setup installer |

## Architecture

All clients talk to the same backend — there is no build-time coupling between
them:

```
 web  ┐
 ios  ┤                         ┌── D1 (SQLite)        records
android┤── HTTPS REST ─────────►│── Clerk              auth (session JWT / API keys)
local-linux ┤   + live WebSocket │── Durable Object     per-user live updates
local-win  ┘                     └  (Hibernation API)
                Cloudflare Worker (packages/server, Hono)
```

- **Auth** is Clerk. Web/iOS/Android sign in with Clerk and send a session JWT;
  the desktop trackers authenticate with a personal API key (`sk_…`) minted in
  the web app.
- **Records** are cumulative win-points per day, stored in D1, keyed per user
  and game mode (`world-tour` / `ranked`).
- **Live updates** are pushed over a per-user WebSocket backed by a Durable
  Object (Hibernation API), so an edit on one device shows up on the others
  immediately.
- **Domain logic** (rank thresholds + pace/projection math) is implemented once
  per client and kept in sync — see `useChartGeometry.js`/`useRankInfo.js` (web),
  `Domain/Rank.swift`+`Domain/Pace.swift` (iOS), and the ported Kotlin `Rank`/
  `Pace` (Android), all sharing the `worldTourRanks.json` thresholds.

## Getting started

Requires [pnpm](https://pnpm.io) (see `packageManager` in `package.json` for the
pinned version) and Node (see `.nvmrc`).

```bash
pnpm install                 # install all workspace deps

pnpm -F web run serve        # web app dev server (hot reload)
pnpm -F server run dev       # backend on http://localhost:8787
pnpm -F landing dev          # landing site on http://localhost:3000
```

Run any package script from the repo root with `pnpm -F <package> run <script>`
(alias `-F` = `--filter`). `pnpm dev` runs every package's `dev` script in
parallel.

The native and desktop-tracker packages have their own toolchains — see each
package README:

- iOS — [`packages/ios/README.md`](packages/ios/README.md)
- Android — [`packages/android/README.md`](packages/android/README.md)
- Linux tracker — [`packages/local-linux/README.md`](packages/local-linux/README.md)
- Windows tracker — [`packages/local-win/README.md`](packages/local-win/README.md)

## Deploy & release

- **Web** and **landing** deploy on Render; **server** deploys to Cloudflare
  Workers (`pnpm -F server run deploy`). The www/app domain split is documented
  in [`packages/landing/README.md`](packages/landing/README.md).
- **Desktop trackers** ship via GitHub Releases. `.github/workflows/build-linux.yml`
  builds the Linux tarball from `packages/local-linux` and
  `.github/workflows/build-windows-installer.yml` builds the Windows installer
  from `packages/local-win/installer`. The downloads page picks assets up
  automatically by extension.

See [`WARP.md`](WARP.md) for additional command reference.
