#!/usr/bin/env bash
#
# screenshot-loop.sh — capture X11 screen every N seconds using ffmpeg x11grab
# (or xwd+ffmpeg on systems where ffmpeg 7's URL parser rejects ":0.0").
#
# Usage: run from repo root (or set SHOT_DIR). Stop with Ctrl+C.
#
# Env vars:
#   SHOT_DIR       Output directory (default: ./packages/local/screenshots)
#   SHOT_INTERVAL  Seconds between captures (default: 20)
#   SHOT_GEOMETRY  Optional WxH or WxH+X+Y for region
#                  (default: 2560x1440+0+0 to capture your 1440p monitor only)
#   SHOT_REGION_MODE
#                  Region selection mode within SHOT_GEOMETRY.
#                  "bottom_center" captures middle third (width) and
#                  bottom fifth (height). Default: bottom_center.
#   DISPLAY        X11 display (default: from env or :0.0)
#   MAX_FILES      Keep only this many most recent screenshots (default: 500)
#   OCR_ENABLED    1 to OCR each capture (default: 1)
#   OCR_LOG_FILE   Rolling OCR text file (default: $SHOT_DIR/ocr-rolling.txt)
#   OCR_MAX_LINES  Max lines to keep in OCR_LOG_FILE (default: 2000)
#   OCR_LANG       Tesseract language (default: eng)
#

set -e

# Don't exit on ffmpeg failure so one bad capture doesn't stop the loop
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SHOT_DIR="${SHOT_DIR:-$REPO_ROOT/packages/local/screenshots}"
SHOT_INTERVAL="${SHOT_INTERVAL:-20}"
DISPLAY="${DISPLAY:-:0.0}"
# Normalize :0 to :0.0 so ffmpeg x11grab doesn't treat ":0" as a protocol
[[ "$DISPLAY" == ":0" ]] && DISPLAY=":0.0"
MAX_FILES="${MAX_FILES:-500}"
SHOT_REGION_MODE="${SHOT_REGION_MODE:-bottom_center}"
OCR_ENABLED="${OCR_ENABLED:-1}"
OCR_MAX_LINES="${OCR_MAX_LINES:-2000}"
OCR_LANG="${OCR_LANG:-eng}"

# Optional: WxH or WxH+X+Y
# Default targets the 1440p monitor on this setup.
SHOT_GEOMETRY="${SHOT_GEOMETRY:-2560x1440+0+0}"

exiting=0
cleanup() {
  exiting=1
  echo "Stopping screenshot loop."
}
trap cleanup INT TERM

mkdir -p "$SHOT_DIR"
OCR_LOG_FILE="${OCR_LOG_FILE:-$SHOT_DIR/ocr-rolling.txt}"
ocr_missing_warned=0

get_size() {
  if [[ -n "$SHOT_GEOMETRY" ]]; then
    # WxH or WxH+X+Y — we only need WxH for -video_size
    echo "${SHOT_GEOMETRY%%+*}"
  else
    xdpyinfo -display "$DISPLAY" | awk '/dimensions:/{print $2; exit}'
  fi
}

get_offset() {
  if [[ "$SHOT_GEOMETRY" == *+* ]]; then
    # Return "x y" for -x and -y
    local rest="${SHOT_GEOMETRY#*+}"
    echo "${rest//+/ }"
  else
    echo "0 0"
  fi
}

prune_old() {
  local pattern="$SHOT_DIR/screenshot-*.png"
  # Only our own files
  if ! compgen -G "$pattern" >/dev/null 2>&1; then
    return
  fi
  local count
  count=$(ls -1 $pattern 2>/dev/null | wc -l)
  if [[ "$count" -le "$MAX_FILES" ]]; then
    return
  fi
  local to_remove
  to_remove=$((count - MAX_FILES))
  ls -1t $pattern 2>/dev/null | tail -n "$to_remove" | xargs -r rm --
}

prune_ocr_log() {
  if [[ ! -f "$OCR_LOG_FILE" ]]; then
    return
  fi
  local line_count
  line_count=$(wc -l < "$OCR_LOG_FILE")
  if [[ "$line_count" -le "$OCR_MAX_LINES" ]]; then
    return
  fi
  local tmp_file
  tmp_file=$(mktemp)
  tail -n "$OCR_MAX_LINES" "$OCR_LOG_FILE" > "$tmp_file"
  mv "$tmp_file" "$OCR_LOG_FILE"
}

ocr_capture() {
  local image_path="$1"
  if [[ "$OCR_ENABLED" != "1" ]]; then
    return
  fi
  if ! command -v tesseract >/dev/null 2>&1; then
    if [[ "$ocr_missing_warned" -eq 0 ]]; then
      echo "OCR skipped: tesseract not found. Install with: sudo apt install tesseract-ocr" 1>&2
      ocr_missing_warned=1
    fi
    return
  fi

  local ocr_txt_tmp
  local ocr_err_tmp
  ocr_txt_tmp=$(mktemp)
  ocr_err_tmp=$(mktemp)
  if tesseract "$image_path" stdout -l "$OCR_LANG" >"$ocr_txt_tmp" 2>"$ocr_err_tmp"; then
    {
      echo "----- $(date -Iseconds) file=$(basename "$image_path") -----"
      if [[ -s "$ocr_txt_tmp" ]]; then
        cat "$ocr_txt_tmp"
      else
        echo "[no text detected]"
      fi
      echo
    } >> "$OCR_LOG_FILE"
    prune_ocr_log
  else
    echo "OCR failed for $image_path" 1>&2
    cat "$ocr_err_tmp" 1>&2
  fi
  rm -f "$ocr_txt_tmp" "$ocr_err_tmp"
}

# Capture one frame: prefer ffmpeg x11grab; if that fails with "Protocol not found"
# (ffmpeg 7 parses ":0.0" as a URL), fall back to xwd + ffmpeg to convert XWD→PNG.
capture_one() {
  local outfile="$1"
  local ff_stderr
  local xwd_stderr
  local conv_stderr
  ff_stderr=$(mktemp)
  xwd_stderr=$(mktemp)
  conv_stderr=$(mktemp)
  local ff_rc=0
  if ffmpeg -y -loglevel error -f x11grab -video_size "$size" -grab_x "$grab_x" -grab_y "$grab_y" -i "$DISPLAY" -frames:v 1 "$outfile" 2>"$ff_stderr"; then
    rm -f "$ff_stderr"
    rm -f "$xwd_stderr" "$conv_stderr"
    return 0
  else
    ff_rc=$?
  fi
  if grep -q "Protocol not found\|Error opening input" "$ff_stderr" 2>/dev/null; then
    rm -f "$ff_stderr"
    # Use xwd for X11 capture, ffmpeg only to convert XWD → PNG (avoids passing :0.0 to -i)
    local xwd_tmp
    xwd_tmp=$(mktemp --suffix=.xwd)
    if xwd -silent -screen -display "$DISPLAY" -out "$xwd_tmp" 2>"$xwd_stderr"; then
      if [[ -n "$SHOT_GEOMETRY" ]]; then
        # crop=width:height:x:y
        ffmpeg -y -loglevel error -i "$xwd_tmp" -vf "crop=${size//x/:}:${grab_x}:${grab_y}" -frames:v 1 "$outfile" 2>"$conv_stderr"
      else
        ffmpeg -y -loglevel error -i "$xwd_tmp" -frames:v 1 "$outfile" 2>"$conv_stderr"
      fi
      local xwd_ret=$?
      rm -f "$xwd_tmp"
      if [[ "$xwd_ret" -ne 0 ]]; then
        cat "$conv_stderr" 1>&2
      fi
      rm -f "$xwd_stderr" "$conv_stderr"
      return $xwd_ret
    fi
    rm -f "$xwd_tmp"
    cat "$xwd_stderr" 1>&2
    echo "xwd fallback failed" 1>&2
    rm -f "$xwd_stderr" "$conv_stderr"
  else
    cat "$ff_stderr" 1>&2
    rm -f "$ff_stderr"
    rm -f "$xwd_stderr" "$conv_stderr"
  fi
  return "$ff_rc"
}

size=$(get_size)
read -r grab_x grab_y <<< "$(get_offset)"

# Apply requested focus region within the selected monitor geometry:
# middle third horizontally, bottom fifth vertically.
if [[ "$SHOT_REGION_MODE" == "bottom_center" ]]; then
  base_w="${size%x*}"
  base_h="${size#*x}"
  crop_w=$((base_w / 3))
  crop_h=$((base_h / 5))
  grab_x=$((grab_x + (base_w - crop_w) / 2))
  grab_y=$((grab_y + (base_h - crop_h)))
  size="${crop_w}x${crop_h}"
fi

echo "Starting screenshot loop: DISPLAY=$DISPLAY XAUTHORITY=${XAUTHORITY:-"(default)"} SHOT_DIR=$SHOT_DIR size=$size offset=${grab_x},${grab_y} interval=${SHOT_INTERVAL}s region_mode=$SHOT_REGION_MODE"
echo "OCR: enabled=$OCR_ENABLED log=$OCR_LOG_FILE max_lines=$OCR_MAX_LINES lang=$OCR_LANG"

while [[ "$exiting" -eq 0 ]]; do
  outfile="$SHOT_DIR/screenshot-$(date +%Y%m%d-%H%M%S).png"
  if capture_one "$outfile"; then
    echo "$(date -Iseconds) captured $outfile"
    ocr_capture "$outfile"
    prune_old
  else
    echo "$(date -Iseconds) capture failed (see error above)"
  fi
  if [[ "$exiting" -eq 0 ]]; then
    sleep "$SHOT_INTERVAL"
  fi
done
