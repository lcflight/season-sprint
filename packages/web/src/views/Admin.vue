<template>
  <section v-if="isAdmin" class="admin">
    <header class="admin-head">
      <h1 class="admin-title">Admin · Feature Flags</h1>
      <router-link class="btn-ghost back-link" to="/">Back</router-link>
    </header>

    <p v-if="error" class="admin-error">{{ error }}</p>

    <!-- Global flags -->
    <div class="card">
      <h2 class="card-title">Flags</h2>
      <table v-if="flags.length" class="flag-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Description</th>
            <th>Global</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in flags" :key="f.key">
            <td class="mono">{{ f.key }}</td>
            <td>{{ f.description }}</td>
            <td>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="f.enabledGlobally"
                  @change="toggleGlobal(f, $event.target.checked)"
                />
                <span>{{ f.enabledGlobally ? "On" : "Off" }}</span>
              </label>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No flags yet.</p>

      <form class="create-flag" @submit.prevent="createFlag">
        <input v-model.trim="newKey" type="text" placeholder="flag key (e.g. ranked)" />
        <input v-model.trim="newDescription" type="text" placeholder="description" />
        <button class="btn-primary" type="submit" :disabled="!newKey">
          Create / update
        </button>
      </form>
    </div>

    <!-- Per-user overrides -->
    <div class="card">
      <h2 class="card-title">Users</h2>
      <form class="user-search" @submit.prevent="searchUsers">
        <input v-model.trim="searchEmail" type="text" placeholder="search by email…" />
        <button type="submit">Search</button>
      </form>

      <div v-for="u in users" :key="u.id" class="user-row">
        <div class="user-head">
          <span class="user-email">{{ u.email }}</span>
          <label
            class="switch"
            :class="{ 'switch-locked': u.allowlisted }"
            :title="u.allowlisted ? 'Admin via ADMIN_CLERK_USER_IDS allowlist — set in worker config, not editable here' : ''"
          >
            <input
              type="checkbox"
              :checked="u.isAdmin || u.allowlisted"
              :disabled="u.allowlisted"
              @change="setAdmin(u, $event.target.checked)"
            />
            <span>Admin{{ u.allowlisted ? " (allowlist)" : "" }}</span>
          </label>
        </div>
        <div class="user-flags">
          <label v-for="f in flags" :key="f.key" class="user-flag">
            <span class="mono">{{ f.key }}</span>
            <select
              :value="overrideState(u, f.key)"
              @change="changeOverride(u, f.key, $event.target.value)"
            >
              <option value="inherit">Inherit ({{ f.enabledGlobally ? "on" : "off" }})</option>
              <option value="on">Force on</option>
              <option value="off">Force off</option>
            </select>
          </label>
        </div>
      </div>
      <p v-if="searched && !users.length" class="muted">No users found.</p>
    </div>
  </section>
</template>

<script>
export default { name: "AdminView" };
</script>

<script setup>
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useFlags } from "@/composables/useFlags";
import {
  getAuthorizationHeader,
  adminListFlags,
  adminCreateFlag,
  adminToggleFlag,
  adminSearchUsers,
  adminSetUserOverride,
  adminClearUserOverride,
  adminSetUserAdmin,
} from "@/services/api";

const flags = ref([]);
const users = ref([]);
const newKey = ref("");
const newDescription = ref("");
const searchEmail = ref("");
const searched = ref(false);
const error = ref("");

// Defense-in-depth: the router guard already blocks non-admins, but if this
// view is ever reached without admin rights, render nothing and bounce out.
// (The server still enforces admin on every /admin endpoint regardless.)
const router = useRouter();
const { isAdmin, loaded } = useFlags();
watch(
  [isAdmin, loaded],
  ([admin, isLoaded]) => {
    if (isLoaded && !admin) router.replace("/world-tour");
  },
  { immediate: true }
);

async function auth() {
  const header = await getAuthorizationHeader();
  if (!header) throw new Error("Not authenticated");
  return header;
}

async function run(fn) {
  error.value = "";
  try {
    return await fn();
  } catch (e) {
    error.value = e?.message || "Request failed";
    return null;
  }
}

async function loadFlags() {
  await run(async () => {
    flags.value = await adminListFlags(await auth());
  });
}

async function createFlag() {
  if (!newKey.value) return;
  await run(async () => {
    await adminCreateFlag(newKey.value, newDescription.value, await auth());
    newKey.value = "";
    newDescription.value = "";
    await loadFlags();
  });
}

async function toggleGlobal(flag, enabled) {
  await run(async () => {
    const updated = await adminToggleFlag(flag.key, enabled, await auth());
    flag.enabledGlobally = updated.enabledGlobally;
  });
}

async function searchUsers() {
  await run(async () => {
    users.value = await adminSearchUsers(searchEmail.value, await auth());
    searched.value = true;
  });
}

function overrideState(user, flagKey) {
  const o = (user.flagOverrides || []).find((x) => x.flagKey === flagKey);
  if (!o) return "inherit";
  return o.enabled ? "on" : "off";
}

async function changeOverride(user, flagKey, state) {
  await run(async () => {
    const header = await auth();
    if (state === "inherit") {
      await adminClearUserOverride(user.id, flagKey, header);
      user.flagOverrides = (user.flagOverrides || []).filter(
        (x) => x.flagKey !== flagKey
      );
    } else {
      const enabled = state === "on";
      await adminSetUserOverride(user.id, flagKey, enabled, header);
      const existing = (user.flagOverrides || []).find(
        (x) => x.flagKey === flagKey
      );
      if (existing) existing.enabled = enabled;
      else (user.flagOverrides = user.flagOverrides || []).push({ flagKey, enabled });
    }
  });
}

async function setAdmin(user, isAdmin) {
  // Allowlisted admins are fixed in worker config; the toggle is disabled in
  // the UI, but guard here too so it can never clear their admin status.
  if (user.allowlisted) return;
  await run(async () => {
    const updated = await adminSetUserAdmin(user.id, isAdmin, await auth());
    user.isAdmin = updated.isAdmin;
  });
}

onMounted(() => {
  if (isAdmin.value) loadFlags();
});
</script>

<style scoped>
.admin {
  max-width: 900px;
  margin: 0 auto;
  text-align: left;
  width: 100%;
}
.admin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.admin-title {
  font-size: 22px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-strong);
  margin: 0;
}
.back-link {
  text-decoration: none;
  flex-shrink: 0;
}
.admin-error {
  color: var(--danger);
  font-weight: 700;
}
.card {
  border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--surface));
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  background: color-mix(in oklab, var(--surface) 90%, #000);
}
.card-title {
  margin: 0 0 12px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.flag-table {
  width: 100%;
  border-collapse: collapse;
}
.flag-table th,
.flag-table td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 12%, var(--surface));
}
.mono {
  font-family: var(--font-mono, monospace);
  color: var(--text-strong);
}
.muted {
  color: var(--muted);
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.switch-locked {
  cursor: not-allowed;
  opacity: 0.7;
}
.switch-locked input {
  cursor: not-allowed;
}
.create-flag,
.user-search {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.create-flag input,
.user-search input {
  flex: 1 1 160px;
  min-width: 0;
}
.user-row {
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in oklab, var(--primary) 12%, var(--surface));
}
.user-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.user-email {
  font-weight: 700;
  color: var(--text-strong);
}
.user-flags {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.user-flag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
