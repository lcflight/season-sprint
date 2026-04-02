#!/usr/bin/env python3
"""
OCR a screenshot using EasyOCR. Finds the "WORLD TOUR POINTS" header
and returns the "current / max" numbers spatially located below it.

Usage: python3 ocr_preprocess.py <input.png>
Output: lines like "WORLD TOUR POINTS" and "311 / 375"
"""

import sys
import easyocr

if len(sys.argv) != 2:
    print(f"Usage: {sys.argv[0]} <input.png>", file=sys.stderr)
    sys.exit(1)

reader = easyocr.Reader(['en'], gpu=False, verbose=False)
results = reader.readtext(sys.argv[1])

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
    sys.exit(0)

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
        sys.exit(0)

# Sort by horizontal position (left to right) — "current / max" reads left-to-right
numbers.sort(key=lambda x: x[0])

if len(numbers) >= 2:
    print(f"{numbers[0][1]} / {numbers[1][1]}")
elif len(numbers) == 1:
    print(numbers[0][2])
