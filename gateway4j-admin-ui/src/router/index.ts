import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views/auth/Login.vue'), meta: { layout: 'blank' } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requireAuth: true },
    children: [
      { path: '', redirect: '/routes' },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/Index.vue'), meta: { title: 'sidebar.dashboard', titleKey: 'sidebar.dashboard', permission: 'monitor:read' } },
      { path: 'routes', name: 'Routes', component: () => import('@/views/routes/List.vue'), meta: { title: 'sidebar.routeList', titleKey: 'sidebar.routeList', permission: 'route:read' } },
      { path: 'routes/new', name: 'RouteNew', component: () => import('@/views/routes/Editor.vue'), meta: { title: 'common.create', titleKey: 'common.create', permission: 'route:edit' } },
      { path: 'routes/:id', name: 'RouteEdit', component: () => import('@/views/routes/Editor.vue'), meta: { title: 'common.edit', titleKey: 'common.edit', permission: 'route:edit' } },
      { path: 'routes/:id/canvas', name: 'RouteCanvas', component: () => import('@/views/routes/Canvas.vue'), meta: { title: 'sidebar.routeCanvas', titleKey: 'sidebar.routeCanvas', permission: 'route:edit' } },
      { path: 'plugins', name: 'Plugins', component: () => import('@/views/plugins/List.vue'), meta: { title: 'sidebar.pluginList', titleKey: 'sidebar.pluginList', permission: 'plugin:read' } },
      { path: 'plugins/global', name: 'GlobalPlugins', component: () => import('@/views/plugins/Global.vue'), meta: { title: 'sidebar.pluginGlobal', titleKey: 'sidebar.pluginGlobal', permission: 'plugin:read' } },
      { path: 'plugins/builtin', name: 'BuiltinPlugins', component: () => import('@/views/plugins/Builtin.vue'), meta: { title: 'sidebar.pluginBuiltin', titleKey: 'sidebar.pluginBuiltin', permission: 'plugin:read' } },
      { path: 'plugins/new', name: 'PluginNew', component: () => import('@/views/plugins/Editor.vue'), meta: { title: 'common.create', titleKey: 'common.create', permission: 'plugin:edit' } },
      { path: 'plugins/:id/edit', name: 'PluginEdit', component: () => import('@/views/plugins/Editor.vue'), meta: { title: 'common.edit', titleKey: 'common.edit', permission: 'plugin:edit' } },
      { path: 'import-export', name: 'ImportExport', component: () => import('@/views/routes/ImportExport.vue'), meta: { title: 'sidebar.routeImport', titleKey: 'sidebar.routeImport', permission: 'route:edit' } },
      { path: 'users', name: 'Users', component: () => import('@/views/users/List.vue'), meta: { title: 'sidebar.userList', titleKey: 'sidebar.userList', permission: 'system:user' } },
      // 只读页按读权限放行 (与 MainLayout 侧栏可见性 hasPermission('user:read') 对齐)
      { path: 'roles', name: 'Roles', component: () => import('@/views/users/Roles.vue'), meta: { title: 'sidebar.rolePerm', titleKey: 'sidebar.rolePerm', permission: 'user:read' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: 'sidebar.settings', titleKey: 'sidebar.settings', permission: 'system:read' } },
      // D15: 未知路由不再静默跳回列表, 渲染 404 页 (保持在 MainLayout 子层级, requireAuth 语义不变)
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/error/NotFound.vue') }
    ]
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

let authInitialized = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!authInitialized) {
    authInitialized = true
    await auth.init()
  }
  if (to.meta.requireAuth && !auth.isLogin) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  const perm = to.meta.permission as string | undefined
  if (perm && !auth.permissions.some(p => p.permission_code === perm)) {
    ElMessage.warning((i18n.global as any).t('common.permissionDenied'))
    return false
  }
})
