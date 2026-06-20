#!/usr/bin/env bash
#
# package-linux.sh — Build the Linux release tarball (season-sprint-linux.tar.gz).
#
# Ships SOURCE, not a precompiled binary: the tracker links native libs
# (tesseract, leptonica, libcurl, X11) whose ABIs skew across distros/glibc,
# so building on the user's machine via season-tracker.sh is more portable than
# shipping one binary. season-tracker.sh installs the toolchain + deps for them.
#
# Usage:
#   ./package-linux.sh            # -> dist/season-sprint-linux.tar.gz
#   ./package-linux.sh OUTDIR     # write the tarball into OUTDIR instead

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/dist}"
STAGE_PARENT="$(mktemp -d)"
STAGE="$STAGE_PARENT/season-sprint"
TARBALL="$OUT_DIR/season-sprint-linux.tar.gz"

# Files the tracker needs at runtime / build time on the user's machine.
FILES=(
  season-tracker.c
  Makefile
  ocr_preprocess.py
  season-tracker.sh
  .env.example
)

cleanup() { rm -rf "$STAGE_PARENT"; }
trap cleanup EXIT

mkdir -p "$STAGE" "$OUT_DIR"

for f in "${FILES[@]}"; do
  if [[ ! -e "$SCRIPT_DIR/$f" ]]; then
    echo "ERROR: missing required file: $f" >&2
    exit 1
  fi
  cp "$SCRIPT_DIR/$f" "$STAGE/$f"
done

chmod +x "$STAGE/season-tracker.sh"

# Tar with a stable top-level dir so install.sh can --strip-components=1.
tar -czf "$TARBALL" -C "$STAGE_PARENT" season-sprint

echo "Built $TARBALL"
ls -lh "$TARBALL" | awk '{print "  size: " $5}'
