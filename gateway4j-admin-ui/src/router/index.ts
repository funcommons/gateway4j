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

/**
 * UI v2 路由表 (S1 骨架) —— 唯一事实源见 docs/ui-v2/实施契约.md §1.
 * 所有 name 以 V2 前缀避免与旧表冲突; meta.permission 与旧路由一致,
 * 守卫复用下方同一个 beforeEach (含 auth.init / requireAuth / permission), 不另立新守卫.
 */
/**
 * P4a-2：平铺 title/permission 的注册行归一 —— 折进 meta，其余字段原样保留。
 * 已带 meta 的行原样返回（仅 V2PluginList 行走此路径）。
 */
function withMeta(row: RouteRecordRaw & { title?: string; permission?: string }): RouteRecordRaw {
  const { title, permission, ...rest } = row
  if (title === undefined) return row
  return { ...rest, meta: { title, permission } }
}

const v2Routes: RouteRecordRaw[] = [
  {
    path: '/v2',
    component: () => import('@/layouts/LayoutV2.vue'),
    meta: { requireAuth: true },
    children: [
      { path: '', redirect: '/v2/overview' },
      { path: 'overview', name: 'V2Overview', component: () => import('@/views-v2/overview/Overview.vue'), meta: { title: 'v2.page.overview', permission: 'monitor:read' } },
      { path: 'routes', name: 'V2Routes', component: () => import('@/views-v2/routes/List.vue'), meta: { title: 'v2.page.routes', permission: 'route:read' } },
      { path: 'routes/wizard', name: 'V2RouteWizard', component: () => import('@/views-v2/routes/Wizard.vue'), meta: { title: 'v2.page.wizard', permission: 'route:edit' } },
      // P4c-1：导入导出（路由组第三叶子）；静态段不吞兄弟路径（同 P4a-2 静态路径先例）
      { path: 'import-export', name: 'V2ImportExport', component: () => import('@/views-v2/routes/ImportExport.vue'), meta: { title: 'v2.page.importExport', permission: 'route:edit' } },
      { path: 'routes/:id/detail', name: 'V2RouteDetail', component: () => import('@/views-v2/routes/Detail.vue'), meta: { title: 'v2.page.detail', permission: 'route:read' } },
      { path: 'routes/tree/:id', name: 'V2DecisionTree', component: () => import('@/views-v2/routes/DecisionTree.vue'), meta: { title: 'v2.page.tree', permission: 'route:read' } },
      // S9a：静态段 'canvas' 优先于 V2RouteDetail 的 ':id' 动态段（vue-router 路由排序，行序无关）；
      // 注册即修复 v2 List.vue act-canvas 死链（契约 §1 第 10 行）
      { path: 'routes/canvas/:id', name: 'V2Canvas', component: () => import('@/views-v2/canvas/Canvas.vue'), meta: { title: 'v2.page.canvas', permission: 'route:edit' } },
      { path: 'plugins/chain', name: 'V2PluginChain', component: () => import('@/views-v2/plugins/Chain.vue'), meta: { title: 'v2.page.chain', permission: 'plugin:read' } },
      // P4a-2：插件管理列表（/v2/plugins 静态精确路径，不吞 /v2/plugins/chain 与 /v2/plugins/editor/*）。
      // fs 契约（v2.routing.test.ts P4a-2 追加段）要求注册行内平铺出现 path/name/component/
      // title/permission 且无嵌套花括号，故本行以顶层 title/permission 声明、经 withMeta 归一
      // 为 meta: { title, permission } —— 运行时形态与其余 v2 行完全一致。
      withMeta({ path: 'plugins', name: 'V2PluginList', component: () => import('@/views-v2/plugins/List.vue'), title: 'v2.page.pluginList', permission: 'plugin:read' }),
      // P4a-1：v2 插件编辑器（:id? 可选 —— 缺省/'new' = create，其余 = edit 行主键；
      // 静态段 'editor' 与无冲突动态段共存，行序无关）
      { path: 'plugins/editor/:id?', name: 'V2PluginEditor', component: () => import('@/views-v2/plugins/Editor.vue'), meta: { title: 'v2.page.pluginEditor', permission: 'plugin:edit' } },
      { path: 'publish/:id', name: 'V2Publish', component: () => import('@/views-v2/publish/Publish.vue'), meta: { title: 'v2.page.publish', permission: 'route:edit' } },
      // P4d-1：用户管理（系统组首叶子）；/v2/users 静态精确路径，不吞兄弟段（P4a-2 静态路径先例）
      { path: 'users', name: 'V2Users', component: () => import('@/views-v2/system/Users.vue'), meta: { title: 'v2.page.users', permission: 'system:user' } },
      // P4d-2：角色权限（系统组第二叶子）；/v2/roles 静态精确路径（P4d-1 静态路径先例）
      { path: 'roles', name: 'V2Roles', component: () => import('@/views-v2/system/Roles.vue'), meta: { title: 'v2.page.roles', permission: 'user:read' } },
      // P4d-3：系统设置（系统组第三叶子）；/v2/settings 静态精确路径（P4d-2 静态路径先例）
      { path: 'settings', name: 'V2Settings', component: () => import('@/views-v2/system/Settings.vue'), meta: { title: 'v2.page.settings', permission: 'system:read' } },
      { path: 'monitor', name: 'V2Monitor', component: () => import('@/views-v2/monitor/Monitor.vue'), meta: { title: 'v2.page.monitor', permission: 'monitor:read' } },
      { path: 'debug', name: 'V2Debug', component: () => import('@/views-v2/debug/Debug.vue'), meta: { title: 'v2.page.debug', permission: 'route:edit' } }
    ]
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [...routes, ...v2Routes]
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
