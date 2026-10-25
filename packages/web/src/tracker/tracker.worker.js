// Screen-tracker worker: reads THE FINALS' score screens from a shared-screen
// stream, off the main thread. Pixels never leave this worker; it only posts
// back what it read (see useScreenTracker.js).
//
// Frames arrive two ways:
//   - "stream": a ReadableStream of VideoFrames (MediaStreamTrackProcessor,
//     Chrome/Edge). Reads are driven by incoming frames, not timers, so they
//     keep going while the tab is in the background.
//   - "frame": an ImageBitmap posted by the page (other browsers). The page's
//     timer drives these, and browsers slow that down in background tabs.

import { buildTemplates, readFrame } from './screenReader'

// Same cadence as the desktop trackers: once a second, every 0.2s while the
// post-match panel is up (it lasts ~2s and the value counts up first).
const POLL_MS = 1000
const FAST_POLL_MS = 200

let templates = null
let nextDue = 0
let reader = null
// Diagnostics the page asked for, served from the next frame that arrives.
let wantPreview = false
let wantSnapshot = false

const PREVIEW_W = 320

const canvas = new OffscreenCanvas(1, 1)
const ctx = canvas.getContext('2d', { willReadFrequently: true })

/** Frame source for the reader: copies only the regions it asks for. */
function sourceFor(image, width, height) {
  return {
    width,
    height,
    region(x, y, w, h) {
      canvas.width = Math.max(1, w)
      canvas.height = Math.max(1, h)
      ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
      return { w, h, data: ctx.getImageData(0, 0, w, h).data }
    },
  }
}

function process(image, width, height) {
  const t0 = performance.now()
  let reading
  try {
    // Captured video stores colour at half resolution, so read by brightness.
    reading = readFrame(sourceFor(image, width, height), templates, { chromaSafe: true })
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) })
    nextDue = performance.now() + POLL_MS
    return
  }
  const ms = performance.now() - t0
  nextDue = performance.now() + (reading.screen === 'post' ? FAST_POLL_MS : POLL_MS)
  self.postMessage({ type: 'reading', reading, ms, width, height, at: Date.now() })
}

/**
 * A small copy of the frame plus its average brightness, so the user can see
 * what is being captured (a black picture, the wrong monitor, washed-out HDR).
 */
function sendPreview(image, width, height) {
  const w = PREVIEW_W
  const h = Math.max(1, Math.round((height / width) * w))
  const pc = new OffscreenCanvas(w, h)
  const pctx = pc.getContext('2d', { willReadFrequently: true })
  pctx.drawImage(image, 0, 0, w, h)
  const d = pctx.getImageData(0, 0, w, h).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  const bitmap = pc.transferToImageBitmap()
  self.postMessage({ type: 'preview', bitmap, meanLuma: sum / (w * h) }, [bitmap])
}

/** The full frame as a PNG, for the user to save. */
async function sendSnapshot(image, width, height) {
  const sc = new OffscreenCanvas(width, height)
  sc.getContext('2d').drawImage(image, 0, 0)
  const blob = await sc.convertToBlob({ type: 'image/png' })
  self.postMessage({ type: 'snapshot', blob })
}

/** Serve any pending diagnostics from this frame (before it's closed). */
async function serveRequests(image, width, height) {
  if (wantPreview) {
    wantPreview = false
    sendPreview(image, width, height)
  }
  if (wantSnapshot) {
    wantSnapshot = false
    // The PNG encode is async, so draw from a copy the caller can't close.
    const copy = await createImageBitmap(image)
    sendSnapshot(copy, width, height).finally(() => copy.close())
  }
}

async function pump(readable) {
  reader = readable.getReader()
  try {
    for (;;) {
      const { value: frame, done } = await reader.read()
      if (done) break
      try {
        await serveRequests(frame, frame.displayWidth, frame.displayHeight)
        if (templates && performance.now() >= nextDue) {
          process(frame, frame.displayWidth, frame.displayHeight)
        }
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err?.message || err) })
      } finally {
        frame.close()
      }
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) })
  }
  self.postMessage({ type: 'ended' })
}

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    try {
      const files = {}
      for (const [k, buf] of Object.entries(msg.files)) files[k] = new Uint8Array(buf)
      templates = buildTemplates(files)
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: `templates: ${err?.message || err}` })
    }
  } else if (msg.type === 'stream') {
    nextDue = 0
    pump(msg.readable)
  } else if (msg.type === 'frame') {
    const bmp = msg.bitmap
    serveRequests(bmp, bmp.width, bmp.height)
      .then(() => {
        if (templates && performance.now() >= nextDue) process(bmp, bmp.width, bmp.height)
      })
      .catch((err) => self.postMessage({ type: 'error', message: String(err?.message || err) }))
      .finally(() => bmp.close())
  } else if (msg.type === 'preview') {
    wantPreview = true
  } else if (msg.type === 'snapshot') {
    wantSnapshot = true
  } else if (msg.type === 'stop') {
    reader?.cancel().catch(() => {})
    reader = null
  }
}
