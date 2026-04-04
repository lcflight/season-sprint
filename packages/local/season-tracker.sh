#!/usr/bin/env bash
#
# season-tracker.sh — Automatically capture World Tour Points from screen
# and push changes to the Season Sprint server.
#
# Usage:
#   First run (interactive setup):
#     ./season-tracker.sh
#
#   Steam launch option (after setup):
#     /full/path/to/season-tracker.sh %command%
#
#   The script launches the game, continuously captures the screen region,
#   OCRs for "WORLD TOUR POINTS", and pushes value changes to the API.
#
# Env overrides (all optional):
#   DISPLAY          X11 display (default: :0.0)
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
STATE_FILE="$SCRIPT_DIR/.last-wtp"
LOG_FILE="$SCRIPT_DIR/tracker.log"

DISPLAY="${DISPLAY:-:0.0}"
[[ "$DISPLAY" == ":0" ]] && DISPLAY=":0.0"

# ── Logging ──────────────────────────────────────────────────────────────────

MAX_LOG_LINES=500
_log_count=0
_LOG_PRUNE_EVERY=50

log() {
  local ts
  ts="$(date -Iseconds)"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
  _maybe_prune_log
}

# Log only to file (no terminal output) for routine cycle info
logq() {
  local ts
  ts="$(date -Iseconds)"
  echo "[$ts] $*" >> "$LOG_FILE"
  _maybe_prune_log
}

_maybe_prune_log() {
  _log_count=$((_log_count + 1))
  (( _log_count % _LOG_PRUNE_EVERY == 0 )) || return 0
  local lc
  lc=$(wc -l < "$LOG_FILE" 2>/dev/null) || return
  if (( lc > MAX_LOG_LINES )); then
    local tmp
    tmp=$(mktemp)
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$tmp"
    mv "$tmp" "$LOG_FILE"
  fi
}

# ── Monitor detection ────────────────────────────────────────────────────────

# List connected monitors. Each line: "NAME WxH+X+Y" (offsets may be negative)
# e.g. "DP-1 2560x1440+0+0" or "HDMI-1 1920x1080+-1920+0"
list_monitors() {
  xrandr --query 2>/dev/null \
    | grep ' connected' \
    | sed -n 's/^\([^ ]*\) connected.* \([0-9]\+x[0-9]\+[+-][0-9-]\+[+-][0-9-]\+\).*/\1 \2/p'
}

# Prompt user to pick a monitor. Sets SHOT_GEOMETRY.
# If only one monitor, auto-selects it.
prompt_monitor() {
  local monitors
  monitors=$(list_monitors)
  local count
  count=$(echo "$monitors" | wc -l)

  if [[ -z "$monitors" ]]; then
    echo "WARNING: Could not detect monitors via xrandr."
    echo "Falling back to full primary display."
    read -rp "Enter monitor geometry manually (WxH+X+Y): " SHOT_GEOMETRY
    return
  fi

  if [[ "$count" -eq 1 ]]; then
    local name geo
    read -r name geo <<< "$monitors"
    echo "Detected monitor: $name ($geo)"
    SHOT_GEOMETRY="$geo"
    return
  fi

  echo "Detected monitors:"
  local i=1
  while IFS= read -r line; do
    local name geo
    read -r name geo <<< "$line"
    echo "  $i) $name — $geo"
    i=$((i + 1))
  done <<< "$monitors"

  local choice
  read -rp "Which monitor does the game run on? [1-$count]: " choice
  while ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > count )); do
    read -rp "Enter a number 1-$count: " choice
  done

  local selected
  selected=$(echo "$monitors" | sed -n "${choice}p")
  local name geo
  read -r name geo <<< "$selected"
  echo "Selected: $name ($geo)"
  SHOT_GEOMETRY="$geo"
}

# ── First-run setup ──────────────────────────────────────────────────────────

setup_env() {
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║          Season Sprint Tracker — First-Time Setup       ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo
  echo "This script captures your World Tour Points from the game"
  echo "and pushes them to the Season Sprint server automatically."
  echo

  # Load any existing values so we only prompt for what's missing
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$ENV_FILE"
  fi

  local server_url="${SERVER_URL:-}"
  local auth_token="${AUTH_TOKEN:-}"
  local shot_geometry="${SHOT_GEOMETRY:-}"

  # 1. Server URL
  if [[ -z "$server_url" ]]; then
    echo "SERVER_URL — Your Season Sprint API URL"
    echo "  (e.g. https://your-worker.workers.dev or http://localhost:8787)"
    read -rp "SERVER_URL: " server_url
    while [[ -z "$server_url" ]]; do
      echo "  Server URL cannot be empty."
      read -rp "SERVER_URL: " server_url
    done
    server_url="${server_url%/}"
  fi

  # 2. Auth token
  if [[ -z "$auth_token" ]]; then
    echo
    echo "AUTH_TOKEN — Your personal API key (starts with sk_)"
    echo "  Generate one from the web app: click 'API Keys' in the header."
    read -rp "AUTH_TOKEN: " auth_token
    while [[ -z "$auth_token" ]]; do
      echo "  Auth token cannot be empty."
      read -rp "AUTH_TOKEN: " auth_token
    done
  fi

  # 3. Monitor selection
  if [[ -z "$shot_geometry" ]]; then
    echo
    prompt_monitor
    shot_geometry="$SHOT_GEOMETRY"
  fi

  # Merge into existing .env (preserve any custom overrides like SHOT_INTERVAL)
  _env_set() {
    local key="$1" val="$2"
    if [[ -f "$ENV_FILE" ]] && grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
  }
  touch "$ENV_FILE"
  _env_set SERVER_URL "$server_url"
  _env_set AUTH_TOKEN "$auth_token"
  _env_set SHOT_GEOMETRY "$shot_geometry"
  chmod 600 "$ENV_FILE"

  echo
  echo "Config saved to $ENV_FILE"
  echo

  # Verify connectivity
  echo "Testing connection..."
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: $auth_token" \
    "$server_url/me/records" 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" ]]; then
    echo "Connected successfully."
  elif [[ "$http_code" == "000" ]]; then
    echo "WARNING: Could not reach $server_url — check the URL and try again later."
  else
    echo "WARNING: Server returned HTTP $http_code — check your URL and token."
  fi

  echo
  echo "Setup complete. To use as a Steam launch option, set:"
  echo "  $SCRIPT_DIR/season-tracker.sh %command%"
  echo
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  if [[ -z "${SERVER_URL:-}" || -z "${AUTH_TOKEN:-}" || -z "${SHOT_GEOMETRY:-}" ]]; then
    return 1
  fi
  return 0
}

# ── Timing ──────────────────────────────────────────────────────────────────

# Return current time in milliseconds using bash built-in (no subprocess fork)
now_ms() {
  local rt="${EPOCHREALTIME}"
  local secs="${rt%%.*}"
  local frac="${rt#*.}"
  # Pad/truncate fractional part to 3 digits (milliseconds)
  frac="${frac}000"
  echo "${secs}${frac:0:3}"
}

# ── Screen capture ───────────────────────────────────────────────────────────

parse_geometry() {
  # Parse WxH+X+Y or WxH+-X+Y (offsets can be negative)
  # Sets: _pw _ph _px _py
  if [[ "$SHOT_GEOMETRY" =~ ^([0-9]+)x([0-9]+)([+-][0-9-]+)([+-][0-9-]+)$ ]]; then
    _pw="${BASH_REMATCH[1]}"
    _ph="${BASH_REMATCH[2]}"
    _px="${BASH_REMATCH[3]}"
    _py="${BASH_REMATCH[4]}"
    _px="${_px#+}"
    _py="${_py#+}"
  else
    _pw="${SHOT_GEOMETRY%x*}"
    _ph="${SHOT_GEOMETRY#*x}"
    _px=0
    _py=0
  fi
}

get_capture_geometry() {
  local _pw _ph _px _py
  parse_geometry

  # Bottom center: middle third width, bottom fifth height
  local crop_w=$((_pw / 3))
  local crop_h=$((_ph / 5))
  local grab_x=$((_px + (_pw - crop_w) / 2))
  local grab_y=$((_py + (_ph - crop_h)))

  echo "${crop_w}x${crop_h}" "$grab_x" "$grab_y"
}

# Top-left capture region for the "WORLD TOUR" header text.
# Covers roughly the left quarter, top tenth of the screen.
get_gate_geometry() {
  local _pw _ph _px _py
  parse_geometry

  local crop_w=$((_pw / 4))
  local crop_h=$((_ph / 10))

  echo "${crop_w}x${crop_h}" "$_px" "$_py"
}

FF_ERR_FILE=""

capture_screenshot() {
  local outfile="$1"
  local size="$2" grab_x="$3" grab_y="$4"

  # Reuse a single temp file for ffmpeg stderr across all calls
  [[ -z "$FF_ERR_FILE" ]] && FF_ERR_FILE=$(mktemp)

  # Try ffmpeg x11grab first
  if ffmpeg -y -loglevel error \
    -f x11grab -video_size "$size" \
    -grab_x "$grab_x" -grab_y "$grab_y" \
    -i "$DISPLAY" -frames:v 1 "$outfile" 2>"$FF_ERR_FILE"; then
    return 0
  fi

  # Fallback: xwd + ffmpeg crop
  if grep -q "Protocol not found\|Error opening input" "$FF_ERR_FILE" 2>/dev/null; then
    local xwd_tmp
    xwd_tmp=$(mktemp --suffix=.xwd)
    if xwd -silent -screen -display "$DISPLAY" -out "$xwd_tmp" 2>/dev/null; then
      if ffmpeg -y -loglevel error -i "$xwd_tmp" \
        -vf "crop=${size//x/:}:${grab_x}:${grab_y}" \
        -frames:v 1 "$outfile" 2>/dev/null; then
        rm -f "$xwd_tmp"
        return 0
      fi
    fi
    rm -f "$xwd_tmp"
  fi

  return 1
}

# ── OCR + Parsing ────────────────────────────────────────────────────────────

# Extract World Tour Points from OCR text.
# Returns the current points value (integer) or empty string if not found.
parse_wtp() {
  local ocr_text="$1"

  # Look for "WORLD TOUR POINTS" or "TOUR POINTS" header, then extract
  # the current/max points. Supports two formats:
  #   1. "N / N" on same or next line (tesseract style)
  #   2. Separate lines for each number (EasyOCR style)
  local found_header=0
  local first_num=""

  while IFS= read -r line; do
    local upper
    upper=$(echo "$line" | tr '[:lower:]' '[:upper:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [[ "$found_header" -eq 1 ]]; then
      # Try "current / max" on one line first
      if [[ "$upper" =~ (^|[[:space:]])([0-9][0-9,]*)[[:space:]]*[/|][[:space:]]*([0-9][0-9,]*) ]]; then
        local current="${BASH_REMATCH[2]//,/}"
        local max_val="${BASH_REMATCH[3]//,/}"
        if [[ "$current" =~ ^[0-9]+$ ]] && [[ "$max_val" =~ ^[0-9]+$ ]]; then
          if (( current >= 0 && current <= 2400 && max_val >= 0 && max_val <= 2400 )); then
            echo "$current"
            return 0
          fi
        fi
      fi

      # EasyOCR: numbers come as separate lines after the header.
      # Collect consecutive number pairs — return when current <= max.
      local stripped="${upper//,/}"
      stripped="${stripped//[_]/}"  # strip trailing underscores from OCR artifacts
      if [[ "$stripped" =~ ^[0-9]+$ ]] && (( stripped >= 0 && stripped <= 2400 )); then
        if [[ -z "$first_num" ]]; then
          first_num="$stripped"
        else
          # Got a pair: check if first_num <= stripped (current <= max)
          if (( first_num <= stripped )); then
            echo "$first_num"
            return 0
          fi
          # first_num > stripped — shift: this number becomes the new first
          first_num="$stripped"
        fi
        continue
      fi

      # Non-numeric, non-empty line after header (e.g. "VIEW REWARDS") — stop
      if [[ -n "$upper" ]] && ! [[ "$upper" =~ ^[/|[:space:]]*$ ]]; then
        found_header=0
        first_num=""
      fi
      continue
    fi

    # Check for the header
    if [[ "$upper" == *"TOUR POINTS"* ]]; then
      # Also try to match "current / max" on the same line
      if [[ "$upper" =~ (^|[[:space:]])([0-9][0-9,]*)[[:space:]]*[/|][[:space:]]*([0-9][0-9,]*) ]]; then
        local current="${BASH_REMATCH[2]//,/}"
        local max_val="${BASH_REMATCH[3]//,/}"
        if [[ "$current" =~ ^[0-9]+$ ]] && [[ "$max_val" =~ ^[0-9]+$ ]]; then
          if (( current >= 0 && current <= 2400 && max_val >= 0 && max_val <= 2400 )); then
            echo "$current"
            return 0
          fi
        fi
      fi
      found_header=1
      first_num=""
    fi
  done <<< "$ocr_text"

  return 1
}

# ── API ──────────────────────────────────────────────────────────────────────

push_record() {
  local win_points="$1"
  local today
  today="$(date +%Y-%m-%d)"

  local http_code body
  body=$(mktemp)

  http_code=$(curl -s -o "$body" -w "%{http_code}" \
    -X POST \
    -H "Authorization: $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"date\": \"$today\", \"winPoints\": $win_points}" \
    "$SERVER_URL/me/records" 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    log "Pushed winPoints=$win_points for $today (HTTP $http_code)"
    rm -f "$body"
    return 0
  else
    log "ERROR: Push failed (HTTP $http_code)"
    if [[ -f "$body" ]]; then
      log "Response: $(cat "$body")"
      rm -f "$body"
    fi
    return 1
  fi
}

# ── State ────────────────────────────────────────────────────────────────────

get_last_value() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo ""
  fi
}

set_last_value() {
  echo "$1" > "$STATE_FILE"
}

# ── Main loop ────────────────────────────────────────────────────────────────

exiting=0
game_pid=""
ocr_pid=""

cleanup() {
  exiting=1
  log "Shutting down tracker."
  # Kill the OCR daemon if running
  if [[ -n "$ocr_pid" ]] && kill -0 "$ocr_pid" 2>/dev/null; then
    kill "$ocr_pid" 2>/dev/null
    wait "$ocr_pid" 2>/dev/null || true
  fi
}
trap cleanup INT TERM

# Send an image path to the OCR daemon and read back the response.
# Globals: OCR_IN_FD, OCR_OUT_FD
ocr_daemon_query() {
  local img_path="$1"
  echo "$img_path" >&"$OCR_IN_FD"

  local line result=""
  while IFS= read -r line <&"$OCR_OUT_FD"; do
    [[ "$line" == "---END---" ]] && break
    if [[ -n "$result" ]]; then
      result+=$'\n'"$line"
    else
      result="$line"
    fi
  done
  echo "$result"
}

run_tracker() {
  # Clear Steam's library overrides so system tools (tesseract, curl, ffmpeg) work
  # but preserve PATH so linuxbrew/system tools remain reachable
  unset LD_PRELOAD LD_LIBRARY_PATH STEAM_RUNTIME_LIBRARY_PATH 2>/dev/null || true

  # Ensure linuxbrew is on PATH (Steam may launch with a minimal PATH)
  for p in /home/linuxbrew/.linuxbrew/bin /usr/local/bin; do
    [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
  done

  if ! command -v ffmpeg >/dev/null 2>&1; then
    log "ERROR: ffmpeg is required. Install with: sudo apt install ffmpeg"
    exit 1
  fi
  if ! command -v tesseract >/dev/null 2>&1; then
    log "ERROR: tesseract is required for gate checks. Install with: sudo apt install tesseract-ocr"
    exit 1
  fi
  if ! python3 -c "import easyocr" 2>&1; then
    log "ERROR: EasyOCR is required. Install with: pip3 install easyocr"
    exit 1
  fi

  # Start the OCR daemon (loads model once, then processes images via stdin)
  log "Starting OCR daemon (loading model)..."
  local ocr_in ocr_out
  ocr_in=$(mktemp -u)
  ocr_out=$(mktemp -u)
  mkfifo "$ocr_in" "$ocr_out"

  python3 "$SCRIPT_DIR/ocr_preprocess.py" --daemon < "$ocr_in" > "$ocr_out" 2>"$LOG_FILE.ocr_err" &
  ocr_pid=$!

  # Open file descriptors for the pipes
  exec {OCR_IN_FD}>"$ocr_in"
  exec {OCR_OUT_FD}<"$ocr_out"

  # Wait for the READY signal
  local ready_line
  IFS= read -r ready_line <&"$OCR_OUT_FD"
  if [[ "$ready_line" != "READY" ]]; then
    log "ERROR: OCR daemon failed to start (got: $ready_line)"
    kill "$ocr_pid" 2>/dev/null || true
    rm -f "$ocr_in" "$ocr_out"
    exit 1
  fi
  log "OCR daemon ready (PID $ocr_pid)"
  rm -f "$ocr_in" "$ocr_out"  # FIFOs no longer needed after opening FDs

  local capture_args
  read -r size grab_x grab_y <<< "$(get_capture_geometry)"
  local gate_size gate_x gate_y
  read -r gate_size gate_x gate_y <<< "$(get_gate_geometry)"

  log "Tracker started: gate=${gate_size}+${gate_x}+${gate_y} capture=${size}+${grab_x}+${grab_y} interval=3s"
  log "Server: $SERVER_URL"

  local consecutive_failures=0
  local cycle_count=0
  local unchanged_count=0
  local sleep_interval=3

  while [[ "$exiting" -eq 0 ]]; do
    cycle_count=$((cycle_count + 1))
    # If launched with a game and the game has exited, stop
    if [[ -n "$game_pid" ]] && ! kill -0 "$game_pid" 2>/dev/null; then
      log "Game process exited. Stopping tracker."
      break
    fi

    local t_start t_gate t_capture t_ocr
    t_start=$(now_ms)

    # ── Stage 1: Cheap Tesseract gate on top-left corner ──
    local gate_img
    gate_img=$(mktemp --suffix=.bmp)

    if ! capture_screenshot "$gate_img" "$gate_size" "$gate_x" "$gate_y"; then
      rm -f "$gate_img"
      consecutive_failures=$((consecutive_failures + 1))
      if (( consecutive_failures % 10 == 1 )); then
        log "Gate capture failed (attempt $consecutive_failures)"
      else
        logq "Gate capture failed (attempt $consecutive_failures)"
      fi
      [[ "$exiting" -eq 0 ]] && sleep "$sleep_interval"
      continue
    fi

    local gate_result
    gate_result=$(ocr_daemon_query "GATE:$gate_img")
    rm -f "$gate_img"
    t_gate=$(now_ms)
    local ms_gate=$(( t_gate - t_start ))

    if [[ "$gate_result" != "WORLD_TOUR" ]]; then
      logq "Gate: not World Tour screen | ${ms_gate}ms"
      unchanged_count=0
      sleep_interval=3
      [[ "$exiting" -eq 0 ]] && sleep "$sleep_interval"
      continue
    fi

    # ── Stage 2: Full EasyOCR on bottom-center for points value ──
    local tmp_img
    tmp_img=$(mktemp --suffix=.bmp)

    if ! capture_screenshot "$tmp_img" "$size" "$grab_x" "$grab_y"; then
      rm -f "$tmp_img"
      consecutive_failures=$((consecutive_failures + 1))
      if (( consecutive_failures % 10 == 1 )); then
        log "Screen capture failed (attempt $consecutive_failures)"
      else
        logq "Capture failed (attempt $consecutive_failures)"
      fi
      [[ "$exiting" -eq 0 ]] && sleep "$sleep_interval"
      continue
    fi

    t_capture=$(now_ms)
    local ocr_text
    ocr_text=$(ocr_daemon_query "$tmp_img")
    rm -f "$tmp_img"
    t_ocr=$(now_ms)

    local ms_capture=$(( t_capture - t_gate ))
    local ms_ocr=$(( t_ocr - t_capture ))
    local ms_total=$(( t_ocr - t_start ))
    local cpu_ocr="-" cpu_load="-"
    if (( cycle_count % 10 == 0 )); then
      cpu_ocr=$(ps -p "$ocr_pid" -o %cpu= 2>/dev/null | tr -d ' ')
      cpu_load=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)
    fi

    if [[ -n "$ocr_text" ]]; then
      local ocr_oneline
      ocr_oneline=$(echo "$ocr_text" | tr '\n' ' ' | head -c 120)
      logq "OCR raw=\"$ocr_oneline\" | gate=${ms_gate}ms capture=${ms_capture}ms ocr=${ms_ocr}ms total=${ms_total}ms | ocr_cpu=${cpu_ocr}% load=${cpu_load}"

      local wtp
      if wtp=$(parse_wtp "$ocr_text"); then
        consecutive_failures=0
        local last
        last=$(get_last_value)

        if [[ "$wtp" != "$last" ]]; then
          log "World Tour Points changed: ${last:-"(none)"} → $wtp"
          if push_record "$wtp"; then
            set_last_value "$wtp"
          fi
          unchanged_count=0
          sleep_interval=3
        else
          unchanged_count=$((unchanged_count + 1))
          # Back off: 3s -> 5s -> 10s after consecutive unchanged reads
          if (( unchanged_count >= 10 )); then
            sleep_interval=10
          elif (( unchanged_count >= 5 )); then
            sleep_interval=5
          fi
          logq "OCR ok | wtp=$wtp (unchanged x${unchanged_count}) | gate=${ms_gate}ms capture=${ms_capture}ms ocr=${ms_ocr}ms total=${ms_total}ms interval=${sleep_interval}s | ocr_cpu=${cpu_ocr}% load=${cpu_load}"
        fi
      else
        logq "OCR ok | no WTP detected | gate=${ms_gate}ms capture=${ms_capture}ms ocr=${ms_ocr}ms total=${ms_total}ms | ocr_cpu=${cpu_ocr}% load=${cpu_load}"
      fi
    else
      logq "OCR empty | gate=${ms_gate}ms total=${ms_total}ms | ocr_cpu=${cpu_ocr}% load=${cpu_load}"
    fi

    if [[ "$exiting" -eq 0 ]]; then
      sleep "$sleep_interval"
    fi
  done

  # Clean up OCR daemon
  exec {OCR_IN_FD}>&-
  exec {OCR_OUT_FD}<&-
}

# ── Entry point ──────────────────────────────────────────────────────────────

main() {
  # If any config is missing, run interactive setup to fill in the gaps
  if ! load_env 2>/dev/null; then
    setup_env
    if ! load_env 2>/dev/null; then
      echo "ERROR: Setup did not produce a valid configuration." >&2
      exit 1
    fi
    # If no game command was given, exit after setup
    if [[ $# -eq 0 ]]; then
      exit 0
    fi
  fi

  # If game command was passed (Steam %command%), launch it
  if [[ $# -gt 0 ]]; then
    log "Launching game: $*"
    "$@" &
    game_pid=$!
    log "Game PID: $game_pid"

    # Give the game a moment to start rendering
    sleep 5
  fi

  run_tracker

  # If game is still running somehow, wait for it
  if [[ -n "$game_pid" ]] && kill -0 "$game_pid" 2>/dev/null; then
    wait "$game_pid" 2>/dev/null || true
  fi
}

main "$@"
