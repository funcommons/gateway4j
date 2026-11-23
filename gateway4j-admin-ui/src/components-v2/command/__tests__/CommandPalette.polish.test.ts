/**
 * P3-a：⌘K 命令面板打磨五项（P3 池 a 组 —— docs/ui-v2/实施契约.md P3 池前五项）。
 * 本文件是 C 步实现前的 RED 契约（行为缺失型），纯增量：不改业务代码、不动
 * CommandPalette.test.ts 的 60 个冻结用例与 LayoutV2.command-palette.test.ts 的 6 个冻结用例
 * （C 步落地后全仓必须 60+6+本文件 全绿）。
 *
 * ══ P3-a 五项契约（固化，C 步不得偏离）══
 *
 * ① 焦点陷阱（面板焦点不逸出）：
 * - cmd-root role=dialog aria-modal=true 打开期间，Tab / Shift+Tab 的焦点必须落在
 *   cmd-root 内部（首尾环绕；面板内可聚焦元素集合以实现为准，现行设计仅 cmd-input，
 *   环绕=自环）。测试以「可取消 keydown + 未 preventDefault 时模拟浏览器默认环游」
 *   驱动（jsdom 无原生焦点环游），对 SDK（useFocusTrap）与自实现循环哨兵两路实现等价。
 * - 关闭后陷阱必须解除（面板外 Tab 恢复默认环游），且「焦点归还触发元素」既有行为不变
 *   （冻结契约 C3 —— 本文件守卫防过度实现）。
 *
 * ② execute() 异常兜底（【判词固化：执行失败不关面板，用户可重试】）：
 * - 条目 run() reject（如路由守卫抛错）→ 面板不得关闭（不 emit update:open=false），
 *   错误不得静默吞：ElMessage.error(t('v2.cmd.execError')) 用户可见兜底，恰好一次。
 *   click 与 Enter（键盘）两路执行同一出口语义。
 * - 失败后面板保持可用：解除故障后同一高亮项再次 Enter → 正常执行并关闭（重试闭环）。
 * - 实现口径：execute 必须 catch（不得 try/finally 裸吞后再抛出——抛出会以 unhandled
 *   rejection 逃逸，测试进程级失败）。
 *
 * ③ aria-controls：
 * - cmd-root 带稳定 DOM id="cmd-palette"（非 testid，供触发器 aria-controls 指向）。
 * - LayoutV2 顶栏触发器（v2-topbar-search）加 aria-controls="cmd-palette"；
 *   aria-expanded 既有语义联动不变（开 true / 关 false）。
 *
 * ④ query 态动作组排尾：
 * - query 非空且有任一异步命中时，组序（DOM 渲染序 = flatOptions 键盘序，二者必须一致）
 *   pages → routes → plugins → actions：动作组排尾，首项 = 首个 pages 命中，无页命中时
 *   = 首个路由命中，动作永不居首（修 OPT-2 V 发现的「Enter 落向导」怪相）。
 * - 红线（既有契约不破坏）：动作组在任一组有命中时仍渲染（H2 语义）；空 query 浏览态
 *   组序 pages → actions、首项 V2Overview 不变（H5/浏览态）。
 * - ⚠ 冲突点单列给 F 裁决：冻结契约 CommandPalette.test.ts describe「异步搜索路由/插件」
 *   用例「结果合并」中的 DOM 组序断言 `at('cmd-group-actions') <
 *   at('cmd-group-routes')`（该文件 G/H 段）与「动作组排尾」相悖——C 步落地排尾后该单条
 *   断言必红，须由 F 修订该行（其余三条组序断言仍成立）；本文件不动彼文件。
 *
 * ⑤ 搜索失败可见错误态：
 * - listRoutes / listPlugins 任一 reject → 面板内出现可感知错误态：
 *   data-testid="cmd-error" + role="alert"，文案 t('v2.cmd.searchError')（双语）；
 *   全空结果时错误态优先于 cmd-empty（二者不同时渲染）；部分成功一侧的结果保留不吞。
 * - 重试语义 = 下次输入自然重查：错误后新 query 触发重新请求，成功则错误态退场、
 *   结果正常渲染；清空 query 回浏览态并清场错误态。
 *
 * ══ 新增 i18n key 全表（2 个，v2 命名空间，zh-CN/en-US 严格同步）══
 * - v2.cmd.searchError —— 搜索失败面板内错误文案（zh「搜索失败，请重试」）
 * - v2.cmd.execError  —— 条目执行失败 toast 文案（zh「执行失败，请重试」；
 *   C 步以 ElMessage.error(t('v2.cmd.execError')) 字符串实参调用）
 *   ⚠ 事故备注：这两个 key 与 LayoutV2 顶栏触发器 aria-controls="cmd-palette" 已被并行
 *   P3-b 提交（cd2c6a2）连同其 working tree 一并扫入 HEAD —— 但 cmd-palette 这个 DOM id
 *   在 HEAD 的 CommandPalette.vue 上并不存在（悬空 ARIA 引用）。C 步落地 cmd-root
 *   id="cmd-palette" 后该引用才闭合；执行/搜索错误消费点（ElMessage.error / cmd-error）
 *   仍完全缺失（本文件 ②⑤ 组 RED 为证）。
 *
 * ══ 新增 testid 全表（1 个，沿用 cmd- 前缀）══
 * - cmd-error —— 搜索失败错误态容器（role="alert"）
 *
 * ══ 新增 DOM id（1 个，非 testid）══
 * - cmd-palette —— cmd-root 的 DOM id（LayoutV2 触发器 aria-controls 指向目标）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import CommandPalette from '@/components-v2/command/CommandPalette.vue'
import LayoutV2 from '@/layouts/LayoutV2.vue'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  listPlugins: vi.fn(),
  logout: vi.fn()
}))

vi.mock('@/api/routes', () => ({ listRoutes: mocks.listRoutes }))
vi.mock('@/api/plugins', () => ({ listPlugins: mocks.listPlugins }))
// 全权限种子：同时供 LayoutV2 侧栏 canAccess 与面板 canAccessPage（真 usePermission 读 store）
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: [
      'monitor:read',
      'route:read',
      'route:edit',
      'plugin:read',
      'plugin:edit',
      'user:read',
      'system:read',
      'system:user'
    ].map((c) => ({ permission_code: c })),
    isLogin: true,
    logout: mocks.logout
  })
}))

// —— 夹具：路由树与插件分页（与冻结契约文件同形）——
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

// —— i18n：真双语 message，显式 I18n<> 类型（冻结契约文件先例）——
const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
function makeI18n(): I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false> {
  return createI18n(i18nBase)
}

/** 按点路径取 locale 值；undefined = key 缺失（冻结契约文件先例） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

// —— 路由表桩：侧栏 12 叶子 + 4 个参数页 + /login（与冻结契约文件同形）——
interface PageRow {
  path: string
  name: string
  permission: string
}
const SIDEBAR_PAGES: PageRow[] = [
  { path: '/v2/overview', name: 'V2Overview', permission: 'monitor:read' },
  { path: '/v2/routes', name: 'V2Routes', permission: 'route:read' },
  { path: '/v2/routes/new', name: 'V2RouteScg', permission: 'route:edit' },
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
const stub = { template: '<div />' }

function makeRouter(): Router {
  const rows: RouteRecordRaw[] = SIDEBAR_PAGES.map((r) => ({
    path: r.path,
    name: r.name,
    component: stub,
    meta: { permission: r.permission }
  }))
  rows.push({ path: '/login', name: 'Login', component: stub })
  return createRouter({ history: createMemoryHistory(), routes: rows })
}

const wrappers: VueWrapper<any>[] = []

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

/** LayoutV2 整体接线（aria-controls 契约跨 LayoutV2.vue 与 CommandPalette.vue 两个文件） */
async function mountLayout(): Promise<{ wrapper: VueWrapper<any> }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/overview', name: 'V2Overview', component: stub, meta: { permission: 'monitor:read' } },
      { path: '/v2/routes', name: 'V2Routes', component: stub, meta: { permission: 'route:read' } },
      { path: '/login', name: 'Login', component: stub }
    ]
  })
  await router.push('/v2/overview')
  await router.isReady()
  const wrapper = mount(LayoutV2, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, makeI18n(), router] }
  }) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper }
}

// —— 主题上下文 mock（inject('fc-theme')，冻结契约文件同形）——
const themeContext = {
  brand: ref('ldx2'),
  theme: ref<'light' | 'dark'>('light'),
  setTheme: vi.fn(),
  setBrand: vi.fn()
}

const tid = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="${id}"]`)
const openEvents = (w: VueWrapper<any>) => (w.emitted('update:open') ?? []).map((e) => e[0])
const options = (w: VueWrapper<any>) => w.findAll('[role="option"]')
/** 渲染出的组序（DOM 顺序）——契约：DOM 组序 = flatOptions 键盘序，二者一致 */
const groupOrder = (w: VueWrapper<any>) => w.findAll('[data-testid^="cmd-group-"]').map((g) => g.attributes('data-testid'))
/** 扁平条目序（DOM 顺序即键盘序；条目 data-testid = option id） */
const optionIds = (w: VueWrapper<any>) => options(w).map((o) => o.attributes('data-testid'))
function pressKey(w: VueWrapper<any>, key: string, init: KeyboardEventInit = {}) {
  return w.find('[data-testid="cmd-input"]').trigger('keydown', { key, ...init })
}
/** 输入并越过 200ms trailing debounce（冻结契约 describe H 同款节奏） */
async function typeQuery(w: VueWrapper<any>, text: string) {
  await tid(w, 'cmd-input').setValue(text)
  await flushPromises()
  vi.advanceTimersByTime(200)
  await flushPromises()
}

// —— 焦点陷阱驱动：派发可取消 Tab；无人 preventDefault 时模拟浏览器默认环游 ——
// （jsdom 无原生焦点环游，默认行为须人工模拟；陷阱生效 = preventDefault + 面板内自处理）
function tabFrom(el: Element, opts: { shift?: boolean; fallbackTarget?: HTMLElement } = {}) {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: opts.shift ?? false, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  if (!ev.defaultPrevented) opts.fallbackTarget?.focus()
  return ev
}

function cleanEnv() {
  try {
    localStorage.removeItem('fc-theme-provider')
    localStorage.removeItem('gw4j_lang')
  } catch {
    /* 非浏览器环境静默 */
  }
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-brand')
  document.documentElement.removeAttribute('data-theme')
}

/** 背景可聚焦元素（焦点逸出的「受害元素」），afterEach 统一移除 */
const planted: HTMLElement[] = []
function plantButton(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  document.body.appendChild(b)
  planted.push(b)
  return b
}

beforeEach(() => {
  setActivePinia(createPinia())
  cleanEnv()
  mocks.listRoutes.mockImplementation(() => Promise.resolve(ROUTES))
  mocks.listPlugins.mockImplementation((params?: { keyword?: string }) => Promise.resolve(pluginsPage(params?.keyword)))
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  wrappers.length = 0
  for (const n of planted) n.remove()
  planted.length = 0
  mocks.listRoutes.mockReset()
  mocks.listPlugins.mockReset()
  mocks.logout.mockReset()
  themeContext.setTheme.mockReset()
  themeContext.setBrand.mockReset()
  vi.useRealTimers()
  cleanEnv()
})

// ═══════════ A. 新增 i18n key 双语存在（铁律 6；C 步补 zh-CN.ts / en-US.ts）═══════════
const P3A_NEW_KEYS = ['v2.cmd.searchError', 'v2.cmd.execError']
describe('P3-a — 新增 i18n key 双语存在（契约铁律 6）', () => {
  it.each(P3A_NEW_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ═══════════ B. 焦点陷阱（面板打开期间 Tab/Shift+Tab 不逸出；关闭解除 + 归还不变）═══════════
describe('P3-a① — 焦点陷阱（Tab 循环面板内，不逸出背景页面）', () => {
  it('Tab：焦点必须留在 cmd-root 内（背景元素不可达）', async () => {
    const bgNext = plantButton('bg-next')
    const { wrapper } = await factory({ open: true, attach: true })
    const root = tid(wrapper, 'cmd-root').element as HTMLElement
    const input = tid(wrapper, 'cmd-input').element as HTMLElement
    expect(document.activeElement, '前置：打开后焦点在 cmd-input').toBe(input)
    tabFrom(input, { fallbackTarget: bgNext })
    expect(
      root.contains(document.activeElement),
      'Tab 后焦点逸出到面板外——缺焦点陷阱（P3-a①）',
    ).toBe(true)
    expect(document.activeElement, 'Tab 后焦点不得落在背景元素').not.toBe(bgNext)
  })

  it('Shift+Tab：反向同样不逸出面板', async () => {
    const bgPrev = plantButton('bg-prev')
    const { wrapper } = await factory({ open: true, attach: true })
    const root = tid(wrapper, 'cmd-root').element as HTMLElement
    const input = tid(wrapper, 'cmd-input').element as HTMLElement
    tabFrom(input, { shift: true, fallbackTarget: bgPrev })
    expect(
      root.contains(document.activeElement),
      'Shift+Tab 后焦点逸出到面板外——缺焦点陷阱（P3-a①）',
    ).toBe(true)
    expect(document.activeElement, 'Shift+Tab 后焦点不得落在背景元素').not.toBe(bgPrev)
  })

  it('关闭后陷阱解除（面板外 Tab 恢复默认环游）且焦点归还触发元素不变（防过度实现守卫）', async () => {
    const bgTrigger = plantButton('bg-trigger')
    const bgTail = plantButton('bg-tail')
    const { wrapper } = await factory({ open: false, attach: true })
    bgTrigger.focus()
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(document.activeElement, '打开后焦点接管到 cmd-input（既有契约）').toBe(tid(wrapper, 'cmd-input').element)
    await wrapper.setProps({ open: false })
    await flushPromises()
    expect(document.activeElement, '关闭后焦点归还触发元素（既有契约 C3 不得回退）').toBe(bgTrigger)
    tabFrom(bgTrigger, { fallbackTarget: bgTail })
    expect(
      document.activeElement,
      '关闭后 Tab 仍被拦下（陷阱未解除）或未恢复默认环游',
    ).toBe(bgTail)
  })
})

// ═══════════ C. execute() 异常兜底（run() reject → 不关面板 + toast 兜底 + 可重试）═══════════
describe('P3-a② — execute() 异常兜底（判词：执行失败不关面板，用户可重试）', () => {
  let restoreToast: () => void = () => {}
  beforeEach(() => {
    const spy = vi.spyOn(ElMessage, 'error').mockImplementation((() => ({})) as any)
    restoreToast = () => spy.mockRestore()
  })
  afterEach(() => {
    restoreToast()
  })

  /** 导航守卫抛错 = 真实「守卫炸了」场景：router.push reject → 条目 run() reject */
  function armBrokenGuard(router: Router) {
    return router.beforeEach(() => {
      throw new Error('nav guard exploded')
    })
  }

  it('click 执行失败（守卫抛错）→ 面板不关 + ElMessage.error(v2.cmd.execError) 恰一次（不静默吞）', async () => {
    const { wrapper, router } = await factory({ open: true })
    const disarm = armBrokenGuard(router)
    try {
      await tid(wrapper, 'cmd-item-page-V2Overview').trigger('click')
      await flushPromises()
      expect(tid(wrapper, 'cmd-root').exists(), '执行失败面板不得关闭（用户可重试）').toBe(true)
      expect(openEvents(wrapper), '执行失败不得 emit update:open=false').toEqual([])
      expect(vi.mocked(ElMessage.error), '异常必须 toast.error 兜底（不得静默吞）').toHaveBeenCalledTimes(1)
      expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(String(dig(zhCN, 'v2.cmd.execError')))
    } finally {
      disarm()
    }
  })

  it('Enter 键盘执行失败 → 同一兜底语义（面板不关 + toast）', async () => {
    const { wrapper, router } = await factory({ open: true })
    const disarm = armBrokenGuard(router)
    try {
      await pressKey(wrapper, 'Enter')
      await flushPromises()
      expect(tid(wrapper, 'cmd-root').exists(), '键盘执行失败面板同样不得关闭').toBe(true)
      expect(openEvents(wrapper), '键盘执行失败不得 emit update:open=false').toEqual([])
      expect(vi.mocked(ElMessage.error), '键盘路径异常同样必须 toast 兜底').toHaveBeenCalledTimes(1)
    } finally {
      disarm()
    }
  })

  it('失败后可重试：解除故障再次 Enter 同一高亮项 → 正常执行并关闭', async () => {
    const { wrapper, router } = await factory({ open: true })
    const disarm = armBrokenGuard(router)
    await tid(wrapper, 'cmd-item-page-V2Overview').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'cmd-root').exists(), '前置：失败后面板保持打开').toBe(true)
    disarm()
    await pressKey(wrapper, 'Enter')
    await flushPromises()
    expect(router.currentRoute.value.path, '重试应成功跳转首项页面').toBe('/v2/overview')
    expect(openEvents(wrapper), '重试成功后关闭面板').toEqual([false])
  })
})

// ═══════════ D. aria-controls（面板稳定 DOM id + 触发器指向 + aria-expanded 联动）═══════════
describe('P3-a③ — aria-controls（触发器指向面板 DOM id=cmd-palette）', () => {
  it('面板根节点带稳定 DOM id="cmd-palette"（aria-controls 指向目标，fs 双保险）', async () => {
    const { wrapper } = await factory({ open: true })
    expect(tid(wrapper, 'cmd-root').attributes('id'), 'cmd-root 缺稳定 DOM id=cmd-palette').toBe('cmd-palette')
    const source = fs.readFileSync(path.resolve(__dirname, '../CommandPalette.vue'), 'utf-8')
    expect(source, 'CommandPalette.vue 源码缺 id="cmd-palette" 绑定').toContain('cmd-palette')
  })

  it('LayoutV2 触发器 aria-controls="cmd-palette"；aria-expanded 既有联动不变（关 false / 开 true / 关回 false）', async () => {
    const { wrapper } = await mountLayout()
    const trigger = wrapper.find('[data-testid="v2-topbar-search"]')
    expect(trigger.exists(), '顶栏缺命令面板触发器').toBe(true)
    expect(trigger.attributes('aria-controls'), '触发器缺 aria-controls 指向面板 id').toBe('cmd-palette')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await flushPromises()
    const root = document.querySelector('[data-testid="cmd-root"]')
    expect(root, '点击触发器未打开面板').not.toBeNull()
    expect(root!.id, '打开后面板 DOM id 必须与触发器 aria-controls 一致').toBe('cmd-palette')
    expect(trigger.attributes('aria-expanded'), '打开后 aria-expanded 必须为 true（既有联动）').toBe('true')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(trigger.attributes('aria-expanded'), '关闭后 aria-expanded 回落 false（既有联动）').toBe('false')
  })
})

// ═══════════ E. query 态动作组排尾（DOM 组序 = flatOptions 键盘序，动作永不居首）═══════════
describe('P3-a④ — query 态动作组排尾（首项=首个页/路由命中，修「Enter 落向导」）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("query='user' 四组齐渲染（红线 H2：动作组仍在），组序 pages→routes→plugins→actions 排尾", async () => {
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'user')
    expect(tid(wrapper, 'cmd-action-create-route').exists(), '红线 H2：命中态动作组必须仍渲染').toBe(true)
    expect(groupOrder(wrapper), '动作组必须排尾（⚠ 冻结契约「结果合并」的 actions<routes 断言行须 F 裁决修订）').toEqual([
      'cmd-group-pages',
      'cmd-group-routes',
      'cmd-group-plugins',
      'cmd-group-actions'
    ])
    expect(optionIds(wrapper), 'DOM 条目序必须与键盘序一致：页→路由→插件→动作').toEqual([
      'cmd-item-page-V2Users',
      'cmd-item-route-r1',
      'cmd-item-plugin-p1',
      'cmd-action-create-route',
      'cmd-action-import-export',
      'cmd-action-theme-toggle',
      'cmd-action-logout'
    ])
  })

  it("query='user' 首项=首个 pages 命中（V2Users），Enter 落 /v2/users 而非「新建路由」向导", async () => {
    const { wrapper, router } = await factory({ open: true })
    await typeQuery(wrapper, 'user')
    expect(optionIds(wrapper)[0], 'query 态首项必须是首个 pages 命中').toBe('cmd-item-page-V2Users')
    await pressKey(wrapper, 'Enter')
    await flushPromises()
    expect(router.currentRoute.value.path, 'Enter 必须落首个命中页，不得落新建路由向导').toBe('/v2/users')
    expect(openEvents(wrapper), '执行后关闭面板（既有契约）').toEqual([false])
  })

  it("query='order'（无 pages 命中）首项=首个路由命中 route-r2，动作永不居首", async () => {
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'order')
    expect(groupOrder(wrapper), '无页命中时组序 routes→actions').toEqual(['cmd-group-routes', 'cmd-group-actions'])
    expect(optionIds(wrapper)[0], '无页命中时首项=首个路由命中（现状首项是 create-route 动作 = Enter 落向导怪相）').toBe(
      'cmd-item-route-r2',
    )
  })

  it('红线：空 query 浏览态顺序不变——12 页 + 4 动作，组序 pages→actions、首项 V2Overview', async () => {
    const { wrapper } = await factory({ open: true })
    expect(groupOrder(wrapper), '浏览态组序不得变化').toEqual(['cmd-group-pages', 'cmd-group-actions'])
    const ids = optionIds(wrapper)
    expect(ids.length).toBe(16)
    expect(ids[0], '浏览态首项=V2Overview（不得被排尾改动波及）').toBe('cmd-item-page-V2Overview')
    expect(ids[12], '浏览态第 13 项起为动作组').toBe('cmd-action-create-route')
    expect(ids[15]).toBe('cmd-action-logout')
  })

  it("红线 H2：query='monitor' 仅页命中（异步零命中）时动作组仍渲染且居于页组之后", async () => {
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'monitor')
    expect(groupOrder(wrapper), '仅页命中时动作组仍渲染且排在其后').toEqual(['cmd-group-pages', 'cmd-group-actions'])
    expect(optionIds(wrapper)[0]).toBe('cmd-item-page-V2Monitor')
    expect(optionIds(wrapper).length, '页命中 1 + 动作 4').toBe(5)
  })
})

// ═══════════ F. 搜索失败可见错误态（cmd-error + role=alert + 下次输入自然重查）═══════════
describe('P3-a⑤ — 搜索失败可见错误态（非完全静默）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('listRoutes reject（listPlugins 正常）→ cmd-error 可见 + 成功一侧插件结果保留不吞', async () => {
    mocks.listRoutes.mockRejectedValueOnce(new Error('network down'))
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'user')
    const err = tid(wrapper, 'cmd-error')
    expect(err.exists(), '搜索失败必须出现可感知错误态 cmd-error（现状完全静默）').toBe(true)
    expect(err.text(), '错误文案走 i18n v2.cmd.searchError').toContain(String(dig(zhCN, 'v2.cmd.searchError')))
    expect(tid(wrapper, 'cmd-item-plugin-p1').exists(), '成功一侧的插件结果不得被失败侧吞掉').toBe(true)
  })

  it('两侧全 reject → cmd-error 带 role=alert 且优先于 cmd-empty（二者不同时渲染）', async () => {
    mocks.listRoutes.mockRejectedValueOnce(new Error('network down'))
    mocks.listPlugins.mockRejectedValueOnce(new Error('network down'))
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'zzzz')
    const err = tid(wrapper, 'cmd-error')
    expect(err.exists()).toBe(true)
    expect(err.attributes('role'), '错误态必须 role=alert（读屏可感知）').toBe('alert')
    expect(err.text()).toContain(String(dig(zhCN, 'v2.cmd.searchError')))
    expect(tid(wrapper, 'cmd-empty').exists(), '错误态不得同时渲染空态（错误优先）').toBe(false)
  })

  it('重试语义=下次输入自然重查：恢复后新 query → 错误态退场、结果正常渲染', async () => {
    mocks.listRoutes.mockRejectedValueOnce(new Error('network down'))
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'user')
    expect(tid(wrapper, 'cmd-error').exists(), '前置：首查失败出现错误态').toBe(true)
    await typeQuery(wrapper, 'order')
    expect(mocks.listRoutes, '新输入必须自然重查（2 次）').toHaveBeenCalledTimes(2)
    expect(tid(wrapper, 'cmd-error').exists(), '重查成功后错误态必须退场').toBe(false)
    expect(tid(wrapper, 'cmd-item-route-r2').exists(), '重查结果正常渲染').toBe(true)
  })

  it('清空 query 回浏览态：错误态清场、pages/actions 恢复', async () => {
    mocks.listRoutes.mockRejectedValueOnce(new Error('network down'))
    const { wrapper } = await factory({ open: true })
    await typeQuery(wrapper, 'user')
    expect(tid(wrapper, 'cmd-error').exists(), '前置：错误态在显').toBe(true)
    await tid(wrapper, 'cmd-input').setValue('')
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(tid(wrapper, 'cmd-error').exists(), '清空 query 后错误态必须清场').toBe(false)
    expect(tid(wrapper, 'cmd-group-pages').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-action-logout').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-empty').exists()).toBe(false)
  })
})
