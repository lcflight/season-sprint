<script>
export default { name: "SettingsView" };
</script>

<script setup>
import { computed } from "vue";
import GraphSettingsSection from "@/components/GraphSettingsSection.vue";
import ApiKeysPanel from "@/components/ApiKeysPanel.vue";
import { useFlags } from "@/composables/useFlags";

// Ranked graph settings are only relevant when the ranked feature is enabled.
const { flags, loaded, loadFlags } = useFlags();
if (!loaded.value) loadFlags();
const rankedEnabled = computed(() => !!flags.ranked);
</script>

<template>
  <div class="settings-page">
    <header class="settings-page-head">
      <h1>Settings</h1>
      <router-link class="btn-ghost back-link" to="/">Back</router-link>
    </header>

    <section class="settings-card">
      <h2 class="card-title">Graph</h2>
      <p class="card-desc">
        Display options for each mode's chart. Saved per mode.
      </p>
      <GraphSettingsSection
        storage-key="world-tour"
        title="World Tour"
        :has-goal-options="true"
      />
      <GraphSettingsSection
        v-if="rankedEnabled"
        storage-key="ranked"
        title="Ranked"
        :has-goal-options="true"
      />
    </section>

    <section class="settings-card">
      <h2 class="card-title">API Keys</h2>
      <ApiKeysPanel />
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  width: min(720px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 20px;
  text-align: left;
}

.settings-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-page-head h1 {
  margin: 0;
  font-size: clamp(20px, 5vw, 28px);
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-strong);
}

.back-link {
  text-decoration: none;
}

.settings-card {
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  padding: 16px;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-strong);
}

.card-desc {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--muted);
}
</style>
