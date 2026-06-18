import { createRouter, createWebHistory } from 'vue-router'

import WorldTour from '@/views/WorldTour.vue'
import { useFlags } from '@/composables/useFlags'

const routes = [
  { path: '/', redirect: '/world-tour' },
  { path: '/world-tour', name: 'WorldTour', component: WorldTour },
  // Ranked is gated by the `ranked` feature flag (see the guard below).
  {
    path: '/ranked',
    name: 'Ranked',
    component: () => import('@/views/Ranked.vue'),
    meta: { flag: 'ranked' },
  },
  // Admin panel — only for admins.
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: { admin: true },
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
