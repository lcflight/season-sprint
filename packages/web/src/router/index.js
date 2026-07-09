import { createRouter, createWebHistory } from 'vue-router'

import WorldTour from '@/views/WorldTour.vue'
import { useFlags } from '@/composables/useFlags'

const routes = [
  { path: '/', redirect: '/world-tour' },
  { path: '/world-tour', name: 'WorldTour', component: WorldTour, meta: { modeSwitcher: true } },
  // Ranked is gated by the `ranked` feature flag (see the guard below).
  {
    path: '/ranked',
    name: 'Ranked',
    component: () => import('@/views/Ranked.vue'),
    meta: { flag: 'ranked', modeSwitcher: true },
  },
  // Admin panel — only for admins.
  // Settings page (graph display options + API keys). The ranked graph
  // section is gated internally by the `ranked` flag.
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: { admin: true },
  },
  // Public — must be reachable without signing in (Play/App Store review,
  // and visitors deciding whether to sign up in the first place).
  {
    path: '/privacy',
    name: 'Privacy',
    component: () => import('@/views/Privacy.vue'),
    meta: { public: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

// Gate flag-protected and admin-only routes. Flags depend on auth, so ensure
// they are loaded before deciding (idempotent — shares one in-flight request).
router.beforeEach(async (to) => {
  const { flags, isAdmin, loaded, loadFlags } = useFlags()
  if (to.meta?.flag || to.meta?.admin) {
    if (!loaded.value) await loadFlags()
    if (to.meta.admin && !isAdmin.value) return '/world-tour'
    if (to.meta.flag && !flags[to.meta.flag]) return '/world-tour'
  }
  return true
})

export default router
