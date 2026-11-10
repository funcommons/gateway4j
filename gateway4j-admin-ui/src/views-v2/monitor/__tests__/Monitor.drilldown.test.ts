/**
 * OPT-1 T（写测试，先红为预期）：大盘行点击下钻 —— monitor 慢路由 Top5 行 → 路由详情页。
 * 依据 docs/ui-v2/gateway4j-v2优化.md 建议第 3 条（对标 Gravitee 360° 下钻：「看大盘发现异常
 * → 一跳定位」）；P4e 02-08 裁决「大盘下钻入口归 03 路由组」的已记录缺口闭环。
 * 本文件只落用例：零业务代码改动、不动既有 Monitor.test.ts 用例；C 步接线后转绿。
 *
 * ── 页面现状侦察（C 步实现要点）────────────────────────────────────────────
 * - 行数据结构：Monitor.vue slowRows → SlowRow { id, name, path, val, barPct, cls }，
 *   其中 id = RouteTrafficSummaryItem.route_id（就是路由主键，不是 routeName）→ 跳转参数
 *   直接用 r.id，不存在「行只有名称无 id」的缺口。
 * - 行级 testid 已存在：mon-slow-row-<route_id>（P4b-1T 契约落定）→ 本票【复用】，
 *   不新增命名、不另设 act-* 按钮。
 * - 目标路由：/v2/routes/:id/detail（name=V2RouteDetail，src/router/index.ts），
 *   与 routes/List.vue act-detail 的 push(`/v2/routes/${row.id}/detail`) 同款仓库先例。
 * - 触发方式裁决：【单击】—— 慢路由榜是普通列表（非拓扑/非拖拽画布），单击未被任何
 *   「选中」逻辑占用；下钻列表行单击直达是 Gravitee/Konnect 惯例，双击反而加重动线成本。
 *
 * ── C 步实现清单（本文件测试即契约）────────────────────────────────────────
 * 1. .slow-row 行（mon-slow-row-<id>）加 @click → router.push(`/v2/routes/${r.id}/detail`)
 * 2. 行加 tabindex="0" + @keydown.enter（复用同一 handler；Hallmark 键盘可达惯例；
 *    role 建议 "button"，测试不断言 role —— button/link 由 C 定夺）
 * 3. push 写法：字符串路径或 { name:'V2RouteDetail', params:{id} } 均可 —— 测试断言
 *    push 参数归一后的 path + 落地 currentRoute，两种写法都绿
 * 4. i18n：无新增 key（行为型入口，无新文案；如需 aria-label/title 提示语另立 P3）
 *
 * ── RED 口径 ─────────────────────────────────────────────────────────────
 * 组件与行 DOM 均已存在（P4b-1 已建），失败点只能是「行为未接」：click/Enter 后 push
 * 零调用 + currentRoute 原地、或行无 tabindex —— 不得出现 import/语法级失败。
 */
import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  fetchTrafficSummary: vi.fn(),
  fetchGatewayTimeseries: vi.fn(),
  listRouteStatus: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary,
  fetchGatewayTimeseries: mocks.fetchGatewayTimeseries
}))
vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// SSE 订阅整体 mock（Monitor.test.ts P4b-3 同思路、最简面）：mode 用真 Vue ref，
// start/stop/dispose 空转 —— 不 mock 则真实 composable 在 jsdom 里走 EventSource（不存在），
// 降级链非确定。下钻行为与流无关，fake 到「能挂载」即可。
vi.mock('@/composables/useMonitorStream', async () => {
  const { ref } = await import('vue')
  const mode = ref('idle')
  const handle = {
    mode,
    connected: ref(false),
    lastMetrics: ref<unknown>(null),
    lastConfigChange: ref<unknown>(null),
    start: () => { mode.value = 'connecting' },
    stop: vi.fn(),
    dispose: () => { mode.value = 'idle' }
  }
  return { useMonitorStream: vi.fn(() => handle) }
})

import Monitor from '@/views-v2/monitor/Monitor.vue'

const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
/** i18n 实例显式 I18n<> 类型（Settings.test.ts factory 同款签名；TSC:0 口径含测试文件） */
type TestI18n = I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false>
function createTestI18n(): TestI18n {
  return createI18n(i18nBase)
}

const stub = { template: '<div />' }

function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 312000, qps: 118, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
    upstream: null, source: 'prometheus', quantile_fallback: false, ...over
  }
}

/** 三行榜（p95 降序）：s1(412ms) → s2(112ms) → d1(p95=null，值 — 无 pbar)。
 * d1 故意入榜：钉「p95 缺失的榜内行同样可下钻」——行代表路由本身，与有无耗时值无关。 */
function defaultTraffic() {
  return [
    makeTraffic('s1', { route_name: 'checkout_service', path: '/api/pay/checkout/**', p95_latency_ms: 412 }),
    makeTraffic('s2', { route_name: 'order_service', path: '/api/order/**', p95_latency_ms: 112 }),
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', p95_latency_ms: null })
  ]
}

async function factory() {
  const i18n = createTestI18n()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/monitor', component: Monitor as any },
      // 下钻落地路由（stub）：注册真实 path 形状，push 落地后可断言 currentRoute
      { path: '/v2/routes/:id/detail', name: 'V2RouteDetail', component: stub }
    ]
  })
  await router.push('/v2/monitor')
  await router.isReady()
  // push spy：断言「push 参数」（字符串与 {name,params} 两种写法归一为 path）+ 调用计数；
  // spyOn 透传原实现，不干扰真实导航（List.test.ts currentRoute 断言先例 + 参数断言双保险）
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

/** push 参数归一为 path：字符串取原值；location 对象经 router.resolve 归一
 * （契约钉「落到哪个 path」，不钉写法）。前置：调用方已先断言 push 恰调用一次。 */
function pushedPath(router: Router, pushSpy: MockInstance): string {
  const arg = pushSpy.mock.calls[0]?.[0]
  if (typeof arg === 'string') return arg
  expect(arg, 'router.push 未被调用，无参数可断言').toBeDefined()
  return router.resolve(arg).path
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.fetchGatewayTimeseries.mockReset().mockResolvedValue({ source: 'prometheus', data_points: [] })
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
})

describe('OPT-1 monitor — 慢路由 Top5 行单击下钻 → /v2/routes/{id}/detail', () => {
  it('榜首行 mon-slow-row-s1 点击 → push 落地 /v2/routes/s1/detail（params.id=s1）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const row = one(wrapper, 'mon-slow-row-s1')
    expect(row.exists(), '缺 mon-slow-row-s1 行（P4b-1 既有 testid，本票复用）').toBe(true)
    expect(row.text()).toContain('checkout_service')
    await row.trigger('click')
    await flushPromises()
    expect(pushSpy, '行点击应触发 router.push 下钻（未接 onClick → 先红）').toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy), 'push 参数应指向该行路由的详情页').toBe('/v2/routes/s1/detail')
    expect(router.currentRoute.value.path, '点击后应落地 /v2/routes/s1/detail').toBe('/v2/routes/s1/detail')
    expect(router.currentRoute.value.params.id).toBe('s1')
    wrapper.unmount()
  })

  it('第二行 s2 点击 → /v2/routes/s2/detail（id 取自行数据，非硬编码单一路径）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const row = one(wrapper, 'mon-slow-row-s2')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('order_service')
    await row.trigger('click')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy)).toBe('/v2/routes/s2/detail')
    expect(router.currentRoute.value.path).toBe('/v2/routes/s2/detail')
    expect(router.currentRoute.value.params.id).toBe('s2')
    wrapper.unmount()
  })

  it('p95=null 行 d1 点击 → /v2/routes/d1/detail（榜内行皆可下钻，与有无耗时值无关）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const row = one(wrapper, 'mon-slow-row-d1')
    expect(row.exists(), 'p95=null 的路由仍入榜（值 — 无 pbar），行应存在').toBe(true)
    await row.trigger('click')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy)).toBe('/v2/routes/d1/detail')
    expect(router.currentRoute.value.path).toBe('/v2/routes/d1/detail')
    expect(router.currentRoute.value.params.id).toBe('d1')
    wrapper.unmount()
  })
})

describe('OPT-1 monitor — 行键盘可达（Hallmark 惯例：Tab 可聚焦 + Enter 触发）', () => {
  it('榜内每行都带 tabindex="0"（可 Tab 聚焦；纯展示 div 不得不可达）', async () => {
    const { wrapper } = await factory()
    const rows = wrapper.findAll('[data-testid^="mon-slow-row-"]')
    expect(rows.length).toBe(3)
    for (const row of rows) {
      expect(row.attributes('tabindex'), `行 ${row.attributes('data-testid')} 应可聚焦（tabindex=0）`).toBe('0')
    }
    wrapper.unmount()
  })

  it('Enter 触发下钻 → /v2/routes/s1/detail（@keydown.enter 复用 click handler）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const row = one(wrapper, 'mon-slow-row-s1')
    expect(row.exists()).toBe(true)
    await row.trigger('keydown.enter')
    await flushPromises()
    expect(pushSpy, 'Enter 应触发下钻（未接 keydown → 先红）').toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy)).toBe('/v2/routes/s1/detail')
    expect(router.currentRoute.value.path).toBe('/v2/routes/s1/detail')
    wrapper.unmount()
  })
})
