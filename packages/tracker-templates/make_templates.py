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
  # current value (the yellow number), e.g. a World Tour score of 5,239.
  # --only limits which digits are written; --blend averages into the
  # existing template instead of replacing it:
  python make_templates.py digits shot.png 5239
  python make_templates.py digits shot.png 6998 --only 9
  python make_templates.py digits shot.png 6998 --only 8 --variant yellow

  # Ranked badge tier numbers, from a ranked MODES screen: pass the current
  # tier (the left badge). Writes that number and the next badge's (right).
  # --only / --blend work as for digits:
  python make_templates.py tier shot.png 2

  # Check what the tracker reads from a screenshot:
  python make_templates.py check shot.png
  # Ranked needs the last saved ranked score to place the read:
  python make_templates.py check shot.png --anchor 25000

Needs numpy + Pillow. Reuses the tracker's reader from ../local-win.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

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


def cmd_digits(shot: str, value: str, only: str = "", blend: bool = False,
               variant: str = "") -> None:
    """Write digit templates from the yellow value in `shot`. Repeated
    digits are averaged. `only` limits which digits are written; `blend`
    averages the new sample 50/50 into the existing template instead of
    replacing it (keeps the margin that multi-sample templates have).
    `variant` writes digit_<d>_<variant>.pgm alongside the main template,
    for a digit whose yellow and white renderings differ (e.g. 8)."""
    value = value.replace(",", "")
    rgb, s = load(shot)
    _, _, region, group = find_value_row(rgb, s)
    ink = sr.yellow_ink(region)
    if len(group) != len(value):
        sys.exit(f"found {len(group)} yellow glyphs but '{value}' has {len(value)} digits")
    samples: dict[str, list[np.ndarray]] = {}
    for ch, c in zip(value, group):
        if not only or ch in only:
            samples.setdefault(ch, []).append(sr.normalize_glyph(sr.glyph_image(ink, c)))
    for ch, gs in sorted(samples.items()):
        g = np.mean(gs, axis=0)
        path = HERE / (f"digit_{ch}_{variant}.pgm" if variant else f"digit_{ch}.pgm")
        if blend and path.is_file():
            g = (g + sr.read_pgm(path).astype(np.float32) / 255.0) / 2
        sr.write_pgm(path, np.round(g * 255).astype(np.uint8))
        print(f"{'blended' if blend else 'wrote'} {path.name} ({len(gs)} sample{'s' * (len(gs) > 1)})")


def cmd_tier(shot: str, tier: str, only: str = "", blend: bool = False) -> None:
    """Write badge_tier_<n>.pgm for both badges of a ranked MODES screen.
    `tier` is the current (left) badge's tier; the right one is the next."""
    if tier not in "1234" or len(tier) != 1:
        sys.exit("tier must be 1, 2, 3 or 4")
    a = int(tier)
    b = 4 if a == 1 else a - 1
    rgb, s = load(shot)
    H, W = rgb.shape[:2]
    rx0, ry0 = int(W / 2 - 640 * s), int(H - 380 * s)
    region = rgb[ry0:H, rx0:int(W / 2 + 640 * s)]
    t = sr.Templates.load(HERE)
    if "ranked" not in t.headers:
        sys.exit("header_ranked.pgm missing — cut it first")
    tm = sr.scale_mask(t.headers["ranked"], s)
    hx, hy, score = sr.match_template(sr.white_mask(region), tm, max(1, int(4 * s)))
    if score < sr.HEADER_MIN:
        sys.exit(f"no ranked header found (match {score:.2f})")
    cx, cy = hx + tm.shape[1] / 2, hy + sr.TIER_DY * s
    for n, x in ((a, cx - sr.TIER_DX * s), (b, cx + sr.TIER_DX * s)):
        if only and str(n) not in only:
            continue
        zr = int(sr.TIER_ZONE * s)
        x0, y0 = max(0, int(x) - zr), max(0, int(cy) - zr)
        lum = sr.luma(region[y0:int(cy) + zr, x0:int(x) + zr])
        zh, zw = lum.shape
        comps = [
            c for c in sr.components((lum > sr.TIER_LUMA_MIN).astype(np.uint8))
            if 11 * s <= c.h <= 24 * s and c.w <= c.h
            and c.x0 > 0 and c.y0 > 0 and c.x1 < zw and c.y1 < zh
        ]
        if not comps:
            sys.exit(f"no tier number found on the badge for {n}")
        c = min(comps, key=lambda c: abs((c.x0 + c.x1) / 2 - (x - x0)) + abs((c.y0 + c.y1) / 2 - (cy - y0)))
        ink = np.clip((lum - sr.TIER_INK_LO) / sr.TIER_INK_SPAN, 0, 1)
        g = sr.normalize_glyph(sr.glyph_image(ink, c))
        path = HERE / f"badge_tier_{n}.pgm"
        if blend and path.is_file():
            g = (g + sr.read_pgm(path).astype(np.float32) / 255.0) / 2
        sr.write_pgm(path, np.round(g * 255).astype(np.uint8))
        print(f"{'blended' if blend else 'wrote'} {path.name} ({c.w}x{c.h}px glyph)")


def cmd_check(shot: str, anchor: Optional[int] = None) -> None:
    rgb, _ = load(shot)
    t = sr.Templates.load(HERE)
    r = sr.read_frame(rgb, t, anchor)
    print(f"gate {r.gate_score:.3f}  headers {r.header_scores}")
    print(f"=> {r.verdict}  (mode={r.mode}, value={r.value}, max={r.max_value}, "
          f"tier={r.tier}, total={r.total})")


def main(argv: list[str]) -> None:
    # Flags (digits only): --only 39, --blend
    only, blend, variant, anchor, args = "", False, "", None, []
    it = iter(argv)
    for a in it:
        if a == "--only":
            only = next(it, "")
        elif a == "--blend":
            blend = True
        elif a == "--variant":
            variant = next(it, "")
        elif a == "--anchor":
            anchor = int(next(it, "0"))
        else:
            args.append(a)
    if args and args[0] == "digits" and len(args) == 3:
        return cmd_digits(args[1], args[2], only, blend, variant)
    if args and args[0] == "tier" and len(args) == 3:
        return cmd_tier(args[1], args[2], only, blend)
    if args and args[0] == "check" and len(args) == 2:
        return cmd_check(args[1], anchor)
    argv = args
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
