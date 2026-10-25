// In-browser screen tracker (test build, behind the "screenTracker" flag).
//
// The user shares their screen (getDisplayMedia); a worker reads THE FINALS'
// MODES tab and post-match panel from it with the same template matching as
// the desktop trackers (src/tracker/screenReader.js), and confirmed changes
// are saved like a manual entry. Frames stay in the browser: only the score
// read from them is sent to the server.
//
// Module-level state, so tracking keeps running when the user switches pages.

import { reactive, readonly } from 'vue'
import { getAuthorizationHeader, upsertRecord } from '@/services/api'
import { formatDate } from '@/utils/date'
import { loadTemplateFiles } from '@/tracker/templateFiles'

// Confirm rules, as in packages/local-win/season_tracker.py.
const CONFIRM_READS = 2 // MODES: identical reads in a row
const POST_CONFIRM_READS = 3 // post-match: more, so a counting-up value never confirms
const COOLDOWN_MS = 5 * 60 * 1000 // MODES: rest per mode after a confirmed read
const POST_REST_MS = 10 * 1000 // post-match: the panel lasts ~2s
const LOG_MAX = 40
// While nothing changes, log a heartbeat this often so a tracker that is
// running but not recognising anything doesn't look frozen.
const HEARTBEAT_MS = 60 * 1000
const FALLBACK_FRAME_MS = 200

const MODE_LABELS = { 'world-tour': 'World Tour', ranked: 'Ranked' }
const lastKey = (mode) => `season-sprint:screen-tracker:last:${mode}`

const state = reactive({
  status: 'idle', // idle | starting | running | error
  error: '',
  // "stream": frames read in the worker (keeps going in background tabs).
  // "fallback": the page grabs frames on a timer (may slow in the background).
  path: '',
  surface: '', // what was shared: monitor | window | browser
  width: 0,
  height: 0,
  verdict: '',
  readMs: 0,
  reads: 0,
  lastSaved: null, // { mode, value, at }
  log: [], // newest first: { at, text }
  // How long the longest gap between reads was while this tab was hidden.
  // Answers "does it keep reading in the background?" during the test.
  maxHiddenGapMs: 0,
  // The display reports HDR. Windows HDR can wash out shared-screen colours.
  hdr: false,
})

let worker = null
let stream = null
let fallbackTimer = null
let video = null
let lastReadAt = 0
let lastVerdictKey = ''
let heartbeatAt = 0
let heartbeatReads = 0
let sizeLogged = false
const previewListeners = new Set()
let snapshotWaiter = null
const tracks = new Map() // "screen|mode" -> { reads, lastVal, restUntil }

function log(text) {
  state.log.unshift({ at: Date.now(), text })
  if (state.log.length > LOG_MAX) state.log.length = LOG_MAX
}

function readLast(mode) {
  try {
    const v = localStorage.getItem(lastKey(mode))
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

function writeLast(mode, value) {
  try {
    localStorage.setItem(lastKey(mode), String(value))
  } catch {
    // Only used to skip re-saving an unchanged value.
  }
}

async function save(mode, value, label) {
  try {
    const auth = await getAuthorizationHeader()
    if (!auth) throw new Error('signed out')
    await upsertRecord(formatDate(new Date()), value, auth, mode)
    writeLast(mode, value)
    state.lastSaved = { mode, value, at: Date.now() }
    log(`Saved ${label}: ${value.toLocaleString()}`)
  } catch (e) {
    log(`Couldn't save ${label} ${value.toLocaleString()}: ${e?.message || e}`)
  }
}

function onReading({ reading: r, ms, width, height, at }) {
  if (document.hidden && lastReadAt) {
    state.maxHiddenGapMs = Math.max(state.maxHiddenGapMs, at - lastReadAt)
  }
  lastReadAt = at
  state.reads++
  heartbeatReads++
  if (!sizeLogged) {
    sizeLogged = true
    log(`Capturing ${width}×${height}`)
  }
  if (at - heartbeatAt >= HEARTBEAT_MS) {
    if (heartbeatAt) log(`Still watching: ${heartbeatReads} reads in the last minute. Last: ${r.verdict}`)
    heartbeatAt = at
    heartbeatReads = 0
  }
  state.readMs = Math.round(ms)
  state.width = width
  state.height = height
  state.verdict = r.verdict

  const key = r.mode && r.total !== null ? `${r.screen}|${r.mode}` : null
  for (const [k, tr] of tracks) {
    if (k !== key) {
      tr.reads = 0
      tr.lastVal = null
    }
  }
  if (!key) {
    const vk = `${r.screen}|${r.header}`
    if (vk !== lastVerdictKey) log(r.verdict)
    lastVerdictKey = vk
    return
  }
  lastVerdictKey = ''

  let tr = tracks.get(key)
  if (!tr) tracks.set(key, (tr = { reads: 0, lastVal: null, restUntil: 0 }))
  const post = r.screen === 'post'
  const label = MODE_LABELS[r.mode] + (post ? ' (post-match)' : '')
  const now = performance.now()
  if (now < tr.restUntil) return

  if (r.total === tr.lastVal) tr.reads++
  else {
    tr.reads = 1
    tr.lastVal = r.total
  }
  if (tr.reads < (post ? POST_CONFIRM_READS : CONFIRM_READS)) return

  tr.restUntil = now + (post ? POST_REST_MS : COOLDOWN_MS)
  tr.reads = 0
  tr.lastVal = null
  if (r.total !== readLast(r.mode)) save(r.mode, r.total, label)
  else log(`${label}: ${r.total.toLocaleString()} (unchanged)`)
}

function cleanup() {
  clearInterval(fallbackTimer)
  fallbackTimer = null
  if (video) {
    video.srcObject = null
    video = null
  }
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  worker?.terminate()
  worker = null
  tracks.clear()
  lastReadAt = 0
  lastVerdictKey = ''
  heartbeatAt = 0
  heartbeatReads = 0
  sizeLogged = false
  snapshotWaiter?.reject(new Error('stopped'))
  snapshotWaiter = null
}

export function stop() {
  if (state.status === 'idle') return
  cleanup()
  state.status = 'idle'
  log('Stopped')
}

function fail(message) {
  cleanup()
  state.status = 'error'
  state.error = message
  log(message)
}

/** True when this browser can share a screen at all. */
export function isSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined'
  )
}

/**
 * Ask the user to share a screen and start reading it. Call from a click.
 * `options.stream` skips the share prompt and reads that stream instead
 * (development testing only, see the bottom of this file).
 */
export async function start(options = {}) {
  if (state.status === 'starting' || state.status === 'running') return
  state.status = 'starting'
  state.error = ''
  state.reads = 0
  state.maxHiddenGapMs = 0
  state.verdict = ''
  try {
    stream = options.stream || await navigator.mediaDevices.getDisplayMedia({
      // A low frame rate is plenty (reads run at most 5 times a second) and
      // keeps the capture cheap.
      video: { displaySurface: 'monitor', frameRate: { ideal: 10, max: 15 } },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'include',
    })
  } catch (e) {
    cleanup()
    state.status = 'idle'
    log(e?.name === 'NotAllowedError' ? 'Screen sharing was cancelled' : `Couldn't share the screen: ${e?.message || e}`)
    return
  }
  const track = stream.getVideoTracks()[0]
  state.surface = track.getSettings?.().displaySurface || ''
  track.addEventListener('ended', () => stop())

  try {
    worker = new Worker(new URL('../tracker/tracker.worker.js', import.meta.url))
    const files = await loadTemplateFiles()
    const ready = new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') resolve()
        else if (e.data.type === 'error') reject(new Error(e.data.message))
      }
    })
    worker.postMessage({ type: 'init', files }, Object.values(files))
    await ready
  } catch (e) {
    fail(`Couldn't start the tracker: ${e?.message || e}`)
    return
  }
  if (!stream) return // stopped while loading

  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'reading') onReading(m)
    else if (m.type === 'preview') {
      for (const fn of previewListeners) fn(m.bitmap, m.meanLuma)
      if (!previewListeners.size) m.bitmap.close()
    } else if (m.type === 'snapshot') {
      snapshotWaiter?.resolve(m.blob)
      snapshotWaiter = null
    }
    else if (m.type === 'error') log(`Read error: ${m.message}`)
    else if (m.type === 'ended') stop()
  }

  // eslint-disable-next-line no-undef
  if (typeof MediaStreamTrackProcessor !== 'undefined') {
    // eslint-disable-next-line no-undef
    const processor = new MediaStreamTrackProcessor({ track })
    worker.postMessage({ type: 'stream', readable: processor.readable }, [processor.readable])
    state.path = 'stream'
  } else {
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play().catch(() => {})
    fallbackTimer = setInterval(async () => {
      if (!worker || !video || video.readyState < 2) return
      try {
        const bitmap = await createImageBitmap(video)
        worker?.postMessage({ type: 'frame', bitmap }, [bitmap])
      } catch {
        // Skip this frame.
      }
    }, FALLBACK_FRAME_MS)
    state.path = 'fallback'
  }
  state.status = 'running'
  try {
    state.hdr = window.matchMedia('(dynamic-range: high)').matches
  } catch {
    state.hdr = false
  }
  log(`Watching ${state.surface || 'screen'}`)
  if (state.hdr) log('This display reports HDR. If nothing is recognised, try with HDR off')
  if (state.surface && state.surface !== 'monitor') {
    log('Tip: share your whole screen (the monitor the game is on), not a window or tab')
  }
}

/**
 * Ask for a small copy of the next captured frame. `fn(bitmap, meanLuma)` is
 * called with it; the listener owns the bitmap. Returns an unsubscribe.
 */
export function onPreview(fn) {
  previewListeners.add(fn)
  return () => previewListeners.delete(fn)
}

export function requestPreview() {
  worker?.postMessage({ type: 'preview' })
}

/** The next captured frame as a PNG blob, for the user to save. */
export function snapshot() {
  if (!worker || state.status !== 'running') return Promise.reject(new Error('not running'))
  if (snapshotWaiter) return snapshotWaiter.promise
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  snapshotWaiter = { promise, resolve, reject }
  worker.postMessage({ type: 'snapshot' })
  return promise
}

export function useScreenTracker() {
  return { state: readonly(state), start, stop, isSupported, onPreview, requestPreview, snapshot }
}

// Development builds: let a test feed in any stream, e.g. a canvas showing a
// saved screenshot: __screenTracker.start({ stream: canvas.captureStream(10) }).
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  window.__screenTracker = { start, stop, state }
}
