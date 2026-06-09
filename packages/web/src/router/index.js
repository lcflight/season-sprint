import { createRouter, createWebHistory } from 'vue-router'

import WorldTour from '@/views/WorldTour.vue'
// Ranked mode is disabled for now. Keep the import/route commented so it can be
// restored quickly later.
// import Ranked from '@/views/Ranked.vue'

const routes = [
  { path: '/', redirect: '/world-tour' },
  { path: '/world-tour', name: 'WorldTour', component: WorldTour },
  // Ranked is disabled for now — redirect any /ranked links back to World Tour.
  // { path: '/ranked', name: 'Ranked', component: Ranked },
  { path: '/ranked', redirect: '/world-tour' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

