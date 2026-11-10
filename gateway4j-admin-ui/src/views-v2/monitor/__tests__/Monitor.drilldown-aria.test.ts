/**
 * P3-c T（写测试，先红为预期）：大盘下钻入口可访问名 —— monitor 慢路由 Top5 行 aria-label。
 * 票据：docs/ui-v2/实施契约.md §6 P3 池「下钻 aria-label」（OPT-1 V 轮遗留：落地时按
 * 「零新增 i18n」裁决未加 aria-label，行成为「无可访问名称的可点元素」反模式 ——
 * tabindex="0" 可聚焦、可回车下钻，却对读屏匿名）。本票补齐；
 * LOW-1（Settings.auditFilterByValue，'按此值筛选：{value}'）已立「命名插值 aria-label」
 * 先例，本票同式。本文件只落用例：零业务代码改动、不动既有 Monitor.drilldown.test.ts /
 * Monitor.test.ts 用例（纯增量同仓并行）；C 步接线后转绿。
 *
 * ── 页面现状侦察（C 步实现要点）────────────────────────────────────────────
 * - 行数据结构：Monitor.vue slowRows → SlowRow { id, name, path, val, barPct, cls }，
 *   name = RouteTrafficSummaryItem.route_name（路由名就是可访问名的插值素材，行上现成）。
 * - 行级 testid：mon-slow-row-<route_id>（P4b-1 契约，本票复用）；行已带 tabindex="0" +
 *   @click + @keydown.enter（OPT-1 ff82f86 已落）→ 本票只补「名」，不动行为、不加新元素。
 * - 挂载位置：aria-label 必须落在可点行元素本身（.slow-row，即 mon-slow-row-{id} testid
 *   元素），不是内层 .slow-name span —— 可访问名必须与可操作元素同体。
 *
 * ── C 步实现清单（本文件测试即契约）────────────────────────────────────────
 * 1. .slow-row 行加 :aria-label="t('v2.routes.viewDetail', { name: r.name })"
 * 2. i18n 共享 key（双语严格同步，落 v2.routes 显式树）：下钻两入口（monitor 行单击 /
 *    overview 节点双击）落点同为目标路由详情页，语义同句 → 两页共享一 key，不各设一份
 *    （Overview.vue 借用 v2.routes.placeholder 已立 v2.routes 跨页共享先例）：
 *      v2.routes.viewDetail   zh '查看 {name} 详情' / en 'View {name} details'
 *    {name} 命名插值必须保留（多行可点元素的可访问名必须可分辨行）；文案措辞 C 可调，
 *    key 名与命名参数名 {name} 钉死（本文件断言按 locale 源复算，措辞改动不破测试）。
 *
 * ── RED 口径 ─────────────────────────────────────────────────────────────
 * 行 DOM 与交互（tabindex/click/Enter）均已存在（OPT-1 已落），失败点只能是「名未挂 +
 * key 未落」：aria-label 缺省（undefined / missing-key 回显 ≠ 插值结果）+ i18n key 双语
 * 缺失 —— 不得出现 import/语法级失败。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
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
// SSE 订阅整体 mock（Monitor.drilldown.test.ts 同款最简面）：下钻可访问名与流无关，fake 到「能挂载」即可
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

/** 共享 i18n key（C 步钉死，overview 侧同款）：下钻两入口语义同句，落 v2.routes 显式树 */
const KEY = 'v2.routes.viewDetail'

const i18nBase = (locale: 'zh-CN' | 'en-US') => ({
  legacy: false as const,
  locale,
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})
/** i18n 实例显式 I18n<> 类型（Settings.test.ts factory 同款签名；TSC:0 口径含测试文件） */
type TestI18n = I18n<ReturnType<typeof i18nBase>['messages'], Record<string, unknown>, Record<string, unknown>, string, false>
function createTestI18n(locale: 'zh-CN' | 'en-US'): TestI18n {
  return createI18n(i18nBase(locale))
}

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
/** tMsg：locale 源文案取值 + {name} 命名插值复算（断言 aria-label 全等用，与 vue-i18n
 * 命名插值同构；文案同源不改写 —— C 调措辞不破测试，只钉 key 与命名参数名） */
function tMsg(locale: unknown, key: string, params: Record<string, string>): string {
  const raw = String(dig(locale, key) ?? '')
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => (name in params ? params[name] : `{${name}}`))
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

/** 三行榜（与 Monitor.drilldown.test.ts 同构）：s1(412ms) → s2(112ms) → d1(p95=null)。
 * d1 故意入榜：钉「p95 缺失的榜内行同样有可访问名」——行可点性与其有无耗时值无关。 */
function defaultTraffic() {
  return [
    makeTraffic('s1', { route_name: 'checkout_service', path: '/api/pay/checkout/**', p95_latency_ms: 412 }),
    makeTraffic('s2', { route_name: 'order_service', path: '/api/order/**', p95_latency_ms: 112 }),
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', p95_latency_ms: null })
  ]
}

async function factory(locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const i18n = createTestI18n(locale)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/monitor', component: Monitor as any },
      { path: '/v2/routes/:id/detail', name: 'V2RouteDetail', component: stub }
    ]
  })
  await router.push('/v2/monitor')
  await router.isReady()
  const wrapper = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.fetchGatewayTimeseries.mockReset().mockResolvedValue({ source: 'prometheus', data_points: [] })
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
})

// ── 行可访问名（挂可点行元素本体，命名插值路由名）─────────────────────────
describe('P3-c monitor — 慢路由行可访问名（aria-label = viewDetail 命名插值该行路由名）', () => {
  it('榜内三行逐一：mon-slow-row-{id} 行元素 aria-label 全等 t(v2.routes.viewDetail, {name})——含 p95=null 行 d1', async () => {
    const { wrapper } = await factory()
    const rows: Array<[string, string]> = [
      ['mon-slow-row-s1', 'checkout_service'],
      ['mon-slow-row-s2', 'order_service'],
      ['mon-slow-row-d1', 'api_gateway']
    ]
    for (const [tid, name] of rows) {
      const row = one(wrapper, tid)
      expect(row.exists(), `缺 ${tid} 行（P4b-1 既有 testid，本票复用）`).toBe(true)
      // 断言落在 testid 元素本体 = 挂载位置契约：可访问名必须在可点行元素上，非内层 span
      expect(row.attributes('aria-label'), `${tid} 可访问名应为 viewDetail 命名插值本行路由名「${name}」（未挂 → 先红）`)
        .toBe(tMsg(zhCN, KEY, { name }))
    }
    wrapper.unmount()
  })

  it('en-US locale 下行走 en 文案插值（label 经 t() 路由，非硬编码 zh 常量；双语同源）', async () => {
    const { wrapper } = await factory('en-US')
    const row = one(wrapper, 'mon-slow-row-s1')
    expect(row.exists()).toBe(true)
    expect(row.attributes('aria-label'), 'en locale 下可访问名应为 en 文案插值（硬编码 zh 常量在此必炸）')
      .toBe(tMsg(enUS, KEY, { name: 'checkout_service' }))
    wrapper.unmount()
  })
})

// ── i18n key 契约（共享 key 双语存在，LOW-1 auditFilterByValue 同款断言式）──
describe('P3-c — i18n key 契约（v2.routes.viewDetail 共享 key 双语存在 + {name} 命名插值保留）', () => {
  it('双语两处都存在，且 zh/en 文案均保留 {name} 命名插值（可访问名必须含行名，多行可分辨）', () => {
    expect(dig(zhCN, KEY), `zh-CN 缺少 ${KEY}`).toBeDefined()
    expect(dig(enUS, KEY), `en-US 缺少 ${KEY}`).toBeDefined()
    expect(String(dig(zhCN, KEY)), 'zh 文案须保留 {name} 命名插值').toContain('{name}')
    expect(String(dig(enUS, KEY)), 'en 文案须保留 {name} 命名插值').toContain('{name}')
  })
})
