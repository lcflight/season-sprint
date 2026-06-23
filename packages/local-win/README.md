# Season Sprint — Windows tracker

The Windows counterpart to [`packages/local-linux`](../local-linux). It watches
THE FINALS' end-of-match score screen, OCRs your **World Tour points** straight
off the display, and pushes changes to your Season Sprint account automatically
while you play. Distributed as a one-click installer (`SeasonSprintTracker.exe`).

## How it works
A single Python program (`season_tracker.py`):

1. **Capture** — grabs the bottom-centre of your chosen monitor with **mss**
   (no PIL/OpenCV needed for capture).
2. **Read** — runs **EasyOCR** (CPU-only PyTorch) over the region, looks for the
   "WORLD TOUR POINTS" header, and parses the number beneath it. It requires two
   identical consecutive reads before trusting a value.
3. **Sync** — when the value changes versus local state (`.last-wtp`), it `POST`s
   `{ date, winPoints }` to the server with your API key, then cools down ~5 min.

The token is validated (`sk_` + 64 hex) before sending and masked in logs, and
SSL is pinned to certifi's CA bundle so model downloads work on fresh Windows
installs.

## Files
- `season_tracker.py` — the tracker (capture → OCR → POST), config, state, and
  logging. Supports `--setup-only`, `--list-monitors`.
- `tray.py` — system-tray launcher for **non-Steam** players (Epic/Xbox/direct);
  runs headless via `pythonw.exe`, single-instance, with a tray menu.
- `launch.bat` — **Steam** wrapper (`launch.bat %command%`): starts the tracker
  headless, runs the game, kills the tracker on exit. Run with no args to test
  in a console.
- `setup.bat` / `install-deps.bat` — interactive setup and (idempotent)
  dependency bootstrap: find/install Python, MSVC redist, create the venv,
  pip-install requirements with **CPU-only torch**.
- `watch-tracker.bat` — live-tails `tracker.log`. `test_ocr.py` — runs the OCR
  pipeline against a saved image to debug parsing.
- `requirements.txt` — `easyocr`, `mss`, `requests`, `numpy`, `Pillow`,
  `pystray`.
- `installer/installer.iss` — Inno Setup 6 script that builds the installer.
- `.env.example` — config template (`AUTH_TOKEN`, `MONITOR_INDEX`).

## Prerequisites
- **Windows x64**. Python **3.9+** (the installer/`install-deps.bat` will install
  Python 3.12 via `winget` if it's missing), plus the MSVC C++ redistributable
  (needed by PyTorch).
- The dependency bootstrap creates a venv at `%USERPROFILE%\.season-sprint\venv`
  — outside the repo, stable across drives/updates — and installs **CPU-only**
  torch from the PyTorch CPU wheel index (avoids the ~2 GB CUDA wheels).
- A personal **API key** (`sk_…`) from the web app's API Keys panel.

## Install & run
**End users:** download and run `SeasonSprintTracker.exe` from the
[downloads page](https://www.seasonsprint.com/downloads). The wizard takes your
API key, installs dependencies, lets you pick a monitor, and prints the Steam
launch line + a Start-menu entry for the tray launcher.

**From source** (this repo): double-click the repo-root
`INSTALL-TRACKER-WINDOWS.bat`, which `cd`s here and runs `setup.bat`.

Once installed:

- **Steam:** paste into the game's *Properties → Launch Options*:
  ```
  "<install-dir>\launch.bat" %command%
  ```
- **Non-Steam:** launch **"Season Sprint Tracker"** from the Start menu (tray
  launcher). Right-click the tray icon → Quit to stop.

## Configuration (`.env`)
| Var | Meaning |
|-----|---------|
| `AUTH_TOKEN` | Personal API key (`sk_…`) from the web app |
| `MONITOR_INDEX` | Which monitor to read (`mss` convention: `1` = primary, `2+` = secondary) |

The server URL is **hardcoded** in `season_tracker.py` (not configurable, to
avoid leaking the token to a wrong host — fork and edit the constant to
self-host). Runtime files (gitignored): `.last-wtp`, `.tracker-pid`,
`tracker.log`.

## Building the installer
On Windows with Inno Setup 6:

```bat
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\installer.iss
```

This produces `dist\SeasonSprintTracker.exe` — a per-user, no-UAC installer that
ships the Python sources (not a frozen binary); the venv is created on the user's
machine during the wizard. Uninstalling removes the install dir, `.env`, state
files, and `%USERPROFILE%\.season-sprint`.
