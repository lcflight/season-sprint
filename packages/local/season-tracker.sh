#!/usr/bin/env bash
#
# season-tracker.sh — One-shot installer + Steam launcher for Season Sprint.
#
# First-time (interactive setup: deps, venv, build, config):
#   ./season-tracker.sh
#
# After setup, set as a Steam launch option on the game:
#   /full/path/to/season-tracker.sh %command%
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BINARY="$SCRIPT_DIR/season-tracker"
SOURCE="$SCRIPT_DIR/season-tracker.c"
VENV="$SCRIPT_DIR/.venv"

# ── System dependencies ──────────────────────────────────────────────────────
#
# Linux-only (tracker uses X11 SHM). Covers the common package managers.

APT_PKGS=(build-essential pkg-config tesseract-ocr tesseract-ocr-eng
          libtesseract-dev libleptonica-dev libcurl4-openssl-dev
          libx11-dev libxext-dev python3 python3-venv python3-pip)

DNF_PKGS=(gcc make pkgconf-pkg-config tesseract tesseract-langpack-eng
          tesseract-devel leptonica-devel libcurl-devel libX11-devel
          libXext-devel python3 python3-pip)

PACMAN_PKGS=(base-devel pkgconf tesseract tesseract-data-eng leptonica
             curl libx11 libxext python python-pip)

detect_pkg_mgr() {
  for cmd in apt-get dnf pacman zypper; do
    command -v "$cmd" >/dev/null 2>&1 && { echo "$cmd"; return; }
  done
}

have_build_deps() {
  command -v gcc >/dev/null 2>&1 \
    && command -v make >/dev/null 2>&1 \
    && command -v pkg-config >/dev/null 2>&1 \
    && pkg-config --exists tesseract libcurl x11 xext 2>/dev/null
}

install_system_deps() {
  if have_build_deps; then
    echo "Build dependencies already satisfied."
    return 0
  fi

  local mgr
  mgr=$(detect_pkg_mgr)
  if [[ -z "$mgr" ]]; then
    echo "WARNING: No supported package manager found (apt/dnf/pacman/zypper)."
    echo "Install manually: tesseract + dev headers, libcurl-dev, libx11-dev,"
    echo "libxext-dev, gcc, make, pkg-config, python3, python3-venv."
    return 1
  fi

  echo
  echo "System packages need to be installed via $mgr (sudo required)."
  local ans
  read -rp "Proceed? [Y/n] " ans
  case "${ans,,}" in n|no) echo "Skipping — build will likely fail."; return 1;; esac

  case "$mgr" in
    apt-get) sudo apt-get update && sudo apt-get install -y "${APT_PKGS[@]}" ;;
    dnf)     sudo dnf install -y "${DNF_PKGS[@]}" ;;
    pacman)  sudo pacman -S --needed --noconfirm "${PACMAN_PKGS[@]}" ;;
    zypper)  sudo zypper --non-interactive install gcc make pkg-config \
               tesseract-ocr tesseract-ocr-devel libcurl-devel \
               libX11-devel libXext-devel python3 python3-pip ;;
  esac
}

# ── Python / EasyOCR ─────────────────────────────────────────────────────────

python_has_easyocr() {
  [[ -x "$1" ]] && "$1" -c 'import easyocr' >/dev/null 2>&1
}

ensure_python_deps() {
  # Always provision a local venv. Trusting system Python is fragile: Steam
  # strips LD_LIBRARY_PATH / STEAM_RUNTIME_LIBRARY_PATH before exec'ing the
  # binary, and a Linuxbrew / conda / distro Python that imports EasyOCR in a
  # normal shell may fail once those vars are gone. The venv keeps the OCR
  # daemon's runtime environment identical to install time.
  if [[ ! -x "$VENV/bin/python3" ]]; then
    echo "Creating Python virtual environment at $VENV ..."
    if ! python3 -m venv "$VENV"; then
      echo "ERROR: 'python3 -m venv' failed. Install python3-venv and retry." >&2
      return 1
    fi
  fi

  if python_has_easyocr "$VENV/bin/python3"; then
    return 0
  fi

  echo "Installing EasyOCR into venv (downloads ~1GB of PyTorch, takes a few minutes)..."
  "$VENV/bin/pip" install --upgrade pip >/dev/null \
    && "$VENV/bin/pip" install easyocr \
    || { echo "ERROR: pip install failed. See output above." >&2; return 1; }
  echo "EasyOCR ready."
}

# ── Monitor detection ────────────────────────────────────────────────────────

list_monitors() {
  xrandr --query 2>/dev/null \
    | grep ' connected' \
    | sed -n 's/^\([^ ]*\) connected.* \([0-9]\+x[0-9]\+[+-][0-9-]\+[+-][0-9-]\+\).*/\1 \2/p'
}

prompt_monitor() {
  local monitors count
  monitors=$(list_monitors)
  count=$(echo "$monitors" | grep -c .)

  if [[ "$count" -eq 0 ]]; then
    echo "WARNING: Could not detect monitors via xrandr."
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

  local selected name geo
  selected=$(echo "$monitors" | sed -n "${choice}p")
  read -r name geo <<< "$selected"
  echo "Selected: $name ($geo)"
  SHOT_GEOMETRY="$geo"
}

# ── Config prompts + .env ────────────────────────────────────────────────────

_env_set() {
  local key="$1" val="$2"
  if [[ -f "$ENV_FILE" ]] && grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

prompt_config() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$ENV_FILE"
  fi

  local server_url="${SERVER_URL:-}"
  local auth_token="${AUTH_TOKEN:-}"
  local shot_geometry="${SHOT_GEOMETRY:-}"

  if [[ -z "$server_url" ]]; then
    echo
    echo "SERVER_URL — your Season Sprint API URL"
    echo "  (e.g. https://your-worker.workers.dev)"
    read -rp "SERVER_URL: " server_url
    while [[ -z "$server_url" ]]; do
      read -rp "SERVER_URL (required): " server_url
    done
    server_url="${server_url%/}"
  fi

  if [[ -z "$auth_token" ]]; then
    echo
    echo "AUTH_TOKEN — your personal API key (starts with sk_)"
    echo "  Generate one from the web app: click 'API Keys' in the header."
    read -rp "AUTH_TOKEN: " auth_token
    while [[ -z "$auth_token" ]]; do
      read -rp "AUTH_TOKEN (required): " auth_token
    done
  fi

  if [[ -z "$shot_geometry" ]]; then
    echo
    prompt_monitor
    shot_geometry="$SHOT_GEOMETRY"
  fi

  touch "$ENV_FILE"
  _env_set SERVER_URL    "$server_url"
  _env_set AUTH_TOKEN    "$auth_token"
  _env_set SHOT_GEOMETRY "$shot_geometry"
  chmod 600 "$ENV_FILE"

  echo
  echo "Testing connection to $server_url ..."
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: $auth_token" \
    "$server_url/me/records" 2>/dev/null || echo "000")
  case "$http_code" in
    200) echo "  OK — connected successfully." ;;
    000) echo "  WARNING: couldn't reach $server_url. Check URL / network." ;;
    *)   echo "  WARNING: server returned HTTP $http_code. Check URL + token." ;;
  esac
}

# ── Build ────────────────────────────────────────────────────────────────────

build_binary() {
  if [[ -x "$BINARY" && "$BINARY" -nt "$SOURCE" ]]; then
    return 0
  fi
  echo "Building season-tracker binary..."
  if ! make -C "$SCRIPT_DIR" season-tracker; then
    echo "ERROR: Build failed. See errors above." >&2
    return 1
  fi
}

# ── Steam launcher env prep ──────────────────────────────────────────────────

prep_launcher_env() {
  # Strip Steam's library overrides (keep only the gameoverlay overlay so the
  # Steam overlay still works) so system libcurl/tesseract/X11 load cleanly.
  local filtered_preload="" entry
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    [[ "$entry" != *gameoverlay* ]] && continue
    [[ "$entry" == *ubuntu12_32* ]] && continue
    [[ -f "$entry" ]] || continue
    filtered_preload+="${filtered_preload:+:}$entry"
  done < <(tr ':' '\n' <<< "${LD_PRELOAD:-}")
  export LD_PRELOAD="$filtered_preload"
  unset LD_LIBRARY_PATH STEAM_RUNTIME_LIBRARY_PATH 2>/dev/null || true

  # Steam launches with a minimal PATH — restore common tool locations.
  local p
  for p in /home/linuxbrew/.linuxbrew/bin /usr/local/bin; do
    [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
  done
}

# ── Install orchestration ────────────────────────────────────────────────────

is_installed() {
  [[ -f "$ENV_FILE" ]] || return 1
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  [[ -n "${SERVER_URL:-}"    ]] || return 1
  [[ -n "${AUTH_TOKEN:-}"    ]] || return 1
  [[ -n "${SHOT_GEOMETRY:-}" ]] || return 1
  [[ -x "$BINARY"            ]] || return 1
  return 0
}

run_install() {
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║          Season Sprint Tracker — Setup                  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo
  echo "This will:"
  echo "  1. Install system packages (via your package manager, sudo)"
  echo "  2. Set up a local Python venv with EasyOCR (~1GB)"
  echo "  3. Build the tracker binary"
  echo "  4. Prompt for your server URL, API token, and monitor"
  echo

  install_system_deps || echo "(continuing; some steps may fail)"
  ensure_python_deps  || exit 1
  build_binary        || exit 1
  prompt_config

  echo
  echo "──────────────────────────────────────────────────────────"
  echo "Setup complete."
  echo
  echo "In Steam: right-click your game → Properties → Launch Options"
  echo "and paste this line:"
  echo
  echo "  $SCRIPT_DIR/season-tracker.sh %command%"
  echo
  echo "──────────────────────────────────────────────────────────"
}

# ── Entry point ──────────────────────────────────────────────────────────────

main() {
  # Invoked with no args and not yet set up → run installer and stop.
  if [[ $# -eq 0 ]] && ! is_installed; then
    run_install
    exit 0
  fi

  # Invoked by Steam (or manually) but setup is incomplete → finish install,
  # then continue to launch if a game command was passed through.
  if ! is_installed; then
    run_install
    [[ $# -eq 0 ]] && exit 0
  fi

  prep_launcher_env
  exec "$BINARY" "$@"
}

main "$@"
