"""
tray.py — system-tray launcher for the Season Sprint tracker.

For players who don't launch through Steam (Epic, Xbox, a direct .exe, etc.),
the Steam wrapper (launch.bat %command%) never fires. This gives them a
forward-facing way to run the tracker: a Start-menu shortcut ("Season Sprint
Tracker", searchable) starts this launcher, which runs the tracker in the
background and shows a system-tray icon. Right-click the icon > Quit to stop it
when you're done playing.

Steam users don't need this — launch.bat starts/stops the tracker automatically
with the game.

Launched headless via pythonw.exe (no console), so all tracker output goes to
tracker.log (see the _Tee in season_tracker.py). Configuration must already
exist (the installer writes .env); if it doesn't, we point the user at setup.
"""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import threading
from pathlib import Path

import season_tracker as st

SCRIPT_DIR = Path(__file__).resolve().parent

# Win32 single-instance guard. Two tray instances would run two tracker loops
# (double OCR + double pushes, racing on tracker.log / .last-wtp). A named
# mutex is the simplest cross-process lock; ERROR_ALREADY_EXISTS (183) means
# another instance already holds it.
_MUTEX_NAME = "Global\\SeasonSprintTracker"
_ERROR_ALREADY_EXISTS = 183
MB_OK = 0x0
MB_ICONERROR = 0x10
MB_ICONINFORMATION = 0x40


def _message_box(text: str, title: str = "Season Sprint Tracker", flags: int = MB_OK) -> None:
    try:
        ctypes.windll.user32.MessageBoxW(None, text, title, flags)
    except Exception:
        # No user32 (non-Windows) or headless — nothing useful to do.
        pass


def _acquire_single_instance() -> bool:
    """Return True if we got the lock, False if a tracker is already running.
    The handle is intentionally leaked for the process lifetime — the OS frees
    the mutex when we exit, releasing the lock for the next launch."""
    try:
        ctypes.windll.kernel32.CreateMutexW(None, False, _MUTEX_NAME)
        return ctypes.windll.kernel32.GetLastError() != _ERROR_ALREADY_EXISTS
    except Exception:
        # Can't create a mutex (non-Windows) — don't block startup.
        return True


def _load_icon_image():
    from PIL import Image
    return Image.open(SCRIPT_DIR / "icon.png")


def main() -> int:
    if not _acquire_single_instance():
        _message_box(
            "The Season Sprint tracker is already running.\n\n"
            "Look for its icon in the system tray (near the clock).",
            flags=MB_OK | MB_ICONINFORMATION,
        )
        return 0

    cfg = st.load_config_or_none()
    if cfg is None:
        _message_box(
            "The tracker isn't set up yet.\n\n"
            "Opening setup so you can enter your API key.",
            flags=MB_OK | MB_ICONINFORMATION,
        )
        try:
            subprocess.Popen(["cmd", "/c", str(SCRIPT_DIR / "setup.bat")], cwd=str(SCRIPT_DIR))
        except Exception:
            pass
        return 1

    import pystray

    # Record our PID so the lifecycle matches the Steam path (which writes the
    # same file); best-effort.
    try:
        st.PID_FILE.write_text(str(os.getpid()))
    except OSError:
        pass

    tracker_thread = threading.Thread(target=st.main_loop, args=(cfg,), daemon=True)

    def on_open_diagnostics(icon, item):
        try:
            # Imported lazily so a broken/missing tkinter can't stop the
            # tray (and tracker) from starting at all.
            import debug_panel
            debug_panel.open_panel()
        except Exception as e:
            _message_box(
                f"Could not open the diagnostics panel:\n{e}",
                flags=MB_OK | MB_ICONERROR,
            )

    def on_open_log(icon, item):
        try:
            os.startfile(str(st.LOG_FILE))  # noqa: S606 (Windows-only, trusted path)
        except Exception:
            pass

    def on_quit(icon, item):
        st._stop = True  # main_loop + _sleep_interruptible poll this
        icon.stop()

    icon = pystray.Icon(
        "season_sprint",
        _load_icon_image(),
        "Season Sprint Tracker",
        menu=pystray.Menu(
            pystray.MenuItem("OCR diagnostics", on_open_diagnostics),
            pystray.MenuItem("Open log", on_open_log),
            pystray.MenuItem("Quit", on_quit),
        ),
    )

    tracker_thread.start()
    try:
        icon.run()  # blocks the main thread until on_quit calls icon.stop()
    finally:
        st._stop = True
        tracker_thread.join(timeout=5)
        try:
            st.PID_FILE.unlink(missing_ok=True)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
