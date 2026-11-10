/**
 * S7-5 T 步（RED）：⌘K 面板 routes 搜索改走服务端 keyword 过滤（消 listRoutes() 全量拉
 * 带宽，P3 池遗留④）。纯增量：不改业务代码、不动 CommandPalette.test.ts（60 冻结用例）、
 * CommandPalette.polish.test.ts（P3-a RED 契约）与 LayoutV2.command-palette.test.ts。
 *
 * ══ 契约演进（⚠ 报备 F 裁决，与 P3-a④ 同款冲突单列）══
 * 冻结契约 CommandPalette.test.ts L527 `expect(mocks.listRoutes).toHaveBeenCalledWith()`
 * 钉死「搜索态零参调用 + 客户端过滤」——本票演进为「搜索态 listRoutes({ keyword: q })，
 * 服务端 route_name/path LIKE 过滤（后端平铺契约，见 gateway4j-admin
 * RouteServiceKeywordSearchTest），前端兜底过滤保留」。C 步落地后冻结文件该单行必红，
 * 须由 F 修订为 `toHaveBeenCalledWith(expect.objectContaining({ keyword: 'user' }))`
 * （其余断言——199ms 零调用、200ms 恰一次、plugins 组断言——不受影响）。
 *
 * ══ 本文件钉死的行为（C 步不得偏离）══
 * ① 搜索态 routes 请求携带 { keyword: q }（q 为 trim 后检索词）——RED：现零参调用；
 * ② 服务端过滤结果直显：routes 组只渲染服务端命中行（mock 复刻服务端平铺语义）；
 * ③ 前端兜底过滤保留：服务端漏网行（mock 故意多放行一行 name/path 均不命中的数据）
 *    仍被客户端 matches(`${route_name} ${path}`) 剔除——演进不回退「脏数据可见」；
 * ④ 组序既有契约不破坏：搜索态 pages→routes→plugins→actions（P3-a④ 演进序）+
 *    plugins 组服务端 keyword 语义照旧——既有契约由冻结文件与 polish 文件钉，此处
 *    轻量守卫防 C 步顺手改坏合并/组序逻辑；
 * ⑤ path 命中行直显（服务端搜索域含 path 的前端对位：name 不含检索词、path 命中的行）。
 *
 * 浏览态（空 query）零调用契约由冻结文件 L300 钉，本文件不重复。
 *
 * ══ RED 机制 ══
 * 用例① 行为缺失型：`toHaveBeenCalledWith(objectContaining({ keyword }))` 对现零参调用
 * 失败；用例②③⑤ 的 mock 复刻「服务端按 keyword 过滤后的平铺结果」——现实现零参调用
 * → mock 走「未携带 keyword = 未过滤」回退分支返回全量 → 兜底过滤结果恰好一致
 * （②⑤ 侥幸同显、③ 的漏网行今日恰好被客户端过滤兜住）→ ②③⑤ 今日偏绿、属守卫钉；
 * 真正 RED 信号在①。C 步落地 keyword 透传后①转绿、③的漏网行仍被剔除（双保险成立）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

// 与冻结文件同款：非常量动态导入（组件必已存在，此处沿用先例仅为对齐 harness）
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

// —— 夹具：含 DISPATCH 父 + 子路由 + path 命中行 + 漏网行（复刻服务端平铺契约）——
function makeRoute(id: string, routeName: string, routePath: string, children: unknown[] = []) {
  return {
    id,
    route_name: routeName,
    route_type: children.length ? 'DISPATCH' : 'BACKEND',
    path: routePath,
    upstream_url: 'http://10.0.0.11:9001',
    status: 'PUBLISHED',
    sort_order: 0,
    config_version: '1',
    created_at: 0,
    updated_at: 0,
    plugins: [],
    children
  }
}
/** 服务端全量集（仅 mock 内部用于「未携带 keyword」回退分支） */
const ROUTES_FULL = [
  makeRoute('r1', 'user_service', '/api/user/**'),
  makeRoute('r2', 'order_service', '/api/order/**'),
  makeRoute('r3', 'pay_service', '/api/pay/**'),
  makeRoute('r4', 'audit_worker', '/jobs/audit') // path 命中行（name 不含 audit 外的检索词用例用）
]
/**
 * 服务端语义复刻（C 步落地后的平铺契约）：携带 keyword → 按 name/path contains 过滤、
 * 平铺返回（children=[]）；未携带（今日行为）→ 全量树原样返回。
 * 漏网行 LeakRow：服务端 LIKE 命中但前端检索词已变化时的时序脏数据——故意放行一行，
 * 钉「前端兜底过滤保留」。
 */
const LEAK_ROW = makeRoute('r9', 'legacy-route', '/legacy/none')
function serverRoutes(params?: { keyword?: string }) {
  const kw = params?.keyword
  if (!kw) return ROUTES_FULL
  const hits = ROUTES_FULL.filter((r) => `${r.route_name} ${r.path ?? ''}`.includes(kw))
  return [...hits.map((r) => ({ ...r, children: [] })), { ...LEAK_ROW, children: [] }]
}

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
  mocks.listRoutes.mockImplementation((params?: { keyword?: string }) => Promise.resolve(serverRoutes(params)))
  mocks.listPlugins.mockImplementation((params?: { keyword?: string }) => Promise.resolve(pluginsPage(params?.keyword)))
  mocks.hasPermission.mockImplementation(() => true)
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  wrappers.length = 0
  mocks.listRoutes.mockReset()
  mocks.listPlugins.mockReset()
  mocks.setTheme.mockReset()
  mocks.setBrand.mockReset()
  mocks.hasPermission.mockReset()
  mocks.hasPermission.mockImplementation(() => true)
  vi.useRealTimers()
})

const wrappers: VueWrapper<any>[] = []

const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
function makeI18n(): I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false> {
  return createI18n(i18nBase)
}

const themeContext = {
  brand: ref('ldx2'),
  theme: ref<'light' | 'dark'>('light'),
  setBrand: mocks.setBrand,
  setTheme: mocks.setTheme
}

interface PageRow {
  path: string
  name: string
  permission: string
}
const SIDEBAR_PAGES: PageRow[] = [
  { path: '/v2/overview', name: 'V2Overview', permission: 'monitor:read' },
  { path: '/v2/routes', name: 'V2Routes', permission: 'route:read' }
]
const stub = { template: '<div />' }

function makeRouter(): Router {
  const rows: RouteRecordRaw[] = SIDEBAR_PAGES.map((r) => ({
    path: r.path,
    name: r.name,
    component: stub,
    meta: { permission: r.permission }
  }))
  rows.push({ path: '/v2/routes/:id/detail', name: 'V2RouteDetail', component: stub })
  return createRouter({ history: createMemoryHistory(), routes: rows })
}

async function factory(opts: { open?: boolean } = {}) {
  const router = makeRouter()
  await router.push('/v2/overview')
  await router.isReady()
  const global = { plugins: [ElementPlus, makeI18n(), router], provide: { 'fc-theme': themeContext } }
  const wrapper = mount(CommandPalette, { props: { open: opts.open ?? false }, global }) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

const tid = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="${id}"]`)

describe('CommandPalette — routes 搜索服务端 keyword（S7-5 契约演进）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  /** 等价驱动：输入 → debounce 200ms 到点（flush:'sync'）→ 请求已发出 → 结果回填 */
  async function search(wrapper: VueWrapper<any>, q: string) {
    await tid(wrapper, 'cmd-input').setValue(q)
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
  }

  it('① 搜索态 listRoutes 携带 { keyword }（trim 后检索词；现零参调用，RED）', async () => {
    const { wrapper } = await factory({ open: true })
    await search(wrapper, 'user')
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.listRoutes).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'user' }))
  })

  it('② 服务端命中行直显：routes 组只渲染 keyword 命中行（平铺行 children=[] 照常渲染）', async () => {
    const { wrapper } = await factory({ open: true })
    await search(wrapper, 'pay')
    const routesGroup = tid(wrapper, 'cmd-group-routes')
    expect(routesGroup.exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-route-r3').exists(), '服务端命中行 pay_service 应渲染').toBe(true)
    expect(tid(wrapper, 'cmd-item-route-r1').exists(), '服务端未命中行 user_service 不应渲染').toBe(false)
    expect(tid(wrapper, 'cmd-item-route-r2').exists()).toBe(false)
  })

  it('③ 前端兜底过滤保留：服务端漏网行（LEAK_ROW）仍被客户端 matches 剔除', async () => {
    const { wrapper } = await factory({ open: true })
    await search(wrapper, 'pay')
    expect(tid(wrapper, 'cmd-item-route-r9').exists(), '漏网行不得透传到面板').toBe(false)
  })

  it('⑤ path 命中行直显（服务端搜索域含 path：name 不含、path 命中）', async () => {
    const { wrapper } = await factory({ open: true })
    await search(wrapper, '/jobs/audit')
    expect(tid(wrapper, 'cmd-item-route-r4').exists(), 'path 命中行 audit_worker 应渲染').toBe(true)
  })

  it('④ 组序/合并既有契约不破坏：搜索态 pages→routes→plugins→actions，plugins 组服务端 keyword 照旧', async () => {
    const { wrapper } = await factory({ open: true })
    await search(wrapper, 'user')
    const html = wrapper.html()
    const at = (id: string) => html.indexOf(`data-testid="${id}"`)
    // P3-a④ 演进序（冻结文件 G 段已钉，此处轻量守卫防 C 步改 keyword 透传时顺手改坏）
    expect(at('cmd-group-pages')).toBeGreaterThan(-1)
    expect(at('cmd-group-pages')).toBeLessThan(at('cmd-group-routes'))
    expect(at('cmd-group-routes')).toBeLessThan(at('cmd-group-plugins'))
    expect(at('cmd-group-plugins')).toBeLessThan(at('cmd-group-actions'))
    // routes 组命中项（user_service）+ plugins 组命中项（user_auth）照旧合并渲染
    expect(tid(wrapper, 'cmd-item-route-r1').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-plugin-p1').exists()).toBe(true)
    expect(tid(wrapper, 'cmd-item-plugin-p2').exists()).toBe(false)
    // keyword 参数不挤占 plugins 组语义：listPlugins 仍收 { page, keyword }
    expect(mocks.listPlugins).toHaveBeenCalledWith(expect.objectContaining({ page: 1, keyword: 'user' }))
  })
})
