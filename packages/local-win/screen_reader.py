"""
screen_reader.py — template-matching reader for THE FINALS' Modes screen.

Finds World Tour score / Ranked score on the lobby's MODES tab without any
OCR engine. Everything is plain numpy so the tracker has no PyTorch/EasyOCR
dependency. packages/local-linux/season-tracker.c is a C port of this file;
keep the two in step (same masks, thresholds and geometry).

Two screens are read:
  * the lobby MODES tab (World Tour / Ranked panel at the bottom centre), and
  * the post-match "WORLD TOUR SCORE" panel shown after every match (centred;
    the value counts up for ~0.5s, then holds ~1.5s).

How a MODES frame is read:
  1. Gate — is the yellow-highlighted MODES tab in the top nav bar? Template
     match the tab's yellow mask in the top-left of the screen.
  2. Header — which panel is showing at the bottom centre? Match each header
     template ("WORLD TOUR SCORE", "PLACEMENT ROUNDS", optionally a ranked
     header) against the white-text mask and keep the best.
  3. Value — under the header the current value is drawn in yellow and the
     max in white ("2,726 / 8,000"). Split the yellow mask into glyphs and
     classify each one against the digit templates. The white max is read
     the same way and used as a sanity check (current <= max).

Templates are binary masks captured at 2560x1440 (see
packages/tracker-templates/README.md) and scaled by monitor height, since
the game's UI scales with vertical resolution.

The post-match panel uses an upright font with the whole "5,736/8,000" in
white, so it has its own header and glyph templates (post_*.pgm), and is
read from a small centre zone (post_zone) rather than the full frame.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

REF_H = 1440  # height of the screenshots the templates were cut from

# Header template name -> server mode. None = recognised but nothing to push
# (placement rounds show "0 / 4" games played, not a score).
HEADER_MODES = {
    "world_tour": "world-tour",
    "ranked": "ranked",
    "placement": None,
}

# Post-match panel header name -> server mode.
POST_HEADER_MODES = {
    "world_tour": "world-tour",
    "ranked": "ranked",
}
# Glyphs of the post-match value: digits plus the "/" between current and max.
POST_GLYPHS = {**{d: d for d in "0123456789"}, "slash": "/"}

# Match thresholds (normalised cross-correlation, -1..1).
GATE_MIN = 0.60     # MODES tab
# Pre-check: skip the MODES-tab match unless the gate zone holds at least this
# fraction of the tab's yellow pixels. In a match there's almost no yellow up
# there, so most polls end after one mask pass.
GATE_MIN_YELLOW = 0.5
HEADER_MIN = 0.60   # bottom-centre header
DIGIT_MIN = 0.70    # best digit template for a glyph
DIGIT_MARGIN = 0.04 # best must beat the runner-up by this much

DIGIT_H, DIGIT_W = 24, 20  # normalised glyph canvas
# Below ~900p the digits are ~10px tall and 5/6, 0/8 stop being reliably
# distinguishable, so refuse to read rather than risk pushing a wrong value.
MIN_SCALE = 0.6


# ── Templates ────────────────────────────────────────────────────────────────


def read_pgm(path: Path) -> np.ndarray:
    """Read a binary (P5) PGM. Kept dependency-free so the C side can use the
    exact same files with a ~20 line loader."""
    data = path.read_bytes()
    parts: list[bytes] = []
    i = 0
    while len(parts) < 4:
        while data[i:i + 1].isspace():
            i += 1
        if data[i:i + 1] == b"#":
            while data[i:i + 1] not in (b"\n", b""):
                i += 1
            continue
        j = i
        while not data[j:j + 1].isspace():
            j += 1
        parts.append(data[i:j])
        i = j
    if parts[0] != b"P5":
        raise ValueError(f"{path}: not a binary PGM")
    w, h = int(parts[1]), int(parts[2])
    i += 1  # single whitespace after maxval
    return np.frombuffer(data[i:i + w * h], dtype=np.uint8).reshape(h, w).copy()


def write_pgm(path: Path, img: np.ndarray) -> None:
    img = np.asarray(img, dtype=np.uint8)
    h, w = img.shape
    path.write_bytes(f"P5\n{w} {h}\n255\n".encode() + img.tobytes())


@dataclass
class Templates:
    modes: np.ndarray                      # 0/1 mask, reference scale
    headers: dict[str, np.ndarray]         # name -> 0/1 mask, reference scale
    # "0".."9" -> float DIGIT_H x DIGIT_W. Variant templates for the same digit
    # use keys like "8_yellow" (file digit_8_yellow.pgm); the first character
    # is the digit, and a glyph scores the best of its digit's variants.
    digits: dict[str, np.ndarray]
    # Post-match panel (both empty if its templates aren't installed).
    post_headers: dict[str, np.ndarray] = field(default_factory=dict)
    post_glyphs: dict[str, np.ndarray] = field(default_factory=dict)  # "0".."9", "/"

    @classmethod
    def load(cls, folder: Path) -> "Templates":
        modes = (read_pgm(folder / "modes_tab.pgm") > 127).astype(np.uint8)
        headers = {}
        for name in HEADER_MODES:
            p = folder / f"header_{name}.pgm"
            if p.is_file():
                headers[name] = (read_pgm(p) > 127).astype(np.uint8)
        digits = {
            d: read_pgm(folder / f"digit_{d}.pgm").astype(np.float32) / 255.0
            for d in "0123456789"
        }
        for p in sorted(folder.glob("digit_[0-9]_*.pgm")):
            digits[p.stem[len("digit_"):]] = read_pgm(p).astype(np.float32) / 255.0
        post_headers = {}
        for name in POST_HEADER_MODES:
            p = folder / f"post_header_{name}.pgm"
            if p.is_file():
                post_headers[name] = (read_pgm(p) > 127).astype(np.uint8)
        post_glyphs = {}
        if post_headers and all((folder / f"post_digit_{n}.pgm").is_file() for n in POST_GLYPHS):
            post_glyphs = {
                ch: read_pgm(folder / f"post_digit_{n}.pgm").astype(np.float32) / 255.0
                for n, ch in POST_GLYPHS.items()
            }
        else:
            post_headers = {}
        return cls(modes=modes, headers=headers, digits=digits,
                   post_headers=post_headers, post_glyphs=post_glyphs)


def find_templates_dir(script_dir: Path) -> Path:
    """Installed builds ship templates next to the script; a repo checkout
    keeps them in packages/tracker-templates."""
    for cand in (script_dir / "templates", script_dir.parent / "tracker-templates"):
        if (cand / "modes_tab.pgm").is_file():
            return cand
    raise FileNotFoundError(
        f"template folder not found (looked in {script_dir / 'templates'} "
        f"and {script_dir.parent / 'tracker-templates'})"
    )


# ── Colour masks ─────────────────────────────────────────────────────────────


def yellow_mask(rgb: np.ndarray) -> np.ndarray:
    """The game's accent yellow: MODES tab, current score value."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return ((r > 190) & (g > 130) & (b < 110) & (r - b > 110)).astype(np.uint8)


def white_mask(rgb: np.ndarray, threshold: int = 200) -> np.ndarray:
    """Near-white UI text: headers, the max value."""
    return (rgb.min(axis=2) > threshold).astype(np.uint8)


# Soft versions (0..1) used to classify glyphs. The binary masks above find
# the glyphs; these keep the anti-aliased edges, which carry most of the
# shape information once text is only ~15px tall (1080p).


def yellow_ink(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    return np.clip((r - b - 60) / 120, 0, 1)


def white_ink(rgb: np.ndarray, lo: int = 130, span: int = 90) -> np.ndarray:
    return np.clip((rgb.min(axis=2).astype(np.float32) - lo) / span, 0, 1)


# ── Template matching ────────────────────────────────────────────────────────


def scale_mask(mask: np.ndarray, s: float) -> np.ndarray:
    """Nearest-neighbour resize of a 0/1 mask by factor s."""
    h, w = mask.shape
    nh, nw = max(1, int(h * s + 0.5)), max(1, int(w * s + 0.5))
    ys = np.minimum(((np.arange(nh) + 0.5) / s).astype(int), h - 1)
    xs = np.minimum(((np.arange(nw) + 0.5) / s).astype(int), w - 1)
    return mask[ys][:, xs]


def _block_mean(a: np.ndarray, d: int) -> np.ndarray:
    h, w = (a.shape[0] // d) * d, (a.shape[1] // d) * d
    return a[:h, :w].reshape(h // d, d, w // d, d).mean(axis=(1, 3))


def _ncc_map(img: np.ndarray, tmpl: np.ndarray) -> np.ndarray:
    """NCC of tmpl at every valid offset in img (both float)."""
    H, W = img.shape
    h, w = tmpl.shape
    oh, ow = H - h + 1, W - w + 1
    n = h * w
    t = tmpl - tmpl.mean()
    t_norm = np.sqrt((t * t).sum())
    num = np.zeros((oh, ow), dtype=np.float64)
    for dy in range(h):
        row = t[dy]
        for dx in range(w):
            v = row[dx]
            if v:
                num += v * img[dy:dy + oh, dx:dx + ow]
    ii = np.pad(img, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    ii2 = np.pad(img * img, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    s1 = ii[h:, w:] - ii[:-h, w:] - ii[h:, :-w] + ii[:-h, :-w]
    s2 = ii2[h:, w:] - ii2[:-h, w:] - ii2[h:, :-w] + ii2[:-h, :-w]
    var = np.maximum(s2 - s1 * s1 / n, 0)
    den = np.sqrt(var) * t_norm
    out = np.zeros_like(num)
    ok = den > 1e-9
    out[ok] = num[ok] / den[ok]
    return out


def _ncc_at(img: np.ndarray, tmpl: np.ndarray, x: int, y: int) -> float:
    h, w = tmpl.shape
    a = img[y:y + h, x:x + w].astype(np.float64)
    b = tmpl.astype(np.float64)
    a = a - a.mean()
    b = b - b.mean()
    den = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / den) if den > 1e-9 else 0.0


def match_template(mask: np.ndarray, tmpl: np.ndarray, d: int) -> tuple[int, int, float]:
    """Best (x, y, score) of a 0/1 template in a 0/1 mask. Coarse search on
    d-times downsampled copies, then an exact refine within ±d pixels."""
    H, W = mask.shape
    h, w = tmpl.shape
    if h > H or w > W:
        return 0, 0, 0.0
    cm = _block_mean(mask.astype(np.float64), d)
    ct = _block_mean(tmpl.astype(np.float64), d)
    if ct.shape[0] < 1 or ct.shape[1] < 1 or ct.shape[0] > cm.shape[0] or ct.shape[1] > cm.shape[1]:
        cx = cy = 0
    else:
        m = _ncc_map(cm, ct)
        cy, cx = np.unravel_index(int(np.argmax(m)), m.shape)
    best = (0, 0, -1.0)
    for y in range(max(0, cy * d - d), min(H - h, cy * d + d) + 1):
        for x in range(max(0, cx * d - d), min(W - w, cx * d + d) + 1):
            sc = _ncc_at(mask, tmpl, x, y)
            if sc > best[2]:
                best = (x, y, sc)
    return best


# ── Glyphs ───────────────────────────────────────────────────────────────────


@dataclass
class Comp:
    x0: int
    y0: int
    x1: int  # exclusive
    y1: int  # exclusive
    mask: np.ndarray  # 0/1, cropped to the bbox, only this component

    @property
    def w(self) -> int:
        return self.x1 - self.x0

    @property
    def h(self) -> int:
        return self.y1 - self.y0


def components(mask: np.ndarray) -> list[Comp]:
    """8-connected components of a small 0/1 mask, sorted left to right."""
    H, W = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny in (y - 1, y, y + 1):
                if ny < 0 or ny >= H:
                    continue
                for nx in (x - 1, x, x + 1):
                    if 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        ys = np.array([p[0] for p in pts])
        xs = np.array([p[1] for p in pts])
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        m = np.zeros((y1 - y0, x1 - x0), dtype=np.uint8)
        m[ys - y0, xs - x0] = 1
        out.append(Comp(int(x0), int(y0), int(x1), int(y1), m))
    out.sort(key=lambda c: c.x0)
    return out


def glyph_image(ink: np.ndarray, c: Comp) -> np.ndarray:
    """Soft ink inside a component's bbox, limited to the component grown by
    one pixel (keeps its anti-aliased edge, drops neighbouring glyphs that
    overlap the bbox because of the italic slant)."""
    m = np.pad(c.mask, 1)
    grown = np.zeros_like(m)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            grown |= np.pad(m, 1)[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    return ink[c.y0:c.y1, c.x0:c.x1] * grown[1:-1, 1:-1]


def normalize_glyph(m: np.ndarray) -> np.ndarray:
    """Scale a glyph image (0..1) to DIGIT_H tall (aspect kept, width capped at
    DIGIT_W) and centre it on a DIGIT_H x DIGIT_W canvas. Each output pixel
    is the mean of a 4x4 grid of nearest-neighbour samples, so this works for
    both up- and down-scaling. Mirrored exactly in season-tracker.c."""
    h, w = m.shape
    nw = min(DIGIT_W, max(1, int(w * DIGIT_H / h + 0.5)))
    off = (DIGIT_W - nw) // 2
    out = np.zeros((DIGIT_H, DIGIT_W), dtype=np.float32)
    sub = (np.arange(4) + 0.5) / 4
    for oy in range(DIGIT_H):
        sy = np.minimum(((oy + sub) * h / DIGIT_H).astype(int), h - 1)
        for ox in range(nw):
            sx = np.minimum(((ox + sub) * w / nw).astype(int), w - 1)
            out[oy, ox + off] = m[np.ix_(sy, sx)].mean()
    return out


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    den = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / den) if den > 1e-9 else 0.0


def classify_digit(g_img: np.ndarray, digits: dict[str, np.ndarray]) -> tuple[Optional[str], float, float]:
    """Return (glyph or None, best score, runner-up score). Keys may be
    variants ("8_yellow"): each glyph character scores the best of its
    variants, and the margin is measured against other characters."""
    g = normalize_glyph(g_img)
    per_char: dict[str, float] = {}
    for key, t in digits.items():
        sc = _ncc(g, t)
        if sc > per_char.get(key[0], -2.0):
            per_char[key[0]] = sc
    scores = sorted(((sc, ch) for ch, sc in per_char.items()), reverse=True)
    (best, d), (second, _) = scores[0], scores[1]
    if best < DIGIT_MIN or best - second < DIGIT_MARGIN:
        return None, best, second
    return d, best, second


def _digit_like(c: Comp, s: float) -> bool:
    return 14 * s <= c.h <= 32 * s and c.w <= c.h


# Gap between glyphs (as a fraction of glyph height) that ends a run. Normal
# digit and comma gaps are <= ~0.47h; a digit missing from the middle of a
# number leaves ~0.75h, so it ends the run rather than being skipped over.
RUN_GAP = 0.7


def read_glyphs(comps: list[Comp], ink: np.ndarray, glyphs: dict[str, np.ndarray],
                require_all: bool = False) -> tuple[Optional[str], str]:
    """Classify a left-to-right run of glyph components into a string.
    Stops at a gap wider than RUN_GAP glyph heights, or a glyph of a
    different height (end of the run). With require_all, a run that stops
    before the last component is rejected — a missed glyph mid-number would
    otherwise read as a shorter, wrong number. Returns (text or None, info)."""
    out = ""
    prev_x1 = None
    first_h = comps[0].h if comps else 0
    used = 0
    for c in comps:
        if prev_x1 is not None and c.x0 - prev_x1 > c.h * RUN_GAP:
            break
        # A glyph of a different height ends the number (e.g. the heart
        # icon after the World Tour max).
        if abs(c.h - first_h) > first_h * 0.15:
            break
        d, best, second = classify_digit(glyph_image(ink, c), glyphs)
        if d is None:
            return None, f"unrecognised glyph #{len(out) + 1} (best {best:.2f}, next {second:.2f})"
        out += d
        prev_x1 = c.x1
        used += 1
    if not out:
        return None, "no digits"
    if require_all and used < len(comps):
        return None, f"gap after '{out}' — a glyph may be missing"
    return out, out


# A missed glyph at the start or end of a number leaves no gap to notice, so
# two formatting rules the game always follows are checked instead:
#  - thousands are grouped with commas ("2,726"): the commas fix how many
#    digits there must be, and a multi-digit number never starts with 0;
#  - on MODES the white "/" sits a fixed ~0.45 glyph heights after the value
#    (a missed last digit pushes it past ~1.0).
SLASH_GAP_MAX = 0.8


def grouping_ok(text: str, digit_comps: list[Comp], all_comps: list[Comp]) -> bool:
    """True if `text` (the digits read from `digit_comps`, left to right) is
    consistent with the commas among `all_comps` (every component of the
    same colour in the row)."""
    if not text.isdigit() or len(text) != len(digit_comps):
        return False
    if len(text) > 1 and text[0] == "0":
        return False
    h = max(c.h for c in digit_comps)
    base = max(c.y1 for c in digit_comps)
    # Include a stray comma just before the first digit: that's what a missed
    # leading digit leaves behind ("2,726" read as ",726").
    lo, hi = digit_comps[0].x0 - h, digit_comps[-1].x0 + 3
    commas = [
        (c.x0 + c.x1) / 2 for c in all_comps
        if c.h < 0.6 * h and abs(c.y1 - base) < 0.4 * h and lo <= (c.x0 + c.x1) / 2 <= hi
    ]
    # Digits to the right of each comma must be 3, 6, 9, ... and there must
    # be exactly as many commas as the digit count calls for.
    right = sorted(sum(1 for d in digit_comps if (d.x0 + d.x1) / 2 > cx) for cx in commas)
    return right == [3 * (i + 1) for i in range(len(right))] and len(right) == (len(text) - 1) // 3


def read_number(comps: list[Comp], ink: np.ndarray, digits: dict[str, np.ndarray],
                require_all: bool = False) -> tuple[Optional[int], str]:
    """Classify a left-to-right run of glyph components as one number."""
    text, info = read_glyphs(comps, ink, digits, require_all)
    return (int(text), info) if text is not None else (None, info)


# ── Screen read ──────────────────────────────────────────────────────────────


@dataclass
class Reading:
    screen: str = ""          # "modes" or "post" once a screen is recognised
    on_modes: bool = False
    gate_score: float = 0.0
    header: Optional[str] = None
    header_scores: dict[str, float] = field(default_factory=dict)
    value: Optional[int] = None
    max_value: Optional[int] = None
    verdict: str = ""

    @property
    def mode(self) -> Optional[str]:
        if not self.header:
            return None
        table = POST_HEADER_MODES if self.screen == "post" else HEADER_MODES
        return table.get(self.header)


def gate_zone(screen_w: int, screen_h: int) -> tuple[int, int]:
    """(width, height) of the top-left zone the MODES tab is searched in.
    The tab sits at x~270-413, y 0-85 at 1440p; the extra width allows for a
    shifted nav bar (e.g. ultrawide). About 3% of the screen, so the tracker
    can grab just this zone on every poll and the full frame only on a hit."""
    s = screen_h / REF_H
    return min(screen_w, int(960 * s)), min(screen_h, int(130 * s))


def check_gate(frame: np.ndarray, t: Templates, screen_h: Optional[int] = None) -> tuple[bool, float]:
    """Is the yellow MODES tab highlighted? frame is either the full monitor
    or just its gate_zone() (then pass the monitor height as screen_h)."""
    H = screen_h or frame.shape[0]
    s = H / REF_H
    zw, zh = gate_zone(frame.shape[1], H)
    ymask = yellow_mask(frame[:zh, :zw])
    if ymask.sum() < GATE_MIN_YELLOW * t.modes.sum() * s * s:
        return False, 0.0
    tm = scale_mask(t.modes, s)
    _, _, score = match_template(ymask, tm, max(1, int(4 * s)))
    return score >= GATE_MIN, score


def read_frame(frame: np.ndarray, t: Templates) -> Reading:
    """Run the full gate -> header -> value pipeline on one full-monitor
    RGB frame."""
    r = Reading()
    H, W = frame.shape[:2]
    s = H / REF_H
    d = max(1, int(4 * s))

    r.on_modes, r.gate_score = check_gate(frame, t)
    if not r.on_modes:
        # Not the lobby — maybe the post-match score panel.
        x0, y0, zw, zh = post_zone(W, H)
        p = read_post(frame[y0:y0 + zh, x0:x0 + zw], t, H)
        if p.screen == "post":
            p.gate_score = r.gate_score
            return p
        r.verdict = f"not on the MODES tab (tab match {r.gate_score:.2f})"
        return r
    r.screen = "modes"

    # Bottom-centre panel. The game centres it horizontally, so anchor the
    # search on the screen centre rather than a fraction of the width.
    rx0 = max(0, int(W / 2 - 640 * s))
    rx1 = min(W, int(W / 2 + 640 * s))
    ry0 = max(0, int(H - 380 * s))
    region = frame[ry0:H, rx0:rx1]
    wmask = white_mask(region)

    best = None
    for name, tmpl in t.headers.items():
        tm = scale_mask(tmpl, s)
        x, y, score = match_template(wmask, tm, d)
        r.header_scores[name] = round(score, 3)
        if score >= HEADER_MIN and (best is None or score > best[3]):
            best = (name, x, y, score, tm.shape)
    if best is None:
        scores = ", ".join(f"{k} {v:.2f}" for k, v in r.header_scores.items())
        r.verdict = f"on MODES, but no known score header ({scores})"
        return r

    name, hx, hy, _, (th, tw) = best
    r.header = name
    if HEADER_MODES[name] is None:
        r.verdict = f"'{name}' panel — nothing to record"
        return r

    if s < MIN_SCALE:
        r.verdict = f"'{name}' found, but {W}x{H} is too low to read digits (need 900p+)"
        return r

    # Value row: current (yellow) then "/ max" (white), just under the header.
    vx0 = max(0, int(hx - 40 * s))
    vx1 = min(region.shape[1], int(hx + tw + 40 * s))
    vy0 = int(hy + th + 2 * s)
    vy1 = min(region.shape[0], int(hy + th + 42 * s))
    row = region[vy0:vy1, vx0:vx1]

    ycomps = [c for c in components(yellow_mask(row)) if _digit_like(c, s)]
    if not ycomps:
        r.verdict = f"'{name}' header found, but no yellow value under it"
        return r
    # The yellow current value is the only yellow text in the row, so every
    # digit-shaped glyph must be part of it.
    value, info = read_number(ycomps, yellow_ink(row), t.digits, require_all=True)
    if value is None:
        r.verdict = f"'{name}' value unreadable: {info}"
        return r
    if not grouping_ok(info, ycomps, components(yellow_mask(row))):
        r.verdict = f"'{name}' read {info}, but its commas don't fit — a digit may be missing"
        return r

    # Max: white glyphs right of the current value; the first is the "/".
    last_x1 = ycomps[-1].x1
    wall = components(white_mask(row))
    wcomps = [c for c in wall if c.x0 >= last_x1 and _digit_like(c, s)]
    if wcomps and wcomps[0].x0 - last_x1 > SLASH_GAP_MAX * ycomps[0].h:
        r.verdict = f"'{name}' read {info}, but the '/' is too far after it — a digit may be missing"
        return r
    max_value = None
    if len(wcomps) >= 2:
        max_value, mtext = read_number(wcomps[1:], white_ink(row), t.digits)
        # An inconsistent max just skips the sanity check below.
        if max_value is not None and not grouping_ok(mtext, wcomps[1:1 + len(mtext)], wall):
            max_value = None
    if max_value is not None and value > max_value:
        r.verdict = f"'{name}' read {value} / {max_value} — current > max, rejecting"
        return r

    r.value, r.max_value = value, max_value
    r.verdict = f"{name}: {value}" + (f" / {max_value}" if max_value is not None else "")
    return r


# ── Post-match panel ─────────────────────────────────────────────────────────

POST_MIN_WHITE = 0.5  # pre-check: share of the header's white pixels needed
# The post-match value is small, thin upright text (19px at 1440p) on a
# saturated background, so it's masked at a lower brightness than the MODES
# text — at 200 its strokes break apart at 1080p.
POST_WHITE_MIN = 150
POST_INK_LO, POST_INK_SPAN = 100, 110


def post_zone(screen_w: int, screen_h: int) -> tuple[int, int, int, int]:
    """(x, y, width, height) of the centre zone holding the post-match
    "WORLD TOUR SCORE" header and value. At 1440p the header sits at
    x 1130-1437, y 654-683 and the value just below it. ~4% of the screen."""
    s = screen_h / REF_H
    x0 = max(0, int(screen_w / 2 - 360 * s))
    y0 = max(0, int(screen_h / 2 - 150 * s))
    x1 = min(screen_w, int(screen_w / 2 + 360 * s))
    y1 = min(screen_h, int(screen_h / 2 + 60 * s))
    return x0, y0, x1 - x0, y1 - y0


def read_post(zone: np.ndarray, t: Templates, screen_h: int) -> Reading:
    """Read the post-match panel from its post_zone() crop. screen.post is
    set as soon as the header is found, even if the value can't be read yet
    (it's still counting up or fading in) — the tracker uses that to poll
    faster while the panel is up."""
    r = Reading()
    if not t.post_headers:
        r.verdict = "post-match templates not installed"
        return r
    s = screen_h / REF_H
    if s < MIN_SCALE:
        r.verdict = "resolution too low for the post-match panel"
        return r
    wmask = white_mask(zone)

    # Pre-check: the header alone is a lot of white; without that much,
    # skip the template match.
    need = POST_MIN_WHITE * min(m.sum() for m in t.post_headers.values()) * s * s
    if wmask.sum() < need:
        r.verdict = "no post-match panel"
        return r

    d = max(1, int(4 * s))
    best = None
    for name, tmpl in t.post_headers.items():
        tm = scale_mask(tmpl, s)
        x, y, score = match_template(wmask, tm, d)
        r.header_scores[name] = round(score, 3)
        if score >= HEADER_MIN and (best is None or score > best[3]):
            best = (name, x, y, score, tm.shape)
    if best is None:
        r.verdict = "no post-match panel"
        return r

    name, hx, hy, _, (th, tw) = best
    r.screen, r.header = "post", name

    # Value row just under the header: "5,736/8,000" in white.
    vx0 = max(0, int(hx - 60 * s))
    vx1 = min(zone.shape[1], int(hx + tw + 60 * s))
    vy0 = int(hy + th + 2 * s)
    vy1 = min(zone.shape[0], int(hy + th + 50 * s))
    row = zone[vy0:vy1, vx0:vx1]
    comps = [c for c in components(white_mask(row, POST_WHITE_MIN)) if _digit_like(c, s)]
    if not comps:
        r.verdict = f"post-match '{name}' panel, value not visible yet"
        return r
    ink = white_ink(row, POST_INK_LO, POST_INK_SPAN)
    text, info = read_glyphs(comps, ink, t.post_glyphs)
    if text is None:
        r.verdict = f"post-match '{name}' value unreadable: {info}"
        return r
    cur, sep, mx = text.partition("/")
    if not sep or not cur.isdigit() or not mx.isdigit():
        r.verdict = f"post-match '{name}' value malformed: {text!r}"
        return r
    wall = components(white_mask(row, POST_WHITE_MIN))
    k = len(cur)
    if not (grouping_ok(cur, comps[:k], wall)
            and grouping_ok(mx, comps[k + 1:k + 1 + len(mx)], wall)):
        r.verdict = f"post-match '{name}' read {text}, but its commas don't fit — a digit may be missing"
        return r
    value, max_value = int(cur), int(mx)
    if value > max_value:
        r.verdict = f"post-match '{name}' read {value} / {max_value} — current > max, rejecting"
        return r
    r.value, r.max_value = value, max_value
    r.verdict = f"post-match {name}: {value} / {max_value}"
    return r
