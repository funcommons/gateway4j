/**
 * OPT-1 T（写测试，先红为预期）：大盘下钻第二入口 —— overview 拓扑节点 → 路由详情页。
 * 依据 docs/ui-v2/gateway4j-v2优化.md 建议第 3 条（对标 Gravitee 360° 下钻）；
 * P4e 02-08 裁决「大盘下钻入口归 03 路由组」的已记录缺口闭环。
 * 本文件只落用例：零业务代码改动、不动既有 Overview.test.ts 用例；C 步接线后转绿。
 *
 * ── 页面现状侦察（C 步实现要点）────────────────────────────────────────────
 * - 节点数据结构：Overview.vue nodes（LaidNode）→ key=『client | gateway | dispatch-<id> |
 *   backend-<id>』（testid 后缀），eid=边端点名：固定节点 'client'/'gw'，路由节点 = route_id。
 *   即：dispatch/backend 两类节点都带 routeId（eid），client/gateway 是无 routeId 的固定节点
 *   ——【与任务口径的偏差】：任务提示把「分发」归入无 routeId 一侧，但本页实现里分发节点
 *   来自 topology.nodes（id=route_id），分发路由是 route_info 正式路由（routes/List 的
 *   DISPATCH 行同样有 act-detail 入口）→ 裁定【分发节点可下钻】；「无 routeId」一侧实际只有
 *   client/gateway 两个固定虚拟节点。测试按实际数据结构落（C 勿回退分发下钻）。
 * - 节点级 testid 已存在：topo-node-<key>（S6-T 契约落定）→ 本票【复用】，不新增命名。
 * - 目标路由：/v2/routes/:id/detail（name=V2RouteDetail）；画布 /v2/routes/canvas/:id 是
 *   备选落点（优化原文「路由详情/画布」），本票钉详情页 —— 画布入口如需可后续以修饰键另立票。
 *
 * ── 触发方式裁决（双击 vs 单击，C 勿改）────────────────────────────────────
 * 【双击下钻】。现状侦察：本页节点单击【尚未】被「选中」逻辑占用（源码无 selected 状态、
 * 无节点级 click 处理）——但仍选双击，原因有二：
 * ① 拓扑画布是「总览读图」场景，用户会点节点确认视线焦点，单击直达会把「读图」误触成
 *    「跳页」，动线成本高于收益（Gravitee/Konnect 拓扑下钻同为双击/详情钮惯例）；
 * ② 给未来「单击选中 → 侧栏同步高亮」留出语义空位，避免契约反复。
 * 由此单击【不】导航（用例钉死），Enter 为双击的键盘等价（Hallmark 惯例）。
 *
 * ── C 步实现清单（本文件测试即契约）────────────────────────────────────────
 * 1. 路由节点（kind ∈ dispatch|backend，取 n.eid 为 routeId）：@dblclick +
 *    @keydown.enter → router.push(`/v2/routes/${n.eid}/detail`)
 * 2. 节点加 tabindex="0"（仅路由节点；client/gateway 保持 inert 不进 Tab 序）
 * 3. 固定节点（client/gateway）不接任何导航 handler
 * 4. push 写法两种皆可（断言落地 path，见 Monitor.drilldown.test.ts 同款裁决）
 * 5. i18n：无新增 key（如需 aria-label「查看 {name} 详情」可另立 P3 补 key）
 *
 * ── RED 口径 ─────────────────────────────────────────────────────────────
 * 组件与节点 DOM 均已存在（S6 已建），失败点只能是「行为未接」：dblclick/Enter 后 push
 * 零调用 + currentRoute 原地、节点无 tabindex —— 不得出现 import/语法级失败。
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

/** 5 路由：d1 分发 + b1/b2/b3 后置 + dr1 草稿（S6-T 同构，缩量不改形状） */
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

async function factory() {
  const i18n = createTestI18n()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/overview', component: Overview as any },
      // 下钻落地路由（stub）：注册真实 path 形状，push 落地后可断言 currentRoute
      { path: '/v2/routes/:id/detail', name: 'V2RouteDetail', component: stub }
    ]
  })
  await router.push('/v2/overview')
  await router.isReady()
  // push spy：断言 push 参数（两种写法归一为 path）+ 调用计数；spyOn 透传原实现
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(Overview, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

/** push 参数归一为 path：字符串取原值；location 对象经 router.resolve 归一。
 * 前置：调用方已先断言 push 恰调用一次。 */
function pushedPath(router: Router, pushSpy: MockInstance): string {
  const arg = pushSpy.mock.calls[0]?.[0]
  if (typeof arg === 'string') return arg
  expect(arg, 'router.push 未被调用，无参数可断言').toBeDefined()
  return router.resolve(arg).path
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.getTopology.mockReset().mockResolvedValue(defaultTopology())
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
})

describe('OPT-1 overview — 拓扑 routeId 节点双击下钻 → /v2/routes/{id}/detail', () => {
  it('后置节点 topo-node-backend-b1 双击 → push 落地 /v2/routes/b1/detail（params.id=b1）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const node = one(wrapper, 'topo-node-backend-b1')
    expect(node.exists(), '缺 topo-node-backend-b1 节点（S6 既有 testid，本票复用）').toBe(true)
    expect(node.text()).toContain('user_service')
    await node.trigger('dblclick')
    await flushPromises()
    expect(pushSpy, '节点双击应触发 router.push 下钻（未接 onDblclick → 先红）').toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy), '双击参数应指向该节点路由的详情页').toBe('/v2/routes/b1/detail')
    expect(router.currentRoute.value.path, '双击后应落地 /v2/routes/b1/detail').toBe('/v2/routes/b1/detail')
    expect(router.currentRoute.value.params.id).toBe('b1')
    wrapper.unmount()
  })

  it('分发节点 topo-node-dispatch-d1 双击 → /v2/routes/d1/detail（偏差裁定：分发节点 eid=route_id，可下钻）', async () => {
    // 偏差说明（头注已详述）：任务口径把「分发」归无 routeId 不导航侧；本页分发节点来自
    // topology.nodes（id=route_id），分发路由是正式路由、List 的 DISPATCH 行同样有 act-detail
    // → 按页面实际数据结构裁定分发节点可下钻。C 勿把分发节点排除。
    const { wrapper, router, pushSpy } = await factory()
    const node = one(wrapper, 'topo-node-dispatch-d1')
    expect(node.exists(), '缺 topo-node-dispatch-d1 节点').toBe(true)
    expect(node.text()).toContain('api_gateway')
    await node.trigger('dblclick')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy)).toBe('/v2/routes/d1/detail')
    expect(router.currentRoute.value.path).toBe('/v2/routes/d1/detail')
    expect(router.currentRoute.value.params.id).toBe('d1')
    wrapper.unmount()
  })

  it('固定节点 client/gateway（无 routeId）双击 → 不导航（currentRoute 原地 + push 零调用）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    expect(one(wrapper, 'topo-node-client').exists()).toBe(true)
    expect(one(wrapper, 'topo-node-gateway').exists()).toBe(true)
    await one(wrapper, 'topo-node-client').trigger('dblclick')
    await one(wrapper, 'topo-node-gateway').trigger('dblclick')
    await flushPromises()
    expect(pushSpy, '固定虚拟节点不接导航 handler').not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/overview')
    wrapper.unmount()
  })
})

describe('OPT-1 overview — 单击不导航（双击 vs 单击裁决钉死，C 勿改成单击直达）', () => {
  it('routeId 节点 b1 单击 → 不导航（单击留给未来「选中」态；下钻只走双击，头注裁决②）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const node = one(wrapper, 'topo-node-backend-b1')
    expect(node.exists()).toBe(true)
    await node.trigger('click')
    await flushPromises()
    expect(pushSpy, '单击不得触发下钻（双击裁决）').not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/overview')
    wrapper.unmount()
  })
})

describe('OPT-1 overview — 节点键盘可达（Hallmark 惯例：Tab 可聚焦 + Enter 触发）', () => {
  it('路由节点带 tabindex="0"，Enter 触发下钻 → /v2/routes/b1/detail（双击的键盘等价）', async () => {
    const { wrapper, router, pushSpy } = await factory()
    const b1 = one(wrapper, 'topo-node-backend-b1')
    const d1 = one(wrapper, 'topo-node-dispatch-d1')
    expect(b1.exists()).toBe(true)
    expect(d1.exists()).toBe(true)
    expect(b1.attributes('tabindex'), '路由节点应可聚焦（tabindex=0）').toBe('0')
    expect(d1.attributes('tabindex'), '分发节点同为路由节点，应可聚焦').toBe('0')
    await b1.trigger('keydown.enter')
    await flushPromises()
    expect(pushSpy, 'Enter 应触发下钻（未接 keydown → 先红）').toHaveBeenCalledTimes(1)
    expect(pushedPath(router, pushSpy)).toBe('/v2/routes/b1/detail')
    expect(router.currentRoute.value.path).toBe('/v2/routes/b1/detail')
    wrapper.unmount()
  })

  it('固定节点 client/gateway 无 tabindex（非交互元素不进 Tab 序，不抢键盘焦点）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'topo-node-client').attributes('tabindex')).toBeUndefined()
    expect(one(wrapper, 'topo-node-gateway').attributes('tabindex')).toBeUndefined()
    wrapper.unmount()
  })
})
