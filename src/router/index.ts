import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'main', component: () => import('@/views/MawScene.vue') },
  { path: '/editor', name: 'editor', component: () => import('@/views/LevelEditor.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

export default router
