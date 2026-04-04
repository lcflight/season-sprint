#!/usr/bin/env python3
"""
OCR a screenshot using EasyOCR. Finds the "WORLD TOUR POINTS" header
and returns the "current / max" numbers spatially located below it.

Modes:
  Single-shot:  python3 ocr_preprocess.py <input.png>
  Daemon:       python3 ocr_preprocess.py --daemon
                Then send image paths on stdin, one per line.
                Each response is terminated by a "---END---" sentinel line.
"""

import os
import subprocess
import sys
import tempfile

import easyocr
from PIL import Image, ImageOps

SENTINEL = "---END---"


def gate_check(path):
    """Quick Tesseract check for 'WORLD TOUR' text with preprocessing."""
    try:
        img = Image.open(path)
        gray = ImageOps.grayscale(img)
        thresh = gray.point(lambda x: 255 if x > 180 else 0)
        tmp = tempfile.mktemp(suffix=".bmp")
        thresh.save(tmp)
        result = subprocess.run(
            ["tesseract", tmp, "-", "--psm", "7"],
            capture_output=True, text=True, timeout=5,
        )
        os.unlink(tmp)
        return "WORLD TOUR" in result.stdout.upper()
    except Exception as e:
        print(f"GATE ERROR: {e}", file=sys.stderr)
        return False


def process_image(reader, path):
    """OCR one image and print results to stdout."""
    try:
        results = reader.readtext(path)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return

    # Find the "WORLD TOUR POINTS" header by text match
    header_bbox = None
    for (bbox, text, conf) in results:
        if "TOUR" in text.upper() and "POINT" in text.upper():
            header_bbox = bbox
            print(text)
            break

    if header_bbox is None:
        # No header found — dump all text for the bash parser to handle
        for (bbox, text, conf) in results:
            print(text)
        return

    # Header bbox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    header_top = min(pt[1] for pt in header_bbox)
    header_bottom = max(pt[1] for pt in header_bbox)
    header_left = min(pt[0] for pt in header_bbox)
    header_right = max(pt[0] for pt in header_bbox)
    header_center_x = (header_left + header_right) / 2
    header_height = header_bottom - header_top

    # Collect numbers spatially near the header (below or overlapping) and
    # horizontally within the header's x-range
    numbers = []
    for (bbox, text, conf) in results:
        text_top = min(pt[1] for pt in bbox)
        text_bottom = max(pt[1] for pt in bbox)
        text_center_x = (min(pt[0] for pt in bbox) + max(pt[0] for pt in bbox)) / 2

        # Must start at or below the header's top (not above the header)
        if text_bottom < header_top:
            continue

        # Must be within reasonable vertical distance below header top
        if text_top > header_bottom + header_height * 3:
            continue

        # Must be horizontally within the header's x-range (with tolerance)
        if text_center_x < header_left - header_height:
            continue
        if text_center_x > header_right + header_height:
            continue

        # Extract digits from the text
        cleaned = text.replace(',', '').replace('_', '').strip()
        # Check if it's a number or a "N / N" pattern
        if cleaned.isdigit():
            numbers.append((text_center_x, int(cleaned), text))
        elif '/' in cleaned:
            # Already in "N / N" format
            print(text)
            return

    # Sort by horizontal position (left to right) — "current / max" reads left-to-right
    numbers.sort(key=lambda x: x[0])

    if len(numbers) >= 2:
        print(f"{numbers[0][1]} / {numbers[1][1]}")
    elif len(numbers) == 1:
        print(numbers[0][2])


def main():
    daemon = len(sys.argv) >= 2 and sys.argv[1] == "--daemon"

    if not daemon and len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <input.png>  or  {sys.argv[0]} --daemon", file=sys.stderr)
        sys.exit(1)

    # Load model once
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)

    if daemon:
        # Signal readiness
        print("READY", flush=True)
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            if line.startswith("GATE:"):
                # Cheap Tesseract gate check — no EasyOCR needed
                path = line[5:]
                if gate_check(path):
                    print("WORLD_TOUR")
                else:
                    print("NO_MATCH")
            else:
                # Full EasyOCR processing
                process_image(reader, line)
            print(SENTINEL, flush=True)
    else:
        process_image(reader, sys.argv[1])


if __name__ == "__main__":
    main()
