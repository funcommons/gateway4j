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
 */
import { describe, it, expect } from 'vitest'
import { router } from '@/router'
import type { RouteRecordRaw } from 'vue-router'

/** 契约 §1 表：name → 完整 path + meta.permission（与旧路由权限模型一致） */
const V2_TABLE: Array<{ name: string; path: string; permission: string }> = [
  { name: 'V2Overview', path: '/v2/overview', permission: 'monitor:read' },
  { name: 'V2Routes', path: '/v2/routes', permission: 'route:read' },
  { name: 'V2RouteWizard', path: '/v2/routes/wizard', permission: 'route:edit' },
  { name: 'V2RouteDetail', path: '/v2/routes/:id/detail', permission: 'route:read' },
  { name: 'V2DecisionTree', path: '/v2/routes/tree/:id', permission: 'route:read' },
  { name: 'V2Canvas', path: '/v2/routes/canvas/:id', permission: 'route:edit' },
  { name: 'V2PluginChain', path: '/v2/plugins/chain', permission: 'plugin:read' },
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

  it('v2 路由 name 全部以 V2 前缀且恰好 10 条（S9a 注册 V2Canvas，契约 §1）', () => {
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
