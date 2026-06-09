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
      <input
        type="number"
        step="any"
        v-model.number="customY"
        placeholder="points"
      />
      <button
        class="btn-primary"
        @click="addAtDate"
        :disabled="!customDate || !isFinite(customY)"
      >
        Add
      </button>
    </div>
    <div class="cp-row" v-else>
      <input
        type="number"
        step="any"
        v-model.number="customY"
        placeholder="points"
      />
      <button
        class="btn-primary"
        @click="addToday"
        :disabled="!isFinite(customY)"
      >
        Add for today
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

// eslint-disable-next-line no-undef
defineProps({
  title: { type: String, default: "Set points" },
});

// eslint-disable-next-line no-undef
const emit = defineEmits(["add-at-date", "add-today"]);

const useCustomDate = ref(false);
const customDate = ref(new Date().toISOString().slice(0, 10));
const customY = ref(0);

function addAtDate() {
  if (!customDate.value || !isFinite(customY.value)) return;
  emit("add-at-date", { date: customDate.value, y: Number(customY.value) });
}

function addToday() {
  if (!isFinite(customY.value)) return;
  emit("add-today", { y: Number(customY.value) });
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
