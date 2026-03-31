<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h3>Points</h3>
      </header>
      <section class="modal-body">
        <p v-if="!points.length" class="muted">No points yet.</p>
        <ul class="points-ul" v-else>
          <li v-for="(pt, i) in sortedPointsReverse" :key="i">
            <template v-if="editIndex === getOriginalIndex(pt)">
              <div class="edit-row">
                <label>
                  date
                  <input v-model="editDate" type="date" required />
                </label>
                <label>
                  points
                  <input
                    v-model.number="editY"
                    type="number"
                    step="any"
                    required
                  />
                </label>
              </div>
              <div class="row-actions">
                <button
                  class="btn-primary"
                  @click="onSaveEdit(getOriginalIndex(pt))"
                  :disabled="!canSaveEdit"
                >
                  save
                </button>
                <button class="btn-ghost" @click="cancelEdit">cancel</button>
              </div>
            </template>
            <template v-else>
              <span>({{ pt.date }} , {{ pt.y }} pts)</span>
              <div class="row-actions">
                <button
                  class="btn-primary"
                  @click="openEdit(getOriginalIndex(pt))"
                >
                  edit
                </button>
                <button
                  class="btn-ghost"
                  @click="$emit('remove-point', getOriginalIndex(pt))"
                >
                  remove
                </button>
              </div>
            </template>
          </li>
        </ul>
      </section>
      <footer class="modal-footer">
        <button @click="$emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { isValidDateStr } from '@/utils/date'

// eslint-disable-next-line no-undef
const props = defineProps({
  points: { type: Array, required: true },
  sortedPointsReverse: { type: Array, required: true },
})

// eslint-disable-next-line no-undef
const emit = defineEmits(['close', 'save-edit', 'remove-point'])

const editIndex = ref(-1)
const editDate = ref('')
const editY = ref(0)

const canSaveEdit = computed(
  () => isValidDateStr(editDate.value) && isFinite(editY.value)
)

function getOriginalIndex(point) {
  return props.points.findIndex((p) => p.date === point.date && p.y === point.y)
}

function openEdit(index) {
  const p = props.points[index]
  editIndex.value = index
  editDate.value = p.date
  editY.value = p.y
}

function onSaveEdit(index) {
  if (!canSaveEdit.value) return
  emit('save-edit', { index, date: editDate.value, y: Number(editY.value) })
  editIndex.value = -1
}

function cancelEdit() {
  editIndex.value = -1
}
</script>
