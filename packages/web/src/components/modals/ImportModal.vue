<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h3>Import CSV</h3>
      </header>
      <section class="modal-body">
        <p>Provide a CSV with columns: <strong>date,y</strong> (y = points). Supported date formats include YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, DD/MM/YYYY, and names like 5 Jan 2025. Header row is optional. Delimiters supported: comma, semicolon, colon, or tab.</p>
        <pre class="example">date,y
2025-03-01,2
2025-03-07,5.5
2025-03-15,7
</pre>
        <div
          class="dropzone"
          @dragover.prevent
          @dragenter.prevent
          @drop.prevent="onDropCSV"
        >
          <p>Drag and drop a CSV file here</p>
          <p>or</p>
          <input ref="fileInput" type="file" accept=".csv,text/csv" @change="onFilePick" />
        </div>
        <label class="import-options">
          <input type="checkbox" :checked="autoSetSeasonFromImport" @change="onToggleAutoSet" />
          Auto-set season range to imported data dates
        </label>
        <label class="import-options">
          <input type="checkbox" :checked="simplifyImport" @change="onToggleSimplify" />
          Simplify consecutive duplicates
        </label>
        <div class="import-hint">If enabled, consecutive rows with the same y value are collapsed into a single point (keeps the first, skips the rest).</div>
        <p v-if="importError" class="error">{{ importError }}</p>
      </section>
      <footer class="modal-footer">
        <button @click="emit('close')">Cancel</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { parseCSVText } from '@/utils/csv'

// eslint-disable-next-line no-undef
const props = defineProps({
  autoSetSeasonFromImport: { type: Boolean, default: true },
  simplifyImport: { type: Boolean, default: false },
})

// eslint-disable-next-line no-undef
const emit = defineEmits(['close', 'import-data', 'update:autoSetSeasonFromImport', 'update:simplifyImport'])

const fileInput = ref(null)
const importError = ref('')

function onToggleAutoSet(e) {
  emit('update:autoSetSeasonFromImport', !!e.target.checked)
}
function onToggleSimplify(e) {
  emit('update:simplifyImport', !!e.target.checked)
}

function onFilePick(e) {
  const f = e.target.files && e.target.files[0]
  if (f) readCSVFile(f)
}

function onDropCSV(e) {
  const f = e.dataTransfer.files && e.dataTransfer.files[0]
  if (f) readCSVFile(f)
}

function readCSVFile(file) {
  importError.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = reader.result?.toString() || ''
      const imported = parseCSVText(text)
      if (imported.length === 0) {
        throw new Error('No valid rows found. Expected columns: date,y (YYYY-MM-DD, numeric y).')
      }
      const simplified = props.simplifyImport
        ? imported.filter((row, idx, arr) => idx === 0 || row.y !== arr[idx - 1].y)
        : imported
      // emit rows and, if caller wants, they can adjust season bounds
      emit('import-data', simplified)
      emit('close')
    } catch (err) {
      importError.value = err?.message || 'Failed to parse CSV.'
    }
  }
  reader.onerror = () => {
    importError.value = 'Unable to read file.'
  }
  reader.readAsText(file)
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--surface);
  width: min(720px, 95vw);
  max-height: 85vh;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header, .modal-footer {
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
}

.modal-footer { border-bottom: 0; border-top: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface)); }

.modal-body {
  padding: 12px 16px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
}

.dropzone {
  border: 2px dashed color-mix(in oklab, var(--primary) 35%, var(--surface));
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  color: var(--muted);
  margin: 8px 0 12px;
}

.example {
  background: color-mix(in oklab, var(--surface) 85%, black);
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  padding: 8px;
  overflow: auto;
}

.import-options {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.import-hint {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0 0;
}

.error {
  color: #ff6b6b;
  margin: 4px 0 8px;
}
</style>

