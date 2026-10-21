#!/usr/bin/env python3
"""
make_templates.py — cut tracker templates out of THE FINALS screenshots.

Use full-monitor screenshots of the MODES tab. Any 16:9-ish resolution works;
masks are rescaled to the 1440p reference the trackers expect.

  # Yellow MODES tab (nav bar)
  python make_templates.py modes  shot.png

  # Score header above the yellow value, e.g. once ranked placements are done:
  python make_templates.py header ranked shot.png

  # Replace digit templates with real glyphs from a screen showing a known
  # current value (the yellow number), e.g. a World Tour score of 5,239:
  python make_templates.py digits shot.png 5239

  # Check what the tracker reads from a screenshot:
  python make_templates.py check shot.png

Needs numpy + Pillow. Reuses the tracker's reader from ../local-win.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "local-win"))

import screen_reader as sr  # noqa: E402


def load(path: str) -> tuple[np.ndarray, float]:
    rgb = np.asarray(Image.open(path).convert("RGB"))
    return rgb, rgb.shape[0] / sr.REF_H


def to_ref(mask: np.ndarray, s: float) -> np.ndarray:
    return mask if abs(s - 1) < 1e-6 else sr.scale_mask(mask, 1 / s)


def save_mask(name: str, mask: np.ndarray) -> None:
    path = HERE / name
    sr.write_pgm(path, mask.astype(np.uint8) * 255)
    print(f"wrote {path.name} ({mask.shape[1]}x{mask.shape[0]})")


def bbox_crop(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def find_value_row(rgb: np.ndarray, s: float):
    """Locate the yellow current-value glyphs in the bottom-centre panel.
    Returns (region offset x, y, region rgb, digit comps) for the group of
    same-baseline glyphs closest to the screen centre."""
    H, W = rgb.shape[:2]
    rx0, ry0 = int(W / 2 - 640 * s), int(H - 380 * s)
    region = rgb[ry0:H, rx0:int(W / 2 + 640 * s)]
    comps = [c for c in sr.components(sr.yellow_mask(region)) if sr._digit_like(c, s)]
    if not comps:
        sys.exit("no yellow value found in the bottom-centre panel")
    groups: list[list[sr.Comp]] = []
    for c in comps:
        for g in groups:
            if abs(g[0].y1 - c.y1) <= 3 * s and c.x0 - g[-1].x1 < c.h * 1.2:
                g.append(c)
                break
        else:
            groups.append([c])
    cx = region.shape[1] / 2
    group = min(groups, key=lambda g: abs((g[0].x0 + g[-1].x1) / 2 - cx))
    return rx0, ry0, region, group


def cmd_modes(shot: str) -> None:
    rgb, s = load(shot)
    H, W = rgb.shape[:2]
    zw, zh = sr.gate_zone(W, H)
    region = sr.yellow_mask(rgb[:zh, :zw])
    biggest = max(sr.components(region), key=lambda c: c.w * c.h)
    # Keep the whole bbox (text holes included) — that's what makes it a
    # MODES tab rather than any yellow box.
    tab = region[biggest.y0:biggest.y1, biggest.x0:biggest.x1]
    save_mask("modes_tab.pgm", to_ref(tab, s))


def cmd_header(name: str, shot: str) -> None:
    if name not in sr.HEADER_MODES:
        sys.exit(f"unknown header '{name}' (known: {', '.join(sr.HEADER_MODES)})")
    rgb, s = load(shot)
    _, _, region, group = find_value_row(rgb, s)
    top = min(c.y0 for c in group)
    mid = (group[0].x0 + group[-1].x1) // 2
    # The header is the white text line just above the value.
    win = sr.white_mask(region[max(0, int(top - 50 * s)): int(top - 3 * s),
                               max(0, int(mid - 300 * s)): int(mid + 300 * s)])
    # Letters: components of text height. Take the lowest line of letters
    # near the centre, then grow it sideways letter by letter (gap up to a
    # word space). This skips the rank badges and panel-edge specks.
    letters = [c for c in sr.components(win) if 12 * s <= c.h <= 34 * s]
    centre = win.shape[1] / 2
    near = [c for c in letters if abs((c.x0 + c.x1) / 2 - centre) < 150 * s]
    if not near:
        sys.exit("no white header text above the value")
    base = max(c.y1 for c in near)
    line = sorted((c for c in letters if abs(c.y1 - base) <= 4 * s), key=lambda c: c.x0)
    seed = min(line, key=lambda c: abs((c.x0 + c.x1) / 2 - centre))
    i = j = line.index(seed)
    gap = 20 * s
    while i > 0 and line[i].x0 - line[i - 1].x1 <= gap:
        i -= 1
    while j < len(line) - 1 and line[j + 1].x0 - line[j].x1 <= gap:
        j += 1
    x0, x1 = line[i].x0, max(c.x1 for c in line[i:j + 1])
    y0, y1 = min(c.y0 for c in line[i:j + 1]), max(c.y1 for c in line[i:j + 1])
    header = win[y0:y1, x0:x1]
    save_mask(f"header_{name}.pgm", to_ref(header, s))


def cmd_digits(shot: str, value: str) -> None:
    value = value.replace(",", "")
    rgb, s = load(shot)
    _, _, region, group = find_value_row(rgb, s)
    ink = sr.yellow_ink(region)
    if len(group) != len(value):
        sys.exit(f"found {len(group)} yellow glyphs but '{value}' has {len(value)} digits")
    for ch, c in zip(value, group):
        g = sr.normalize_glyph(sr.glyph_image(ink, c))
        sr.write_pgm(HERE / f"digit_{ch}.pgm", np.round(g * 255).astype(np.uint8))
        print(f"wrote digit_{ch}.pgm")


def cmd_check(shot: str) -> None:
    rgb, _ = load(shot)
    t = sr.Templates.load(HERE)
    r = sr.read_frame(rgb, t)
    print(f"gate {r.gate_score:.3f}  headers {r.header_scores}")
    print(f"=> {r.verdict}  (mode={r.mode}, value={r.value}, max={r.max_value})")


def main(argv: list[str]) -> None:
    cmds = {
        "modes": (cmd_modes, 1),
        "header": (cmd_header, 2),
        "digits": (cmd_digits, 2),
        "check": (cmd_check, 1),
    }
    if not argv or argv[0] not in cmds or len(argv) - 1 != cmds[argv[0]][1]:
        sys.exit(__doc__)
    fn, _ = cmds[argv[0]]
    fn(*argv[1:])


if __name__ == "__main__":
    main(sys.argv[1:])
