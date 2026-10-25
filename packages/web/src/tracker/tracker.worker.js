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
    reading = readFrame(sourceFor(image, width, height), templates)
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message || e) })
    nextDue = performance.now() + POLL_MS
    return
  }
  const ms = performance.now() - t0
  nextDue = performance.now() + (reading.screen === 'post' ? FAST_POLL_MS : POLL_MS)
  self.postMessage({ type: 'reading', reading, ms, width, height, at: Date.now() })
}

async function pump(readable) {
  reader = readable.getReader()
  try {
    for (;;) {
      const { value: frame, done } = await reader.read()
      if (done) break
      try {
        if (templates && performance.now() >= nextDue) {
          process(frame, frame.displayWidth, frame.displayHeight)
        }
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
    try {
      if (templates && performance.now() >= nextDue) process(bmp, bmp.width, bmp.height)
    } finally {
      bmp.close()
    }
  } else if (msg.type === 'stop') {
    reader?.cancel().catch(() => {})
    reader = null
  }
}
