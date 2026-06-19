<template>
  <div class="api-keys-panel">
    <p class="muted key-intro">
      Generate a key to use with the local tracker script.
      Keys are shown once on creation — copy it before leaving this page.
    </p>

    <!-- Create form -->
    <div class="create-row">
      <input
        v-model.trim="newName"
        type="text"
        placeholder="Key name (e.g. laptop)"
        maxlength="64"
        @keyup.enter="onCreate"
      />
      <button class="btn-primary" :disabled="!newName || creating" @click="onCreate">
        {{ creating ? '...' : 'Create' }}
      </button>
    </div>

    <!-- Newly created key (show once) -->
    <div v-if="justCreatedKey" class="created-key-banner">
      <div class="setting-title">New key created — copy it now</div>
      <div class="key-display">
        <code>{{ justCreatedKey }}</code>
        <button class="btn-ghost" @click="copyKey">{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="error">{{ error }}</p>

    <!-- Key list -->
    <p v-if="isLoading" class="muted">Loading...</p>
    <p v-else-if="!apiKeys.length" class="muted">No API keys yet.</p>
    <ul v-else class="points-ul">
      <li v-for="key in apiKeys" :key="key.id">
        <div class="key-info">
          <span class="key-name">{{ key.name }}</span>
          <code class="key-prefix">{{ key.keyPrefix }}...</code>
          <span class="muted key-date">{{ formatDate(key.createdAt) }}</span>
        </div>
        <div class="row-actions">
          <button class="btn-ghost btn-danger" @click="onRevoke(key.id)">Revoke</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApiKeys } from '@/composables/useApiKeys'

const { apiKeys, isLoading, error, load, create, revoke } = useApiKeys()

const newName = ref('')
const creating = ref(false)
const justCreatedKey = ref('')
const copied = ref(false)

onMounted(load)

async function onCreate() {
  if (!newName.value || newName.value.length > 64) return
  creating.value = true
  justCreatedKey.value = ''
  copied.value = false
  const result = await create(newName.value)
  if (result?.key) {
    justCreatedKey.value = result.key
    newName.value = ''
  }
  creating.value = false
}

async function onRevoke(keyId) {
  await revoke(keyId)
}

function copyKey() {
  navigator.clipboard.writeText(justCreatedKey.value)
  copied.value = true
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString()
}
</script>

<style scoped>
.key-intro {
  font-size: 12px;
  margin-bottom: 12px;
}

.create-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.create-row input {
  flex: 1;
}

.created-key-banner {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--success) 40%, var(--surface));
  background: color-mix(in oklab, var(--success) 6%, var(--surface));
}

.key-display {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.key-display code {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  background: color-mix(in oklab, var(--surface) 80%, #000);
  font-size: 12px;
  word-break: break-all;
  color: var(--text-strong);
}

.key-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.key-name {
  font-weight: 800;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.03em;
  color: var(--text-strong);
}

.key-prefix {
  font-size: 12px;
  color: var(--muted);
}

.key-date {
  font-size: 11px;
}

.btn-danger {
  color: var(--danger);
}
.btn-danger:hover {
  background: color-mix(in oklab, var(--danger) 10%, var(--surface));
}

.error {
  color: var(--danger);
  font-size: 12px;
  margin-bottom: 8px;
}

@media (max-width: 480px) {
  .create-row {
    flex-direction: column;
  }
  .key-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
