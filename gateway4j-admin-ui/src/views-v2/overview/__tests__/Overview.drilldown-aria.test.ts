/**
 * P3-c T（写测试，先红为预期）：大盘下钻入口可访问名 —— overview 拓扑节点 aria-label
 * （路由节点有名、固定节点 inert 保持无名）。票据：docs/ui-v2/实施契约.md §6 P3 池
 * 「下钻 aria-label」（OPT-1 V 轮遗留：落地时按「零新增 i18n」裁决未加 aria-label，
 * 路由节点 tabindex="0" 可聚焦、可双击/回车下钻，却对读屏匿名）。本票补齐；LOW-1
 * （Settings.auditFilterByValue，命名插值 aria-label）先例同式。本文件只落用例：
 * 零业务代码改动、不动既有 Overview.drilldown.test.ts / Overview.test.ts 用例（纯增量
 * 同仓并行）；C 步接线后转绿。
 *
 * ── 页面现状侦察（C 步实现要点）────────────────────────────────────────────
 * - 节点数据结构：Overview.vue nodes（LaidNode）→ key=『client | gateway | dispatch-<id> |
 *   backend-<id>』（testid 后缀）；【名称字段就是 n.name】：路由节点 name =
 *   raw.name || s?.route_name || raw.id（topology.nodes 的 name 优先），固定节点 name =
 *   t('v2.overview.clientLabel') / t('v2.overview.nodeGateway') —— 可访问名插值素材行上现成。
 * - 可下钻判定：n.routeId != null（dispatch/backend 都是路由节点，client/gateway 为 null
 *   不导航 —— 与既有 Overview.drilldown.test.ts 裁决一致，勿回退分发下钻）。
 * - 节点级 testid：topo-node-<key>（S6-T 契约，本票复用）；路由节点已带 tabindex="0" +
 *   @dblclick + @keydown.enter（OPT-1 ff82f86 已落）→ 本票只补「名」，不动行为。
 * - 挂载位置：aria-label 必须落在节点可点元素本身（.topo-node，即 topo-node-{key} testid
 *   元素），不是内层 .tn-name span —— 可访问名必须与可操作元素同体。
 *
 * ── C 步实现清单（本文件测试即契约）────────────────────────────────────────
 * 1. 路由节点（n.routeId != null）加 :aria-label="t('v2.routes.viewDetail', { name: n.name })"
 *    （推荐三元写法：n.routeId != null ? t(...) : undefined —— undefined 时 Vue 不渲染
 *    attribute，固定节点自然无名）
 * 2. 固定节点（client/gateway，routeId=null）：【不】加 aria-label —— 与 inert 一致
 *    （无 tabindex 不进 Tab 序、双击原地），不得「可点无名」也不得「不可点却有下钻名」
 *    造成读屏误导航暗示
 * 3. i18n 共享 key（与 monitor 侧同款，Monitor.drilldown-aria.test.ts 头注详述共享裁决）：
 *      v2.routes.viewDetail   zh '查看 {name} 详情' / en 'View {name} details'
 *    {name} 命名插值必须保留；文案措辞 C 可调，key 名与命名参数名钉死。
 *
 * ── RED 口径 ─────────────────────────────────────────────────────────────
 * 节点 DOM 与交互（tabindex/dblclick/Enter）均已存在（OPT-1 已落），失败点只能是「名未挂 +
 * key 未落」：路由节点 aria-label 缺省（undefined / missing-key 回显 ≠ 插值结果）+ i18n key
 * 双语缺失。「固定节点无名」护栏用例 RED 期天然绿（防 C 过度补名），非本票 RED 证据 ——
 * 不得出现 import/语法级失败。
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
  getTopology: vi.fn(),
  listAuditLogs: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary
}))
vi.mock('@/api/misc', () => ({
  getTopology: mocks.getTopology,
  listAuditLogs: mocks.listAuditLogs
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import Overview from '@/views-v2/overview/Overview.vue'

/** 共享 i18n key（C 步钉死，monitor 侧同款）：下钻两入口语义同句，落 v2.routes 显式树 */
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

/** 5 路由：d1 分发 + b1/b2/b3 后置 + dr1 草稿（S6-T 同构，与 Overview.drilldown.test.ts 同源）；
 * topology.nodes 的 name 全量在位 → 节点可访问名插值素材 = raw.name（name 优先级第一路） */
function defaultTraffic() {
  return [
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', hits_24h: 1200000, qps: 221, p95_latency_ms: null }),
    makeTraffic('b1', { route_name: 'user_service', path: '/api/user/**', upstream: { reachable: true, latency_ms: 8 } }),
    makeTraffic('b2', { route_name: 'order_service', path: '/api/order/**', hits_24h: 121000, qps: 85, p95_latency_ms: 112, status: 'CHANGING', upstream: { reachable: false, latency_ms: null } }),
    makeTraffic('b3', { route_name: 'product_service', path: '/api/product/**', hits_24h: 84000, qps: 49.4, p95_latency_ms: 37 }),
    makeTraffic('dr1', { route_name: 'draft_svc', path: '/api/draft/**', status: 'DRAFT', hits_24h: 3000, qps: 1, p95_latency_ms: null })
  ]
}

/** topology 实际形状：d1 分发 + 4 后置；edges = d1 的 2 条条件路由 */
function defaultTopology() {
  return {
    nodes: [
      { id: 'd1', name: 'api_gateway', type: 'DISPATCH', status: 'HEALTHY' },
      { id: 'b1', name: 'user_service', type: 'BACKEND', status: 'HEALTHY' },
      { id: 'b2', name: 'order_service', type: 'BACKEND', status: 'ERROR' },
      { id: 'b3', name: 'product_service', type: 'BACKEND', status: 'HEALTHY' },
      { id: 'dr1', name: 'draft_svc', type: 'BACKEND', status: 'HEALTHY' }
    ],
    edges: [
      { source_id: 'd1', target_id: 'b1', condition: 'PATH CONTAINS /api/user' },
      { source_id: 'd1', target_id: 'b2', condition: 'PATH CONTAINS /api/order' }
    ]
  }
}

function defaultAuditPage() {
  return {
    records: [
      { id: '9001', action: 'CREATE_ROUTE', target_type: 'ROUTE', target_id: '30', actor: 'admin', result: 'SUCCESS', created_at: '2026-11-04T13:47:00+08:00' }
    ],
    total: 1, size: 5, current: 1, pages: 1
  }
}

async function factory(locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const i18n = createTestI18n(locale)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/overview', component: Overview as any },
      { path: '/v2/routes/:id/detail', name: 'V2RouteDetail', component: stub }
    ]
  })
  await router.push('/v2/overview')
  await router.isReady()
  const wrapper = mount(Overview, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.getTopology.mockReset().mockResolvedValue(defaultTopology())
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
})

// ── 路由节点可访问名（挂可点节点元素本体，命名插值节点名）─────────────────
describe('P3-c overview — 路由节点可访问名（aria-label = viewDetail 命名插值该节点名）', () => {
  it('5 个路由节点逐一（dispatch-d1 + backend-b1/b2/b3/dr1）：topo-node-{key} 元素 aria-label 全等 t(v2.routes.viewDetail, {name})', async () => {
    const { wrapper } = await factory()
    // 期望名 = 节点名解析第一路 raw.name（fixture 全量在位；分发节点可下钻属 OPT-1 既有裁定，勿回退）
    const nodes: Array<[string, string]> = [
      ['topo-node-dispatch-d1', 'api_gateway'],
      ['topo-node-backend-b1', 'user_service'],
      ['topo-node-backend-b2', 'order_service'],
      ['topo-node-backend-b3', 'product_service'],
      ['topo-node-backend-dr1', 'draft_svc']
    ]
    for (const [tid, name] of nodes) {
      const node = one(wrapper, tid)
      expect(node.exists(), `缺 ${tid} 节点（S6 既有 testid，本票复用）`).toBe(true)
      // 断言落在 testid 元素本体 = 挂载位置契约：可访问名必须在可点节点元素上，非内层 tn-name
      expect(node.attributes('aria-label'), `${tid} 可访问名应为 viewDetail 命名插值本节点名「${name}」（未挂 → 先红）`)
        .toBe(tMsg(zhCN, KEY, { name }))
    }
    wrapper.unmount()
  })

  it('en-US locale 下行走 en 文案插值（label 经 t() 路由，非硬编码 zh 常量；双语同源）', async () => {
    const { wrapper } = await factory('en-US')
    const node = one(wrapper, 'topo-node-backend-b1')
    expect(node.exists()).toBe(true)
    expect(node.attributes('aria-label'), 'en locale 下可访问名应为 en 文案插值（硬编码 zh 常量在此必炸）')
      .toBe(tMsg(enUS, KEY, { name: 'user_service' }))
    wrapper.unmount()
  })
})

// ── 固定节点 inert 一致性 + i18n key 契约 ────────────────────────────────
describe('P3-c — 固定节点 inert 一致性（无名 + 无 tabindex，防「不可点却有下钻名」）', () => {
  it('client/gateway 固定节点：无 aria-label（缺省或空皆可）且无 tabindex —— 与 inert 裁决一致，读屏不误暗示可下钻', async () => {
    const { wrapper } = await factory()
    for (const tid of ['topo-node-client', 'topo-node-gateway']) {
      const node = one(wrapper, tid)
      expect(node.exists(), `缺 ${tid} 固定节点`).toBe(true)
      const label = node.attributes('aria-label')
      expect(label ?? '', `${tid} 固定虚拟节点不得带下钻可访问名（C 勿过度补名）`).toBe('')
      expect(node.attributes('tabindex'), `${tid} 无 routeId 不进 Tab 序（OPT-1 既有 inert 裁决，随迁双证）`).toBeUndefined()
    }
    wrapper.unmount()
  })
})

describe('P3-c — i18n key 契约（v2.routes.viewDetail 共享 key 双语存在 + {name} 命名插值保留）', () => {
  it('双语两处都存在，且 zh/en 文案均保留 {name} 命名插值（可访问名必须含节点名，多节点可分辨）', () => {
    expect(dig(zhCN, KEY), `zh-CN 缺少 ${KEY}`).toBeDefined()
    expect(dig(enUS, KEY), `en-US 缺少 ${KEY}`).toBeDefined()
    expect(String(dig(zhCN, KEY)), 'zh 文案须保留 {name} 命名插值').toContain('{name}')
    expect(String(dig(enUS, KEY)), 'en 文案须保留 {name} 命名插值').toContain('{name}')
  })
})
