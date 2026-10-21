# Season Sprint — Windows tracker

The Windows counterpart to [`packages/local-linux`](../local-linux). It watches
THE FINALS' lobby **MODES** tab and the post-match score panel, reads your
**World Tour** and **Ranked** scores straight off the display, and pushes changes to your Season Sprint account automatically
while you play. Distributed as a one-click installer (`SeasonSprintTracker.exe`).

## How it works
A single Python program (`season_tracker.py`):

1. **Capture** — grabs a small top-left zone of your chosen monitor with **mss** every
   second (the whole monitor only when the MODES tab is showing).
2. **Read** — `screen_reader.py` template-matches the yellow MODES tab, then the
   score header at the bottom centre ("WORLD TOUR SCORE", "PLACEMENT ROUNDS", or
   a ranked header once one is added), then classifies the yellow digits under
   it against digit templates. No OCR engine — plain numpy, ~70ms a frame. The
   white "/ max" is read too and a value above it is rejected. Needs 900p or
   higher. Templates live in [`../tracker-templates`](../tracker-templates).
3. **Post-match** — when not on MODES it also checks a small centre zone for the
   post-match "WORLD TOUR SCORE" panel, polling every 0.2s while it's up and
   requiring three identical reads (the value counts up for ~0.5s).
4. **Sync** — after two identical consecutive reads (three post-match), if the value differs from
   local state (`.last-wtp` / `.last-rank`) it `POST`s `{ date, winPoints, mode }`
   to the server with your API key; that mode then rests ~5 min.

The token is validated (`sk_` + 64 hex) before sending and masked in logs, and
SSL is pinned to certifi's CA bundle so HTTPS works on fresh Windows installs.

## Files
- `season_tracker.py` — the tracker (capture → read → POST), config, state, and
  logging. Supports `--setup-only`, `--list-monitors`.
- `tray.py` — system-tray launcher for **non-Steam** players (Epic/Xbox/direct);
  runs headless via `pythonw.exe`, single-instance, with a tray menu.
- `launch.bat` — **Steam** wrapper (`launch.bat %command%`): starts the tracker
  headless, runs the game, kills the tracker on exit. Run with no args to test
  in a console.
- `setup.bat` / `install-deps.bat` — interactive setup and (idempotent)
  dependency bootstrap: find/install Python, create the venv, pip-install
  requirements.
- `screen_reader.py` — the template-matching reader (C port lives in
  `local-linux/season-tracker.c`; keep them in step).
- `watch-tracker.bat` — live-tails `tracker.log`. `test_reader.py` — runs the
  reader against a saved full-screen screenshot to debug recognition.
- `requirements.txt` — `mss`, `requests`, `numpy`, `Pillow`, `pystray`.
- `installer/installer.iss` — Inno Setup 6 script that builds the installer.
- `.env.example` — config template (`AUTH_TOKEN`, `MONITOR_INDEX`).

## Prerequisites
- **Windows x64**. Python **3.9+** (the installer/`install-deps.bat` will install
  Python 3.12 via `winget` if it's missing).
- The dependency bootstrap creates a venv at `%USERPROFILE%\.season-sprint\venv`
  — outside the repo, stable across drives/updates.
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
