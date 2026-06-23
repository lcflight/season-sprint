# Season Sprint — Linux tracker

A local desktop tracker for Linux. It watches THE FINALS' end-of-match score
screen, OCRs your **World Tour points** / **Ranked score** straight off the
display, and pushes changes to your Season Sprint account automatically while
you play — no manual entry. This is the package the published
`season-sprint-linux.tar.gz` release is built from.

## How it works
A small C program drives the hot path; a Python sidecar does the heavy OCR:

1. **Capture** — `season-tracker.c` grabs the screen via X11 shared memory
   (`XShmGetImage`, sub-millisecond).
2. **Gate** — it runs the Tesseract C API on a small corner region to cheaply
   detect when the score screen is actually up, so the expensive OCR only runs
   when there's something to read.
3. **Read** — on a hit it writes the score region to a BMP and hands the path to
   `ocr_preprocess.py`, a long-lived **EasyOCR** daemon that finds the
   "WORLD TOUR POINTS" / "RANK SCORE" header and returns the number below it.
4. **Sync** — when the parsed value changes versus local state
   (`.last-wtp` / `.last-rank`), it `POST`s `{ date, winPoints, mode }` to
   `SERVER_URL/me/records` with your API key (libcurl), then backs off.

When launched as a Steam launch option it also `fork`/`exec`s the game, and
exits when the game does.

## Files
- `season-tracker.c` — the tracker (capture → gate → OCR handoff → POST). Built
  by the `Makefile`.
- `ocr_preprocess.py` — the EasyOCR daemon `season-tracker` talks to over a FIFO.
- `season-tracker.sh` — one-shot installer **and** Steam launcher: installs
  system deps, creates the Python venv + EasyOCR, compiles the tracker, prompts
  for config, then execs the binary with the game command.
- `Makefile` — `make season-tracker` (default) and `make season-watcher`.
- `.env.example` — config template (`SERVER_URL`, `AUTH_TOKEN`, `SHOT_GEOMETRY`).
- `package-linux.sh` — builds the release tarball (see [Release](#release)).
- `season-watcher.c` / `season-launch.sh` — a separate local-only helper, **not
  shipped** in the release (see [Season watcher](#season-watcher-local-only)).

## Prerequisites
The installer pulls these via your distro's package manager (apt / dnf / pacman
/ zypper), so you normally don't install them by hand:

- **Build:** `gcc`, `make`, `pkg-config`
- **Native libs:** Tesseract + dev headers, Leptonica, libcurl, X11 (`libx11`,
  `libxext`)
- **Python:** `python3` + `venv` + `pip`, into which EasyOCR is installed
  (this pulls PyTorch — a large, multi-minute first-time download)
- An **X11** session (screen capture uses XShm; Wayland needs Xorg/XWayland)

## Install & run
The normal path is the published release: download
`season-sprint-linux.tar.gz`, extract, and run `./season-tracker.sh` — or use
the one-liner on the [downloads page](https://www.seasonsprint.com/downloads).
From this repo directly:

```bash
cd packages/local-linux
./season-tracker.sh        # installs deps, builds, and walks you through config
```

The script installs system packages, builds the venv + EasyOCR, compiles the
tracker, and interactively writes `.env` (chmod 600) — it auto-detects your
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
`tracker.log` (+ `tracker.log.ocr_err`), and `/tmp/st-*` capture/FIFO temporaries.

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
not a binary** — the tracker links native libs (Tesseract, Leptonica, libcurl,
X11) whose ABIs skew across distros, so building on the user's machine via
`season-tracker.sh` is more portable. The tarball contains exactly:
`season-tracker.c`, `Makefile`, `ocr_preprocess.py`, `season-tracker.sh`, and
`.env.example`. In CI this is driven by `.github/workflows/build-linux.yml`.
