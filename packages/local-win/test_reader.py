"""
test_reader.py — debug helper. Runs the tracker's screen reader against a
screenshot of your choice, so you can tell capture problems (wrong monitor,
wrong screen) apart from recognition problems.

Take a full-screen screenshot of THE FINALS' MODES tab, then:

    .venv\\Scripts\\python.exe test_reader.py path\\to\\screenshot.png
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

import screen_reader as sr

SCRIPT_DIR = Path(__file__).resolve().parent


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test_reader.py <screenshot>")
        return 2

    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"ERROR: {path} not found")
        return 1

    img = np.array(Image.open(path).convert("RGB"))
    print(f"Image: {path} ({img.shape[1]}x{img.shape[0]})")

    templates = sr.Templates.load(sr.find_templates_dir(SCRIPT_DIR))
    r = sr.read_frame(img, templates)

    print(f"\nMODES tab match: {r.gate_score:.2f} (need {sr.GATE_MIN:.2f})")
    for name, score in r.header_scores.items():
        print(f"header '{name}':  {score:.2f} (need {sr.HEADER_MIN:.2f})")
    print(f"\nverdict: {r.verdict}")

    if r.value is None:
        print(
            "\nNo value read. Check that the screenshot is the whole game monitor,\n"
            "taken on the MODES tab with the score panel visible at the bottom."
        )
        return 1
    print(f"mode={r.mode} value={r.value} max={r.max_value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
