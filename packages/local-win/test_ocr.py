"""
test_ocr.py — debug helper. Runs the same EasyOCR + parse pipeline the
tracker uses, against an image file of your choice. Lets you rule out
capture-region issues from parser/recognition issues.

Usage:
    .venv\\Scripts\\python.exe test_ocr.py path\\to\\image.png
"""

from __future__ import annotations

import sys
from pathlib import Path

# Inherit the SSL-cert fix from the main module so EasyOCR's first-run
# model download works on a fresh Windows VM.
import season_tracker  # noqa: F401  (just for the import side-effects)

import numpy as np
from PIL import Image
import easyocr


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test_ocr.py <image-file>")
        return 2

    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"ERROR: {path} not found")
        return 1

    print(f"Loading image: {path}")
    img = np.array(Image.open(path).convert("RGB"))
    print(f"Image size: {img.shape[1]}x{img.shape[0]} (WxH)")

    print("Loading EasyOCR model (first run downloads ~100MB) ...")
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)

    print("Running OCR ...")
    results = reader.readtext(img)

    print("\n--- Raw OCR results (%d boxes) ---" % len(results))
    for bbox, text, conf in results:
        x1 = min(p[0] for p in bbox)
        y1 = min(p[1] for p in bbox)
        x2 = max(p[0] for p in bbox)
        y2 = max(p[1] for p in bbox)
        print(f"  [{x1:4.0f},{y1:4.0f}]-[{x2:4.0f},{y2:4.0f}] conf={conf:.2f}  {text!r}")

    wtp = season_tracker.parse_wtp_from_ocr(results)
    print(f"\n--- parse_wtp_from_ocr -> {wtp} ---")

    if wtp is None:
        print(
            "\nParser returned None. Possible causes:\n"
            "  1. No header containing both 'TOUR' and 'POINT' in one OCR box\n"
            "     (EasyOCR sometimes splits 'WORLD TOUR POINTS' across boxes;\n"
            "      compare the raw results above).\n"
            "  2. Numbers below the header didn't parse as pure digits or 'N / N'.\n"
            "  3. Image resolution too low / text too small for EasyOCR.\n"
        )
        return 1

    print("\nParser succeeded. Tracker plumbing + parser work against this image.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
