#!/usr/bin/env bash
#
# Season Sprint — Linux installer bootstrap.
#
#   curl -fsSL https://www.seasonsprint.com/install.sh | bash
#
# Downloads the latest release tarball, extracts it to a stable location, and
# hands off to season-tracker.sh, which installs system deps + EasyOCR, builds
# the tracker, and walks you through configuration.
#
# Env overrides:
#   SEASON_SPRINT_DIR     install location (default: ~/.local/share/season-sprint)
#   SEASON_SPRINT_VERSION release tag to fetch (default: latest)

set -euo pipefail

REPO="lcflight/season-sprint"
ASSET="season-sprint-linux.tar.gz"
INSTALL_DIR="${SEASON_SPRINT_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/season-sprint}"
VERSION="${SEASON_SPRINT_VERSION:-latest}"

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/$REPO/releases/latest/download/$ASSET"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
fi

die() { echo "ERROR: $*" >&2; exit 1; }

# X11 SHM screen capture — there is no native Wayland/macOS/Windows build here.
[[ "$(uname -s)" == "Linux" ]] || die "the desktop tracker is Linux-only (uname=$(uname -s))."

command -v curl >/dev/null 2>&1 || die "curl is required but not found."
command -v tar  >/dev/null 2>&1 || die "tar is required but not found."

echo "Season Sprint — Linux installer"
echo "  source : $URL"
echo "  install: $INSTALL_DIR"
echo

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $ASSET ..."
curl -fSL --proto '=https' --tlsv1.2 -o "$tmp/$ASSET" "$URL" \
  || die "download failed. Check your connection or grab the tarball from https://github.com/$REPO/releases"

echo "Extracting to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
# Tarball has a top-level season-sprint/ dir; strip it so files land directly.
tar -xzf "$tmp/$ASSET" -C "$INSTALL_DIR" --strip-components=1

LAUNCHER="$INSTALL_DIR/season-tracker.sh"
[[ -f "$LAUNCHER" ]] || die "season-tracker.sh missing from the release tarball."
chmod +x "$LAUNCHER"

echo
echo "Starting setup ..."
echo

# Hand off to the interactive installer. It needs a real TTY for its prompts,
# which the `curl | bash` pipe doesn't provide — reconnect stdin to the
# terminal when one is available.
if [[ -t 1 && -r /dev/tty ]]; then
  exec "$LAUNCHER" < /dev/tty
else
  exec "$LAUNCHER"
fi
