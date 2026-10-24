<template>
  <section class="onboarding" aria-labelledby="onboarding-title">
    <div class="ob-card">
      <h2 id="onboarding-title">Welcome to Season Sprint</h2>
      <p class="ob-lede">
        Enter where you are now so your graph starts from there. For World Tour,
        copy the fans shown on the World Tour panel (e.g. 1,250 / 6,000). You
        can leave a mode blank if you don't play it.
      </p>

      <form class="ob-form" @submit.prevent="onSave">
        <label class="ob-field">
          <span class="ob-label">World Tour fans</span>
          <span class="ob-pair">
            <input
              v-model="worldTour"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              placeholder="e.g. 1250"
              aria-label="Fans in your current badge"
              autofocus
            />
            <span class="ob-slash">/</span>
            <input
              v-model="worldTourRequired"
              type="number"
              min="2000"
              step="2000"
              inputmode="numeric"
              placeholder="e.g. 6000"
              aria-label="Fans your current badge needs"
            />
          </span>
          <span v-if="worldTourInvalid" class="ob-error">
            The second number must be 2,000, 4,000 … 48,000, and the first can't be bigger.
          </span>
        </label>

        <label class="ob-field" v-if="showRanked">
          <span class="ob-label">Ranked</span>
          <input
            v-model="ranked"
            type="number"
            step="any"
            inputmode="numeric"
            placeholder="e.g. 18000"
          />
        </label>

        <p v-if="saveError" class="ob-error" role="alert">{{ saveError }}</p>

        <div class="ob-actions">
          <button type="submit" class="btn-primary" :disabled="!canSave || isSaving">
            {{ isSaving ? "Saving…" : "Get started" }}
          </button>
          <button type="button" class="btn-ghost" :disabled="isSaving" @click="skip">
            Skip for now
          </button>
        </div>
      </form>

      <p class="ob-note">Saved as today's entry — you can edit it any time.</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { fansTotalFromReadout } from "@/utils/fans";

// eslint-disable-next-line no-undef
const props = defineProps({
  // Modes to prompt for; Ranked is omitted when the user lacks the flag.
  modes: { type: Array, required: true },
  isSaving: { type: Boolean, default: false },
  saveError: { type: String, default: "" },
});

// eslint-disable-next-line no-undef
const emit = defineEmits(["save", "skip"]);

// Kept as strings so a blank field stays blank ("don't record this mode")
// rather than coercing to 0, which would anchor that mode's graph at zero.
const worldTour = ref("");
const worldTourRequired = ref("");
const ranked = ref("");

const blank = (v) => String(v).trim() === "";
// Season-total fans from the "X / Y" pair, or null.
const worldTourTotal = computed(() =>
  blank(worldTour.value) || blank(worldTourRequired.value)
    ? null
    : fansTotalFromReadout(Number(worldTour.value), Number(worldTourRequired.value))
);
const worldTourInvalid = computed(
  () =>
    !blank(worldTour.value) &&
    !blank(worldTourRequired.value) &&
    worldTourTotal.value === null
);

const showRanked = computed(() => props.modes.includes("ranked"));

function entered(mode) {
  if (mode !== "ranked") return worldTourTotal.value !== null;
  return !blank(ranked.value) && isFinite(Number(ranked.value));
}

// At least one total is needed — otherwise "Get started" would do nothing that
// "Skip for now" doesn't already do.
const canSave = computed(() => props.modes.some(entered));

function onSave() {
  if (!canSave.value || props.isSaving) return;
  const values = {};
  for (const mode of props.modes) {
    if (entered(mode)) {
      values[mode] = mode === "ranked" ? Number(ranked.value) : worldTourTotal.value;
    }
  }
  emit("save", values);
}

function skip() {
  emit("skip");
}
</script>

<style scoped>
.onboarding {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 24px 16px;
}

.ob-card {
  width: 100%;
  max-width: 440px;
  text-align: left;
  padding: 24px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--primary) 24%, var(--surface));
  background: color-mix(in oklab, var(--surface) 90%, #000);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}

.ob-card h2 {
  margin: 0 0 8px;
  color: var(--text-strong);
  font-size: 20px;
  letter-spacing: 0.02em;
}

.ob-lede {
  margin: 0 0 20px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.ob-form {
  display: grid;
  gap: 14px;
}

.ob-field {
  display: grid;
  gap: 6px;
}

.ob-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 900;
}

.ob-field input {
  width: 100%;
  min-width: 0;
}

.ob-pair {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-slash {
  color: var(--muted);
  font-weight: 800;
}

.ob-error {
  margin: 0;
  color: #ff6b6b;
  font-size: 13px;
}

.ob-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.ob-actions .btn-primary {
  flex: 1 1 auto;
}

.ob-note {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 480px) {
  .ob-actions button {
    flex: 1 1 100%;
    min-height: 44px;
  }
}
</style>
