// The browser screen tracker's reader must read exactly what the desktop
// trackers' Python reader does. Fixtures and expected.json come from
// scripts/make-tracker-fixtures.py (real screenshots, cropped to the regions
// the reader looks at).
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { buildTemplates, readFrame } from '@/tracker/screenReader'

const TEMPLATES = path.resolve(__dirname, '../../tracker-templates')
const FIXTURES = path.resolve(__dirname, 'fixtures/tracker')
const expected = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'))

/** Minimal decoder for 8-bit RGB / RGBA PNGs (what PIL writes). Returns RGBA. */
function decodePng(buf) {
  let pos = 8
  let w = 0, h = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const body = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      if (body[8] !== 8 || ![2, 6].includes(body[9]) || body[12]) throw new Error('unsupported PNG')
      colorType = body[9]
    } else if (type === 'IDAT') idat.push(body)
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0
      const b = y ? px[dst - stride + x] : 0
      const c = x >= bpp && y ? px[dst - stride + x - bpp] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[dst + x] = v & 255
    }
  }
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = px[i * bpp]
    data[i * 4 + 1] = px[i * bpp + 1]
    data[i * 4 + 2] = px[i * bpp + 2]
    data[i * 4 + 3] = 255
  }
  return { w, h, data }
}

/** A frame source over a full RGBA image, like the worker's canvas source. */
function sourceOf(img) {
  return {
    width: img.w,
    height: img.h,
    region(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let r = 0; r < h; r++) {
        const from = ((y + r) * img.w + x) * 4
        data.set(img.data.subarray(from, from + w * 4), r * w * 4)
      }
      return { w, h, data }
    },
  }
}

let templates
beforeAll(() => {
  const files = {}
  for (const n of fs.readdirSync(TEMPLATES)) {
    if (n.endsWith('.pgm')) files[n] = new Uint8Array(fs.readFileSync(path.join(TEMPLATES, n)))
  }
  templates = buildTemplates(files)
})

describe('screenReader matches the Python reader', () => {
  for (const [name, want] of Object.entries(expected)) {
    it(`${name}: ${want.verdict}`, () => {
      const img = decodePng(fs.readFileSync(path.join(FIXTURES, `${name}.png`)))
      const r = readFrame(sourceOf(img), templates)
      expect({
        screen: r.screen,
        onModes: r.onModes,
        header: r.header,
        mode: r.mode,
        value: r.value,
        maxValue: r.maxValue,
        total: r.total,
        verdict: r.verdict,
      }).toEqual({
        screen: want.screen,
        onModes: want.onModes,
        header: want.header,
        mode: want.mode,
        value: want.value,
        maxValue: want.maxValue,
        total: want.total,
        verdict: want.verdict,
      })
      expect(r.gateScore).toBeCloseTo(want.gateScore, 3)
      for (const [k, v] of Object.entries(want.headerScores)) expect(r.headerScores[k]).toBeCloseTo(v, 2)
    })
  }

  it('ignores a blank screen', () => {
    const w = 2560, h = 1440
    const r = readFrame(sourceOf({ w, h, data: new Uint8ClampedArray(w * h * 4) }), templates)
    expect(r.screen).toBe('')
    expect(r.total).toBe(null)
  })
})

// Browser captures arrive as video with half-resolution colour (4:2:0). The
// *_yuv420 fixtures are the same frames put through that conversion. With the
// desktop reader's exact-colour masks the comma vanishes and a "0" can read
// as "8"; chromaSafe must read the right total from both versions.
describe('screenReader chromaSafe (browser captures)', () => {
  const cases = {
    modes_2726: 12726,
    modes_4051: 14051,
    modes_5736: 15736,
    modes_6998: 16998,
    post_5736: 15736,
    post_countup_5556: 15556,
  }
  for (const [name, total] of Object.entries(cases)) {
    for (const variant of ['', '_yuv420']) {
      it(`${name}${variant} reads ${total}`, () => {
        const img = decodePng(fs.readFileSync(path.join(FIXTURES, `${name}${variant}.png`)))
        const r = readFrame(sourceOf(img), templates, { chromaSafe: true })
        expect(r.mode).toBe('world-tour')
        expect(r.total).toBe(total)
      })
    }
  }

  it('still skips placement rounds', () => {
    const img = decodePng(fs.readFileSync(path.join(FIXTURES, 'placement.png')))
    const r = readFrame(sourceOf(img), templates, { chromaSafe: true })
    expect(r.header).toBe('placement')
    expect(r.total).toBe(null)
  })

  it('the desktop reader alone would reject a converted frame', () => {
    const img = decodePng(fs.readFileSync(path.join(FIXTURES, 'modes_4051_yuv420.png')))
    expect(readFrame(sourceOf(img), templates).total).toBe(null)
  })
})

// 16:10 monitors (e.g. 2560x1600): the game fits its UI to the width, keeps the
// nav bar at the top and the score panel at the bottom, and centres the
// post-match panel. Build that layout from the 16:9 fixtures by adding rows
// in the middle (lobby) or around the frame (post-match).
function tallerSource(img, extra, centred) {
  const H = img.h + extra
  const mid = img.h / 2
  const srcRow = (y) => {
    if (centred) {
      const sy = y - extra / 2
      return sy >= 0 && sy < img.h ? sy : -1
    }
    if (y < mid) return y
    return y >= mid + extra ? y - extra : -1
  }
  return {
    width: img.w,
    height: H,
    region(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let r = 0; r < h; r++) {
        const sy = srcRow(y + r)
        if (sy < 0) continue
        const from = (sy * img.w + x) * 4
        data.set(img.data.subarray(from, from + w * 4), r * w * 4)
      }
      return { w, h, data }
    },
  }
}

describe('screenReader on a 16:10 screen (2560x1600)', () => {
  const cases = { modes_4051: 14051, modes_6998: 16998, post_5736: 15736 }
  for (const [name, total] of Object.entries(cases)) {
    it(`${name} reads ${total}`, () => {
      const img = decodePng(fs.readFileSync(path.join(FIXTURES, `${name}_yuv420.png`)))
      const r = readFrame(tallerSource(img, 160, name.startsWith('post')), templates, { chromaSafe: true })
      expect(r.total).toBe(total)
    })
  }
})

