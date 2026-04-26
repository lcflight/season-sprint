"""
season_tracker.py — Proof-of-concept Windows tracker for Season Sprint.

Cross-platform Python port of packages/local/season-tracker.c. Polls a
monitor at a fixed interval, runs EasyOCR on the bottom-centre region
to find "WORLD TOUR POINTS", and pushes changes to the Season Sprint
server.

First run (interactive setup):
    python season_tracker.py

Run with an existing .env:
    python season_tracker.py

Config is read from .env next to this script (same format as the Linux
tracker's .env, with MONITOR_INDEX replacing SHOT_GEOMETRY).
"""

from __future__ import annotations

import datetime as dt
import getpass
import os
import signal
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Force OpenSSL to use certifi's CA bundle. A fresh Windows install's cert
# store can miss modern roots/intermediates (Let's Encrypt, etc.) until
# Windows Update has run, which makes EasyOCR's model download and HTTPS
# probes fail with SSL: CERTIFICATE_VERIFY_FAILED. certifi ships a current
# Mozilla bundle and is a transitive dependency of requests, so it's
# always present in the venv.
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

import mss
import numpy as np
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPT_DIR / ".env"
STATE_FILE = SCRIPT_DIR / ".last-wtp"
PID_FILE = SCRIPT_DIR / ".tracker-pid"
LOG_FILE = SCRIPT_DIR / "tracker.log"

# Hardcoded: there's exactly one production deployment of the Season Sprint
# server, so making this user-configurable just opened a class of typo bugs
# (e.g. .workers.dev → .werkers.dev) that silently leaked the AUTH_TOKEN to
# whatever host the user typo'd into. If you self-host, change this constant
# in your fork.
SERVER_URL = "https://season-sprint-server.lcarthur747.workers.dev"

POLL_INTERVAL_SECS = 3
COOLDOWN_SECS = 300  # 5 min after a confirmed read
CONFIRM_READS = 2    # how many identical reads in a row count as "confirmed"
HTTP_TIMEOUT = 10


# ── Tee stdout/stderr to a log file ───────────────────────────────────────────
#
# When launched headlessly via pythonw.exe (no console window), all print()
# output would otherwise vanish. Tee'ing to tracker.log gives testers a way
# to verify the tracker is working — they can live-tail it from
# watch-tracker.bat while the game runs.

class _Tee:
    def __init__(self, *streams):
        # pythonw.exe sets sys.__stdout__ to None; filter those out.
        self.streams = [s for s in streams if s is not None]

    def write(self, data):
        for s in self.streams:
            try:
                s.write(data)
            except Exception:
                pass
        self.flush()

    def flush(self):
        for s in self.streams:
            try:
                s.flush()
            except Exception:
                pass

try:
    _log_handle = open(LOG_FILE, "a", buffering=1, encoding="utf-8")
    sys.stdout = _Tee(sys.__stdout__, _log_handle)
    sys.stderr = _Tee(sys.__stderr__, _log_handle)
    print(f"\n=== Tracker started {dt.datetime.now().isoformat(timespec='seconds')} ===")
except OSError:
    # Couldn't open the log file (read-only install dir, etc.) — fall back to
    # whatever stdout the runtime gave us.
    pass


# ── Config ────────────────────────────────────────────────────────────────────


@dataclass(repr=False)
class Config:
    auth_token: str
    monitor_index: int  # mss convention: 0 = all, 1 = primary, 2+ = others

    def __repr__(self) -> str:
        # Redact auth_token. Everything printed by this script is tee'd to
        # tracker.log (see _Tee below), which watch-tracker.bat happily
        # tails — a stray `print(cfg)` or an exception whose repr includes
        # the Config would otherwise leak the token to a file the user can
        # easily share. Never log self.auth_token directly anywhere else.
        return f"Config(auth_token={_mask_token(self.auth_token)!r}, monitor_index={self.monitor_index})"


def _mask_token(t: str) -> str:
    """Display-safe form of an AUTH_TOKEN. Used by Config.__repr__ and the
    push-request dump so the raw token never lands in tracker.log."""
    return (t[:5] + "…" + t[-4:]) if len(t) > 12 else "<redacted>"


def _parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val.strip()
    return out


def _write_env_file(path: Path, values: dict[str, str]) -> None:
    # Create with restrictive perms before writing the token.
    path.touch(exist_ok=True)
    try:
        os.chmod(path, 0o600)
    except OSError:
        # Windows tolerates chmod but permissions are managed differently;
        # the file ends up private to the current user by default.
        pass
    lines = [f"{k}={v}" for k, v in values.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _list_monitors() -> list[dict]:
    with mss.MSS() as sct:
        # Index 0 is the virtual "all monitors" bounding box; 1+ are physical.
        return list(sct.monitors)


def _prompt_config() -> Config:
    existing = _parse_env_file(ENV_FILE)

    print("═══ Season Sprint Tracker — Setup ═══\n")
    print(f"Server: {SERVER_URL}\n")

    auth_token = existing.get("AUTH_TOKEN", "")
    if not auth_token:
        print("AUTH_TOKEN — your personal API key (starts with sk_)")
        print("  Generate one from the web app: click 'API Keys' in the header.")
        while not auth_token:
            auth_token = getpass.getpass("AUTH_TOKEN (hidden): ").strip()

    monitor_index = 0
    if existing.get("MONITOR_INDEX", "").isdigit():
        monitor_index = int(existing["MONITOR_INDEX"])
    if monitor_index <= 0:
        monitors = _list_monitors()
        physical = monitors[1:]  # skip the "all" bounding-box at index 0
        print("\nDetected monitors:")
        for i, m in enumerate(physical, start=1):
            print(f"  {i}) {m['width']}x{m['height']} @ ({m['left']},{m['top']})")
        if len(physical) == 1:
            monitor_index = 1
            print(f"Using monitor 1.")
        else:
            while True:
                raw = input(f"Which monitor runs the game? [1-{len(physical)}]: ").strip()
                if raw.isdigit() and 1 <= int(raw) <= len(physical):
                    monitor_index = int(raw)
                    break

    cfg = Config(auth_token=auth_token, monitor_index=monitor_index)

    _write_env_file(ENV_FILE, {
        "AUTH_TOKEN": cfg.auth_token,
        "MONITOR_INDEX": str(cfg.monitor_index),
    })
    print(f"\nConfig saved to {ENV_FILE}")

    print("Testing connection ...")
    ok, code = _probe_server(cfg)
    if ok:
        print(f"  OK — server reachable (HTTP {code}).")
    else:
        print(f"  WARNING — probe returned HTTP {code}. Continuing anyway.")

    return cfg


def _probe_server(cfg: Config) -> tuple[bool, int]:
    try:
        r = requests.get(
            f"{SERVER_URL}/me/records",
            headers={"Authorization": cfg.auth_token},
            timeout=HTTP_TIMEOUT,
        )
        return r.status_code == 200, r.status_code
    except requests.RequestException:
        return False, 0


def load_or_prompt_config() -> Config:
    env = _parse_env_file(ENV_FILE)
    needed = {"AUTH_TOKEN", "MONITOR_INDEX"}
    # Re-prompt if any field is missing OR present-but-empty/invalid.
    # An `AUTH_TOKEN=` line in .env (empty value) used to pass issubset()
    # and silently propagate an empty token to push_record, which sent
    # `Authorization: ` and got bounced at Cloudflare's edge with an empty
    # 400 — invisible in wrangler tail and impossible to diagnose without
    # the request dump.
    auth_token = env.get("AUTH_TOKEN", "").strip()
    monitor_raw = env.get("MONITOR_INDEX", "").strip()
    if (
        not needed.issubset(env)
        or not auth_token
        or not monitor_raw.isdigit()
        or int(monitor_raw) <= 0
    ):
        return _prompt_config()
    return Config(
        auth_token=auth_token,
        monitor_index=int(monitor_raw),
    )


# ── Capture + OCR ─────────────────────────────────────────────────────────────


def _grab_points_region(sct: mss.base.MSSBase, monitor_index: int) -> np.ndarray:
    """Grab the bottom-centre third × bottom fifth of the chosen monitor.
    Mirrors the region the Linux tracker sends to EasyOCR."""
    mon = sct.monitors[monitor_index]
    w, h = mon["width"], mon["height"]
    pts_w = w // 3
    pts_h = h // 5
    pts_x = mon["left"] + (w - pts_w) // 2
    pts_y = mon["top"] + (h - pts_h)
    shot = sct.grab({"left": pts_x, "top": pts_y, "width": pts_w, "height": pts_h})
    # mss returns BGRA; convert to RGB for EasyOCR.
    frame = np.frombuffer(shot.rgb, dtype=np.uint8).reshape(pts_h, pts_w, 3)
    return frame


def parse_wtp_from_ocr(results) -> Optional[int]:
    """Given EasyOCR readtext() results, return the first 'current points'
    number located spatially below a 'WORLD TOUR POINTS' header. Mirrors
    the logic in packages/local/ocr_preprocess.py."""
    header_bbox = None
    for bbox, text, _conf in results:
        up = text.upper()
        if "TOUR" in up and "POINT" in up:
            header_bbox = bbox
            break

    if header_bbox is None:
        return None

    header_top = min(pt[1] for pt in header_bbox)
    header_bottom = max(pt[1] for pt in header_bbox)
    header_left = min(pt[0] for pt in header_bbox)
    header_right = max(pt[0] for pt in header_bbox)
    header_h = header_bottom - header_top

    candidates: list[tuple[float, int]] = []
    for bbox, text, _conf in results:
        t_top = min(pt[1] for pt in bbox)
        t_bottom = max(pt[1] for pt in bbox)
        t_cx = (min(pt[0] for pt in bbox) + max(pt[0] for pt in bbox)) / 2

        if t_bottom < header_top:
            continue
        if t_top > header_bottom + header_h * 3:
            continue
        if t_cx < header_left - header_h or t_cx > header_right + header_h:
            continue

        cleaned = text.replace(",", "").replace("_", "").strip()
        if cleaned.isdigit():
            candidates.append((t_cx, int(cleaned)))
        elif "/" in cleaned:
            # e.g. "1234 / 2400" — left side is current
            left, _, _ = cleaned.partition("/")
            left = left.strip()
            if left.isdigit():
                return int(left)

    candidates.sort(key=lambda c: c[0])
    return candidates[0][1] if candidates else None


# ── State + HTTP push ─────────────────────────────────────────────────────────


def read_state() -> int:
    if not STATE_FILE.is_file():
        return -1
    try:
        return int(STATE_FILE.read_text().strip())
    except (ValueError, OSError):
        return -1


def write_state(wtp: int) -> None:
    try:
        STATE_FILE.write_text(str(wtp))
    except OSError as e:
        print(f"[warn] could not write state: {e}")


def push_record(cfg: Config, win_points: int) -> bool:
    import json

    today = dt.date.today().isoformat()
    url = f"{SERVER_URL}/me/records"
    body = {"date": today, "winPoints": win_points}
    headers = {
        "Authorization": cfg.auth_token,
        "Content-Type": "application/json",
    }

    # Dump the full request before sending so the user can see exactly what
    # left their machine when something goes wrong. Auth header is masked
    # via _mask_token — never log the raw token, since this all goes to
    # tracker.log which watch-tracker.bat tails.
    safe_headers = {**headers, "Authorization": _mask_token(cfg.auth_token)}
    print(f"[push] -> POST {url}")
    print(f"[push]    headers: {safe_headers}")
    print(f"[push]    body:    {json.dumps(body)}")

    try:
        r = requests.post(url, json=body, headers=headers, timeout=HTTP_TIMEOUT)
    except requests.RequestException as e:
        print(f"[push] FAILED: {e}")
        return False
    ok = r.status_code in (200, 201)
    print(f"[push] winPoints={win_points} date={today} HTTP {r.status_code} {'OK' if ok else 'FAIL'}")
    if not ok:
        # Include the response body (truncated) so the user can see why.
        # 4xx usually carries a server message; 5xx is often empty or a
        # generic Cloudflare page. Strip newlines so it stays one log line.
        resp_body = (r.text or "").strip().replace("\n", " ")[:500]
        if resp_body:
            print(f"[push]   response body: {resp_body}")
        # Also surface a couple of CF-specific headers that pinpoint
        # whether the response came from our worker or CF's edge layer.
        cf_ray = r.headers.get("CF-Ray") or r.headers.get("cf-ray")
        server_hdr = r.headers.get("Server")
        if cf_ray or server_hdr:
            print(f"[push]   response server={server_hdr!r} cf-ray={cf_ray!r}")
    return ok


# ── Main loop ─────────────────────────────────────────────────────────────────


_stop = False


def _handle_signal(signum, _frame):
    global _stop
    _stop = True
    print(f"\n[signal {signum}] shutting down after current cycle ...")


def main_loop(cfg: Config) -> None:
    print(f"[boot] loading EasyOCR model (first run downloads ~100MB) ...")
    import easyocr  # imported lazily so --setup doesn't pay the cost

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    print(f"[boot] tracker started. monitor={cfg.monitor_index} server={SERVER_URL}")
    print(f"[boot] polling every {POLL_INTERVAL_SECS}s; Ctrl+C to quit.")

    consecutive_reads = 0
    last_val: Optional[int] = None

    with mss.MSS() as sct:
        while not _stop:
            t0 = time.monotonic()
            try:
                frame = _grab_points_region(sct, cfg.monitor_index)
                results = reader.readtext(frame)
                wtp = parse_wtp_from_ocr(results)
            except Exception as e:
                print(f"[err] capture/OCR: {e}")
                wtp = None

            dt_ms = (time.monotonic() - t0) * 1000

            if wtp is None:
                consecutive_reads = 0
                last_val = None
                print(f"  [ocr {dt_ms:.0f}ms] no WTP header found")
            else:
                if wtp == last_val:
                    consecutive_reads += 1
                else:
                    consecutive_reads = 1
                    last_val = wtp

                print(f"  [ocr {dt_ms:.0f}ms] wtp={wtp} read #{consecutive_reads}")

                if consecutive_reads >= CONFIRM_READS:
                    prior = read_state()
                    if wtp != prior:
                        print(f"[change] {prior} → {wtp}, pushing ...")
                        if push_record(cfg, wtp):
                            write_state(wtp)
                    else:
                        print(f"[steady] wtp={wtp} unchanged from last push")
                    print(f"[cooldown] sleeping {COOLDOWN_SECS}s")
                    _sleep_interruptible(COOLDOWN_SECS)
                    consecutive_reads = 0
                    last_val = None
                    continue

            _sleep_interruptible(POLL_INTERVAL_SECS)


def _sleep_interruptible(total_secs: int) -> None:
    """Sleep in small slices so Ctrl+C is responsive."""
    end = time.monotonic() + total_secs
    while not _stop and time.monotonic() < end:
        time.sleep(min(0.5, end - time.monotonic()))


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> int:
    signal.signal(signal.SIGINT, _handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _handle_signal)

    setup_only = "--setup-only" in sys.argv[1:]

    try:
        cfg = load_or_prompt_config()
        if setup_only:
            print("[setup] config saved; exiting without starting tracker.")
            return 0

        # Write our PID so launch.bat can kill us cleanly when the game exits
        # (no PowerShell/WMI round-trip). Best-effort — a missing file just
        # means the Steam wrapper skips the kill, which is harmless.
        try:
            PID_FILE.write_text(str(os.getpid()))
        except OSError as e:
            print(f"[warn] could not write PID file: {e}")

        try:
            main_loop(cfg)
        finally:
            try:
                PID_FILE.unlink(missing_ok=True)
            except OSError:
                pass

        print("[exit] clean shutdown")
        return 0
    except (KeyboardInterrupt, EOFError):
        print("\n[abort] cancelled")
        return 1
    except Exception as e:
        import traceback
        print(f"\n[FATAL] {type(e).__name__}: {e}")
        traceback.print_exc()
        return 2


if __name__ == "__main__":
    sys.exit(main())
