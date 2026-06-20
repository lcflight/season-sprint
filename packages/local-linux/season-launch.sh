#!/usr/bin/env bash
#
# season-launch.sh — Thin Steam launcher that runs season-watcher alongside
# season-tracker. Sister to season-tracker.sh / season-watcher.c.
#
# season-tracker.sh deliberately does NOT start the watcher (the watcher isn't
# part of the shipped Linux release). This wrapper adds it for local use: it
# backgrounds the watcher, then hands off to season-tracker.sh unchanged.
#
# Use it in place of season-tracker.sh in your Steam launch options:
#   /full/path/to/season-launch.sh %command%
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRACKER="$SCRIPT_DIR/season-tracker.sh"
WATCHER="$SCRIPT_DIR/season-watcher"
WATCHER_SRC="$SCRIPT_DIR/season-watcher.c"

# Mirror season-tracker.sh's prep_launcher_env so the watcher — which we fork
# here, before the tracker runs its own prep — loads system libs cleanly under
# Steam (which injects LD_PRELOAD / LD_LIBRARY_PATH overrides and a minimal
# PATH). Harmless when launched outside Steam; the tracker repeats it anyway.
prep_env() {
  local filtered="" entry
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    [[ "$entry" != *gameoverlay* ]] && continue
    [[ "$entry" == *ubuntu12_32* ]] && continue
    [[ -f "$entry" ]] || continue
    filtered+="${filtered:+:}$entry"
  done < <(tr ':' '\n' <<< "${LD_PRELOAD:-}")
  export LD_PRELOAD="$filtered"
  unset LD_LIBRARY_PATH STEAM_RUNTIME_LIBRARY_PATH 2>/dev/null || true

  local p
  for p in /home/linuxbrew/.linuxbrew/bin /usr/local/bin; do
    [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
  done
}

# Only on an actual game launch (args passed), not interactive setup.
if [[ $# -gt 0 ]]; then
  prep_env

  # Best-effort: build the watcher once if it's missing or out of date. A
  # failure here (e.g. no toolchain) just means no season-date alerts; never
  # block the game.
  if [[ -f "$WATCHER_SRC" ]] \
     && { [[ ! -x "$WATCHER" ]] || [[ "$WATCHER_SRC" -nt "$WATCHER" ]]; }; then
    make -C "$SCRIPT_DIR" season-watcher >/dev/null 2>&1 || true
  fi

  [[ -x "$WATCHER" ]] && "$WATCHER" >/dev/null 2>&1 &
fi

exec "$TRACKER" "$@"
