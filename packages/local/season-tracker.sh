#!/usr/bin/env bash
#
# season-tracker.sh — Setup and launcher for the Season Sprint tracker.
#
# Usage:
#   First run (interactive setup):
#     ./season-tracker.sh
#
#   Steam launch option (after setup):
#     /full/path/to/season-tracker.sh %command%
#
#   The C binary handles the actual tracking loop (X11 SHM capture,
#   Tesseract gate check, EasyOCR daemon for points reading).
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BINARY="$SCRIPT_DIR/season-tracker"

# ── Monitor detection ────────────────────────────────────────────────────────

# List connected monitors. Each line: "NAME WxH+X+Y" (offsets may be negative)
list_monitors() {
  xrandr --query 2>/dev/null \
    | grep ' connected' \
    | sed -n 's/^\([^ ]*\) connected.* \([0-9]\+x[0-9]\+[+-][0-9-]\+[+-][0-9-]\+\).*/\1 \2/p'
}

# Prompt user to pick a monitor. Sets SHOT_GEOMETRY.
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

  # Merge into existing .env (preserve any custom overrides)
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

  # Build the C binary if it doesn't exist
  if [[ ! -x "$BINARY" ]]; then
    echo "Building tracker binary..."
    if ! make -C "$SCRIPT_DIR" season-tracker 2>&1; then
      echo "ERROR: Build failed. Install build deps:" >&2
      echo "  sudo apt install gcc libtesseract-dev libcurl4-openssl-dev libx11-dev libxext-dev pkg-config" >&2
      exit 1
    fi
  fi

  # Clear Steam's library overrides so system libs work
  unset LD_PRELOAD LD_LIBRARY_PATH STEAM_RUNTIME_LIBRARY_PATH 2>/dev/null || true

  # Ensure linuxbrew is on PATH (Steam may launch with a minimal PATH)
  for p in /home/linuxbrew/.linuxbrew/bin /usr/local/bin; do
    [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
  done

  # Hand off to the C binary
  exec "$BINARY" "$@"
}

main "$@"
