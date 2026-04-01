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
#   The script launches the game, captures the screen region every N seconds,
#   OCRs for "WORLD TOUR POINTS", and pushes value changes to the API.
#
# Env overrides (all optional, defaults are sensible):
#   SHOT_INTERVAL    Seconds between captures (default: 15)
#   SHOT_GEOMETRY    Monitor WxH+X+Y (default: 2560x1440+0+0)
#   DISPLAY          X11 display (default: :0.0)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
STATE_FILE="$SCRIPT_DIR/.last-wtp"
LOG_FILE="$SCRIPT_DIR/tracker.log"

SHOT_INTERVAL="${SHOT_INTERVAL:-15}"
DISPLAY="${DISPLAY:-:0.0}"
[[ "$DISPLAY" == ":0" ]] && DISPLAY=":0.0"
SHOT_GEOMETRY="${SHOT_GEOMETRY:-2560x1440+0+0}"

# ── Logging ──────────────────────────────────────────────────────────────────

log() {
  local ts
  ts="$(date -Iseconds)"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
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
  echo "You need two values:"
  echo "  1. SERVER_URL — Your Season Sprint API URL"
  echo "     (e.g. https://your-worker.workers.dev or http://localhost:8787)"
  echo "  2. AUTH_TOKEN — Your authentication token"
  echo "     (the same value as DEV_AUTH_TOKEN on your server)"
  echo

  local server_url auth_token

  read -rp "SERVER_URL: " server_url
  while [[ -z "$server_url" ]]; do
    echo "  Server URL cannot be empty."
    read -rp "SERVER_URL: " server_url
  done
  # Strip trailing slash
  server_url="${server_url%/}"

  read -rp "AUTH_TOKEN: " auth_token
  while [[ -z "$auth_token" ]]; do
    echo "  Auth token cannot be empty."
    read -rp "AUTH_TOKEN: " auth_token
  done

  cat > "$ENV_FILE" <<EOF
SERVER_URL=$server_url
AUTH_TOKEN=$auth_token
EOF
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
  if [[ -z "${SERVER_URL:-}" || -z "${AUTH_TOKEN:-}" ]]; then
    echo "ERROR: $ENV_FILE is missing SERVER_URL or AUTH_TOKEN."
    echo "Delete $ENV_FILE and re-run to set up again."
    return 1
  fi
  return 0
}

# ── Screen capture ───────────────────────────────────────────────────────────

get_capture_geometry() {
  local base_size="${SHOT_GEOMETRY%%+*}"
  local base_w="${base_size%x*}"
  local base_h="${base_size#*x}"

  local offset_x=0 offset_y=0
  if [[ "$SHOT_GEOMETRY" == *+* ]]; then
    local rest="${SHOT_GEOMETRY#*+}"
    offset_x="${rest%%+*}"
    offset_y="${rest#*+}"
  fi

  # Bottom center: middle third width, bottom fifth height
  local crop_w=$((base_w / 3))
  local crop_h=$((base_h / 5))
  local grab_x=$((offset_x + (base_w - crop_w) / 2))
  local grab_y=$((offset_y + (base_h - crop_h)))

  echo "${crop_w}x${crop_h}" "$grab_x" "$grab_y"
}

capture_screenshot() {
  local outfile="$1"
  local size="$2" grab_x="$3" grab_y="$4"

  local ff_err
  ff_err=$(mktemp)

  # Try ffmpeg x11grab first
  if ffmpeg -y -loglevel error \
    -f x11grab -video_size "$size" \
    -grab_x "$grab_x" -grab_y "$grab_y" \
    -i "$DISPLAY" -frames:v 1 "$outfile" 2>"$ff_err"; then
    rm -f "$ff_err"
    return 0
  fi

  # Fallback: xwd + ffmpeg crop
  if grep -q "Protocol not found\|Error opening input" "$ff_err" 2>/dev/null; then
    rm -f "$ff_err"
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
  else
    rm -f "$ff_err"
  fi

  return 1
}

# ── OCR + Parsing ────────────────────────────────────────────────────────────

# Extract World Tour Points from OCR text.
# Returns the current points value (integer) or empty string if not found.
parse_wtp() {
  local ocr_text="$1"

  # Look for "WORLD TOUR POINTS" or "TOUR POINTS" header (OCR can be partial)
  # followed by a line matching "N,NNN / N,NNN" or "NNN / NNN"
  local found_header=0
  local value=""

  while IFS= read -r line; do
    # Normalize: uppercase, strip leading/trailing whitespace
    local upper
    upper=$(echo "$line" | tr '[:lower:]' '[:upper:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [[ "$found_header" -eq 1 ]]; then
      # Try to match "current / max" pattern on this line
      # Handle commas, spaces, OCR artifacts around the numbers
      # Pattern: optional junk, digits with optional commas, slash, digits with optional commas
      if [[ "$upper" =~ ([0-9][0-9,]*)[[:space:]]*/[[:space:]]*([0-9][0-9,]*) ]]; then
        local current="${BASH_REMATCH[1]}"
        local max_val="${BASH_REMATCH[2]}"
        # Strip commas
        current="${current//,/}"
        max_val="${max_val//,/}"
        # Validate: both must be integers, current 0-2400, max 0-2400
        if [[ "$current" =~ ^[0-9]+$ ]] && [[ "$max_val" =~ ^[0-9]+$ ]]; then
          if (( current >= 0 && current <= 2400 && max_val >= 0 && max_val <= 2400 )); then
            echo "$current"
            return 0
          fi
        fi
      fi
      # Header was found but next line didn't parse — reset
      found_header=0
    fi

    # Check for the header
    if [[ "$upper" == *"TOUR POINTS"* ]]; then
      found_header=1
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

cleanup() {
  exiting=1
  log "Shutting down tracker."
  # Clean up temp screenshot if it exists
  rm -f "$SCRIPT_DIR/.capture-tmp.png"
}
trap cleanup INT TERM

run_tracker() {
  if ! command -v tesseract >/dev/null 2>&1; then
    echo "ERROR: tesseract is required. Install with: sudo apt install tesseract-ocr"
    exit 1
  fi
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ERROR: ffmpeg is required. Install with: sudo apt install ffmpeg"
    exit 1
  fi

  local capture_args
  read -r size grab_x grab_y <<< "$(get_capture_geometry)"

  log "Tracker started: capture=${size} offset=${grab_x},${grab_y} interval=${SHOT_INTERVAL}s"
  log "Server: $SERVER_URL"

  local tmp_img="$SCRIPT_DIR/.capture-tmp.png"
  local consecutive_failures=0

  while [[ "$exiting" -eq 0 ]]; do
    # If launched with a game and the game has exited, stop
    if [[ -n "$game_pid" ]] && ! kill -0 "$game_pid" 2>/dev/null; then
      log "Game process exited. Stopping tracker."
      break
    fi

    if capture_screenshot "$tmp_img" "$size" "$grab_x" "$grab_y"; then
      local ocr_text
      ocr_text=$(tesseract "$tmp_img" stdout 2>/dev/null || true)

      if [[ -n "$ocr_text" ]]; then
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
          fi
        fi
      fi
    else
      consecutive_failures=$((consecutive_failures + 1))
      if (( consecutive_failures % 10 == 1 )); then
        log "Screen capture failed (attempt $consecutive_failures)"
      fi
    fi

    rm -f "$tmp_img"

    if [[ "$exiting" -eq 0 ]]; then
      sleep "$SHOT_INTERVAL"
    fi
  done
}

# ── Entry point ──────────────────────────────────────────────────────────────

main() {
  # If .env doesn't exist, run interactive setup
  if ! load_env 2>/dev/null; then
    setup_env
    # After setup, if no game command was given, exit
    if [[ $# -eq 0 ]]; then
      exit 0
    fi
    # Reload after setup
    load_env
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
