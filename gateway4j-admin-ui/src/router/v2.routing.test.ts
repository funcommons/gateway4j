/**
 * S1-T：/v2 路由表契约测试。
 * 对应契约：docs/ui-v2/实施契约.md §1「v2 路由表」+ §0 铁律 1（旧 UI 零变化）/ 铁律 5（守卫沿用）。
 *
 * 给 C-agent 的实现约定（断言按契约写死，先红是预期）：
 * - src/router/index.ts 追加顶层记录
 *   { path: '/v2', component: () => import('@/layouts/LayoutV2.vue'), meta: { requireAuth: true }, children: [...] }
 *   （requireAuth 与旧 '/' 记录一致；守卫必须复用现有 beforeEach，禁止另写一份）。
 * - children 的 path 必须写**相对路径**（'overview' 而非 '/overview'）：
 *   vue-router 会把带前导斜杠的 child path 当根级路径，拼不出 /v2/*，本测试直接红。
 * - /v2 → /v2/overview 的 redirect 写在父记录或 path:'' 子记录上均可，测试两种都认。
 * - S1 不注册 V2Canvas（契约 §1：S9 时再加）；全部 v2 name 以 V2 前缀。
 *   【S9-T 已更新】S9a 按契约 §1 注册第 10 行 V2Canvas（views-v2/canvas/Canvas.vue，
 *   path /v2/routes/canvas/:id，permission route:edit）——同时修复 v2 List.vue act-canvas 死链。
 *   vue-router 静态段 'canvas' 优先于 V2RouteDetail 的 ':id' 动态段，行序无关。
 * - 【P4a-1-T 追加（2026-11-07，契约 §4 P4 表 P4a 行裁决①）】注册第 11 行
 *   V2PluginEditor（views-v2/plugins/Editor.vue，path /v2/plugins/editor/:id?，
 *   permission plugin:edit，meta.title=v2.page.pluginEditor）—— 即本文件 V2_TABLE 追加行
 *   与「恰好 N 条」计数标题随改（本文件唯二的既有行改动，均为该裁决的直接后果）。
 *   vue-router 静态段 'editor' 优先于无冲突动态段；:id? 可选参数缺省即 create 模式、
 *   保留字 'new' 同 create（页面语义见 views-v2/plugins/__tests__/Editor.test.ts 头注）。
 *   LayoutV2 插件组第二叶子断言见文末 P4a-1 追加段（nav 挂载模式沿 LayoutV2.test.ts）。
 */
import { describe, it, expect, vi } from 'vitest'
import { router } from '@/router'
import type { RouteRecordRaw } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

/** 契约 §1 表：name → 完整 path + meta.permission（与旧路由权限模型一致） */
const V2_TABLE: Array<{ name: string; path: string; permission: string }> = [
  { name: 'V2Overview', path: '/v2/overview', permission: 'monitor:read' },
  { name: 'V2Routes', path: '/v2/routes', permission: 'route:read' },
  { name: 'V2RouteWizard', path: '/v2/routes/wizard', permission: 'route:edit' },
  { name: 'V2RouteDetail', path: '/v2/routes/:id/detail', permission: 'route:read' },
  { name: 'V2DecisionTree', path: '/v2/routes/tree/:id', permission: 'route:read' },
  { name: 'V2Canvas', path: '/v2/routes/canvas/:id', permission: 'route:edit' },
  { name: 'V2PluginChain', path: '/v2/plugins/chain', permission: 'plugin:read' },
  { name: 'V2PluginEditor', path: '/v2/plugins/editor/:id?', permission: 'plugin:edit' },
  { name: 'V2Publish', path: '/v2/publish/:id', permission: 'route:edit' },
  { name: 'V2Monitor', path: '/v2/monitor', permission: 'monitor:read' },
  { name: 'V2Debug', path: '/v2/debug', permission: 'route:edit' }
]

/** 旧路由快照（来自 S1 前的 src/router/index.ts）：name/path/permission 一个都不能动 */
const LEGACY_TABLE: Array<{ name: string; path: string; permission?: string }> = [
  { name: 'Login', path: '/login' },
  { name: 'Dashboard', path: '/dashboard', permission: 'monitor:read' },
  { name: 'Routes', path: '/routes', permission: 'route:read' },
  { name: 'RouteNew', path: '/routes/new', permission: 'route:edit' },
  { name: 'RouteEdit', path: '/routes/:id', permission: 'route:edit' },
  { name: 'RouteCanvas', path: '/routes/:id/canvas', permission: 'route:edit' },
  { name: 'Plugins', path: '/plugins', permission: 'plugin:read' },
  { name: 'GlobalPlugins', path: '/plugins/global', permission: 'plugin:read' },
  { name: 'BuiltinPlugins', path: '/plugins/builtin', permission: 'plugin:read' },
  { name: 'PluginNew', path: '/plugins/new', permission: 'plugin:edit' },
  { name: 'PluginEdit', path: '/plugins/:id/edit', permission: 'plugin:edit' },
  { name: 'ImportExport', path: '/import-export', permission: 'route:edit' },
  { name: 'Users', path: '/users', permission: 'system:user' },
  { name: 'Roles', path: '/roles', permission: 'user:read' },
  { name: 'Settings', path: '/settings', permission: 'system:read' },
  { name: 'NotFound', path: '/:pathMatch(.*)*' }
]

function recordByName(name: string) {
  return router.getRoutes().find((r) => String(r.name) === name)
}

describe('/v2 路由表 — 契约 §1', () => {
  it('存在 /v2 顶层记录：父级 component 是 LayoutV2 且 requireAuth（铁律 5 守卫沿用）', async () => {
    const v2Parent = router.options.routes.find((r) => r.path === '/v2') as
      | (RouteRecordRaw & { meta?: Record<string, unknown> })
      | undefined
    expect(v2Parent, '未找到 path=/v2 的顶层路由记录').toBeDefined()
    expect(v2Parent!.meta?.requireAuth).toBe(true)
    // 父级 component 必须指向 @/layouts/LayoutV2.vue（对模块身份做 toBe 断言，
    // 排除「随手复用 MainLayout / 塞错组件」的情况）
    const comp = (v2Parent as unknown as Record<string, unknown>).component ??
      ((v2Parent as unknown as Record<string, unknown>).components as Record<string, unknown> | undefined)?.default
    expect(typeof comp).toBe('function')
    const mod = await (comp as () => Promise<{ default: unknown }>)()
    const expected = await import('@/layouts/LayoutV2.vue')
    expect(mod.default).toBe(expected.default)
  })

  it('/v2 重定向到 /v2/overview（父记录 redirect 或空 path 子记录均可）', () => {
    const v2Parent = router.options.routes.find((r) => r.path === '/v2') as
      | (RouteRecordRaw & { redirect?: unknown; children?: Array<{ path?: string; redirect?: unknown }> })
      | undefined
    expect(v2Parent).toBeDefined()
    const direct = v2Parent!.redirect
    const viaChild = Array.isArray(v2Parent!.children)
      ? v2Parent!.children.find((c) => c.path === '' || c.path === '/')
      : undefined
    expect(direct === '/v2/overview' || viaChild?.redirect === '/v2/overview').toBe(true)
  })

  it.each(V2_TABLE)('$name 按 §1 注册：path=$path permission=$permission', ({ name, path, permission }) => {
    const record = recordByName(name)
    expect(record, `v2 路由 ${name} 未注册`).toBeDefined()
    expect(record!.path).toBe(path)
    expect((record!.meta as Record<string, unknown>).permission).toBe(permission)
  })

  it('v2 路由 name 全部以 V2 前缀且恰好 11 条（S9a 注册 V2Canvas；P4a-1 注册 V2PluginEditor，契约 §1 + P4a 行）', () => {
    const v2Names = router.getRoutes()
      .map((r) => String(r.name))
      .filter((n) => n.startsWith('V2'))
    expect(v2Names.sort()).toEqual(V2_TABLE.map((r) => r.name).sort())
  })
})

// ═══════════ S11b-T 追加：/v2/debug 页面接线（对齐 V2Canvas 行写法）═══════════
// 契约：docs/ui-v2/实施契约.md §4 S11 行 S11b 半步 + §1 第 10 行。
// /v2/debug 行 S1 已在上方 V2_TABLE（path+permission），本段只追加 meta.title 与
// component 契约，不改既有任何行/断言。裁决：S11b-C 在 @/views-v2/debug/Debug.vue
// 【原地替换】V2PagePlaceholder 占位 —— 不新建组件、不动路由表与侧栏（nav 断言见
// src/layouts/__tests__/LayoutV2.test.ts S11b 追加段；页面契约见 DebugConsole.test.ts 头注）。
describe('S11b 追加 — V2Debug meta 与组件接线', () => {
  it('V2Debug meta.title=v2.page.debug（面包屑数据源）且 permission=route:edit 不变', () => {
    const record = recordByName('V2Debug')
    expect(record, 'v2 路由 V2Debug 未注册').toBeDefined()
    expect((record!.meta as Record<string, unknown>).title).toBe('v2.page.debug')
    expect((record!.meta as Record<string, unknown>).permission).toBe('route:edit')
  })

  it('V2Debug component 指向 @/views-v2/debug/Debug.vue（S11b 原地实现，路由零改动）', async () => {
    const v2Parent = router.options.routes.find((r) => r.path === '/v2')
    const row = v2Parent?.children?.find((c) => c.name === 'V2Debug')
    expect(row, '未在 /v2 children 找到 V2Debug').toBeDefined()
    const loader = (row as unknown as Record<string, unknown>).component as
      (() => Promise<{ default: unknown }>) | undefined
    expect(typeof loader).toBe('function')
    const mod = await loader!()
    const expected = await import('@/views-v2/debug/Debug.vue')
    expect(mod.default).toBe(expected.default)
  })
})

describe('旧路由零变化 — 契约 §0 铁律 1', () => {
  it.each(LEGACY_TABLE)('旧路由 $name 仍存在且 path/permission 不变', ({ name, path, permission }) => {
    const record = recordByName(name)
    expect(record, `旧路由 ${name} 丢失（v2 改动破坏了旧表）`).toBeDefined()
    expect(record!.path).toBe(path)
    expect((record!.meta as Record<string, unknown>).permission ?? null).toBe(permission ?? null)
  })

  it("旧 '/' 记录下 '' 子路由仍 redirect 到 /routes（默认落地页不变）", () => {
    const legacyRoot = router.options.routes.find((r) => r.path === '/')
    const emptyChild = legacyRoot?.children?.[0] as { redirect?: string } | undefined
    expect(emptyChild?.redirect).toBe('/routes')
  })

  it("旧 '/' 记录的父级 component 仍是 MainLayout（LayoutV2 只挂在 /v2 下）", async () => {
    const legacyRoot = router.options.routes.find((r) => r.path === '/') as unknown as Record<string, unknown>
    const comp = legacyRoot.component ?? (legacyRoot.components as Record<string, unknown> | undefined)?.default
    const mod = await (comp as () => Promise<{ default: unknown }>)()
    expect(mod.default).toBe((await import('@/layouts/MainLayout.vue')).default)
  })
})

// ═══════════ P4a-1-T 追加：/v2/plugins/editor/:id? 行 + LayoutV2 插件组第二叶子 ═══════════
// 契约：docs/ui-v2/实施契约.md §4 P4 表 P4a 行裁决①（2026-11-07）。
// V2PluginEditor 行已在上方 V2_TABLE（path+permission，it.each 自动覆盖）；本段追加
// meta.title / component 接线 / :id? 语义 / nav 叶子。先红是预期：src/views-v2/plugins/
// Editor.vue 尚不存在（Failed to resolve import + TS2307，合规先红形态）。
// 头注已记录的两处既有行改动 = V2_TABLE 加行 + 「恰好 10 条」计数标题改 11（裁决直接后果）。
describe('P4a-1 追加 — V2PluginEditor meta 与组件接线', () => {
  it('V2PluginEditor meta.title=v2.page.pluginEditor（面包屑数据源）且 permission=plugin:edit 不变', () => {
    const record = recordByName('V2PluginEditor')
    expect(record, 'v2 路由 V2PluginEditor 未注册').toBeDefined()
    expect((record!.meta as Record<string, unknown>).title).toBe('v2.page.pluginEditor')
    expect((record!.meta as Record<string, unknown>).permission).toBe('plugin:edit')
  })

  it('V2PluginEditor component 指向 @/views-v2/plugins/Editor.vue（P4a-1-C 原地实现）', async () => {
    const v2Parent = router.options.routes.find((r) => r.path === '/v2')
    const row = v2Parent?.children?.find((c) => c.name === 'V2PluginEditor')
    expect(row, '未在 /v2 children 找到 V2PluginEditor').toBeDefined()
    const loader = (row as unknown as Record<string, unknown>).component as
      (() => Promise<{ default: unknown }>) | undefined
    expect(typeof loader).toBe('function')
    const mod = await loader!()
    const expected = await import('@/views-v2/plugins/Editor.vue')
    expect(mod.default).toBe(expected.default)
  })

  it(':id? 可选参数语义：/editor/7001 → params.id=7001（edit）；/editor 与 /editor/new 均可匹配（create，new 为保留字）', () => {
    const withId = router.resolve('/v2/plugins/editor/7001')
    expect(withId.name).toBe('V2PluginEditor')
    expect(withId.params.id).toBe('7001')
    expect(router.resolve('/v2/plugins/editor').name).toBe('V2PluginEditor')
    const fresh = router.resolve('/v2/plugins/editor/new')
    expect(fresh.name).toBe('V2PluginEditor')
    expect(fresh.params.id).toBe('new')
  })
})

// ── LayoutV2 插件组第二叶子（挂载模式沿 LayoutV2.test.ts；auth mock 可变权限集）──
const navAuth = vi.hoisted(() => ({
  permissions: ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'plugin:edit', 'user:read', 'system:read']
}))
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: navAuth.permissions.map((c: string) => ({ permission_code: c }))
  })
}))

import LayoutV2 from '@/layouts/LayoutV2.vue'

/** 按点路径取 locale 值（LayoutV2.test.ts dig 先例） */
function digNav(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

const P4A_NAV_KEY = 'v2.nav.pluginEditor'
const NAV_STUB = { template: '<div />' }

function makeNavRouter(): ReturnType<typeof createRouter> {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2', component: LayoutV2, children: [
        { path: 'overview', name: 'V2Overview', component: NAV_STUB },
        { path: 'plugins/chain', name: 'V2PluginChain', component: NAV_STUB },
        { path: 'plugins/editor/:id?', name: 'V2PluginEditor', component: NAV_STUB }
      ] },
      { path: '/routes', name: 'Routes', component: NAV_STUB }
    ]
  })
}

async function mountNav() {
  const navRouter = makeNavRouter()
  await navRouter.push('/v2/overview')
  await navRouter.isReady()
  const navI18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
  const wrapper = mount(LayoutV2, { global: { plugins: [ElementPlus, navI18n, navRouter] } })
  await flushPromises()
  return { wrapper, navRouter }
}

describe('P4a-1 追加 — LayoutV2 插件组第二叶子（插件编辑器）', () => {
  it('v2.nav.pluginEditor 在 zh-CN 与 en-US 都存在（铁律 6）', () => {
    expect(digNav(zhCN, P4A_NAV_KEY), 'zh-CN 缺少 v2.nav.pluginEditor').toBeDefined()
    expect(digNav(enUS, P4A_NAV_KEY), 'en-US 缺少 v2.nav.pluginEditor').toBeDefined()
  })

  it('「插件编辑器」叶子归插件分组、排「插件链」之后，点击跳 /v2/plugins/editor 且 name=V2PluginEditor', async () => {
    const { wrapper, navRouter } = await mountNav()
    const label = String(digNav(zhCN, P4A_NAV_KEY))
    const side = wrapper.find('#v2-side')
    expect(side.exists()).toBe(true)
    const groups = side.findAll('.v2-nav-group')
    const pluginGroup = groups.find((g) => g.text().includes(String(digNav(zhCN, 'v2.nav.group.plugins'))))
    expect(pluginGroup, '未找到插件分组').toBeDefined()
    const chainAt = pluginGroup!.text().indexOf(String(digNav(zhCN, 'v2.nav.pluginChain')))
    const editorAt = pluginGroup!.text().indexOf(label)
    expect(editorAt, '插件编辑器叶子未渲染').toBeGreaterThan(-1)
    expect(editorAt, '插件编辑器应排插件链之后（插件组第二叶子）').toBeGreaterThan(chainAt)
    const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
    expect(leaf, `找不到文案为「${label}」(${P4A_NAV_KEY}) 的导航项`).toBeDefined()
    await leaf!.trigger('click')
    await flushPromises()
    expect(navRouter.currentRoute.value.path).toBe('/v2/plugins/editor')
    expect(navRouter.currentRoute.value.name).toBe('V2PluginEditor')
  })

  it('无 plugin:edit 权限 → 叶子被侧栏可见性判据隐藏（canAccess 与守卫同源，读路由 meta.permission）', async () => {
    navAuth.permissions = navAuth.permissions.filter((c: string) => c !== 'plugin:edit')
    try {
      const { wrapper } = await mountNav()
      const label = String(digNav(zhCN, P4A_NAV_KEY))
      const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
      expect(leaf, '无 plugin:edit 权限时插件编辑器叶子不应渲染').toBeUndefined()
    } finally {
      navAuth.permissions.push('plugin:edit')
    }
  })
})
