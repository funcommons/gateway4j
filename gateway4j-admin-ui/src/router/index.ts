import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'

/**
 * 顶层共享记录（P4f C2 摘旧树后收敛为两条）：
 * - /login：共享登录页（已随 v2 迁至 @/views-v2/auth/Login.vue）
 * - '/'：根路径重定向到 v2 默认落地页（NotFound 的 goHome push('/') 依赖此行）
 */
const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views-v2/auth/Login.vue') },
  { path: '/', redirect: '/v2/overview' }
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
      { path: 'debug', name: 'V2Debug', component: () => import('@/views-v2/debug/Debug.vue'), meta: { title: 'v2.page.debug', permission: 'route:edit' } },
      // P4f C2（摘旧树）：D15 catch-all 自 MainLayout children 迁入 /v2 children ——
      // 未知路由仍在 LayoutV2 壳内渲染 404 页；meta 合并父级 requireAuth，
      // 语义不变：未登录访问未知路径 → login?redirect=<原路径>
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views-v2/error/NotFound.vue') }
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
