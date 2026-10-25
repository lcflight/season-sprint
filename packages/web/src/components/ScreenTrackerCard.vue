<template>
  <div class="tracker-card">
    <div class="tc-header">
      Screen tracker <span class="tc-beta">Beta</span>
    </div>

    <template v-if="!supported">
      <p class="tc-text">
        This browser can't share its screen with a web page. Try Chrome or Edge
        on a desktop computer.
      </p>
    </template>

    <template v-else-if="state.status === 'running'">
      <p class="tc-status">
        <span class="tc-dot" aria-hidden="true"></span>
        {{ statusText }}
      </p>
      <p v-if="state.lastSaved" class="tc-text">
        Last saved: {{ state.lastSaved.value.toLocaleString() }}
        {{ state.lastSaved.mode === "world-tour" ? "fans" : "" }} at
        {{ timeOf(state.lastSaved.at) }}
      </p>
      <p v-if="state.path === 'fallback'" class="tc-warn">
        This browser may pause reading while this tab is in the background.
        Chrome or Edge keep reading.
      </p>
      <div class="tc-row">
        <button class="btn-ghost" @click="stop">Stop</button>
        <button class="btn-ghost" @click="showDetails = !showDetails">
          {{ showDetails ? "Hide details" : "Details" }}
        </button>
      </div>
    </template>

    <template v-else>
      <p class="tc-text">
        Reads your World Tour score from the lobby and post-match screens while
        you play, so you don't have to enter it. No app to install.
      </p>
      <p v-if="state.status === 'error'" class="tc-warn">{{ state.error }}</p>
      <div class="tc-row">
        <button
          class="btn-primary"
          :disabled="state.status === 'starting'"
          @click="showNotice = true"
        >
          {{ state.status === "starting" ? "Starting…" : "Start screen tracker" }}
        </button>
        <button
          v-if="state.log.length"
          class="btn-ghost"
          @click="showDetails = !showDetails"
        >
          {{ showDetails ? "Hide details" : "Details" }}
        </button>
      </div>
    </template>

    <div v-if="showDetails" class="tc-details">
      <template v-if="state.status === 'running'">
        <canvas
          ref="previewCanvas"
          class="tc-preview"
          width="320"
          height="180"
          aria-label="What the tracker sees"
        ></canvas>
        <p v-if="previewDark" class="tc-warn">
          The captured picture is almost black. Try borderless or windowed
          mode, or share a different screen.
        </p>
        <div class="tc-row">
          <button class="btn-ghost" :disabled="saving" @click="saveSnapshot">
            {{ saving ? "Saving…" : "Save snapshot" }}
          </button>
        </div>
        <p class="tc-hint">
          Saves the captured frame to your computer only, so you can share it
          when reporting a problem.
        </p>
      </template>
      <dl>
        <dt>Capture</dt>
        <dd>
          {{ state.width ? `${state.width}×${state.height}` : "—" }}
          {{ state.surface ? `(${state.surface})` : "" }}
        </dd>
        <dt>Reader</dt>
        <dd>
          {{ state.path === "stream" ? "worker stream" : state.path || "—" }},
          {{ state.reads }} reads, {{ state.readMs }} ms each
        </dd>
        <dt>HDR display</dt>
        <dd>{{ state.hdr ? "yes" : "no" }}</dd>
        <dt>Background gap</dt>
        <dd>
          {{ state.maxHiddenGapMs ? `${(state.maxHiddenGapMs / 1000).toFixed(1)} s` : "—" }}
        </dd>
        <dt>Last read</dt>
        <dd>{{ state.verdict || "—" }}</dd>
      </dl>
      <ul class="tc-log">
        <li v-for="(l, i) in state.log" :key="i">
          <span class="tc-time">{{ timeOf(l.at) }}</span> {{ l.text }}
        </li>
      </ul>
    </div>

    <div
      v-if="showNotice"
      class="modal-backdrop"
      @click.self="showNotice = false"
    >
      <div
        class="modal tc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tc-notice-title"
      >
        <header class="modal-header">
          <h3 id="tc-notice-title">Before you share your screen</h3>
        </header>
        <section class="modal-body tc-notice">
          <h4>Privacy</h4>
          <ul>
            <li>
              Your browser will ask which screen to share. Season Sprint only
              uses it to read your World Tour score from the lobby
              <strong>MODES</strong> tab and the post-match score screen.
            </li>
            <li>
              The reading happens in this browser tab, on your computer. Your
              screen is <strong>never recorded, uploaded or sent anywhere</strong>.
              Only the score it reads is saved to your account, the same as
              entering it yourself.
            </li>
            <li>
              Stop at any time with <strong>Stop</strong> here or your
              browser's <strong>Stop sharing</strong> button. Closing or
              reloading this tab stops it too.
            </li>
          </ul>

          <h4>It may not work on every setup</h4>
          <p class="tc-sub">
            This is an early test, and screen sharing behaves differently
            across browsers, systems and game settings.
          </p>
          <ul>
            <li>
              Works best in <strong>Chrome or Edge</strong> on a desktop
              computer. Other browsers may pause reading while this tab is in
              the background.
            </li>
            <li>
              Share your <strong>entire screen</strong> (the monitor the game
              is on), not a single window.
            </li>
            <li>
              Run the game in <strong>borderless or windowed</strong> mode. In
              exclusive fullscreen some computers share a black screen.
            </li>
            <li>
              Needs a game resolution of 1600×900 or higher, and only World
              Tour is read for now.
            </li>
            <li>
              Keep this tab open while you play. It can stay in the background.
            </li>
            <li>
              If it doesn't work for you, the
              <a
                href="https://www.seasonsprint.com/downloads"
                target="_blank"
                rel="noopener noreferrer"
                >desktop tracker</a
              >
              still does the same job, and you can always enter scores by hand.
            </li>
          </ul>
        </section>
        <footer class="modal-footer">
          <button class="btn-ghost" @click="showNotice = false">Cancel</button>
          <button class="btn-primary" @click="begin">Share screen</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useScreenTracker } from "@/composables/useScreenTracker";

const { state, start, stop, isSupported, onPreview, requestPreview, snapshot } =
  useScreenTracker();
const supported = isSupported();
const showNotice = ref(false);
const showDetails = ref(false);

// Live preview in Details: what the tracker is capturing, refreshed every 2s.
const PREVIEW_MS = 2000;
const previewCanvas = ref(null);
const previewDark = ref(false);
let previewTimer = null;
const offPreview = onPreview((bitmap, meanLuma) => {
  const c = previewCanvas.value;
  if (c) {
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext("2d").drawImage(bitmap, 0, 0);
  }
  bitmap.close();
  // A failed capture (exclusive fullscreen, wrong GPU) is solid black, ~0.
  previewDark.value = meanLuma < 3;
});

watch(
  () => showDetails.value && state.status === "running",
  (on) => {
    clearInterval(previewTimer);
    previewTimer = null;
    previewDark.value = false;
    if (!on) return;
    requestPreview();
    previewTimer = setInterval(requestPreview, PREVIEW_MS);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearInterval(previewTimer);
  offPreview();
});

const saving = ref(false);
async function saveSnapshot() {
  saving.value = true;
  try {
    const blob = await snapshot();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `season-sprint-capture-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    // Stopped while waiting for a frame; nothing to save.
  } finally {
    saving.value = false;
  }
}

const statusText = computed(() => {
  const v = state.verdict || "";
  if (!state.reads) return "Starting…";
  if (v.startsWith("not on the MODES tab"))
    return "Watching for the MODES tab or a post-match score";
  if (v.includes("too low")) return "Game resolution too low to read";
  if (v.includes("fans this season")) return "Reading your World Tour score";
  return "Watching";
});

function timeOf(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function begin() {
  showNotice.value = false;
  // Must run straight from the click: browsers only allow screen sharing in
  // response to a user gesture.
  start();
}
</script>

<style scoped>
.tracker-card {
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.tc-header {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 900;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tc-beta {
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 30%, transparent);
  color: var(--text, inherit);
}
.tc-text,
.tc-status,
.tc-warn {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.4;
}
.tc-text {
  color: var(--muted);
}
.tc-warn {
  color: var(--warning, #f5a524);
}
.tc-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.tc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success, #30a46c);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--success, #30a46c) 30%, transparent);
  flex: none;
}
.tc-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.tc-row button {
  height: 32px;
  padding: 6px 10px;
  line-height: 1;
}
.tc-details {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.tc-preview {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  background: #000;
  margin-bottom: 6px;
}
.tc-hint {
  margin: 4px 0 8px;
  font-size: 12px;
  line-height: 1.4;
}
.tc-details dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2px 8px;
  margin: 0 0 8px;
}
.tc-details dt {
  font-weight: 700;
}
.tc-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.tc-log {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
}
.tc-log li {
  padding: 2px 0;
  overflow-wrap: anywhere;
}
.tc-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.tc-modal {
  max-height: 90vh;
  overflow-y: auto;
}
.tc-notice h4 {
  margin: 4px 0 6px;
  font-size: 14px;
}
.tc-notice h4 + ul,
.tc-notice .tc-sub + ul {
  margin-top: 0;
}
.tc-notice ul {
  padding-left: 18px;
  margin: 0 0 14px;
  line-height: 1.45;
  font-size: 14px;
}
.tc-notice li + li {
  margin-top: 4px;
}
.tc-notice a {
  color: var(--primary);
}
.tc-sub {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--muted);
}

@media (max-width: 480px) {
  .tc-row button {
    height: 44px;
    flex: 1 1 100%;
  }
}
</style>
