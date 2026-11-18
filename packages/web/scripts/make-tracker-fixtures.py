"""
Build the screen-tracker test fixtures for packages/web/tests/screenReader.spec.js.

For each screenshot it keeps only the parts of the frame the reader looks at
(the MODES-tab gate zone plus the score panel, or the post-match zone), blacks
out the rest, and saves it as a PNG next to what the Python reader
(packages/local-win/screen_reader.py) reads from it. The JS port must read the
same thing.

    python3 -I make-tracker-fixtures.py OUT_DIR name=shot.png [name=shot.png@1080 ...]

"@1080" downsizes the shot to 1920x1080 first, to test the template scaling.
"+N" (after the path, e.g. shot.png+25000) reads it with N as the last saved
ranked score, which ranked reads need (stored as rankedAnchor).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "local-win"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import screen_reader as sr  # noqa: E402

PAD = 120  # px at 1440p kept around the found score panel


def keep_regions(img: np.ndarray, r: sr.Reading, t: sr.Templates) -> np.ndarray:
    H, W = img.shape[:2]
    s = H / sr.REF_H
    out = np.zeros_like(img)
    if r.screen == "post":
        x0, y0, w, h = sr.post_zone(W, H)
        out[y0:y0 + h, x0:x0 + w] = img[y0:y0 + h, x0:x0 + w]
        return out
    zw, zh = sr.gate_zone(W, H)
    out[:zh, :zw] = img[:zh, :zw]
    if r.screen == "modes" and r.header:
        # Keep a box around the header and value row inside the bottom region.
        rx0 = max(0, int(W / 2 - 640 * s))
        ry0 = max(0, int(H - 380 * s))
        wmask = sr.white_mask(img[ry0:H, rx0:min(W, int(W / 2 + 640 * s))])
        tm = sr.scale_mask(t.headers[r.header], s)
        hx, hy, _ = sr.match_template(wmask, tm, max(1, int(4 * s)))
        pad = int(PAD * s)
        x0, y0 = max(0, rx0 + hx - pad), max(0, ry0 + hy - pad)
        x1, y1 = min(W, rx0 + hx + tm.shape[1] + pad), min(H, ry0 + hy + tm.shape[0] + pad)
        if r.header == "ranked":
            # Also keep the tier badges either side.
            cx = rx0 + hx + tm.shape[1] / 2
            reach = (sr.TIER_DX + sr.TIER_ZONE + 20) * s
            x0, x1 = max(0, int(cx - reach)), min(W, int(cx + reach))
            y1 = min(H, int(ry0 + hy + (sr.TIER_DY + sr.TIER_ZONE + 20) * s))
        out[y0:y1, x0:x1] = img[y0:y1, x0:x1]
    return out


def describe(r: sr.Reading) -> dict:
    return {
        "screen": r.screen,
        "onModes": bool(r.on_modes),
        "gateScore": round(float(r.gate_score), 4),
        "header": r.header,
        "headerScores": {k: float(v) for k, v in r.header_scores.items()},
        "mode": r.mode,
        "value": r.value,
        "maxValue": r.max_value,
        "total": r.total,
        "tier": r.tier,
        "verdict": r.verdict,
    }


def main() -> int:
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    t = sr.Templates.load(ROOT / "tracker-templates")
    expected = {}
    saved: dict[str, np.ndarray] = {}
    for arg in sys.argv[2:]:
        name, src = arg.split("=", 1)
        anchor = None
        if "+" in src:
            src, a = src.rsplit("+", 1)
            anchor = int(a)
        size = None
        if src.endswith("@1080"):
            src, size = src[:-5], (1920, 1080)
        im = Image.open(src).convert("RGB")
        if size:
            im = im.resize(size, Image.LANCZOS)
        img = np.array(im)
        kept = keep_regions(img, sr.read_frame(img, t, anchor), t)
        # Expected result comes from the saved fixture, exactly as the test sees it.
        r = sr.read_frame(kept, t, anchor)
        expected[name] = describe(r)
        # The same frame read with another anchor reuses the saved image.
        same = next((n for n, k in saved.items() if np.array_equal(k, kept)), None)
        if same:
            expected[name]["image"] = same
        else:
            Image.fromarray(kept).save(out_dir / f"{name}.png", optimize=True)
            saved[name] = kept
        if anchor is not None:
            expected[name]["rankedAnchor"] = anchor
        print(f"{name}: {r.verdict}")
    (out_dir / "expected.json").write_text(json.dumps(expected, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
