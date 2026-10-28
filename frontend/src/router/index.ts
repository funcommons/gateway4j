import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useGatewayAuthStore } from '@/store/gateway-auth'
import i18n from '@/locales'

const t = i18n.global.t

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/gateway/Login.vue'),
    meta: { title: 'router.login', public: true, hideInMenu: true, layout: 'blank' }
  },
  {
    path: '/logout',
    name: 'Logout',
    component: () => import('@/views/auth/Logout.vue'),
    meta: { title: 'router.logout', public: true, hideInMenu: true, layout: 'blank' }
  },
  {
    path: '/',
    component: () => import('@/layout/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('@/views/gateway/routes/List.vue'),
        meta: { title: 'router.routes', hideInMenu: true }
      },
      // —— Routes ——
      {
        path: 'routes',
        name: 'RouteList',
        component: () => import('@/views/gateway/routes/List.vue'),
        meta: { title: 'router.routes', icon: 'Guide' }
      },
      {
        path: 'routes/new',
        name: 'RouteNew',
        component: () => import('@/views/gateway/routes/Editor.vue'),
        meta: { title: 'router.route-new', hideInMenu: true }
      },
      {
        path: 'routes/:id',
        name: 'RouteEdit',
        component: () => import('@/views/gateway/routes/Editor.vue'),
        meta: { title: 'router.route-edit', hideInMenu: true }
      },
      {
        path: 'routes/:id/canvas',
        name: 'RouteCanvas',
        component: () => import('@/views/gateway/routes/Canvas.vue'),
        meta: { title: 'router.route-canvas', hideInMenu: true }
      },
      {
        path: 'import-export',
        name: 'ImportExport',
        component: () => import('@/views/gateway/routes/ImportExport.vue'),
        meta: { title: 'router.import-export', hideInMenu: true }
      },
      // —— Plugins ——
      {
        path: 'plugins',
        name: 'PluginList',
        component: () => import('@/views/gateway/plugins/List.vue'),
        meta: { title: 'router.plugins', icon: 'SetUp' }
      },
      {
        path: 'plugins/new',
        name: 'PluginNew',
        component: () => import('@/views/gateway/plugins/Editor.vue'),
        meta: { title: 'router.plugin-new', hideInMenu: true }
      },
      {
        path: 'plugins/:id/edit',
        name: 'PluginEdit',
        component: () => import('@/views/gateway/plugins/Editor.vue'),
        meta: { title: 'router.plugin-edit', hideInMenu: true }
      },
      {
        path: 'plugins/builtin',
        name: 'PluginBuiltin',
        component: () => import('@/views/gateway/plugins/Builtin.vue'),
        meta: { title: 'router.plugin-builtin', hideInMenu: true }
      },
      {
        path: 'plugins/global',
        name: 'PluginGlobal',
        component: () => import('@/views/gateway/plugins/Global.vue'),
        meta: { title: 'router.plugin-global', hideInMenu: true }
      },
      // —— Dashboard ——
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/gateway/dashboard/Index.vue'),
        meta: { title: 'router.dashboard', icon: 'DataBoard' }
      },
      // —— Users & Roles ——
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/gateway/users/List.vue'),
        meta: { title: 'router.users', icon: 'User', permission: 'system:user' }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('@/views/gateway/users/Roles.vue'),
        meta: { title: 'router.roles', icon: 'Lock', permission: 'system:role' }
      },
      // —— Settings ——
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/gateway/Settings.vue'),
        meta: { title: 'router.settings', icon: 'Setting', permission: 'system:edit' }
      },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach(async (to, _from) => {
  const title = to.meta.title as string
  if (title) {
    document.title = `${t(title)} - Gateway4j`
  }

  // Public routes don't need auth
  if (to.meta.public) return true

  const auth = useGatewayAuthStore()
  // Init on first navigation (refresh token restore)
  if (!auth.user && auth.hasToken) {
    try {
      await auth.init()
    } catch {
      // init failure handled by clearAuth
    }
  }

  if (!auth.hasToken) {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }

  return true
})

export default router
