import { createRouter, createWebHistory } from 'vue-router'

import WorldTour from '@/views/WorldTour.vue'
import Ranked from '@/views/Ranked.vue'

const routes = [
  { path: '/', redirect: '/world-tour' },
  { path: '/world-tour', name: 'WorldTour', component: WorldTour },
  { path: '/ranked', name: 'Ranked', component: Ranked },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

