<template>
  <div class="custom-point">
    <div class="cp-header">{{ title }}</div>
    <div class="cp-row">
      <label class="toggle-row">
        <input type="checkbox" v-model="useCustomDate" />
        <span class="toggle-text">Use custom date</span>
      </label>
    </div>
    <div class="cp-row" v-if="useCustomDate">
      <input type="date" v-model="customDate" />
    </div>
    <!-- Fans (Season 12+ World Tour): enter the "X / Y" the game shows. -->
    <div class="cp-row" v-if="fans">
      <input
        type="number"
        min="0"
        step="1"
        inputmode="numeric"
        v-model.number="fansInRank"
        placeholder="fans"
        aria-label="Fans in this badge"
      />
      <span class="cp-slash">/</span>
      <input
        type="number"
        min="2000"
        step="2000"
        inputmode="numeric"
        v-model.number="fansRequiredInput"
        placeholder="needed"
        aria-label="Fans this badge needs"
      />
    </div>
    <div class="cp-row" v-else>
      <input
        type="number"
        step="any"
        v-model.number="customY"
        placeholder="points"
      />
    </div>
    <p v-if="fans" class="cp-hint" :class="{ 'cp-error': fansInvalid }">
      <template v-if="fansInvalid">
        The second number must be the badge's requirement (2,000, 4,000 … 48,000)
        and the first can't be bigger.
      </template>
      <template v-else-if="fansTotal !== null">
        = {{ fansTotal.toLocaleString() }} fans this season
      </template>
      <template v-else>Enter both numbers from the World Tour panel, e.g. 1,250 / 6,000.</template>
    </p>
    <div class="cp-row">
      <button
        class="btn-primary"
        @click="submit"
        :disabled="value === null || (useCustomDate && !customDate)"
      >
        {{ useCustomDate ? "Add" : "Add for today" }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { fansTotalFromReadout } from "@/utils/fans";

// eslint-disable-next-line no-undef
const props = defineProps({
  title: { type: String, default: "Set points" },
  // Season 12+ World Tour: take the in-game "X / Y" and store the season total.
  fans: { type: Boolean, default: false },
});

// eslint-disable-next-line no-undef
const emit = defineEmits(["add-at-date", "add-today"]);

const useCustomDate = ref(false);
const customDate = ref(new Date().toISOString().slice(0, 10));
const customY = ref(0);
const fansInRank = ref("");
const fansRequiredInput = ref("");

const fansEntered = computed(
  () => fansInRank.value !== "" && fansRequiredInput.value !== ""
);
const fansTotal = computed(() =>
  fansEntered.value
    ? fansTotalFromReadout(fansInRank.value, fansRequiredInput.value)
    : null
);
const fansInvalid = computed(() => fansEntered.value && fansTotal.value === null);

// The season total to save, or null when the input isn't usable yet.
const value = computed(() => {
  if (props.fans) return fansTotal.value;
  return isFinite(customY.value) && customY.value !== "" ? Number(customY.value) : null;
});

function submit() {
  if (value.value === null) return;
  if (useCustomDate.value) {
    if (!customDate.value) return;
    emit("add-at-date", { date: customDate.value, y: value.value });
  } else {
    emit("add-today", { y: value.value });
  }
}
</script>

<style scoped>
.custom-point {
  border: 1px solid color-mix(in oklab, var(--primary) 18%, var(--surface));
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.cp-header {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 900;
  margin-bottom: 6px;
}
.cp-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
}
.cp-row input[type="date"],
.cp-row input[type="number"] {
  flex: 1 1 110px;
  min-width: 0;
}
.cp-slash {
  color: var(--muted);
  font-weight: 800;
}
.cp-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.cp-hint.cp-error {
  color: var(--danger, #e5484d);
}
.cp-row .btn-primary {
  height: 32px;
  padding: 6px 10px;
  line-height: 1;
}

@media (max-width: 480px) {
  .cp-row .btn-primary {
    height: 44px;
    flex: 1 1 100%;
  }
}
</style>
