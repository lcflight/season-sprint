# Season Sprint — Linux tracker

A local desktop tracker for Linux. It watches THE FINALS' lobby **MODES** tab and
the post-match score panel, reads your **World Tour** / **Ranked** score
straight off the display, and
pushes changes to your Season Sprint account automatically while you play — no
manual entry. This is the package the published `season-sprint-linux.tar.gz`
release is built from.

## How it works
One small C program, no OCR engine:

1. **Capture** — `season-tracker.c` grabs the monitor via X11 shared memory
   (`XShmGetImage`, sub-millisecond) once a second.
2. **Gate** — template-matches the yellow-highlighted **MODES** tab in the nav
   bar. Anything else is ignored (~7ms a frame).
3. **Read** — template-matches the score header at the bottom centre
   ("WORLD TOUR SCORE", "PLACEMENT ROUNDS", or a ranked header once one is
   added), then classifies the yellow digits under it against digit templates.
   The white "/ max" is read too and a value above it is rejected. ~20ms a
   frame at 1440p; needs 900p or higher. Placement rounds are recognised and
   skipped. This is a C port of
   [`local-win/screen_reader.py`](../local-win/screen_reader.py) — keep the two
   in step. Templates live in [`../tracker-templates`](../tracker-templates).
4. **Post-match** — when not on MODES, it also checks a small centre zone for
   the "WORLD TOUR SCORE" panel shown after every match. The value counts up
   for ~0.5s and the panel lasts ~2s, so while it's up the tracker polls every
   0.2s and needs three identical reads.
5. **Sync** — after two identical consecutive reads (three post-match), if the value differs from
   local state (`.last-wtp` / `.last-rank`) it `POST`s `{ date, winPoints, mode }`
   to `SERVER_URL/me/records` with your API key (libcurl); that mode then rests
   5 min.

When launched as a Steam launch option it also `fork`/`exec`s the game, and
exits when the game does.

To check what it reads from a screenshot (convert to PPM first):

```bash
convert shot.png shot.ppm && ./season-tracker --read shot.ppm
```

## Files
- `season-tracker.c` — the tracker (capture → gate → read → POST). Built by the
  `Makefile`.
- `season-tracker.sh` — one-shot installer **and** Steam launcher: installs
  system deps, compiles the tracker, prompts for config, then execs the binary
  with the game command.
- `Makefile` — `make season-tracker` (default) and `make season-watcher`.
- `.env.example` — config template (`SERVER_URL`, `AUTH_TOKEN`, `SHOT_GEOMETRY`).
- `package-linux.sh` — builds the release tarball (see [Release](#release)).
- `season-watcher.c` / `season-launch.sh` — a separate local-only helper, **not
  shipped** in the release (see [Season watcher](#season-watcher-local-only)).

## Prerequisites
The installer pulls these via your distro's package manager (apt / dnf / pacman
/ zypper), so you normally don't install them by hand:

- **Build:** `gcc`, `make`, `pkg-config`
- **Native libs:** libcurl, X11 (`libx11`, `libxext`)
- An **X11** session (screen capture uses XShm; Wayland needs Xorg/XWayland)

(The local-only season watcher additionally needs Tesseract + Leptonica.)

## Install & run
The normal path is the published release: download
`season-sprint-linux.tar.gz`, extract, and run `./season-tracker.sh` — or use
the one-liner on the [downloads page](https://www.seasonsprint.com/downloads).
From this repo directly:

```bash
cd packages/local-linux
./season-tracker.sh        # installs deps, builds, and walks you through config
```

The script installs system packages, compiles the tracker, and interactively writes `.env` (chmod 600) — it auto-detects your
monitor geometry via `xrandr` and verifies the server connection. You'll need a
personal **API key** (`sk_…`) from the web app's API Keys panel.

To track automatically while playing, set the tracker as your **Steam launch
option** for THE FINALS:

```
/full/path/to/season-tracker.sh %command%
```

It re-runs setup if anything's missing, strips Steam's library overrides so
system libs load cleanly, then launches the game. Build it by hand with
`make season-tracker` if you'd rather not use the installer.

## Configuration (`.env`)
| Var | Meaning |
|-----|---------|
| `SERVER_URL` | API base URL (no trailing slash) |
| `AUTH_TOKEN` | Personal API key (`sk_…`) from the web app |
| `SHOT_GEOMETRY` | Monitor geometry `WxH+X+Y` (auto-detected by the installer) |

Runtime files (all gitignored): `.last-wtp` / `.last-rank` (last synced values),
and `tracker.log`.

## Season watcher (local-only)
`season-watcher.c` is a separate notify tool that is **not part of the release**.
It OCRs the lobby's "SEASON N ENDS IN D DAYS" banner and fires a desktop
notification (`notify-send`) if the in-game countdown drifts from the season
dates the backend serves at `/seasons` — a canary for a mis-scraped season
window. Build it explicitly with `make season-watcher` (needs `-lm`).
`season-launch.sh` is a thin wrapper that backgrounds the watcher and then hands
off to `season-tracker.sh`; use it as the Steam launch option instead if you
want watcher alerts while you play.

## Release
`package-linux.sh` builds `dist/season-sprint-linux.tar.gz`. It ships **source,
not a binary** — the tracker links native libs (libcurl, X11) whose ABIs skew across distros, so building on the user's machine via
`season-tracker.sh` is more portable. The tarball contains exactly:
`season-tracker.c`, `Makefile`, `season-tracker.sh`, `.env.example`, and
`templates/` (copied from `../tracker-templates`). In CI this is driven by `.github/workflows/build-linux.yml`.
