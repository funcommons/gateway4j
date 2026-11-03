import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'

/**
 * meta.icon: 侧栏图标名 (@element-plus/icons-vue 的组件名),
 * 由 MainLayout 的 iconResolver 映射成实际组件.
 * 只有进入侧栏的路由才需要 (见 MainLayout 的 SIDEBAR_ICONS).
 */
const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views/auth/Login.vue'), meta: { layout: 'blank' } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requireAuth: true },
    children: [
      { path: '', redirect: '/routes' },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/Index.vue'), meta: { title: 'sidebar.dashboard', titleKey: 'sidebar.dashboard', icon: 'Histogram', permission: 'monitor:read' } },
      { path: 'routes', name: 'Routes', component: () => import('@/views/routes/List.vue'), meta: { title: 'sidebar.routeList', titleKey: 'sidebar.routeList', icon: 'Tickets', permission: 'route:read' } },
      { path: 'routes/new', name: 'RouteNew', component: () => import('@/views/routes/Editor.vue'), meta: { title: 'common.create', titleKey: 'common.create', permission: 'route:edit' } },
      { path: 'routes/:id', name: 'RouteEdit', component: () => import('@/views/routes/Editor.vue'), meta: { title: 'common.edit', titleKey: 'common.edit', permission: 'route:edit' } },
      // 画布是「某一条路由」的编辑器: :id 必须是真实 route id, 因此它不是侧栏叶子,
      // 只能从路由列表行内的「画布」按钮 / 命令面板进入 (见 MainLayout 的 IA 说明).
      { path: 'routes/:id/canvas', name: 'RouteCanvas', component: () => import('@/views/routes/Canvas.vue'), meta: { title: 'sidebar.routeCanvas', titleKey: 'sidebar.routeCanvas', icon: 'Share', permission: 'route:edit' } },
      { path: 'plugins', name: 'Plugins', component: () => import('@/views/plugins/List.vue'), meta: { title: 'sidebar.pluginList', titleKey: 'sidebar.pluginList', icon: 'Grid', permission: 'plugin:read' } },
      { path: 'plugins/global', name: 'GlobalPlugins', component: () => import('@/views/plugins/Global.vue'), meta: { title: 'sidebar.pluginGlobal', titleKey: 'sidebar.pluginGlobal', icon: 'Files', permission: 'plugin:read' } },
      { path: 'plugins/builtin', name: 'BuiltinPlugins', component: () => import('@/views/plugins/Builtin.vue'), meta: { title: 'sidebar.pluginBuiltin', titleKey: 'sidebar.pluginBuiltin', icon: 'Cpu', permission: 'plugin:read' } },
      { path: 'plugins/new', name: 'PluginNew', component: () => import('@/views/plugins/Editor.vue'), meta: { title: 'common.create', titleKey: 'common.create', permission: 'plugin:edit' } },
      { path: 'plugins/:id/edit', name: 'PluginEdit', component: () => import('@/views/plugins/Editor.vue'), meta: { title: 'common.edit', titleKey: 'common.edit', permission: 'plugin:edit' } },
      { path: 'import-export', name: 'ImportExport', component: () => import('@/views/routes/ImportExport.vue'), meta: { title: 'sidebar.routeImport', titleKey: 'sidebar.routeImport', icon: 'Operation', permission: 'route:edit' } },
      { path: 'users', name: 'Users', component: () => import('@/views/users/List.vue'), meta: { title: 'sidebar.userList', titleKey: 'sidebar.userList', icon: 'UserFilled', permission: 'system:user' } },
      // 只读页按读权限放行 (与 MainLayout 侧栏可见性 hasPermission('user:read') 对齐)
      { path: 'roles', name: 'Roles', component: () => import('@/views/users/Roles.vue'), meta: { title: 'sidebar.rolePerm', titleKey: 'sidebar.rolePerm', icon: 'Lock', permission: 'user:read' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: 'sidebar.settings', titleKey: 'sidebar.settings', icon: 'Setting', permission: 'system:read' } },
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
