<script>
export default { name: "DeleteAccountView" };
</script>

<script setup>
import { ref } from "vue";
import { requestAccountDeletion } from "@/services/api";

const email = ref("");
const reason = ref("");
const submitting = ref(false);
const submitted = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    await requestAccountDeletion(email.value.trim(), reason.value.trim());
    submitted.value = true;
  } catch (e) {
    error.value = e?.message || "Something went wrong — try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="delete-page">
    <header class="delete-page-head">
      <h1>Delete Account</h1>
      <router-link class="btn-ghost back-link" to="/">Back</router-link>
    </header>

    <section class="delete-card">
      <template v-if="submitted">
        <p class="confirm">
          Request received. We'll confirm by email and permanently delete
          your account, season records, and API keys within 30 days.
        </p>
      </template>
      <template v-else>
        <p>
          Requesting deletion of your Season Sprint account and all
          associated data — season records and API keys. This can't be
          undone. Individual records can be deleted anytime from within the
          app without deleting your whole account.
        </p>

        <form class="delete-form" @submit.prevent="submit">
          <label class="field">
            <span>Account email</span>
            <input
              v-model="email"
              type="email"
              required
              placeholder="you@example.com"
              autocomplete="email"
            />
          </label>

          <label class="field">
            <span>Reason (optional)</span>
            <textarea
              v-model="reason"
              rows="3"
              placeholder="Optional — helps us improve"
            ></textarea>
          </label>

          <p v-if="error" class="error">{{ error }}</p>

          <button class="btn-primary" type="submit" :disabled="submitting || !email">
            {{ submitting ? "Submitting…" : "Request deletion" }}
          </button>
        </form>
      </template>
    </section>

    <p class="fallback">
      Prefer email? Reach out directly at
      <a href="mailto:larthur.creations@gmail.com">larthur.creations@gmail.com</a>.
      See the <router-link to="/privacy#data-deletion">privacy policy</router-link>
      for details on what's deleted and what's retained.
    </p>
  </div>
</template>

<style scoped>
.delete-page {
  width: min(560px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 20px;
  text-align: left;
}

.delete-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.delete-page-head h1 {
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

.delete-card {
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  padding: 20px 24px;
}

.delete-card p {
  margin: 0 0 8px;
  color: var(--text);
  line-height: 1.5;
}

.confirm {
  color: var(--text-strong);
  font-weight: 700;
}

.delete-form {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.field input,
.field textarea {
  font: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--primary) 24%, var(--surface));
  background: color-mix(in oklab, var(--surface) 92%, #000);
  color: var(--text-strong);
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}

.error {
  color: var(--danger);
  font-weight: 700;
}

.fallback {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.fallback a {
  color: var(--primary);
}
</style>
