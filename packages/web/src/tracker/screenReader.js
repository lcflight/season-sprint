// Template-matching reader for THE FINALS' score screens, for the in-browser
// screen tracker. A port of packages/local-win/screen_reader.py (which
// packages/local-linux/season-tracker.c also mirrors): keep all three in step,
// with the same masks, thresholds and geometry. The comments there explain the
// why. tests/screenReader.spec.js checks this file against the Python reader.
//
// Two screens are read: the lobby MODES tab (World Tour panel at the bottom
// centre) and the post-match "WORLD TOUR SCORE" panel. Templates are binary
// masks cut from 2560x1440 screenshots (packages/tracker-templates), scaled
// by screen height since the game UI scales with vertical resolution.
//
// The reader never needs the whole frame. It asks a "source" for just the
// regions it looks at, so the browser only copies those pixels:
//
//   source = { width, height, region(x, y, w, h) -> { data, w, h } }
//
// where data is RGBA bytes (as from getImageData), w*h*4 long.

import { fansTotalFromReadout } from '@/utils/fans'

export const REF_H = 1440

// Header template name -> server mode. null = recognised, nothing to record.
export const HEADER_MODES = { world_tour: 'world-tour', ranked: 'ranked', placement: null }
export const POST_HEADER_MODES = { world_tour: 'world-tour', ranked: 'ranked' }
export const POST_GLYPHS = { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', slash: '/' }

const GATE_MIN = 0.6
const GATE_MIN_YELLOW = 0.5
const HEADER_MIN = 0.6
const DIGIT_MIN = 0.7
const DIGIT_MARGIN = 0.04
const DIGIT_H = 24
const DIGIT_W = 20
const MIN_SCALE = 0.6
const RUN_GAP = 0.7
const SLASH_GAP_MAX = 0.8
const POST_MIN_WHITE = 0.5
const POST_WHITE_MIN = 150
const POST_INK_LO = 100
const POST_INK_SPAN = 110

const int = Math.trunc // Python int() on a float

// ── Templates ────────────────────────────────────────────────────────────────

/** Parse a binary (P5) PGM into { w, h, data: Uint8Array }. */
export function parsePgm(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12
  const parts = []
  let i = 0
  while (parts.length < 4) {
    while (isSpace(b[i])) i++
    if (b[i] === 35) { // '#'
      while (i < b.length && b[i] !== 10) i++
      continue
    }
    let j = i
    while (j < b.length && !isSpace(b[j])) j++
    parts.push(String.fromCharCode(...b.subarray(i, j)))
    i = j
  }
  if (parts[0] !== 'P5') throw new Error('not a binary PGM')
  const w = Number(parts[1])
  const h = Number(parts[2])
  i += 1
  return { w, h, data: b.slice(i, i + w * h) }
}

const toMask = (p) => ({ w: p.w, h: p.h, data: p.data.map((v) => (v > 127 ? 1 : 0)) })
const toFloat = (p) => Float32Array.from(p.data, (v) => v / 255)

/**
 * Build the template set from { fileName: PGM bytes } (e.g. "digit_3.pgm").
 * Missing optional files (ranked headers, post-match set) are skipped, as in
 * the Python Templates.load.
 */
export function buildTemplates(files) {
  const get = (n) => (files[n] ? parsePgm(files[n]) : null)
  const modesPgm = get('modes_tab.pgm')
  if (!modesPgm) throw new Error('modes_tab.pgm missing')
  const headers = {}
  for (const name of Object.keys(HEADER_MODES)) {
    const p = get(`header_${name}.pgm`)
    if (p) headers[name] = toMask(p)
  }
  const digits = {}
  for (let d = 0; d <= 9; d++) {
    const p = get(`digit_${d}.pgm`)
    if (!p) throw new Error(`digit_${d}.pgm missing`)
    digits[String(d)] = toFloat(p)
  }
  // Variants ("digit_8_yellow.pgm" -> key "8_yellow"), sorted like Python's glob.
  for (const n of Object.keys(files).sort()) {
    const m = /^digit_(\d_.+)\.pgm$/.exec(n)
    if (m) digits[m[1]] = toFloat(parsePgm(files[n]))
  }
  let postHeaders = {}
  for (const name of Object.keys(POST_HEADER_MODES)) {
    const p = get(`post_header_${name}.pgm`)
    if (p) postHeaders[name] = toMask(p)
  }
  let postGlyphs = {}
  const haveGlyphs = Object.keys(POST_GLYPHS).every((n) => files[`post_digit_${n}.pgm`])
  if (Object.keys(postHeaders).length && haveGlyphs) {
    for (const [n, ch] of Object.entries(POST_GLYPHS)) postGlyphs[ch] = toFloat(get(`post_digit_${n}.pgm`))
  } else {
    postHeaders = {}
  }
  const modes = toMask(modesPgm)
  for (const m of [modes, ...Object.values(headers), ...Object.values(postHeaders)]) m.sum = maskSum(m)
  return { modes, headers, digits, postHeaders, postGlyphs }
}

// ── Images ───────────────────────────────────────────────────────────────────
// Masks are { w, h, data: Uint8Array (0/1) }; ink is { w, h, data: Float32Array }.

function maskSum(m) {
  let s = 0
  for (let i = 0; i < m.data.length; i++) s += m.data[i]
  return s
}

/** Sub-rectangle of an RGBA image, clamped like a numpy slice. */
function crop(img, x0, y0, x1, y1) {
  x0 = Math.max(0, x0)
  y0 = Math.max(0, y0)
  x1 = Math.min(img.w, x1)
  y1 = Math.min(img.h, y1)
  const w = Math.max(0, x1 - x0)
  const h = Math.max(0, y1 - y0)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * img.w + x0) * 4
    data.set(img.data.subarray(from, from + w * 4), y * w * 4)
  }
  return { w, h, data }
}

function yellowMask(img) {
  const n = img.w * img.h
  const out = new Uint8Array(n)
  const d = img.data
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]
    out[i] = r > 190 && g > 130 && b < 110 && r - b > 110 ? 1 : 0
  }
  return { w: img.w, h: img.h, data: out }
}

function whiteMask(img, threshold = 200) {
  const n = img.w * img.h
  const out = new Uint8Array(n)
  const d = img.data
  for (let i = 0; i < n; i++) {
    out[i] = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > threshold ? 1 : 0
  }
  return { w: img.w, h: img.h, data: out }
}

const clip01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function yellowInk(img) {
  const n = img.w * img.h
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = clip01((img.data[i * 4] - img.data[i * 4 + 2] - 60) / 120)
  return { w: img.w, h: img.h, data: out }
}

function whiteInk(img, lo = 130, span = 90) {
  const n = img.w * img.h
  const out = new Float32Array(n)
  const d = img.data
  for (let i = 0; i < n; i++) out[i] = clip01((Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) - lo) / span)
  return { w: img.w, h: img.h, data: out }
}

// ── Template matching ────────────────────────────────────────────────────────

/** Nearest-neighbour resize of a 0/1 mask by factor s. */
export function scaleMask(mask, s) {
  const { w, h } = mask
  const nh = Math.max(1, int(h * s + 0.5))
  const nw = Math.max(1, int(w * s + 0.5))
  const xs = new Int32Array(nw)
  for (let x = 0; x < nw; x++) xs[x] = Math.min(int((x + 0.5) / s), w - 1)
  const data = new Uint8Array(nw * nh)
  let sum = 0
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(int((y + 0.5) / s), h - 1)
    for (let x = 0; x < nw; x++) {
      const v = mask.data[sy * w + xs[x]]
      data[y * nw + x] = v
      sum += v
    }
  }
  return { w: nw, h: nh, data, sum }
}

function blockMean(m, d) {
  const h = Math.floor(m.h / d)
  const w = Math.floor(m.w / d)
  const data = new Float64Array(w * h)
  const inv = 1 / (d * d)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = 0; dy < d; dy++) {
        const row = (y * d + dy) * m.w + x * d
        for (let dx = 0; dx < d; dx++) s += m.data[row + dx]
      }
      data[y * w + x] = s * inv
    }
  }
  return { w, h, data }
}

/** Offset (x, y) of the highest NCC of tmpl over img (both float). */
function nccArgmax(img, tmpl) {
  const { w: W, h: H } = img
  const { w, h } = tmpl
  const ow = W - w + 1
  const oh = H - h + 1
  const n = w * h
  let tm = 0
  for (let i = 0; i < n; i++) tm += tmpl.data[i]
  tm /= n
  const t = new Float64Array(n)
  let tNorm = 0
  for (let i = 0; i < n; i++) {
    t[i] = tmpl.data[i] - tm
    tNorm += t[i] * t[i]
  }
  tNorm = Math.sqrt(tNorm)
  // Integral images for the window sums.
  const iw = W + 1
  const ii = new Float64Array(iw * (H + 1))
  const ii2 = new Float64Array(iw * (H + 1))
  for (let y = 0; y < H; y++) {
    let rs = 0
    let rs2 = 0
    for (let x = 0; x < W; x++) {
      const v = img.data[y * W + x]
      rs += v
      rs2 += v * v
      ii[(y + 1) * iw + x + 1] = ii[y * iw + x + 1] + rs
      ii2[(y + 1) * iw + x + 1] = ii2[y * iw + x + 1] + rs2
    }
  }
  let best = -Infinity
  let bx = 0
  let by = 0
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let num = 0
      for (let dy = 0; dy < h; dy++) {
        const ir = (y + dy) * W + x
        const tr = dy * w
        for (let dx = 0; dx < w; dx++) num += t[tr + dx] * img.data[ir + dx]
      }
      const a = (y + h) * iw + x + w
      const b = y * iw + x + w
      const c = (y + h) * iw + x
      const e = y * iw + x
      const s1 = ii[a] - ii[b] - ii[c] + ii[e]
      const s2 = ii2[a] - ii2[b] - ii2[c] + ii2[e]
      const den = Math.sqrt(Math.max(s2 - (s1 * s1) / n, 0)) * tNorm
      const v = den > 1e-9 ? num / den : 0
      if (v > best) {
        best = v
        bx = x
        by = y
      }
    }
  }
  return [bx, by]
}

/** NCC of a 0/1 template at (x, y) in a 0/1 mask. */
function nccAt(mask, tmpl, tStats, x, y) {
  const { w, h } = tmpl
  const n = w * h
  let sa = 0
  let sab = 0
  for (let dy = 0; dy < h; dy++) {
    const mr = (y + dy) * mask.w + x
    const tr = dy * w
    for (let dx = 0; dx < w; dx++) {
      const a = mask.data[mr + dx]
      sa += a
      sab += a * tmpl.data[tr + dx]
    }
  }
  // 0/1 values: sum of squares == sum.
  const va = sa - (sa * sa) / n
  const num = sab - (sa * tStats.sum) / n
  const den = Math.sqrt(va * tStats.var)
  return den > 1e-9 ? num / den : 0
}

/**
 * Best [x, y, score] of a 0/1 template in a 0/1 mask: coarse search on
 * d-times downsampled copies, then an exact refine within ±d pixels.
 */
export function matchTemplate(mask, tmpl, d) {
  const { w: W, h: H } = mask
  const { w, h } = tmpl
  if (h > H || w > W) return [0, 0, 0]
  const cm = blockMean(mask, d)
  const ct = blockMean(tmpl, d)
  let cx = 0
  let cy = 0
  if (!(ct.h < 1 || ct.w < 1 || ct.h > cm.h || ct.w > cm.w)) [cx, cy] = nccArgmax(cm, ct)
  const sum = tmpl.sum ?? maskSum(tmpl)
  const tStats = { sum, var: sum - (sum * sum) / (w * h) }
  let best = [0, 0, -1]
  const y1 = Math.min(H - h, cy * d + d)
  const x1 = Math.min(W - w, cx * d + d)
  for (let y = Math.max(0, cy * d - d); y <= y1; y++) {
    for (let x = Math.max(0, cx * d - d); x <= x1; x++) {
      const sc = nccAt(mask, tmpl, tStats, x, y)
      if (sc > best[2]) best = [x, y, sc]
    }
  }
  return best
}

// ── Glyphs ───────────────────────────────────────────────────────────────────

/** 8-connected components of a 0/1 mask, sorted left to right. */
function components(mask) {
  const { w: W, h: H, data } = mask
  const seen = new Uint8Array(W * H)
  const out = []
  for (let i = 0; i < W * H; i++) {
    if (!data[i] || seen[i]) continue
    seen[i] = 1
    const stack = [i]
    const pts = []
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    while (stack.length) {
      const p = stack.pop()
      pts.push(p)
      const y = (p / W) | 0
      const x = p - y * W
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let ny = y - 1; ny <= y + 1; ny++) {
        if (ny < 0 || ny >= H) continue
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || nx >= W) continue
          const q = ny * W + nx
          if (data[q] && !seen[q]) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
    }
    x1 += 1
    y1 += 1
    const cw = x1 - x0
    const m = new Uint8Array(cw * (y1 - y0))
    for (const p of pts) {
      const y = (p / W) | 0
      m[(y - y0) * cw + (p - y * W - x0)] = 1
    }
    out.push({ x0, y0, x1, y1, w: cw, h: y1 - y0, mask: m })
  }
  out.sort((a, b) => a.x0 - b.x0) // stable, like Python's sort
  return out
}

/** Soft ink in a component's bbox, limited to the component grown by 1px. */
function glyphImage(ink, c) {
  const { w, h } = c
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0
      for (let dy = -1; dy <= 1 && !on; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < w && c.mask[yy * w + xx]) {
            on = 1
            break
          }
        }
      }
      if (on) out[y * w + x] = ink.data[(c.y0 + y) * ink.w + c.x0 + x]
    }
  }
  return { w, h, data: out }
}

/** Scale a glyph to DIGIT_H tall and centre it on a DIGIT_H x DIGIT_W canvas. */
function normalizeGlyph(m) {
  const { w, h } = m
  const nw = Math.min(DIGIT_W, Math.max(1, int((w * DIGIT_H) / h + 0.5)))
  const off = Math.floor((DIGIT_W - nw) / 2)
  const out = new Float32Array(DIGIT_H * DIGIT_W)
  const sub = [0.125, 0.375, 0.625, 0.875]
  const sx = new Int32Array(4)
  const sy = new Int32Array(4)
  for (let oy = 0; oy < DIGIT_H; oy++) {
    for (let k = 0; k < 4; k++) sy[k] = Math.min(int(((oy + sub[k]) * h) / DIGIT_H), h - 1)
    for (let ox = 0; ox < nw; ox++) {
      for (let k = 0; k < 4; k++) sx[k] = Math.min(int(((ox + sub[k]) * w) / nw), w - 1)
      let s = 0
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += m.data[sy[a] * w + sx[b]]
      out[oy * DIGIT_W + ox + off] = s / 16
    }
  }
  return out
}

function ncc(a, b) {
  const n = a.length
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    ab += x * y
    aa += x * x
    bb += y * y
  }
  const den = Math.sqrt(aa * bb)
  return den > 1e-9 ? ab / den : 0
}

function classifyDigit(gImg, glyphs) {
  const g = normalizeGlyph(gImg)
  const perChar = {}
  for (const [key, t] of Object.entries(glyphs)) {
    const sc = ncc(g, t)
    if (sc > (perChar[key[0]] ?? -2)) perChar[key[0]] = sc
  }
  const scores = Object.entries(perChar).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))
  const [d, best] = scores[0]
  const second = scores[1][1]
  if (best < DIGIT_MIN || best - second < DIGIT_MARGIN) return [null, best, second]
  return [d, best, second]
}

const digitLike = (c, s) => 14 * s <= c.h && c.h <= 32 * s && c.w <= c.h

function readGlyphs(comps, ink, glyphs, requireAll = false) {
  let out = ''
  let prevX1 = null
  const firstH = comps.length ? comps[0].h : 0
  let used = 0
  for (const c of comps) {
    if (prevX1 !== null && c.x0 - prevX1 > c.h * RUN_GAP) break
    if (Math.abs(c.h - firstH) > firstH * 0.15) break
    const [d, best, second] = classifyDigit(glyphImage(ink, c), glyphs)
    if (d === null) {
      return [null, `unrecognised glyph #${out.length + 1} (best ${best.toFixed(2)}, next ${second.toFixed(2)})`]
    }
    out += d
    prevX1 = c.x1
    used++
  }
  if (!out) return [null, 'no digits']
  if (requireAll && used < comps.length) return [null, `gap after '${out}' — a glyph may be missing`]
  return [out, out]
}

const isDigits = (t) => /^[0-9]+$/.test(t)

function groupingOk(text, digitComps, allComps) {
  if (!isDigits(text) || text.length !== digitComps.length) return false
  if (text.length > 1 && text[0] === '0') return false
  const h = Math.max(...digitComps.map((c) => c.h))
  const base = Math.max(...digitComps.map((c) => c.y1))
  const lo = digitComps[0].x0 - h
  const hi = digitComps[digitComps.length - 1].x0 + 3
  const commas = allComps
    .filter((c) => {
      const cx = (c.x0 + c.x1) / 2
      return c.h < 0.6 * h && Math.abs(c.y1 - base) < 0.4 * h && lo <= cx && cx <= hi
    })
    .map((c) => (c.x0 + c.x1) / 2)
  const right = commas
    .map((cx) => digitComps.filter((d) => (d.x0 + d.x1) / 2 > cx).length)
    .sort((a, b) => a - b)
  return right.every((v, i) => v === 3 * (i + 1)) && right.length === Math.floor((text.length - 1) / 3)
}

function readNumber(comps, ink, digits, requireAll = false) {
  const [text, info] = readGlyphs(comps, ink, digits, requireAll)
  return text !== null ? [Number(text), info] : [null, info]
}

// ── Screen read ──────────────────────────────────────────────────────────────

function newReading() {
  return {
    screen: '', // "modes" or "post" once a screen is recognised
    onModes: false,
    gateScore: 0,
    header: null,
    headerScores: {},
    value: null, // as shown: World Tour = fans in this badge
    maxValue: null,
    total: null, // what to record: the season total
    mode: null,
    verdict: '',
  }
}

const round3 = (v) => Math.round(v * 1000) / 1000

function finish(r) {
  if (r.mode !== 'world-tour') {
    r.total = r.value
    return r
  }
  const total = r.maxValue !== null ? fansTotalFromReadout(r.value, r.maxValue) : null
  if (total === null) {
    const shown = r.maxValue !== null ? `${r.value} / ${r.maxValue}` : `${r.value} (no max)`
    r.verdict = `${r.verdict} — ${shown} isn't a World Tour badge's fans, rejecting`
    r.value = r.maxValue = null
    return r
  }
  r.total = total
  r.verdict = `${r.verdict} = ${total} fans this season`
  return r
}

export function gateZone(screenW, screenH) {
  const s = screenH / REF_H
  return [Math.min(screenW, int(960 * s)), Math.min(screenH, int(130 * s))]
}

export function postZone(screenW, screenH) {
  const s = screenH / REF_H
  const x0 = Math.max(0, int(screenW / 2 - 360 * s))
  const y0 = Math.max(0, int(screenH / 2 - 150 * s))
  const x1 = Math.min(screenW, int(screenW / 2 + 360 * s))
  const y1 = Math.min(screenH, int(screenH / 2 + 60 * s))
  return [x0, y0, x1 - x0, y1 - y0]
}

/** Is the yellow MODES tab highlighted? [onModes, score] */
function checkGate(source, t) {
  const H = source.height
  const s = H / REF_H
  const [zw, zh] = gateZone(source.width, H)
  const ymask = yellowMask(source.region(0, 0, zw, zh))
  if (maskSum(ymask) < GATE_MIN_YELLOW * t.modes.sum * s * s) return [false, 0]
  const tm = scaleMask(t.modes, s)
  const [, , score] = matchTemplate(ymask, tm, Math.max(1, int(4 * s)))
  return [score >= GATE_MIN, score]
}

function bestHeader(wmask, headers, s, d, scores) {
  let best = null
  for (const [name, tmpl] of Object.entries(headers)) {
    const tm = scaleMask(tmpl, s)
    const [x, y, score] = matchTemplate(wmask, tm, d)
    scores[name] = round3(score)
    if (score >= HEADER_MIN && (best === null || score > best.score)) best = { name, x, y, score, w: tm.w, h: tm.h }
  }
  return best
}

/** Gate -> header -> value on one frame. */
export function readFrame(source, t) {
  const r = newReading()
  const W = source.width
  const H = source.height
  const s = H / REF_H
  const d = Math.max(1, int(4 * s))

  ;[r.onModes, r.gateScore] = checkGate(source, t)
  if (!r.onModes) {
    const [x0, y0, zw, zh] = postZone(W, H)
    const p = readPost(source.region(x0, y0, zw, zh), t, H)
    if (p.screen === 'post') {
      p.gateScore = r.gateScore
      return p
    }
    r.verdict = `not on the MODES tab (tab match ${r.gateScore.toFixed(2)})`
    return r
  }
  r.screen = 'modes'

  const rx0 = Math.max(0, int(W / 2 - 640 * s))
  const rx1 = Math.min(W, int(W / 2 + 640 * s))
  const ry0 = Math.max(0, int(H - 380 * s))
  const region = source.region(rx0, ry0, rx1 - rx0, H - ry0)
  const wmask = whiteMask(region)

  const best = bestHeader(wmask, t.headers, s, d, r.headerScores)
  if (best === null) {
    const scores = Object.entries(r.headerScores).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')
    r.verdict = `on MODES, but no known score header (${scores})`
    return r
  }
  const { name, x: hx, y: hy, w: tw, h: th } = best
  r.header = name
  r.mode = HEADER_MODES[name]
  if (r.mode === null) {
    r.verdict = `'${name}' panel — nothing to record`
    return r
  }
  if (s < MIN_SCALE) {
    r.verdict = `'${name}' found, but ${W}x${H} is too low to read digits (need 900p+)`
    return r
  }

  const row = crop(
    region,
    Math.max(0, int(hx - 40 * s)),
    int(hy + th + 2 * s),
    Math.min(region.w, int(hx + tw + 40 * s)),
    Math.min(region.h, int(hy + th + 42 * s))
  )
  const yAll = components(yellowMask(row))
  const ycomps = yAll.filter((c) => digitLike(c, s))
  if (!ycomps.length) {
    r.verdict = `'${name}' header found, but no yellow value under it`
    return r
  }
  const [value, info] = readNumber(ycomps, yellowInk(row), t.digits, true)
  if (value === null) {
    r.verdict = `'${name}' value unreadable: ${info}`
    return r
  }
  if (!groupingOk(info, ycomps, yAll)) {
    r.verdict = `'${name}' read ${info}, but its commas don't fit — a digit may be missing`
    return r
  }

  const lastX1 = ycomps[ycomps.length - 1].x1
  const wall = components(whiteMask(row))
  const wcomps = wall.filter((c) => c.x0 >= lastX1 && digitLike(c, s))
  if (wcomps.length && wcomps[0].x0 - lastX1 > SLASH_GAP_MAX * ycomps[0].h) {
    r.verdict = `'${name}' read ${info}, but the '/' is too far after it — a digit may be missing`
    return r
  }
  let maxValue = null
  if (wcomps.length >= 2) {
    const [mv, mtext] = readNumber(wcomps.slice(1), whiteInk(row), t.digits)
    maxValue = mv
    if (maxValue !== null && !groupingOk(mtext, wcomps.slice(1, 1 + mtext.length), wall)) maxValue = null
  }
  if (maxValue !== null && value > maxValue) {
    r.verdict = `'${name}' read ${value} / ${maxValue} — current > max, rejecting`
    return r
  }
  r.value = value
  r.maxValue = maxValue
  r.verdict = `${name}: ${value}` + (maxValue !== null ? ` / ${maxValue}` : '')
  return finish(r)
}

/** Read the post-match panel from its postZone() crop. */
export function readPost(zone, t, screenH) {
  const r = newReading()
  if (!Object.keys(t.postHeaders).length) {
    r.verdict = 'post-match templates not installed'
    return r
  }
  const s = screenH / REF_H
  if (s < MIN_SCALE) {
    r.verdict = 'resolution too low for the post-match panel'
    return r
  }
  const wmask = whiteMask(zone)
  const need = POST_MIN_WHITE * Math.min(...Object.values(t.postHeaders).map((m) => m.sum)) * s * s
  if (maskSum(wmask) < need) {
    r.verdict = 'no post-match panel'
    return r
  }
  const d = Math.max(1, int(4 * s))
  const best = bestHeader(wmask, t.postHeaders, s, d, r.headerScores)
  if (best === null) {
    r.verdict = 'no post-match panel'
    return r
  }
  const { name, x: hx, y: hy, w: tw, h: th } = best
  r.screen = 'post'
  r.header = name
  r.mode = POST_HEADER_MODES[name]

  const row = crop(
    zone,
    Math.max(0, int(hx - 60 * s)),
    int(hy + th + 2 * s),
    Math.min(zone.w, int(hx + tw + 60 * s)),
    Math.min(zone.h, int(hy + th + 50 * s))
  )
  const wall = components(whiteMask(row, POST_WHITE_MIN))
  const comps = wall.filter((c) => digitLike(c, s))
  if (!comps.length) {
    r.verdict = `post-match '${name}' panel, value not visible yet`
    return r
  }
  const [text, info] = readGlyphs(comps, whiteInk(row, POST_INK_LO, POST_INK_SPAN), t.postGlyphs)
  if (text === null) {
    r.verdict = `post-match '${name}' value unreadable: ${info}`
    return r
  }
  const at = text.indexOf('/')
  const cur = at < 0 ? text : text.slice(0, at)
  const mx = at < 0 ? '' : text.slice(at + 1)
  if (at < 0 || !isDigits(cur) || !isDigits(mx)) {
    r.verdict = `post-match '${name}' value malformed: '${text}'`
    return r
  }
  const k = cur.length
  if (!(groupingOk(cur, comps.slice(0, k), wall) && groupingOk(mx, comps.slice(k + 1, k + 1 + mx.length), wall))) {
    r.verdict = `post-match '${name}' read ${text}, but its commas don't fit — a digit may be missing`
    return r
  }
  const value = Number(cur)
  const maxValue = Number(mx)
  if (value > maxValue) {
    r.verdict = `post-match '${name}' read ${value} / ${maxValue} — current > max, rejecting`
    return r
  }
  r.value = value
  r.maxValue = maxValue
  r.verdict = `post-match ${name}: ${value} / ${maxValue}`
  return finish(r)
}
