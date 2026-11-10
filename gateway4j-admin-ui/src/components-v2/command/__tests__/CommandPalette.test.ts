/**
 * OPT-2-T：⌘K 全局命令面板（v2 优化建议 #1，对标 Kong Konnect —— docs/ui-v2/gateway4j-v2优化.md §三.1）。
 * 先红是预期（RED 类型：组件缺失）——CommandPalette 由 OPT-2-C 实现。对缺失组件采用
 * 「非常量动态导入」（见 PALETTE_PATH 处注释）：避免 RED 阶段 vue-tsc 对不存在模块报
 * TS2307（契约 §3 基线 16 错不得新增），C 步落地后该写法与静态 import 完全等价。
 * LayoutV2 顶栏接线属「行为缺失」型 RED，见 src/layouts/__tests__/LayoutV2.command-palette.test.ts。
 *
 * ══ 组件契约（OPT-2-T 固化，OPT-2-C 不得偏离）══
 * - 落点：src/components-v2/command/CommandPalette.vue（业务域组件：依赖 @/api/routes、
 *   @/api/plugins 与 v2.* i18n，不进 src/components 的 SDK 快照域；且 src/components 在
 *   tsconfig 被 exclude，放进去会逃过 vue-tsc 类型检查）。内部可拆 useCommandRegistry.ts
 *   （同目录，行为已由本文件覆盖，不单独建测试文件）。
 * - API：props { open: boolean }（v-model:open），emits ['update:open']；组件自身在 window
 *   常驻监听 ⌘K / Ctrl+K toggle 与 Esc 关闭（与 open 状态无关，挂载即监听）。
 * - 分组（顺序固定）：pages（静态 = 侧栏 12 叶子：路由表 V2* 非参数页，权限过滤同侧栏
 *   canAccess，读 meta.permission）→ actions（静态 4 动作）→ routes → plugins（异步）。
 *   空组不渲染；query 非空时各组只留命中项。
 *   【P3-a 契约演进 · F 裁决】query 非空（搜索态）且任一异步组有命中时，动作组排尾：
 *   组序 pages→routes→plugins→actions（修「Enter 落向导」怪相）；浏览态（空 query）组序
 *   pages→actions→routes→plugins 不变，由 CommandPalette.polish.test.ts E 组红线钉死。
 *   「结果合并」用例原 actions<routes 断言与演进契约冲突，按裁决修订该单行（见该用例）。
 * - 动作集（无权限门槛，恒显）：create-route→push(/v2/routes/wizard)；
 *   import-export→push(/v2/import-export)；theme-toggle→inject('fc-theme').setTheme(翻转)；
 *   logout→auth store logout()+push(/login)。
 *   【裁决】优化建议原文的「发布页」（V2Publish=/v2/publish/:id）是参数页，无静态直达入口，
 *   不入动作集 —— 后续可作路由搜索结果行的次级动作，不在本步契约。
 * - 异步搜索：query 非空才发请求（打开/空 query 零调用）；trailing debounce 200ms；
 *   routes 走 listRoutes()（该 API 无 keyword 参数 → 客户端按 route_name/path 过滤）；
 *   plugins 走 listPlugins({ page: 1, keyword })（服务端 keyword，结果按 plugin_name 再过滤）。
 *   搜索域 = 标题/名称 + path，不含权限码（'monitor' 不得因 monitor:read 命中总览页）。
 * - 键盘：↑↓ 循环移动高亮（首项 ↑→末项、末项 ↓→首项）、Enter 执行高亮项并关闭、
 *   Esc（window）关闭、点击 cmd-mask 关闭、点击面板本体不关闭。
 * - 高亮：默认首项；query 变化重置首项；视觉类名 is-active + aria-selected="true" +
 *   listbox aria-activedescendant 指向高亮项 id。
 * - 命中片段高亮：命中片段包 class="cmd-hit"。
 * - a11y：cmd-root role="dialog" aria-modal="true"；打开自动聚焦 cmd-input；关闭后焦点还给
 *   打开前的触发元素；组件源码含 :focus-visible 焦点环（fs 断言）。
 * - i18n：全部可见文案走 i18n（铁律 6，zh-CN/en-US 同步）。新增 key 全表（12 个，v2 命名空间）：
 *   v2.cmd.placeholder / v2.cmd.empty / v2.cmd.loading / v2.cmd.footer /
 *   v2.cmd.group.pages / v2.cmd.group.actions / v2.cmd.group.routes / v2.cmd.group.plugins /
 *   v2.cmd.action.createRoute / v2.cmd.action.importExport / v2.cmd.action.themeToggle /
 *   v2.cmd.action.logout
 *   （页面条目复用既有 v2.nav.*；顶栏触发器复用既有 v2.topbar.searchPlaceholder/kbd，
 *     不新增。）
 * - testid 全表（前缀 cmd-）：cmd-root / cmd-input / cmd-mask / cmd-listbox /
 *   cmd-group-{pages|actions|routes|plugins} / cmd-item-page-{V2路由name} /
 *   cmd-item-route-{路由id} / cmd-item-plugin-{插件id} /
 *   cmd-action-{create-route|import-export|theme-toggle|logout} / cmd-empty / cmd-loading
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

// —— RED 关键：非常量动态导入（组件缺失 → 运行时模块解析失败 = 合法 RED）——
// 说明见文件头；静态 import 会在 RED 阶段产生 1 条 TS2307，违反「基线 16 错不得新增」。
const PALETTE_PATH = '@/components-v2/command/CommandPalette.vue'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CommandPalette: any = (await import(PALETTE_PATH)).default

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  listPlugins: vi.fn(),
  logout: vi.fn(),
  setTheme: vi.fn(),
  setBrand: vi.fn(),
  hasPermission: vi.fn<(code: string) => boolean>(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({ listRoutes: mocks.listRoutes }))
vi.mock('@/api/plugins', () => ({ listPlugins: mocks.listPlugins }))
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ logout: mocks.logout, permissions: [], isLogin: true })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

// —— 夹具：路由树（listRoutes 返回 RouteNode[]，此处两节点平铺）——
function makeRoute(id: string, routeName: string, routePath: string) {
  return {
    id,
    route_name: routeName,
    route_type: 'BACKEND',
    path: routePath,
    upstream_url: 'http://10.0.0.11:9001',
    status: 'PUBLISHED',
    sort_order: 0,
    config_version: '1',
    created_at: 0,
    updated_at: 0,
    plugins: [],
    children: []
  }
}
const ROUTES = [makeRoute('r1', 'user_service', '/api/user/**'), makeRoute('r2', 'order_service', '/api/order/**')]

// —— 夹具：插件分页（listPlugins 返回 Page<PluginItem>；mock 按keyword过滤，复刻服务端语义）——
function makePlugin(id: string, pluginId: string, pluginName: string) {
  return {
    id,
    plugin_id: pluginId,
    plugin_name: pluginName,
    plugin_type: 'BUILTIN',
    plugin_phase: 'PRE',
    scope: 'GLOBAL',
    status: 'ENABLED',
    sort_order: 0,
    config: '{}'
  }
}
const PLUGIN_ALL = [makePlugin('p1', 'user-auth', 'user_auth'), makePlugin('p2', 'rate-limit', 'rate_limit')]
function pluginsPage(keyword?: string) {
  const records = keyword ? PLUGIN_ALL.filter((p) => p.plugin_name.includes(keyword)) : PLUGIN_ALL
  return { records, total: records.length, size: 20, current: 1, pages: 1 }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoutes.mockImplementation(() => Promise.resolve(ROUTES))
  mocks.listPlugins.mockImplementation((params?: { keyword?: string }) => Promise.resolve(pluginsPage(params?.keyword)))
  mocks.hasPermission.mockImplementation(() => true)
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  wrappers.length = 0
  mocks.listRoutes.mockReset()
  mocks.listPlugins.mockReset()
  mocks.logout.mockReset()
  mocks.setTheme.mockReset()
  mocks.setBrand.mockReset()
  mocks.hasPermission.mockReset()
  mocks.hasPermission.mockImplementation(() => true)
  vi.useRealTimers()
})

/** 收集所有 wrapper，afterEach 统一卸载（window 监听器随组件卸载移除，防跨用例串扰） */
const wrappers: VueWrapper<any>[] = []

// —— i18n：真双语 message（key 存在性 + 文案断言两用），显式 I18n<> 类型（Settings.test.ts 先例）——
const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
function makeI18n(): I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false> {
  return createI18n(i18nBase)
}

/** 按点路径取 locale 值；undefined = key 缺失（LayoutV2.test.ts 先例） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

// —— 主题上下文 mock（inject('fc-theme')，LayoutV2 兜底上下文同形）——
const themeContext = {
  brand: ref('ldx2'),
  theme: ref<'light' | 'dark'>('light'),
  setBrand: mocks.setBrand,
  setTheme: mocks.setTheme
}

// —— 路由表桩：侧栏 12 叶子（静态页组契约域）+ 4 个参数页（必须被排除）+ /login ——
interface PageRow {
  path: string
  name: string
  permission: string
}
/** 与 src/router/index.ts v2 表 + LayoutV2 NAV_GROUPS 侧栏叶子一一对应 */
const SIDEBAR_PAGES: PageRow[] = [
  { path: '/v2/overview', name: 'V2Overview', permission: 'monitor:read' },
  { path: '/v2/routes', name: 'V2Routes', permission: 'route:read' },
  { path: '/v2/routes/wizard', name: 'V2RouteWizard', permission: 'route:edit' },
  { path: '/v2/import-export', name: 'V2ImportExport', permission: 'route:edit' },
  { path: '/v2/plugins/chain', name: 'V2PluginChain', permission: 'plugin:read' },
  { path: '/v2/plugins', name: 'V2PluginList', permission: 'plugin:read' },
  { path: '/v2/plugins/editor', name: 'V2PluginEditor', permission: 'plugin:edit' },
  { path: '/v2/monitor', name: 'V2Monitor', permission: 'monitor:read' },
  { path: '/v2/debug', name: 'V2Debug', permission: 'route:edit' },
  { path: '/v2/users', name: 'V2Users', permission: 'system:user' },
  { path: '/v2/roles', name: 'V2Roles', permission: 'user:read' },
  { path: '/v2/settings', name: 'V2Settings', permission: 'system:read' }
]
/** 参数页：非侧栏叶子，绝不允许出现在 pages 组 */
const PARAM_PAGES: PageRow[] = [
  { path: '/v2/routes/:id/detail', name: 'V2RouteDetail', permission: 'route:read' },
  { path: '/v2/routes/tree/:id', name: 'V2DecisionTree', permission: 'route:read' },
  { path: '/v2/routes/canvas/:id', name: 'V2Canvas', permission: 'route:edit' },
  { path: '/v2/publish/:id', name: 'V2Publish', permission: 'route:edit' }
]
const stub = { template: '<div />' }

function makeRouter(): Router {
  const rows: RouteRecordRaw[] = [...SIDEBAR_PAGES, ...PARAM_PAGES].map((r) => ({
    path: r.path,
    name: r.name,
    component: stub,
    meta: { permission: r.permission }
  }))
  rows.push({ path: '/login', name: 'Login', component: stub })
  return createRouter({ history: createMemoryHistory(), routes: rows })
}

async function factory(opts: { open?: boolean; attach?: boolean; initialPath?: string } = {}) {
  const router = makeRouter()
  await router.push(opts.initialPath ?? '/v2/monitor')
  await router.isReady()
  const global = { plugins: [ElementPlus, makeI18n(), router], provide: { 'fc-theme': themeContext } }
  const props = { open: opts.open ?? false }
  const wrapper = (
    opts.attach ? mount(CommandPalette, { attachTo: document.body, props, global }) : mount(CommandPalette, { props, global })
  ) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

const tid = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="${id}"]`)
const openEvents = (w: VueWrapper<any>) => (w.emitted('update:open') ?? []).map((e) => e[0])
const options = (w: VueWrapper<any>) => w.findAll('[role="option"]')
const highlighted = (w: VueWrapper<any>) => options(w).find((o) => o.attributes('aria-selected') === 'true')
function pressKey(w: VueWrapper<any>, key: string, init: KeyboardEventInit = {}) {
  return w.find('[data-testid="cmd-input"]').trigger('keydown', { key, ...init })
}
function winKey(key: string, init: Pick<KeyboardEventInit, 'metaKey' | 'ctrlKey'> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))
}

// ═══════════ A. i18n 双语 key 存在（铁律 6；C 步补 zh-CN.ts / en-US.ts）═══════════
const CMD_KEYS = [
  'v2.cmd.placeholder',
  'v2.cmd.empty',
  'v2.cmd.loading',
  'v2.cmd.footer',
  'v2.cmd.group.pages',
  'v2.cmd.group.actions',
  'v2.cmd.group.routes',
  'v2.cmd.group.plugins',
  'v2.cmd.action.createRoute',
  'v2.cmd.action.importExport',
  'v2.cmd.action.themeToggle',
  'v2.cmd.action.logout'
]
describe('CommandPalette — i18n 双语 key 存在（契约铁律 6）', () => {
  it.each(CMD_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ═══════════ B. v-model:open 开关与静态渲染 ═══════════
describe('CommandPalette — v-model:open 开关与静态渲染', () => {
  it('open=false 时面板不渲染（cmd-root 不存在）', async () => {
    const { wrapper } = await factory({ open: false })
    expect(tid(wrapper, 'cmd-root').exists()).toBe(false)
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('open=true 渲染 cmd-root/cmd-mask/cmd-input；cmd-input 是原生 input 且 placeholder 走 i18n', async () => {
    const { wrapper } = await factory({ open: true })
    expect(tid(wrapper, 'cmd-root').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-mask').exists()).toBe(true)
    const input = tid(wrapper, 'cmd-input')
    expect(input.exists()).toBe(true)
    expect(input.element.tagName).toBe('INPUT')
    expect(input.attributes('placeholder')).toBe(t('v2.cmd.placeholder'))
    // 空 query 是浏览态，不是「无结果」态
    expect(tid(wrapper, 'cmd-empty').exists()).toBe(false)
  })

  it('空 query 浏览态：pages(12 项)+actions(4 项) 两组渲染，routes/plugins 组与 cmd-empty 不渲染', async () => {
    const { wrapper } = await factory({ open: true })
    expect(tid(wrapper, 'cmd-group-pages').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-group-actions').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-group-routes').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-group-plugins').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-empty').exists()).toBe(false)
    expect(options(wrapper).length).toBe(16)
  })

  it('打开即聚焦 cmd-input（autofocus 契约）', async () => {
    const { wrapper } = await factory({ open: true, attach: true })
    const input = tid(wrapper, 'cmd-input')
    expect(document.activeElement).toBe(input.element)
  })

  it('空 query 打开零 API 调用（异步搜索只在 query 非空时发生）', async () => {
    await factory({ open: true })
    expect(mocks.listRoutes).not.toHaveBeenCalled()
    expect(mocks.listPlugins).not.toHaveBeenCalled()
  })
})

// ═══════════ C. 关闭路径 ═══════════
describe('CommandPalette — 关闭路径（Esc / 遮罩 / 焦点归还）', () => {
  it('Esc（window 级）→ emit update:open false', async () => {
    const { wrapper } = await factory({ open: true })
    winKey('Escape')
    await flushPromises()
    expect(openEvents(wrapper)).toEqual([false])
  })

  it('点击 cmd-mask → emit update:open false；点击面板内部（listbox 区域）不关闭', async () => {
    const { wrapper } = await factory({ open: true })
    await wrapper.find('[role="listbox"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    await tid(wrapper, 'cmd-mask').trigger('click')
    await flushPromises()
    expect(openEvents(wrapper)).toEqual([false])
  })

  it('关闭后焦点还给打开前的触发元素（a11y 焦点归还契约）', async () => {
    const { wrapper } = await factory({ open: false, attach: true })
    const triggerBtn = document.createElement('button')
    document.body.appendChild(triggerBtn)
    try {
      triggerBtn.focus()
      expect(document.activeElement).toBe(triggerBtn)
      await wrapper.setProps({ open: true })
      await flushPromises()
      expect(document.activeElement, '打开后面板未接管焦点到 cmd-input').toBe(tid(wrapper, 'cmd-input').element)
      await wrapper.setProps({ open: false })
      await flushPromises()
      expect(document.activeElement, '关闭后焦点未归还触发元素').toBe(triggerBtn)
    } finally {
      triggerBtn.remove()
    }
  })
})

// ═══════════ D. 全局快捷键（⌘K / Ctrl+K，window 常驻监听）═══════════
describe('CommandPalette — ⌘K / Ctrl+K 全局开关', () => {
  it('⌘K 在 open=false 时 emit true（监听与 open 状态无关）；父组件回填 open=true 后再按 ⌘K emit false（toggle）', async () => {
    const { wrapper } = await factory({ open: false })
    winKey('k', { metaKey: true })
    await flushPromises()
    expect(openEvents(wrapper)).toEqual([true])
    await wrapper.setProps({ open: true })
    winKey('k', { metaKey: true })
    await flushPromises()
    expect(openEvents(wrapper)).toEqual([true, false])
  })

  it('Ctrl+K（Windows/Linux）同样生效', async () => {
    const { wrapper } = await factory({ open: false })
    winKey('k', { ctrlKey: true })
    await flushPromises()
    expect(openEvents(wrapper)).toEqual([true])
  })
})

// ═══════════ E. 键盘导航（↑↓ 循环 + Enter 执行）═══════════
describe('CommandPalette — 键盘导航与 Enter 执行', () => {
  it('打开后默认高亮首项（page-V2Overview）：aria-selected + is-active + aria-activedescendant', async () => {
    const { wrapper } = await factory({ open: true })
    const first = tid(wrapper, 'cmd-item-page-V2Overview')
    expect(first.exists()).toBe(true)
    expect(first.attributes('aria-selected')).toBe('true')
    expect(first.classes()).toContain('is-active')
    const listbox = wrapper.find('[role="listbox"]')
    expect(listbox.exists()).toBe(true)
    expect(listbox.attributes('aria-activedescendant')).toBe('cmd-item-page-V2Overview')
  })

  it('ArrowDown 移动到第二项（page-V2Routes）', async () => {
    const { wrapper } = await factory({ open: true })
    await pressKey(wrapper, 'ArrowDown')
    await flushPromises()
    expect(tid(wrapper, 'cmd-item-page-V2Routes').attributes('aria-selected')).toBe('true')
    expect(tid(wrapper, 'cmd-item-page-V2Overview').attributes('aria-selected')).not.toBe('true')
  })

  it('ArrowUp 从首项回退高亮（回到首项即不动后循环由回绕用例覆盖）', async () => {
    const { wrapper } = await factory({ open: true })
    await pressKey(wrapper, 'ArrowDown')
    await flushPromises()
    await pressKey(wrapper, 'ArrowUp')
    await flushPromises()
    expect(tid(wrapper, 'cmd-item-page-V2Overview').attributes('aria-selected')).toBe('true')
  })

  it('高亮循环（wrap）：首项 ↑→末项 cmd-action-logout；末项 ↓→回首项', async () => {
    const { wrapper } = await factory({ open: true })
    await pressKey(wrapper, 'ArrowUp')
    await flushPromises()
    expect(tid(wrapper, 'cmd-action-logout').attributes('aria-selected')).toBe('true')
    await pressKey(wrapper, 'ArrowDown')
    await flushPromises()
    expect(tid(wrapper, 'cmd-item-page-V2Overview').attributes('aria-selected')).toBe('true')
  })

  it('Enter 执行高亮项：跳转首项页面（/v2/overview）并 emit update:open false', async () => {
    const { wrapper, router } = await factory({ open: true, initialPath: '/v2/monitor' })
    await pressKey(wrapper, 'Enter')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/overview')
    expect(router.currentRoute.value.name).toBe('V2Overview')
    expect(openEvents(wrapper)).toEqual([false])
  })

  it('空结果态（cmd-empty，无任何 option）按 Enter 不执行、不关闭', async () => {
    vi.useFakeTimers()
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('zzzz')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(highlighted(wrapper), '空态不应有任何高亮项').toBeUndefined()
    await pressKey(wrapper, 'Enter')
    await flushPromises()
    expect(wrapper.emitted('update:open'), '空态 Enter 不应关闭面板').toBeUndefined()
  })
})

// ═══════════ F. 静态页组（侧栏 12 叶子直达 + 权限过滤 + query 过滤）═══════════
describe('CommandPalette — 静态页组（侧栏全部页面直达）', () => {
  it.each(SIDEBAR_PAGES.map((p) => p.name))('cmd-item-page-%s 渲染于 pages 组', async (name) => {
    const { wrapper } = await factory({ open: true })
    const item = tid(wrapper, `cmd-item-page-${name}`)
    expect(item.exists(), `pages 组缺少侧栏叶子 ${name}`).toBe(true)
    expect(item.attributes('role')).toBe('option')
  })

  it('参数页（detail/tree/canvas/publish）不是侧栏叶子，禁止出现在 pages 组', async () => {
    const { wrapper } = await factory({ open: true })
    for (const p of PARAM_PAGES) {
      expect(tid(wrapper, `cmd-item-page-${p.name}`).exists(), `${p.name} 是参数页，不应静态直达`).toBe(false)
    }
  })

  it('query 按标题/名称+path 过滤页组（不含权限码）：「monitor」只剩 V2Monitor 且高亮重置为它', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('monitor')
    await flushPromises()
    expect(tid(wrapper, 'cmd-item-page-V2Monitor').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-page-V2Overview').exists(), 'V2Overview 无 monitor 命中，不应出现').toBe(false)
    expect(highlighted(wrapper)?.attributes('id')).toBe('cmd-item-page-V2Monitor')
    // fixtures 无 monitor 命中 → 异步两组不出
    expect(tid(wrapper, 'cmd-group-routes').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-group-plugins').exists()).toBe(false)
  })

  it('权限过滤与侧栏 canAccess 同源：无 system:user 时 V2Users 隐藏、其余页面仍在', async () => {
    mocks.hasPermission.mockImplementation((code: string) => code !== 'system:user')
    const { wrapper } = await factory({ open: true })
    expect(tid(wrapper, 'cmd-item-page-V2Users').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-item-page-V2Overview').exists()).toBe(true)
    // 动作组不受权限过滤影响
    expect(tid(wrapper, 'cmd-action-logout').exists()).toBe(true)
  })
})

// ═══════════ G. 动作组（4 个快捷动作）═══════════
describe('CommandPalette — 快捷动作组', () => {
  it.each([
    ['create-route', 'v2.cmd.action.createRoute'],
    ['import-export', 'v2.cmd.action.importExport'],
    ['theme-toggle', 'v2.cmd.action.themeToggle'],
    ['logout', 'v2.cmd.action.logout']
  ])('cmd-action-%s 渲染且文案走 %s', async (key, i18nKey) => {
    const { wrapper } = await factory({ open: true })
    const item = tid(wrapper, `cmd-action-${key}`)
    expect(item.exists(), `动作 ${key} 未渲染`).toBe(true)
    expect(item.text()).toContain(String(dig(zhCN, i18nKey)))
  })

  it('执行 create-route → router 跳 /v2/routes/wizard 并关闭', async () => {
    const { wrapper, router } = await factory({ open: true })
    await tid(wrapper, 'cmd-action-create-route').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes/wizard')
    expect(openEvents(wrapper)).toEqual([false])
  })

  it('执行 import-export → router 跳 /v2/import-export', async () => {
    const { wrapper, router } = await factory({ open: true })
    await tid(wrapper, 'cmd-action-import-export').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/import-export')
  })

  it('执行 theme-toggle → inject(fc-theme).setTheme 翻转（light→dark）', async () => {
    themeContext.theme.value = 'light'
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-action-theme-toggle').trigger('click')
    await flushPromises()
    expect(mocks.setTheme).toHaveBeenCalledWith('dark')
  })

  it('执行 logout → auth store logout() + 跳 /login 并关闭', async () => {
    const { wrapper, router } = await factory({ open: true })
    await tid(wrapper, 'cmd-action-logout').trigger('click')
    await flushPromises()
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(openEvents(wrapper)).toEqual([false])
  })
})

// ═══════════ H. 异步搜索（debounce 200ms + 结果合并 + 加载态 + 空态）═══════════
describe('CommandPalette — 异步搜索路由/插件', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('trailing debounce 200ms：输入后 199ms 零调用，第 200ms 调 listRoutes() 与 listPlugins({page,keyword})', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('user')
    await flushPromises()
    vi.advanceTimersByTime(199)
    expect(mocks.listRoutes, '199ms 时不应已发请求').not.toHaveBeenCalled()
    expect(mocks.listPlugins, '199ms 时不应已发请求').not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.listRoutes).toHaveBeenCalledWith()
    expect(mocks.listPlugins).toHaveBeenCalledTimes(1)
    expect(mocks.listPlugins).toHaveBeenCalledWith(expect.objectContaining({ page: 1, keyword: 'user' }))
    expect((tid(wrapper, 'cmd-input').element as HTMLInputElement).value).toBe('user')
  })

  it('结果合并：routes 组只含命中项（user_service，不含 order_service），plugins 组只含命中项', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('user')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    const routesGroup = tid(wrapper, 'cmd-group-routes')
    expect(routesGroup.exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-route-r1').exists(), '路由命中项 user_service 应渲染').toBe(true)
    expect(tid(wrapper, 'cmd-item-route-r2').exists(), '未命中路由 order_service 不应渲染').toBe(false)
    const pluginsGroup = tid(wrapper, 'cmd-group-plugins')
    expect(pluginsGroup.exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-plugin-p1').exists(), '插件命中项 user_auth 应渲染').toBe(true)
    expect(tid(wrapper, 'cmd-item-plugin-p2').exists(), '未命中插件 rate_limit 不应渲染').toBe(false)
    // 分组顺序契约（P3-a 演进）：查询态 pages→routes→plugins→actions（动作组排尾，F 裁决）——
    // 原 actions<routes 断言与演进契约冲突，仅修订该单行（:547/:549 组序断言不受影响仍成立）
    const html = wrapper.html()
    const at = (id: string) => html.indexOf(`data-testid="${id}"`)
    expect(at('cmd-group-pages')).toBeGreaterThan(-1)
    expect(at('cmd-group-pages')).toBeLessThan(at('cmd-group-actions'))
    expect(at('cmd-group-plugins')).toBeLessThan(at('cmd-group-actions'))
    expect(at('cmd-group-routes')).toBeLessThan(at('cmd-group-plugins'))
  })

  it('命中片段高亮：cmd-item-route-r1 内出现 class=cmd-hit 的片段，文本为查询词', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('user')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    const item = tid(wrapper, 'cmd-item-route-r1')
    expect(item.exists()).toBe(true)
    const hit = item.find('.cmd-hit')
    expect(hit.exists(), '命中片段未包 class="cmd-hit" 高亮').toBe(true)
    expect(hit.text()).toContain('user')
  })

  it('加载态：debounce 到点后、请求未决期间 cmd-loading 可见，resolve 后退场并渲染结果', async () => {
    let resolvePlugins!: (v: unknown) => void
    mocks.listPlugins.mockImplementation(
      () => new Promise((resolve) => { resolvePlugins = resolve })
    )
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('user')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(tid(wrapper, 'cmd-loading').exists(), '请求未决时应显示 cmd-loading').toBe(true)
    expect(tid(wrapper, 'cmd-empty').exists()).toBe(false)
    resolvePlugins(pluginsPage('user'))
    await flushPromises()
    expect(tid(wrapper, 'cmd-loading').exists(), '请求完成后 loading 应退场').toBe(false)
    expect(tid(wrapper, 'cmd-item-plugin-p1').exists()).toBe(true)
  })

  it('空结果：查询「zzzz」→ cmd-empty 渲染，四组全部不渲染', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('zzzz')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(tid(wrapper, 'cmd-empty').exists(), '无任何命中时应显示空态').toBe(true)
    for (const g of ['pages', 'actions', 'routes', 'plugins']) {
      expect(tid(wrapper, `cmd-group-${g}`).exists(), `空态下 cmd-group-${g} 不应渲染`).toBe(false)
    }
  })

  it('清空 query 回到浏览态：pages/actions 组恢复，routes/plugins 组退场且 cmd-empty 不出现', async () => {
    const { wrapper } = await factory({ open: true })
    await tid(wrapper, 'cmd-input').setValue('user')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(tid(wrapper, 'cmd-group-routes').exists()).toBe(true)
    await tid(wrapper, 'cmd-input').setValue('')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(tid(wrapper, 'cmd-group-pages').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-group-actions').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-group-routes').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-group-plugins').exists()).toBe(false)
    expect(tid(wrapper, 'cmd-empty').exists()).toBe(false)
  })
})

// ═══════════ I. a11y 语义与源码契约 ═══════════
describe('CommandPalette — a11y 语义与源码契约', () => {
  it('cmd-root 为 role=dialog + aria-modal=true，且带非空 aria-label', async () => {
    const { wrapper } = await factory({ open: true })
    const root = tid(wrapper, 'cmd-root')
    expect(root.attributes('role')).toBe('dialog')
    expect(root.attributes('aria-modal')).toBe('true')
    expect(root.attributes('aria-label') ?? '').not.toBe('')
  })

  it('列表具备 listbox/option 语义：每个条目 role=option 且有稳定 id（供 aria-activedescendant）', async () => {
    const { wrapper } = await factory({ open: true })
    const listbox = wrapper.find('[role="listbox"]')
    expect(listbox.exists()).toBe(true)
    const opts = options(wrapper)
    expect(opts.length).toBe(16)
    for (const opt of opts) {
      expect(opt.attributes('id'), 'option 必须带 id').toBeTruthy()
    }
  })

  it('源码契约（fs）：组件落在 src/components-v2/command/CommandPalette.vue 且含 :focus-visible 焦点环', () => {
    const file = path.resolve(__dirname, '../CommandPalette.vue')
    expect(fs.existsSync(file), 'CommandPalette.vue 未落在 src/components-v2/command/ 下').toBe(true)
    const source = fs.readFileSync(file, 'utf-8')
    expect(source, '组件缺 :focus-visible 焦点环（Hallmark 门槛）').toContain(':focus-visible')
  })
})
