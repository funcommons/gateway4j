/**
 * S1-T：LayoutV2 骨架测试（契约 §2「LayoutV2 骨架」+ §1 侧栏切换入口）。
 * 断言的 i18n key（C-agent 必须在 zh-CN/en-US 同时添加，铁律 6）：
 *   分组（顺序 = 原型 01 侧栏）：v2.nav.group.overview / routes / plugins / observability / system
 *   S1 静态导航叶子：v2.nav.overview→/v2/overview  v2.nav.routes→/v2/routes
 *                    v2.nav.pluginChain→/v2/plugins/chain  v2.nav.monitor→/v2/monitor  v2.nav.debug→/v2/debug
 *   侧栏底部：v2.layout.backToLegacy → /routes（「返回旧版」）
 * 约定：active 态走 route.name（§2），active 类名认 el-menu 的 is-active 或自定义 active；
 * 本文件 mount 时局部注册 ElementPlus（导航是 el-menu 子树，不注册不渲染；不影响其他 app 用例）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import LayoutV2 from '@/layouts/LayoutV2.vue'

// LayoutV2 可能按 MainLayout 同款做法用 meta.permission 过滤侧栏可见性 —— 给满权限账号。
// P4d-1：权限集改可变（navAuth 先例 = router/v2.routing.test.ts P4a-1 追加段），system:user
// 按用例动态注入/还原 —— system 组「零可见条目 ↔ systemEmpty 占位」互斥断言需要。
const navAuth = vi.hoisted(() => ({
  permissions: ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'user:read', 'system:read'] as string[]
}))
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: navAuth.permissions.map((c: string) => ({ permission_code: c }))
  })
}))

/** 按点路径取 locale 值（key 不存在返回 undefined） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

/** 契约 §2 + §1：分组与叶子（顺序即断言顺序） */
const GROUP_KEYS = ['v2.nav.group.overview', 'v2.nav.group.routes', 'v2.nav.group.plugins', 'v2.nav.group.observability', 'v2.nav.group.system']
const LEAVES = [
  { key: 'v2.nav.overview', path: '/v2/overview', name: 'V2Overview' },
  { key: 'v2.nav.routes', path: '/v2/routes', name: 'V2Routes' },
  { key: 'v2.nav.pluginChain', path: '/v2/plugins/chain', name: 'V2PluginChain' },
  { key: 'v2.nav.monitor', path: '/v2/monitor', name: 'V2Monitor' },
  { key: 'v2.nav.debug', path: '/v2/debug', name: 'V2Debug' }
]
const BACK_KEY = 'v2.layout.backToLegacy'
const ALL_KEYS = [...GROUP_KEYS, ...LEAVES.map((l) => l.key), BACK_KEY]

const i18n = createI18n({
  legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})

const stub = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/v2',
        component: LayoutV2,
        children: [...LEAVES.map((l) => ({ path: l.path.slice(4), name: l.name, component: stub }))]
      },
      { path: '/routes', name: 'Routes', component: stub }
    ]
  })
}

async function factory(initialPath = '/v2/overview') {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
  await flushPromises()
  return { wrapper: wrapper as VueWrapper<any>, router }
}

/** 按显示文本找导航节点（el-menu 叶子 / 自定义导航锚点都覆盖） */
function findNavItem(wrapper: VueWrapper<any>, label: string) {
  return wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
}

/** active 类名：el-menu 的 is-active 或自定义 active（约定见文件头） */
function isActive(node: { classes(): string[] }) {
  return node.classes().some((c) => c === 'is-active' || c === 'active')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('LayoutV2 — i18n 双语 key 存在（契约 §0 铁律 6）', () => {
  it.each(ALL_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('LayoutV2 — 侧栏分组（契约 §2）', () => {
  it('渲染 5 个分组，顺序为 总览→路由→插件→可观测→系统（原型 01 侧栏）', async () => {
    const { wrapper } = await factory()
    const text = wrapper.text()
    const labels = GROUP_KEYS.map((k) => String(dig(zhCN, k)))
    let prev = -1
    for (const label of labels) {
      const at = text.indexOf(label)
      expect(at, `分组「${label}」(${GROUP_KEYS[labels.indexOf(label)]}) 未按顺序渲染`).toBeGreaterThan(prev)
      prev = at
    }
  })

  it.each(LEAVES)('导航叶子 $name 存在，点击后跳转 $path', async ({ key, path, name }) => {
    const { wrapper, router } = await factory()
    const label = String(dig(zhCN, key))
    const leaf = findNavItem(wrapper, label)
    expect(leaf, `找不到文案为「${label}」(${key}) 的导航项`).toBeDefined()
    await leaf!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.name).toBe(name)
  })
})

describe('LayoutV2 — 侧栏 active 态（契约 §2：走 route.name）', () => {
  it('路由 name 变化时 active 类跟随（/v2/overview → /v2/routes）', async () => {
    const { wrapper, router } = await factory('/v2/overview')
    const overview = findNavItem(wrapper, String(dig(zhCN, 'v2.nav.overview')))
    expect(overview).toBeDefined()
    expect(isActive(overview!), '初始路由 /v2/overview 的导航项未高亮').toBe(true)
    await router.push('/v2/routes')
    await flushPromises()
    expect(isActive(findNavItem(wrapper, String(dig(zhCN, 'v2.nav.routes')))!)).toBe(true)
    expect(isActive(findNavItem(wrapper, String(dig(zhCN, 'v2.nav.overview')))!)).toBe(false)
  })

  it('active 态由 route.name 推导（源码契约，参照 MainLayout.sidebar-active.test.ts）', () => {
    // 用 $route.path 直推会在 /v2/routes/:id/detail 等嵌套页失配；契约要求按 name 归位
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    expect(source).toMatch(/route\.name|activePath|SIDEBAR_ROUTE_MAP|currentRoute/)
  })
})

describe('LayoutV2 — 返回旧版（契约 §1 侧栏切换入口）', () => {
  it('「返回旧版」存在且点击后回 /routes', async () => {
    const { wrapper, router } = await factory()
    const label = String(dig(zhCN, BACK_KEY))
    const entry = findNavItem(wrapper, label)
    expect(entry, `找不到「${label}」(${BACK_KEY}) 入口`).toBeDefined()
    await entry!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/routes')
  })
})

// ═══════════ S11b-T 追加：调试台入口裁决（契约 §4 S11 行 S11b）═══════════
// 入口接线 S1 已落（上方 LEAVES 含 v2.nav.debug→/v2/debug，it.each 已断言点击跳转）：
// S11b 不新增入口、不动 NAV_GROUPS —— 页面实现原地替换 @/views-v2/debug/Debug.vue 占位
// （页面契约见 src/views-v2/debug/__tests__/DebugConsole.test.ts 头注「入口接线裁决」；
//   路由 meta/component 契约见 src/router/v2.routing.test.ts S11b 追加段）。
// 「该分组将在后续步骤开放」（v2.nav.systemEmpty）与调试台入口无关：它只挂在【零可见条目】
// 的分组（现为 system 组），随 system 组首个条目实装才退场 —— S11b 不动它，用例钉住边界。
describe('S11b 追加 — 调试台入口归组与占位文案边界', () => {
  it('「调试台」叶子归可观测分组，排监控大盘之后（IA 契约钉住，S11b 不改侧栏）', async () => {
    const { wrapper } = await factory()
    const text = wrapper.text()
    const monitorAt = text.indexOf(String(dig(zhCN, 'v2.nav.monitor')))
    const debugAt = text.indexOf(String(dig(zhCN, 'v2.nav.debug')))
    expect(debugAt, '调试台入口未渲染').toBeGreaterThan(-1)
    expect(debugAt, '调试台入口应排在监控大盘之后（可观测组内）').toBeGreaterThan(monitorAt)
  })

  it('v2.nav.systemEmpty 占位只属于零可见条目的分组：含调试台的 observability 组不渲染该文案', async () => {
    // P4d-2 更新前提：system 组已挂 V2Roles 第二叶子（user:read 在种子集）——动态摘除
    // system:user + user:read 使 system 组归零可见（占位边界语义不变，沿可变 navAuth 写法）
    navAuth.permissions = navAuth.permissions.filter((c: string) => c !== 'user:read')
    try {
      const { wrapper } = await factory()
      const emptyText = String(dig(zhCN, 'v2.nav.systemEmpty'))
      const side = wrapper.find('#v2-side')
      expect(side.exists()).toBe(true)
      // system 组零可见 → 占位文案全侧栏仍存在（observability 组有可见条目 → 不渲染该文案）
      expect(side.text()).toContain(emptyText)
      const groups = side.findAll('.v2-nav-group')
      const obs = groups.find((g) => g.text().includes(String(dig(zhCN, 'v2.nav.debug'))))
      expect(obs, '未找到含调试台条目的分组').toBeDefined()
      expect(obs!.text()).not.toContain(emptyText)
    } finally {
      navAuth.permissions = ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'user:read', 'system:read']
    }
  })
})

// ═══════════ P4d-1-T 追加：系统组「用户管理」首叶子（契约 §4.5 P4d，L78）═══════════
// 契约：docs/ui-v2/实施契约.md §4.5 P4d（2026-11-09）。LayoutV2 system 组挂第一叶子
// = 本步交付（NAV_GROUPS system items [] → 1 项）。先红是预期：v2.nav.users key 与
// NAV_GROUPS system 组条目均未落（C 步实现）；无权限边界用例落成即绿、C 后仍绿（钉边界）。
// 交互写法沿上方 S11b 段与 router/v2.routing.test.ts P4a-2 追加段；auth mock 复用上方
// 可变 navAuth（system:user 动态注入，finally 还原）。页面本体契约见
// src/views-v2/system/__tests__/Users.test.ts。
function makeNavRouterP4d1(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2', component: LayoutV2, children: [
        { path: 'overview', name: 'V2Overview', component: stub },
        { path: 'users', name: 'V2Users', component: stub }
      ] },
      { path: '/routes', name: 'Routes', component: stub }
    ]
  })
}

async function mountNavP4d1() {
  const navRouter = makeNavRouterP4d1()
  await navRouter.push('/v2/overview')
  await navRouter.isReady()
  const wrapper = mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, navRouter] } })
  await flushPromises()
  return { wrapper, navRouter }
}

describe('P4d-1 追加 — 系统组「用户管理」首叶子（systemEmpty 占位退场）', () => {
  it('v2.nav.users 在 zh-CN 与 en-US 都存在（铁律 6）', () => {
    expect(dig(zhCN, 'v2.nav.users'), 'zh-CN 缺少 v2.nav.users').toBeDefined()
    expect(dig(enUS, 'v2.nav.users'), 'en-US 缺少 v2.nav.users').toBeDefined()
  })

  it('NAV_GROUPS system 组 items 源码契约：首叶子 V2Users / /v2/users / v2.nav.users / 兜底 system:user（P4d-1-C 落行）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    const at = source.indexOf("key: 'system'")
    expect(at, '未找到 NAV_GROUPS system 组').toBeGreaterThan(-1)
    const block = source.slice(at, at + 480)
    expect(block).toContain("name: 'V2Users'")
    expect(block).toContain("path: '/v2/users'")
    expect(block).toContain("labelKey: 'v2.nav.users'")
    expect(block).toContain("permission: 'system:user'")
  })

  it('有 system:user 权限 → system 组可见且渲染用户管理叶子（点击跳 /v2/users，name=V2Users），侧栏不再渲染 systemEmpty 占位（S11b 占位随首叶子退场）', async () => {
    navAuth.permissions.push('system:user')
    try {
      const { wrapper, navRouter } = await mountNavP4d1()
      const label = String(dig(zhCN, 'v2.nav.users'))
      const side = wrapper.find('#v2-side')
      expect(side.exists()).toBe(true)
      const groups = side.findAll('.v2-nav-group')
      const sys = groups.find((g) => g.text().includes(String(dig(zhCN, 'v2.nav.group.system'))))
      expect(sys, '未找到系统分组').toBeDefined()
      expect(sys!.text()).toContain(label)
      expect(side.text(), 'system 组有可见条目后 systemEmpty 占位必须退场')
        .not.toContain(String(dig(zhCN, 'v2.nav.systemEmpty')))
      const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
      expect(leaf, `找不到文案为「${label}」(v2.nav.users) 的导航项`).toBeDefined()
      await leaf!.trigger('click')
      await flushPromises()
      expect(navRouter.currentRoute.value.path).toBe('/v2/users')
      expect(navRouter.currentRoute.value.name).toBe('V2Users')
    } finally {
      navAuth.permissions = navAuth.permissions.filter((c: string) => c !== 'system:user')
    }
  })

  it('无 system:user / user:read 权限 → 两叶子均被 canAccess 隐藏且 systemEmpty 占位仍在（零可见条目边界钉住，沿 S11b 写法）', async () => {
    expect(navAuth.permissions.some((c: string) => c === 'system:user'), '前置：默认权限集不含 system:user').toBe(false)
    // P4d-2 更新前提：system 组还挂 V2Roles（user:read 在种子集）——归零可见需一并摘除
    navAuth.permissions = navAuth.permissions.filter((c: string) => c !== 'user:read')
    try {
      const { wrapper } = await mountNavP4d1()
      const label = String(dig(zhCN, 'v2.nav.users'))
      const side = wrapper.find('#v2-side')
      const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
      expect(leaf, '无 system:user 权限时用户管理叶子不应渲染').toBeUndefined()
      const rolesLeaf = wrapper
        .findAll('.el-menu-item, [role="menuitem"], a')
        .find((n) => n.text().includes(String(dig(zhCN, 'v2.nav.roles'))))
      expect(rolesLeaf, '无 user:read 权限时角色权限叶子不应渲染').toBeUndefined()
      expect(side.text()).toContain(String(dig(zhCN, 'v2.nav.systemEmpty')))
    } finally {
      navAuth.permissions = ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'user:read', 'system:read']
    }
  })
})

// ═══════════ P4d-2-T 追加：系统组「角色权限」第二叶子（契约 §4.5 P4d 行，~L78）═══════════
// 契约：docs/ui-v2/实施契约.md §4.5 P4d（2026-11-09）。LayoutV2 system 组挂第二叶子
// = 本步交付（system items 1 项 → 2 项）。先红是预期：v2.nav.roles key 与 NAV_GROUPS
// system 组 V2Roles 条目均未落（C 步实现）。permission=user:read 在默认权限集内
// （见上方 navAuth 种子），正/负向用例均走动态改集 + finally 还原（P4d-1 先例反向）。
// fs 断言窗口取 at+900 容纳两叶子（P4d-1 段 at+480 只看首叶子，互不误伤）。
// 页面本体契约见 src/views-v2/system/__tests__/Roles.test.ts；路由行断言见
// src/router/v2.routing.test.ts P4d-2 追加段。
function makeNavRouterP4d2(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2', component: LayoutV2, children: [
        { path: 'overview', name: 'V2Overview', component: stub },
        { path: 'users', name: 'V2Users', component: stub },
        { path: 'roles', name: 'V2Roles', component: stub }
      ] },
      { path: '/routes', name: 'Routes', component: stub }
    ]
  })
}

async function mountNavP4d2() {
  const navRouter = makeNavRouterP4d2()
  await navRouter.push('/v2/overview')
  await navRouter.isReady()
  const wrapper = mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, navRouter] } })
  await flushPromises()
  return { wrapper, navRouter }
}

describe('P4d-2 追加 — 系统组「角色权限」第二叶子', () => {
  it('v2.nav.roles 在 zh-CN 与 en-US 都存在（铁律 6）', () => {
    expect(dig(zhCN, 'v2.nav.roles'), 'zh-CN 缺少 v2.nav.roles').toBeDefined()
    expect(dig(enUS, 'v2.nav.roles'), 'en-US 缺少 v2.nav.roles').toBeDefined()
  })

  it('NAV_GROUPS system 组 items 源码契约：第二叶子 V2Roles / /v2/roles / v2.nav.roles / user:read（P4d-2-C 落行）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    const at = source.indexOf("key: 'system'")
    expect(at, '未找到 NAV_GROUPS system 组').toBeGreaterThan(-1)
    const block = source.slice(at, at + 900)
    expect(block).toContain("name: 'V2Roles'")
    expect(block).toContain("path: '/v2/roles'")
    expect(block).toContain("labelKey: 'v2.nav.roles'")
    expect(block).toContain("permission: 'user:read'")
  })

  it('默认权限集含 user:read → system 组渲染角色权限叶子（点击跳 /v2/roles，name=V2Roles）', async () => {
    expect(navAuth.permissions.some((c: string) => c === 'user:read'), '前置：默认权限集含 user:read').toBe(true)
    const { wrapper, navRouter } = await mountNavP4d2()
    const label = String(dig(zhCN, 'v2.nav.roles'))
    const side = wrapper.find('#v2-side')
    expect(side.exists()).toBe(true)
    const groups = side.findAll('.v2-nav-group')
    const sys = groups.find((g) => g.text().includes(String(dig(zhCN, 'v2.nav.group.system'))))
    expect(sys, '未找到系统分组').toBeDefined()
    expect(sys!.text()).toContain(label)
    const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
    expect(leaf, `找不到文案为「${label}」(v2.nav.roles) 的导航项`).toBeDefined()
    await leaf!.trigger('click')
    await flushPromises()
    expect(navRouter.currentRoute.value.path).toBe('/v2/roles')
    expect(navRouter.currentRoute.value.name).toBe('V2Roles')
  })

  it('无 user:read 权限 → 角色权限叶子被 canAccess 隐藏（动态摘除 + finally 还原，P4d-1 先例反向）', async () => {
    navAuth.permissions = navAuth.permissions.filter((c: string) => c !== 'user:read')
    try {
      const { wrapper } = await mountNavP4d2()
      const label = String(dig(zhCN, 'v2.nav.roles'))
      const leaf = wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
      expect(leaf, '无 user:read 权限时角色权限叶子不应渲染').toBeUndefined()
    } finally {
      navAuth.permissions = ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'user:read', 'system:read']
    }
  })
})
