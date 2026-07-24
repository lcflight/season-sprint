<template>
  <!-- Hold the dashboard back until we know whether this is a new user, so the
       graph doesn't flash into view and then get replaced by the prompt. -->
  <div v-if="!isResolved" class="auth-loading" role="status" aria-live="polite">
    <span class="auth-spinner" aria-hidden="true"></span>
    <span class="auth-loading-sr">Loading…</span>
  </div>
  <OnboardingPrompt
    v-else-if="needed"
    :modes="modes"
    :is-saving="isSaving"
    :save-error="saveError"
    @save="save"
    @skip="skip"
  />
  <router-view v-else />
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import OnboardingPrompt from "./OnboardingPrompt.vue";
import { useOnboarding } from "@/composables/useOnboarding";
import { useFlags } from "@/composables/useFlags";

const { flags, loaded, loadFlags } = useFlags();
const { needed, isResolved, isSaving, saveError, check, save, skip } =
  useOnboarding();

// Ranked is flag-gated on web, so a user without it is neither asked for a
// Ranked total nor held in onboarding by Ranked data they can't create.
// Resolved once, at mount, so the prompt's fields can't change underneath the
// user mid-entry if flags reload.
const promptModes = ref(["world-tour"]);
const modes = computed(() => promptModes.value);

onMounted(async () => {
  // Shares the in-flight request with the app-level load; safe to call again.
  if (!loaded.value) await loadFlags();
  promptModes.value = flags.ranked ? ["world-tour", "ranked"] : ["world-tour"];
  await check(promptModes.value);
});
</script>
