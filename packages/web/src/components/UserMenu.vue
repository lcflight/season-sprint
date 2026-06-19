<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useClerk, useUser } from "@clerk/vue";
import { useFlags } from "@/composables/useFlags";

// Fully custom replacement for Clerk's <UserButton>: we own the markup and
// styling, and call Clerk only for user data (useUser) and actions (useClerk).
//
// In dev-auth mode (Clerk plugin not mounted) the Clerk composables throw, so
// `dev` lets the menu render with a placeholder user for local styling work.
// eslint-disable-next-line no-undef
const props = defineProps({
  dev: { type: Boolean, default: false },
});

let user = ref(null);
let clerk = ref(null);
if (!props.dev) {
  ({ user } = useUser());
  clerk = useClerk();
}

const router = useRouter();

// Admin entry is shown only to admins (resolved server-side; dev override
// grants it locally). See useFlags.
const { isAdmin } = useFlags();

const open = ref(false);
const rootEl = ref(null);

const DEV_USER = {
  firstName: "Dev",
  lastName: "User",
  username: "dev",
  primaryEmailAddress: { emailAddress: "dev auth mode" },
  imageUrl: "",
};

const currentUser = computed(() => (props.dev ? DEV_USER : user.value));

const displayName = computed(() => {
  const u = currentUser.value;
  if (!u) return "";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.username || u.primaryEmailAddress?.emailAddress || "Account";
});

const email = computed(
  () => currentUser.value?.primaryEmailAddress?.emailAddress || ""
);

const imageUrl = computed(() => currentUser.value?.imageUrl || "");

const initials = computed(() => {
  const u = currentUser.value;
  if (!u) return "?";
  const a = (u.firstName?.[0] || "").toUpperCase();
  const b = (u.lastName?.[0] || "").toUpperCase();
  if (a || b) return (a + b) || a || b;
  const src = u.username || u.primaryEmailAddress?.emailAddress || "?";
  return src.slice(0, 1).toUpperCase();
});

const imageFailed = ref(false);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function openSettings() {
  close();
  router.push("/settings");
}

function openAdmin() {
  close();
  router.push("/admin");
}

function manageAccount() {
  close();
  if (props.dev) return;
  clerk.value?.openUserProfile();
}

function signOut() {
  close();
  if (props.dev) return;
  // App.vue's <SignedOut> gate handles redirecting to the sign-in view.
  clerk.value?.signOut();
}

function onDocPointer(e) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target)) {
    close();
  }
}

function onKeydown(e) {
  if (e.key === "Escape") close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointer);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="rootEl" class="user-menu">
    <button
      class="avatar-btn"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="displayName"
      @click="toggle"
    >
      <img
        v-if="imageUrl && !imageFailed"
        :src="imageUrl"
        :alt="displayName"
        class="avatar-img"
        @error="imageFailed = true"
      />
      <span v-else class="avatar-fallback">{{ initials }}</span>
    </button>

    <Transition name="menu-fade">
      <div v-if="open" class="menu-panel" role="menu">
        <div class="menu-header">
          <img
            v-if="imageUrl && !imageFailed"
            :src="imageUrl"
            :alt="displayName"
            class="menu-avatar"
          />
          <span v-else class="menu-avatar menu-avatar--fallback">{{ initials }}</span>
          <div class="menu-identity">
            <span class="menu-name">{{ displayName }}</span>
            <span v-if="email" class="menu-email">{{ email }}</span>
          </div>
        </div>

        <div class="menu-divider" />

        <button class="menu-item" type="button" role="menuitem" @click="openSettings">
          Settings
        </button>

        <button
          v-if="isAdmin"
          class="menu-item"
          type="button"
          role="menuitem"
          @click="openAdmin"
        >
          Admin
        </button>

        <button class="menu-item" type="button" role="menuitem" @click="manageAccount">
          Manage account
        </button>

        <div class="menu-divider" />

        <button
          class="menu-item menu-item--danger"
          type="button"
          role="menuitem"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
  display: inline-flex;
}

.avatar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--primary) 35%, var(--surface));
  background: var(--surface);
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 120ms ease, border-color 120ms ease,
    transform 120ms ease;
}

.avatar-btn:hover {
  transform: translateY(-1px);
  border-color: var(--ring-strong);
  box-shadow: 0 0 0 3px var(--ring);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-fallback {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-strong);
  letter-spacing: 0.02em;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  padding: 8px;
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  backdrop-filter: blur(10px);
  border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--surface));
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  z-index: 50;
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 10px;
}

.menu-avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--surface));
}

.menu-avatar--fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  font-size: 14px;
  font-weight: 800;
  color: var(--text-strong);
}

.menu-identity {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.menu-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-email {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-divider {
  height: 1px;
  margin: 6px 0;
  background: color-mix(in oklab, var(--primary) 18%, var(--surface));
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.menu-item:hover {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  color: var(--text-strong);
}

.menu-item--danger {
  color: var(--danger);
}

.menu-item--danger:hover {
  background: color-mix(in oklab, var(--danger) 16%, var(--surface));
  color: var(--danger);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
