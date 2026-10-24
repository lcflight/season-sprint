"""
season_tracker.py — Proof-of-concept Windows tracker for Season Sprint.

Cross-platform Python counterpart of packages/local-linux/season-tracker.c.
Polls a monitor at a fixed interval and, when the lobby's MODES tab is open,
reads the World Tour / Ranked score from the bottom-centre panel by template
matching (screen_reader.py — no OCR engine), then pushes changes to the
Season Sprint server.

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
import io
import os
import queue
import re
import signal
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Force OpenSSL to use certifi's CA bundle. A fresh Windows install's cert
# store can miss modern roots/intermediates (Let's Encrypt, etc.) until
# Windows Update has run, which makes the server's HTTPS pushes and
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
# Last value pushed, per server mode.
STATE_FILES = {
    "world-tour": SCRIPT_DIR / ".last-wtp",
    "ranked": SCRIPT_DIR / ".last-rank",
}
MODE_LABELS = {"world-tour": "World Tour", "ranked": "Ranked"}
PID_FILE = SCRIPT_DIR / ".tracker-pid"
LOG_FILE = SCRIPT_DIR / "tracker.log"

# Hardcoded: there's exactly one production deployment of the Season Sprint
# server, so making this user-configurable just opened a class of typo bugs
# (e.g. .workers.dev → .werkers.dev) that silently leaked the AUTH_TOKEN to
# whatever host the user typo'd into. If you self-host, change this constant
# in your fork.
SERVER_URL = "https://season-sprint-server.lcarthur747.workers.dev"

POLL_INTERVAL_SECS = 1
# While the post-match score panel is up (~2s, and the value counts up for
# the first ~0.5s of it) poll fast so the settled value is read in time.
FAST_POLL_SECS = 0.2
COOLDOWN_SECS = 300  # MODES: per-mode rest after a confirmed read
CONFIRM_READS = 2    # MODES: identical reads in a row that count as "confirmed"
POST_CONFIRM_READS = 3  # post-match: more, so a count-up value never confirms
POST_REST_SECS = 10     # post-match: ignore the panel after confirming (it lasts ~2s)
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


# Canonical API key format produced by the server: "sk_" + 64 lowercase hex.
# See packages/server/src/utils/apiKey.ts (generateApiKey). We validate against
# this at config-load time so a truncated paste — e.g. the 11-char prefix shown
# in the web UI's API Keys list, or a paste interrupted by a stray newline —
# is caught before it gets sent to the server. Cloudflare's edge silently
# returns an empty 400 for some malformed Authorization values, which is
# painful to diagnose without this check.
_API_KEY_RE = re.compile(r"^sk_[0-9a-f]{64}$")


def _looks_like_api_key(t: str) -> bool:
    return bool(_API_KEY_RE.match(t))


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


def _print_monitor_list() -> int:
    """Print the physical monitors in a machine-parseable form for the Inno
    Setup installer's monitor-picker page. One line per physical monitor:

        MON|<idx>|<width>x<height>|<left>,<top>

    <idx> is the mss index (1-based into sct.monitors, skipping the index-0
    "all monitors" bounding box) — exactly the value written as MONITOR_INDEX
    and consumed by _grab_points_region, so the installer's picker, the saved
    config, and the running tracker all agree on what each number means.

    The "MON|" prefix lets the installer ignore unrelated stdout noise — most
    notably the "=== Tracker started ===" banner that the module-level _Tee
    emits at import time into whatever stdout the installer redirects to a file.
    """
    monitors = _list_monitors()
    physical = monitors[1:]  # skip the "all" bounding-box at index 0
    for i, m in enumerate(physical, start=1):
        print(f"MON|{i}|{m['width']}x{m['height']}|{m['left']},{m['top']}")
    return 0


def _prompt_config() -> Config:
    existing = _parse_env_file(ENV_FILE)

    print("═══ Season Sprint Tracker — Setup ═══\n")
    print(f"Server: {SERVER_URL}\n")

    auth_token = existing.get("AUTH_TOKEN", "").strip()
    if not _looks_like_api_key(auth_token):
        if auth_token:
            # Stored value is present but malformed. Tell the user why we're
            # re-prompting so they don't think the script is just being weird.
            print("Saved AUTH_TOKEN is not a valid API key — re-entering.")
        print("AUTH_TOKEN — your personal API key (sk_ + 64 hex chars, 67 chars total)")
        print("  Generate one from the web app: click 'API Keys' in the header,")
        print("  then copy the full key shown in the green banner — not the")
        print("  truncated prefix shown in the list below it.")
        auth_token = ""
        while not _looks_like_api_key(auth_token):
            auth_token = getpass.getpass("AUTH_TOKEN (hidden): ").strip()
            if not auth_token:
                continue
            if not _looks_like_api_key(auth_token):
                print(
                    f"  That doesn't look like an API key "
                    f"(got {len(auth_token)} chars, expected 67 starting with 'sk_'). "
                    f"Try again."
                )
                auth_token = ""

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


def load_config_or_none() -> Optional[Config]:
    """Load config from .env, returning None if it's missing/invalid instead
    of prompting. Used by the tray launcher, which runs under pythonw.exe with
    no console — an interactive prompt there would hang or crash.

    Rejects an empty or malformed AUTH_TOKEN: an `AUTH_TOKEN=` line (empty
    value) used to propagate an empty token to push_record, which sent
    `Authorization: ` and got bounced at Cloudflare's edge with an opaque empty
    400. A truncated token (e.g. the 11-char prefix the web UI shows in the API
    Keys list) produces the same CF 400, so it's rejected here too.
    """
    env = _parse_env_file(ENV_FILE)
    auth_token = env.get("AUTH_TOKEN", "").strip()
    monitor_raw = env.get("MONITOR_INDEX", "").strip()
    if (
        not _looks_like_api_key(auth_token)
        or not monitor_raw.isdigit()
        or int(monitor_raw) <= 0
    ):
        return None
    return Config(auth_token=auth_token, monitor_index=int(monitor_raw))


def load_or_prompt_config() -> Config:
    cfg = load_config_or_none()
    if cfg is None:
        return _prompt_config()
    return cfg


# ── Capture ───────────────────────────────────────────────────────────────────


def _grab(sct: mss.base.MSSBase, monitor_index: int, size: Optional[tuple[int, int]] = None) -> np.ndarray:
    """Grab the chosen monitor as RGB — all of it, or just the top-left
    (width, height) zone when size is given."""
    mon = sct.monitors[monitor_index]
    if size is not None:
        mon = {"left": mon["left"], "top": mon["top"], "width": size[0], "height": size[1]}
    shot = sct.grab(mon)
    return np.frombuffer(shot.rgb, dtype=np.uint8).reshape(shot.height, shot.width, 3)


def reading_details(r) -> list[str]:
    """Human-readable match scores for the diagnostics panel / sidecars."""
    lines = [f"MODES tab match: {r.gate_score:.2f}"]
    for name, score in r.header_scores.items():
        where = "post-match header" if r.screen == "post" else "header"
        lines.append(f"{where} '{name}' match: {score:.2f}")
    if r.value is not None:
        lines.append(f"value: {r.value}" + (f" / {r.max_value}" if r.max_value is not None else ""))
    if r.total is not None and r.total != r.value:
        lines.append(f"season total: {r.total}")
    return lines


# ── Diagnostics buffer ────────────────────────────────────────────────────────
#
# Backing store for the tray app's "OCR diagnostics" window (debug_panel.py).
# Disabled by default: the tracker's standard behavior is to discard each
# captured frame as soon as OCR has run. While the panel has buffering
# switched on, the last DEBUG_BUFFER_SIZE captures are kept in memory (as
# PNG bytes) together with their OCR output and verdict, so the user can see
# exactly what the tracker saw. "Protecting" a capture pulls it out of the
# rolling buffer and writes it to debug_captures\ so it can be shared.

DEBUG_BUFFER_SIZE = 30
DEBUG_CAPTURE_DIR = SCRIPT_DIR / "debug_captures"


@dataclass
class CaptureRecord:
    seq: int
    timestamp: dt.datetime
    png_bytes: bytes
    details: list  # match scores etc., one line each
    mode: Optional[str]
    value: Optional[int]
    verdict: str
    read_ms: float
    protected: bool = False
    saved_path: Optional[Path] = None


class DebugBuffer:
    """Thread-safe rolling buffer of recent captures.

    Written to by the tracker loop (its thread), toggled and read by the
    diagnostics panel (its own Tk thread). UI updates flow one way through
    `events`, a queue of tuples the panel polls:

        ("added",   CaptureRecord)  — new capture appended
        ("evicted", seq)            — oldest capture rolled off the end
        ("cleared",)                — buffering switched off, records dropped
        ("status",  text)           — tracker state note (e.g. cooldown)
    """

    def __init__(self, maxlen: int = DEBUG_BUFFER_SIZE):
        self.maxlen = maxlen
        self._lock = threading.Lock()
        self._records: deque = deque(maxlen=maxlen)
        self._seq = 0
        self._enabled = False
        self.events: "queue.Queue[tuple]" = queue.Queue()

    @property
    def enabled(self) -> bool:
        with self._lock:
            return self._enabled

    def set_enabled(self, enabled: bool) -> None:
        with self._lock:
            if enabled == self._enabled:
                return
            self._enabled = enabled
            if not enabled:
                self._records.clear()
        if not enabled:
            self.events.put(("cleared",))

    def add(self, frame, details: list, mode: Optional[str], value: Optional[int],
            verdict: str, read_ms: float) -> None:
        """Record one capture. No-op (including the PNG encode) when
        buffering is off, so the tracker's default hot path is unchanged."""
        with self._lock:
            if not self._enabled:
                return
            self._seq += 1
            seq = self._seq

        from PIL import Image  # deferred: only paid when buffering

        img = Image.fromarray(frame)
        img.thumbnail((1280, 1280))  # full-monitor frames; keep the buffer small
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        rec = CaptureRecord(
            seq=seq,
            timestamp=dt.datetime.now(),
            png_bytes=buf.getvalue(),
            details=list(details),
            mode=mode,
            value=value,
            verdict=verdict,
            read_ms=read_ms,
        )

        with self._lock:
            if not self._enabled:  # switched off while we were encoding
                return
            evicted = self._records[0].seq if len(self._records) == self.maxlen else None
            self._records.append(rec)
        if evicted is not None:
            self.events.put(("evicted", evicted))
        self.events.put(("added", rec))

    def post_status(self, text: str) -> None:
        if self.enabled:
            self.events.put(("status", text))

    def protect(self, seq: int) -> Optional[Path]:
        """Pull a capture out of the rolling buffer so it can't be evicted,
        and save it to debug_captures\\ (PNG + .txt sidecar with the OCR
        output and verdict). Returns the PNG path, or None if the capture
        already rolled off."""
        with self._lock:
            rec = next((r for r in self._records if r.seq == seq), None)
            if rec is None:
                return None
            self._records.remove(rec)
            rec.protected = True

        DEBUG_CAPTURE_DIR.mkdir(exist_ok=True)
        stem = f"capture-{rec.timestamp.strftime('%Y%m%d-%H%M%S')}-{rec.seq}"
        png_path = DEBUG_CAPTURE_DIR / f"{stem}.png"
        png_path.write_bytes(rec.png_bytes)
        sidecar = [
            f"captured:  {rec.timestamp.isoformat(timespec='seconds')}",
            f"read time: {rec.read_ms:.0f}ms",
            f"verdict:   {rec.verdict}",
            f"mode:      {rec.mode}",
            f"value:     {rec.value}",
            "",
            "match details:",
        ] + [f"  {line}" for line in rec.details]
        (DEBUG_CAPTURE_DIR / f"{stem}.txt").write_text("\n".join(sidecar) + "\n", encoding="utf-8")
        rec.saved_path = png_path
        return png_path


DEBUG_BUFFER = DebugBuffer()


# ── State + HTTP push ─────────────────────────────────────────────────────────


def read_state(mode: str) -> int:
    path = STATE_FILES[mode]
    if not path.is_file():
        return -1
    try:
        return int(path.read_text().strip())
    except (ValueError, OSError):
        return -1


def write_state(mode: str, value: int) -> None:
    try:
        STATE_FILES[mode].write_text(str(value))
    except OSError as e:
        print(f"[warn] could not write state: {e}")


def push_record(cfg: Config, mode: str, win_points: int) -> bool:
    import json

    today = dt.date.today().isoformat()
    url = f"{SERVER_URL}/me/records"
    body = {"date": today, "winPoints": win_points, "mode": mode}
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
    print(f"[push] {mode} winPoints={win_points} date={today} HTTP {r.status_code} {r.reason or ''} {'OK' if ok else 'FAIL'}".rstrip())
    if not ok:
        # Always log the response body — even if empty — so the user can
        # tell apart "server returned an error message" from "CF rejected
        # the request before it reached the worker" (which gives an empty
        # body). 4xx usually carries a server message; 5xx is often empty
        # or a generic Cloudflare page. Strip newlines so it stays one log
        # line.
        resp_body = (r.text or "").strip().replace("\n", " ")[:500]
        print(f"[push]   response body: {resp_body if resp_body else '<empty>'}")
        # Surface CF-specific + Clerk-specific headers that pinpoint
        # whether the response came from our worker or CF's edge layer.
        # x-clerk-auth-* headers are set by the server when Clerk rejects
        # the auth (e.g. "Invalid JWT form") and are the most useful clue
        # for diagnosing token problems.
        cf_ray = r.headers.get("CF-Ray") or r.headers.get("cf-ray")
        server_hdr = r.headers.get("Server")
        clerk_reason = r.headers.get("x-clerk-auth-reason")
        clerk_message = r.headers.get("x-clerk-auth-message")
        if cf_ray or server_hdr:
            print(f"[push]   response server={server_hdr!r} cf-ray={cf_ray!r}")
        if clerk_reason or clerk_message:
            print(f"[push]   clerk auth reason={clerk_reason!r} message={clerk_message!r}")
    return ok


# ── Main loop ─────────────────────────────────────────────────────────────────


_stop = False


def _handle_signal(signum, _frame):
    global _stop
    _stop = True
    print(f"\n[signal {signum}] shutting down after current cycle ...")


@dataclass
class _Track:
    """Confirmation state for one (screen, mode) pair — e.g. World Tour on
    the MODES tab, World Tour on the post-match panel. Each rests
    independently after a confirmed read, so a MODES confirmation never
    hides the next post-match result."""
    last_val: Optional[int] = None
    reads: int = 0
    rest_until: float = 0.0  # time.monotonic() deadline; 0 = active


def _read_screen(sct, cfg: Config, sr, templates):
    """One poll: cheap zone grabs first, the full monitor only when needed.
    Returns (reading, frame or None)."""
    mon = sct.monitors[cfg.monitor_index]
    W, H = mon["width"], mon["height"]

    # MODES tab: small top-left zone (~3% of the screen).
    frame = _grab(sct, cfg.monitor_index, sr.gate_zone(W, H))
    on_modes, gate = sr.check_gate(frame, templates, H)
    if on_modes:
        frame = _grab(sct, cfg.monitor_index)
        return sr.read_frame(frame, templates), frame

    # Post-match panel: small centre zone (~4%), which holds the value too.
    if templates.post_headers:
        x0, y0, zw, zh = sr.post_zone(W, H)
        mon_zone = {"left": mon["left"] + x0, "top": mon["top"] + y0, "width": zw, "height": zh}
        shot = sct.grab(mon_zone)
        frame = np.frombuffer(shot.rgb, dtype=np.uint8).reshape(shot.height, shot.width, 3)
        r = sr.read_post(frame, templates, H)
        if r.screen == "post":
            r.gate_score = gate
            return r, frame

    r = sr.Reading(gate_score=gate, verdict=f"not on the MODES tab (tab match {gate:.2f})")
    return r, frame


def main_loop(cfg: Config) -> None:
    # Imported here, not at module top: the installer runs this file from a
    # temp folder (for --list-monitors) where screen_reader.py isn't present.
    import screen_reader as sr

    templates = sr.Templates.load(sr.find_templates_dir(SCRIPT_DIR))
    print(f"[boot] tracker started. monitor={cfg.monitor_index} server={SERVER_URL}")
    print(f"[boot] MODES headers: {', '.join(templates.headers)}; "
          f"post-match headers: {', '.join(templates.post_headers) or 'none'}")
    print(f"[boot] polling every {POLL_INTERVAL_SECS}s "
          f"({FAST_POLL_SECS}s while the post-match panel is up); Ctrl+C to quit.")

    tracks: dict[tuple[str, str], _Track] = {}
    last_status = None  # (screen, header) of the last idle line logged

    with mss.MSS() as sct:
        while not _stop:
            now = time.monotonic()
            t0 = now
            try:
                r, frame = _read_screen(sct, cfg, sr, templates)
                # The season total (World Tour: converted from fans in the badge).
                mode, value, verdict = r.mode, r.total, r.verdict
                status = (r.screen, r.header)
                details = reading_details(r)
            except Exception as e:
                print(f"[err] capture/read: {e}")
                frame, r = None, None
                mode, value, verdict, details = None, None, f"capture/read error: {e}", []
                status = ("error", str(e))

            dt_ms = (time.monotonic() - t0) * 1000
            on_post = r is not None and r.screen == "post"
            interval = FAST_POLL_SECS if on_post else POLL_INTERVAL_SECS

            if frame is not None:
                try:
                    DEBUG_BUFFER.add(frame, details, mode, value, verdict, dt_ms)
                except Exception as e:
                    # Diagnostics must never take down the tracker itself.
                    print(f"[warn] debug buffer: {e}")

            key = (r.screen, mode) if (r is not None and mode and value is not None) else None
            # Anything not read this poll loses its streak.
            for k, tr in tracks.items():
                if k != key:
                    tr.reads, tr.last_val = 0, None

            if key is None:
                # Polls run every second (faster on the post-match panel) and
                # tracker.log isn't trimmed, so only log idle states on change.
                if status != last_status:
                    print(f"  [read {dt_ms:.0f}ms] {verdict}")
                    last_status = status
                _sleep_interruptible(interval)
                continue

            last_status = None
            tr = tracks.setdefault(key, _Track())
            post = key[0] == "post"
            label = MODE_LABELS[mode] + (" (post-match)" if post else "")
            if now < tr.rest_until:
                _sleep_interruptible(interval)
                continue

            if value == tr.last_val:
                tr.reads += 1
            else:
                tr.reads, tr.last_val = 1, value
            print(f"  [read {dt_ms:.0f}ms] {label}={value} read #{tr.reads}")

            if tr.reads >= (POST_CONFIRM_READS if post else CONFIRM_READS):
                prior = read_state(mode)
                if value != prior:
                    print(f"[change] {label} {prior} → {value}, pushing ...")
                    if push_record(cfg, mode, value):
                        write_state(mode, value)
                else:
                    print(f"[steady] {label}={value} unchanged from last push")
                rest = POST_REST_SECS if post else COOLDOWN_SECS
                tr.rest_until = time.monotonic() + rest
                tr.reads, tr.last_val = 0, None
                if not post:
                    resume = dt.datetime.now() + dt.timedelta(seconds=rest)
                    print(f"[cooldown] {label} confirmed; resting until {resume:%H:%M:%S}")
                    DEBUG_BUFFER.post_status(
                        f"{label} confirmed — not re-read until {resume:%H:%M:%S}"
                    )

            _sleep_interruptible(interval)


def _sleep_interruptible(total_secs: float) -> None:
    """Sleep in small slices so Ctrl+C is responsive."""
    end = time.monotonic() + total_secs
    while not _stop and time.monotonic() < end:
        time.sleep(min(0.5, end - time.monotonic()))


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> int:
    # Non-interactive query used by the installer's wizard to build its
    # monitor-picker page. Handled before anything else (no signal handlers,
    # no config load, no prompts) so it stays a fast, side-effect-free probe.
    if "--list-monitors" in sys.argv[1:]:
        return _print_monitor_list()

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
