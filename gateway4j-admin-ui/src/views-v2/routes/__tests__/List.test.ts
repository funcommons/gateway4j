/**
 * S3-T：v2 路由列表页测试（对应契约 §4 S3 + 字段契约见 src/api/v2.ts；视觉参照 prototype-v2/02-route-list.html）。
 * 先红是预期：页面由 S3-C 实现（当前为 V2PagePlaceholder 占位）。
 *
 * 数据契约（S3-C 按此实现）：行集合 = listRoutes()（@/api/routes，RouteNode 树平铺）；
 *   流量列 = fetchTrafficSummary()（@/api/v2，按 route_id 合并；未命中的行流量列 —）；
 *   展开懒加载 = fetchRouteTimeseries(id,'24h','1h')（@/api/v2，按行缓存，收起再展开不重复请求）；
 *   复制配置 = duplicateRoute(id)（@/api/routes）。
 * P3-d【契约演进】：批量执行由「客户端逐条循环单条端点」切换为「后端 bulk 端点单请求」
 *   （bulkPublishRoutes / bulkOfflineRoutes / bulkDeleteRoutes → BulkResult{succeeded,failed}）。
 *   背景与理由、新语义全表见下方 OPT-3 段头注；批量执行用例已按新契约改写
 *   （执行类先红 = bulk 接线未实现，属预期 RED）。
 * 依赖 i18n key 全表（v2.routes.*，zh/en 同步加，铁律 6）：create / statusPublished / statusDraft /
 *   statusOffline / statusChanging / upstreamUnreachable / flowMatch / pluginCount('{n} 插件') /
 *   decisionTree / healthOk / healthBad / healthUnknown / snapshotFallback / trafficLoadFailed / empty /
 *   cardUpstream / cardPlugins / cardActions / actDebug / actCanvas / actPublish / actCopy
 * DOM 契约（data-testid）：route-create（仅 canEdit('route')）；summary-source-hint；traffic-error；
 *   route-empty；route-row-<id>（内含 route-status / route-path / route-flow 内 3 个 flow-chip /
 *   route-hits / route-p95 / route-health）；route-expand-<id>；route-detail-<id>（route-spark-<id> +
 *   card-upstream / card-plugins / card-actions；动作 act-debug / act-canvas / act-publish / act-copy）
 * 字段对照（提示词 → 真实 DTO，src/api/routes.ts RouteNode）：name → route_name；matchPath → path；
 *   upstreamUrl → upstream_url；routeType → route_type('DISPATCH'|'BACKEND')；listRouteTree → listRoutes；
 *   plugins[] 用 plugin_name；status ∈ DRAFT|PUBLISHED|OFFLINE|CHANGING；无 method 字段 → 只断言路径 chip
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  duplicateRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  publishRoute: vi.fn(),
  // P3-d 契约演进：批量执行接入 bulk 三端点（单条端点保留给单条操作/undo 用例）
  bulkPublishRoutes: vi.fn(),
  bulkOfflineRoutes: vi.fn(),
  bulkDeleteRoutes: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  fetchRouteTimeseries: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  duplicateRoute: mocks.duplicateRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute,
  publishRoute: mocks.publishRoute,
  bulkPublishRoutes: mocks.bulkPublishRoutes,
  bulkOfflineRoutes: mocks.bulkOfflineRoutes,
  bulkDeleteRoutes: mocks.bulkDeleteRoutes
}))
// P4f 前置票①：只替换 toast，Fc* 组件保留真实实现（plugins/List.test.ts、Editor.test.ts 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components')>()
  return { ...actual, toast: mocks.toast }
})
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary,
  fetchRouteTimeseries: mocks.fetchRouteTimeseries
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import List from '@/views-v2/routes/List.vue'
// 类型仅编译期使用（import type 运行时擦除，不触碰 vi.mock 工厂）
import type { BulkResult } from '@/api/routes'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
// dig: 按点路径取 locale 值；undefined = key 缺失（参照 LayoutV2.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function makeNode(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', status: 'PUBLISHED', sort_order: 0,
    config_version: '1', created_at: 0, updated_at: 0, plugins: [], children: [], ...over
  }
}
function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 312000, qps: 118, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
    upstream: { reachable: true, latency_ms: 8 }, source: 'prometheus', quantile_fallback: false, ...over
  }
}
const PLUGINS = ['签名校验', '请求限流', '链路追踪', '敏感字段脱敏'].map((n, i) => ({ plugin_id: `p${i}`, plugin_name: n, plugin_phase: 'PRE', sort_order: i }))

function defaultNodes() {
  return [
    makeNode('r1', { route_name: 'user_service', plugins: PLUGINS }),
    makeNode('r2', { route_name: 'order_service', upstream_url: 'http://10.0.0.12:9002' }),
    makeNode('r3', { route_name: 'api_gateway', route_type: 'DISPATCH', upstream_url: '' }),
    makeNode('r4', { route_name: 'draft_svc', status: 'DRAFT' }),
    makeNode('r5', { route_name: 'orphan_svc' })
  ]
}
function defaultTraffic() {
  return [
    makeTraffic('r1'),
    makeTraffic('r2', { hits_24h: 121000, p95_latency_ms: 112, upstream: { reachable: false, latency_ms: 0 } }),
    makeTraffic('r3', { hits_24h: 1200000, p95_latency_ms: null }),
    makeTraffic('r4', { upstream: null })
  ]
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes', component: List as any },
      { path: '/v2/debug', component: stub },
      { path: '/v2/publish/:id', component: stub },
      { path: '/v2/routes/canvas/:id', component: stub }
    ]
  })
  await router.push('/v2/routes')
  await router.isReady()
  const wrapper = mount(List, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const row = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="route-row-${id}"]`)
const cell = (w: VueWrapper<any>, id: string, name: string) => w.find(`[data-testid="route-row-${id}"] [data-testid="${name}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'copy-1' })
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.fetchRouteTimeseries.mockReset().mockResolvedValue({
    source: 'prometheus',
    data_points: [
      { timestamp: '2026-11-04T00:00:00Z', total_requests: 10, error_count: 0, error_rate: 0 },
      { timestamp: '2026-11-04T01:00:00Z', total_requests: 20, error_count: 1, error_rate: 0.05 },
      { timestamp: '2026-11-04T02:00:00Z', total_requests: 30, error_count: 0, error_rate: 0 }
    ]
  })
  mocks.canEdit.mockReturnValue(true)
})

const KEYS = ['create', 'statusPublished', 'statusDraft', 'statusOffline', 'statusChanging', 'upstreamUnreachable',
  'flowMatch', 'pluginCount', 'decisionTree', 'healthOk', 'healthBad', 'healthUnknown', 'snapshotFallback',
  'trafficLoadFailed', 'empty', 'cardUpstream', 'cardPlugins', 'cardActions', 'actDebug', 'actCanvas', 'actPublish', 'actCopy']
  .map((k) => `v2.routes.${k}`)

describe('v2 routes/List — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 routes/List — 合并渲染（tree + traffic-summary）', () => {
  it('渲染行并按 route_id 合并流量：名称/路径 chip/状态徽章/命中/P95/健康 + 新建按钮', async () => {
    const { wrapper } = await factory()
    expect(row(wrapper, 'r1').exists()).toBe(true)
    expect(row(wrapper, 'r1').text()).toContain('user_service')
    expect(cell(wrapper, 'r1', 'route-path').text()).toContain('/api/r1/**')
    expect(cell(wrapper, 'r1', 'route-status').text()).toContain(t('v2.routes.statusPublished'))
    expect(cell(wrapper, 'r1', 'route-hits').text()).toContain('312k')
    expect(cell(wrapper, 'r1', 'route-p95').text()).toMatch(/31\s*ms/)
    expect(cell(wrapper, 'r1', 'route-health').text()).toContain(t('v2.routes.healthOk'))
    expect(cell(wrapper, 'r1', 'route-flow').text()).toContain('10.0.0.11:9001')
    expect(wrapper.find('[data-testid="route-create"]').exists()).toBe(true)
  })

  it('行内链路 chips：匹配 → 「4 插件」→ 上游 host（3 段 flow-chip）', async () => {
    const { wrapper } = await factory()
    const chips = cell(wrapper, 'r1', 'route-flow').findAll('[data-testid="flow-chip"]')
    expect(chips.length).toBe(3)
    expect(chips[0].text()).toContain(t('v2.routes.flowMatch'))
    expect(chips[1].text()).toContain(String(dig(zhCN, 'v2.routes.pluginCount')).replace('{n}', '4'))
    expect(chips[2].text()).toContain('10.0.0.11:9001')
  })

  it('命中千分位缩写 1.2M；tree 有行但 summary 无数据 → 流量列显示 —（行仍渲染）', async () => {
    const { wrapper } = await factory()
    expect(cell(wrapper, 'r3', 'route-hits').text()).toContain('1.2M')
    expect(row(wrapper, 'r5').exists()).toBe(true)
    expect(cell(wrapper, 'r5', 'route-hits').text()).toContain('—')
    expect(cell(wrapper, 'r5', 'route-p95').text()).toContain('—')
  })

  it('上游不可达 → 状态徽章「上游不可达」+ 健康列「不可达」', async () => {
    const { wrapper } = await factory()
    expect(cell(wrapper, 'r2', 'route-status').text()).toContain(t('v2.routes.upstreamUnreachable'))
    expect(cell(wrapper, 'r2', 'route-health').text()).toContain(t('v2.routes.healthBad'))
  })

  it('DRAFT → 草稿；traffic.upstream 为 null → 健康列「未知」', async () => {
    const { wrapper } = await factory()
    expect(cell(wrapper, 'r4', 'route-status').text()).toContain(t('v2.routes.statusDraft'))
    expect(cell(wrapper, 'r4', 'route-health').text()).toContain(t('v2.routes.healthUnknown'))
  })

  it('分发路由（route_type=DISPATCH）显示「决策树」chip 而非插件数', async () => {
    const { wrapper } = await factory()
    const flow = cell(wrapper, 'r3', 'route-flow')
    expect(flow.text()).toContain(t('v2.routes.decisionTree'))
    expect(flow.text()).not.toContain(String(dig(zhCN, 'v2.routes.pluginCount')).replace('{n}', '').trim())
    expect(flow.findAll('[data-testid="flow-chip"]').length).toBe(3)
  })
})

describe('v2 routes/List — 快照兜底提示条', () => {
  it('source=snapshot 且 quantile_fallback=true → 页面顶部出现 summary-source-hint', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue([makeTraffic('r1', { source: 'snapshot', quantile_fallback: true })])
    const { wrapper } = await factory()
    const hint = wrapper.find('[data-testid="summary-source-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.routes.snapshotFallback'))
  })

  it('source=prometheus 且 quantile_fallback=false → 不出现提示条', async () => {
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="summary-source-hint"]').exists()).toBe(false)
  })
})

describe('v2 routes/List — 展开行懒加载与三卡片', () => {
  it('展开 r1：fetchRouteTimeseries(r1, 24h, 1h) 仅对展开行调用一次，spark 容器出现', async () => {
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="route-detail-r1"]').exists()).toBe(false)
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledWith('r1', '24h', '1h')
    expect(wrapper.find('[data-testid="route-detail-r1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="route-spark-r1"]').exists()).toBe(true)
    expect(mocks.fetchRouteTimeseries.mock.calls.some((c) => c[0] === 'r2')).toBe(false)
  })

  it('收起（detail 消失）再展开不重复请求（按行缓存）', async () => {
    const { wrapper } = await factory()
    const toggle = () => wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await toggle(); await flushPromises()
    await toggle(); await flushPromises()
    expect(wrapper.find('[data-testid="route-detail-r1"]').exists()).toBe(false)
    await toggle(); await flushPromises()
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="route-spark-r1"]').exists()).toBe(true)
  })

  it('展开行三卡片：上游健康 / 插件链（tree 数据 plugins）/ 快捷操作', async () => {
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    const detail = wrapper.find('[data-testid="route-detail-r1"]')
    expect(detail.find('[data-testid="card-upstream"]').text()).toContain(t('v2.routes.cardUpstream'))
    const pluginsCard = detail.find('[data-testid="card-plugins"]')
    expect(pluginsCard.text()).toContain(t('v2.routes.cardPlugins'))
    expect(pluginsCard.text()).toContain('签名校验')
    expect(detail.find('[data-testid="card-actions"]').text()).toContain(t('v2.routes.cardActions'))
  })
})

describe('v2 routes/List — 快捷动作', () => {
  it('调试→/v2/debug、编辑画布→/v2/routes/canvas/r1、发布→/v2/publish/r1', async () => {
    const { wrapper, router } = await factory()
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="act-debug"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/debug')
    await wrapper.find('[data-testid="act-canvas"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes/canvas/r1')
    await wrapper.find('[data-testid="act-publish"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/publish/r1')
  })

  it('复制配置 → duplicateRoute(r1)', async () => {
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="act-copy"]').trigger('click')
    await flushPromises()
    expect(mocks.duplicateRoute).toHaveBeenCalledWith('r1')
  })
})

describe('v2 routes/List — 权限', () => {
  it('canEdit(route)=false → 新建按钮不渲染', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="route-create"]').exists()).toBe(false)
  })
})

describe('v2 routes/List — 空态与加载失败态', () => {
  it('listRoutes 为空 → route-empty 空态', async () => {
    mocks.listRoutes.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="route-empty"]').exists()).toBe(true)
  })

  it('traffic-summary 失败：页面不崩、错误条出现、路由行仍渲染、流量列显示 —', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    const { wrapper } = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="traffic-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="traffic-error"]').text()).toContain(t('v2.routes.trafficLoadFailed'))
    expect(row(wrapper, 'r1').exists()).toBe(true)
    expect(cell(wrapper, 'r1', 'route-hits').text()).toContain('—')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// P4f 前置票① — 路由「下线」「删除」v2 UI 入口（RED：实现未写，本段用例应先红）
// 契约 §4.5 P4e 行收官段缺口票。语义照旧树 src/views/routes/List.vue：
//   下线（L363-374）：canEdit('route') → confirm({ title: confirmOffline, variant: danger })
//     → offlineRoute(id) → toast.success(offlineSuccess) → reload()
//   删除（L375-385 + L490-495）：canEdit('route') → confirm({ title, content })
//     → deleteRoute(id) → toast.success(deleteSuccess) → reload()；删除确认升 danger
//     （plugins v2 List.test.ts T 裁决先例）
//   状态门禁（旧页 L452-460 + 后端 RouteService L318/L372）：
//     act-offline 仅 PUBLISHED（后端仅 PUBLISHED 可下线，CHANGING 放弃变更后端必拒，不迁）
//     act-delete 仅 DRAFT | OFFLINE（后端 PUBLISHED 拒删「请先下线」）
//   落点：仅 v2 List 展开区 card-actions（旧树无 routes Detail.vue → Detail 不加，保持等价）
// ═══════════════════════════════════════════════════════════════════════════

const OFFLINE_DELETE_KEYS = ['actOffline', 'actDelete', 'confirmOffline', 'confirmDeleteTitle', 'confirmDelete',
  'offlineSuccess', 'deleteSuccess', 'offlineFailed', 'deleteFailed'].map((k) => `v2.routes.${k}`)

// 只增不改：第二个文件级 beforeEach 仅重置本票新增 mock，既有用例不感知
beforeEach(() => {
  mocks.offlineRoute.mockReset().mockResolvedValue({ status: 'OFFLINE' })
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.toast.warning.mockReset()
  mocks.toast.info.mockReset()
})

describe('P4f① 下线/删除 — i18n key 双语存在（铁律 6）', () => {
  it.each(OFFLINE_DELETE_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('P4f① 下线/删除 — 渲染与状态门禁', () => {
  it('门禁矩阵：PUBLISHED 显下线隐删除；DRAFT/OFFLINE 显删除隐下线；CHANGING 两钮均无', async () => {
    mocks.listRoutes.mockResolvedValue([
      makeNode('p1', { route_name: 'pub_svc', status: 'PUBLISHED' }),
      makeNode('d1', { route_name: 'draft_svc', status: 'DRAFT' }),
      makeNode('o1', { route_name: 'off_svc', status: 'OFFLINE' }),
      makeNode('c1', { route_name: 'chg_svc', status: 'CHANGING' })
    ])
    const { wrapper } = await factory()
    for (const id of ['p1', 'd1', 'o1', 'c1']) {
      await wrapper.find(`[data-testid="route-expand-${id}"]`).trigger('click')
      await flushPromises()
    }
    expect(cell(wrapper, 'p1', 'act-offline').exists(), 'PUBLISHED 应显下线').toBe(true)
    expect(cell(wrapper, 'p1', 'act-delete').exists(), 'PUBLISHED 应隐删除（后端拒删）').toBe(false)
    expect(cell(wrapper, 'd1', 'act-delete').exists(), 'DRAFT 应显删除').toBe(true)
    expect(cell(wrapper, 'd1', 'act-offline').exists(), 'DRAFT 应隐下线').toBe(false)
    expect(cell(wrapper, 'o1', 'act-delete').exists(), 'OFFLINE 应显删除').toBe(true)
    expect(cell(wrapper, 'o1', 'act-offline').exists(), 'OFFLINE 应隐下线').toBe(false)
    expect(cell(wrapper, 'c1', 'act-offline').exists(), 'CHANGING 不迁放弃变更（后端仅 PUBLISHED 可下线）').toBe(false)
    expect(cell(wrapper, 'c1', 'act-delete').exists(), 'CHANGING 应隐删除').toBe(false)
  })

  it('canEdit(route)=false → 下线/删除两钮均不渲染（写操作门禁照旧页）', async () => {
    mocks.canEdit.mockReturnValue(false)
    mocks.listRoutes.mockResolvedValue([
      makeNode('p1', { route_name: 'pub_svc', status: 'PUBLISHED' }),
      makeNode('d1', { route_name: 'draft_svc', status: 'DRAFT' })
    ])
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-p1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="route-expand-d1"]').trigger('click')
    await flushPromises()
    // 展开区健康校验：只读钮仍在（证明展开与断言通道有效），写钮被 canEdit 隐藏
    expect(cell(wrapper, 'p1', 'act-detail').exists()).toBe(true)
    expect(cell(wrapper, 'd1', 'act-detail').exists()).toBe(true)
    expect(cell(wrapper, 'p1', 'act-offline').exists()).toBe(false)
    expect(cell(wrapper, 'd1', 'act-delete').exists()).toBe(false)
  })
})

describe('P4f① 下线 — confirm(danger) → offlineRoute → toast + 重拉', () => {
  it('成功链：confirm({ variant:danger, title:confirmOffline }) → offlineRoute(id) → toast.success(offlineSuccess) → reload', async () => {
    const { wrapper } = await factory()
    const before = mocks.listRoutes.mock.calls.length
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    await cell(wrapper, 'r1', 'act-offline').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.routes.confirmOffline'))
    }))
    expect(mocks.offlineRoute).toHaveBeenCalledTimes(1)
    expect(mocks.offlineRoute).toHaveBeenCalledWith('r1')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.routes.offlineSuccess'))
    expect(mocks.listRoutes.mock.calls.length, '成功后应重拉列表').toBeGreaterThan(before)
  })

  it('confirm=false → 不发 offlineRoute 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    const before = mocks.listRoutes.mock.calls.length
    await cell(wrapper, 'r1', 'act-offline').trigger('click')
    await flushPromises()
    expect(mocks.offlineRoute).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length).toBe(before)
  })

  it('offlineRoute 失败 → toast.error(报错文案) + 不重拉（状态不翻转）', async () => {
    mocks.offlineRoute.mockRejectedValue(new Error('仅 PUBLISHED 状态可下线'))
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r1"]').trigger('click')
    await flushPromises()
    const before = mocks.listRoutes.mock.calls.length
    await cell(wrapper, 'r1', 'act-offline').trigger('click')
    await flushPromises()
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('仅 PUBLISHED'))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length).toBe(before)
  })
})

// LOW-4 改写（T 步裁决）：单条删除不再即时——confirm 后行乐观消失并进入 5s 撤销窗口，
// 超时才真调 deleteRoute（成功静默重拉 / 失败回滚）。本文件真实计时器，故两用例局部 useFakeTimers
// 推进 5s 窗口（finally 归还 real，避免污染同文件其他用例；List.undo.test.ts 为主全量表）。
describe('P4f① 删除（LOW-4 undo 窗口语义）— confirm → 乐观移除 → 超时真删 / 失败回滚', () => {
  it('成功链：confirm({ variant:danger, title:confirmDeleteTitle, content:confirmDelete }) → 行乐观消失 + deleteRoute 零调用 + undo 条目出现 → 5s 超时 → deleteRoute 恰一次 → 重拉 + 行消失（静默，不补 toast.success）', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      await wrapper.find('[data-testid="route-expand-r4"]').trigger('click')
      await flushPromises()
      const before = mocks.listRoutes.mock.calls.length
      mocks.listRoutes.mockResolvedValue(defaultNodes().filter((n) => n.id !== 'r4'))
      await cell(wrapper, 'r4', 'act-delete').trigger('click')
      await flushPromises()
      expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
        variant: 'danger',
        title: expect.stringContaining(t('v2.routes.confirmDeleteTitle')),
        content: expect.stringContaining(t('v2.routes.confirmDelete'))
      }))
      // 窗口期：零 API（不真删、不重拉）+ 行乐观消失 + undo 条目出现 + 不提前报成功
      expect(mocks.deleteRoute, 'undo 窗口内不得真调 deleteRoute').not.toHaveBeenCalled()
      expect(mocks.listRoutes.mock.calls.length, '乐观移除不得重拉列表').toBe(before)
      expect(row(wrapper, 'r4').exists(), '确认后行应乐观消失').toBe(false)
      expect(one(wrapper, 'del-undo-r4').exists(), 'undo 条目应出现').toBe(true)
      expect(mocks.toast.success, '窗口期不提前报「已删除」').not.toHaveBeenCalled()
      // 超时：真删恰一次 → 重拉恰一次 → 行消失 + 条目退场（静默收尾，裁决④）
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(mocks.deleteRoute, '超时后应真删').toHaveBeenCalledTimes(1)
      expect(mocks.deleteRoute).toHaveBeenCalledWith('r4')
      expect(mocks.listRoutes.mock.calls.length, '超时完成应重拉恰一次').toBe(before + 1)
      expect(row(wrapper, 'r4').exists(), '重拉后行应消失').toBe(false)
      expect(one(wrapper, 'del-undo-r4').exists(), '完成后 undo 条目应退场').toBe(false)
      expect(mocks.toast.success, '超时完成静默（undo 条目即通知，不重复播报）').not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('confirm=false → 不发 deleteRoute 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r4"]').trigger('click')
    await flushPromises()
    const before = mocks.listRoutes.mock.calls.length
    await cell(wrapper, 'r4', 'act-delete').trigger('click')
    await flushPromises()
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length).toBe(before)
  })

  it('超时失败 → 回滚：toast.error(后端原因) + 行恢复原位 + 不重拉 + 条目退场', async () => {
    mocks.deleteRoute.mockRejectedValue(new Error('已发布路由不可删除，请先下线'))
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      await wrapper.find('[data-testid="route-expand-r4"]').trigger('click')
      await flushPromises()
      const before = mocks.listRoutes.mock.calls.length
      await cell(wrapper, 'r4', 'act-delete').trigger('click')
      await flushPromises()
      expect(row(wrapper, 'r4').exists(), '确认后行应先乐观消失').toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(mocks.deleteRoute).toHaveBeenCalledTimes(1)
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('请先下线'))
      expect(mocks.toast.success).not.toHaveBeenCalled()
      expect(row(wrapper, 'r4').exists(), '删除失败必须回滚行（原位）').toBe(true)
      expect(mocks.listRoutes.mock.calls.length, '失败不重拉').toBe(before)
      expect(one(wrapper, 'del-undo-r4').exists(), '终态落定后条目应退场').toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('P4f① 源码契约 — List.vue fs 抽查（testid + 门禁字面量，Detail.test.ts 先例）', () => {
  const source = () => fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')

  it('card-actions 含 act-offline / act-delete 两钮，门禁字面量照旧页口径', () => {
    const src = source()
    expect(src).toContain('data-testid="act-offline"')
    expect(src).toContain('data-testid="act-delete"')
    expect(src).toContain("'PUBLISHED'")
    expect(src).toMatch(/DRAFT[\s\S]{0,40}OFFLINE|OFFLINE[\s\S]{0,40}DRAFT/)
    expect(src).toContain('offlineRoute')
    expect(src).toContain('deleteRoute')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// OPT-3 — 路由列表批量操作（v2 优化建议 #2，对标 APISIX；docs/ui-v2/gateway4j-v2优化.md §三-2）
//
// P3-d【契约演进·本段头注】：批量执行从「客户端逐条循环单条端点」切换为「后端 bulk 端点单请求」。
//   背景：OPT-3 实装时后端 bulk 端点已存在（bulkPublishRoutes / bulkOfflineRoutes /
//   bulkDeleteRoutes → POST /v1/routes/bulk-publish|bulk-offline|bulk-delete，返回
//   BulkResult{ succeeded: [{id}], failed: [{id, reason}] }，见 src/api/routes.ts），但按
//   「客户端逐条循环保真逐条进度」裁决未接（当时实现注释：bulk* 为 P3 未来切换候选）。
//   P3-d 主 agent 已裁决演进：改走 bulk 端点——单请求、服务端门禁、部分失败明细原生支持；
//   代价 = 真进度随请求粒度退化（bulk 单请求无逐条 done/total）→ 进度呈现改为「执行中…」
//   busy 态，{done}/{total} 文案退役（batProgress 文案改动属 C 步 i18n；本文件只钉
//   「bat-progress 渲染于执行中、完成后退场」的 busy 契约，不断言进度数字）。
//
// 语义契约（P3-d 演进版，C 按此实现）：
//   选择列（不变）：原生 <input type=checkbox>（ImportExport.vue imp-row-check 先例，testid 落原生元素）：
//     sel-all —— 表头全选。checked=可见行全选；indeterminate=部分选中；
//       change 勾 → 仅把「可见行」并入选择集（筛选外已选保留，merge 语义）；取消勾反向。
//     sel-row-<id> —— 行勾选。aria-label=route_name；CHANGING 行禁选（三动作全不适用）。
//   批量条 bat-bar（选中 ≥1 渲染，不变）：bat-count（已选 {n} 项）/ bat-offline / bat-delete /
//     bat-publish / bat-clear。
//   门禁呈现（不变）：按钮级 disabled（下线=含 ≥1 PUBLISHED；删除/发布=含 ≥1 DRAFT|OFFLINE）
//     + 混合态 bat-hint-<action>「{n} 项不可…」前端预估计数原样保留。
//   门禁执行（P3-d 行为变化点）：前端【不再】静默预过滤——ids = 选中集按行序全量交服务端，
//     服务端门禁拒绝项经 BulkResult.failed[{id,reason}] 进失败明细（原「跳过项不计失败」退役）；
//     confirm {n} 口径随之 = 选中数（请求全量口径，与「选中的 {n} 条」文案一致）。
//   执行（bulk 单请求）：fcConfirm({ variant:'danger', title:…{n=选中数} })
//     → bulkXxx(ids) 恰一次（无逐条循环、无并发重复）
//     → bat-progress busy 态（渲染于执行中 / 完成后退场）+ 执行中三钮 disabled（防重复点击）
//     → 收尾矩阵（数据源从逐条 catch → BulkResult，语义不变）：
//       全部成功（failed 空）→ toast.success(已 {n=|succeeded|} 条) + 重拉一次 + 清空选择；
//       部分失败 → toast.warning({ok=|succeeded|} 成 {fail=|failed|} 败) + bat-fail-detail
//         （页根级，保留到下次批量启动）逐项 bat-fail-<id>（route_name + 服务端 reason）
//         + 重拉一次 + 清空选择；
//       全部失败 → toast.error(bat*Failed) + 不重拉 + 保留选择（便于修正后重试）；
//       请求级失败（envelope code≠0 / 网络）→ toast.error(后端消息) + 不重拉 + 保留选择
//         + 无明细行（明细只收 BulkResult.failed；batchRunning 需 finally 复位，bat-progress 退场）。
//       confirm 取消 → bulk 零调用、不重拉、选择保留。
//   单条同步（不变）：既有 act-delete/act-offline 成功重拉后，选择集剔除已消失 id（幽灵计数防护）。
// DOM 契约（testid 全表，P3-d 零新增零删除）：sel-all / sel-row-<id> / bat-bar / bat-count /
//   bat-offline / bat-delete / bat-publish / bat-clear / bat-progress / bat-hint-offline /
//   bat-hint-delete / bat-hint-publish / bat-fail-detail / bat-fail-<id>
// i18n（v2.routes.* 树，双语铁律 6）：key 全表不变（selectAll batSelected batOffline batDelete
//   batPublish batClear batProgress batHintOffline batHintDelete batHintPublish batOfflineConfirm
//   batDeleteConfirm batPublishConfirm batOfflineSuccess batDeleteSuccess batPublishSuccess
//   batPartial batFailTitle batOfflineFailed batDeleteFailed batPublishFailed）；
//   C 步唯一文案变更 = batProgress：zh '执行中 {done}/{total}' → '执行中…' /
//   en 'Running {done}/{total}' → 'Running…'。
// RED 预期：本段执行类用例 + fs 抽查红（bulk 接线未实现，List.vue 仍为客户端逐条循环）；
//   选择态 / 门禁矩阵呈现 / i18n 存在性 / 文件其余用例零波及全绿。
// ═══════════════════════════════════════════════════════════════════════════

const BATCH_KEYS = ['selectAll', 'batSelected', 'batOffline', 'batDelete', 'batPublish', 'batClear',
  'batProgress', 'batHintOffline', 'batHintDelete', 'batHintPublish', 'batOfflineConfirm',
  'batDeleteConfirm', 'batPublishConfirm', 'batOfflineSuccess', 'batDeleteSuccess',
  'batPublishSuccess', 'batPartial', 'batFailTitle', 'batOfflineFailed', 'batDeleteFailed',
  'batPublishFailed'].map((k) => `v2.routes.${k}`)

// 只增不改：第三个文件级 beforeEach 仅重置本票新增面，既有用例不感知（P4f① 先例）
beforeEach(() => {
  mocks.publishRoute.mockReset().mockResolvedValue({ id: 'ok' })
  // P3-d：bulk 三函数默认「回显全部入参 ids 为 succeeded」（等价旧逐条全成默认），
  // 用例按场景用 mockResolvedValue / mockImplementationOnce 覆盖部分失败 / 全败 / pending
  const bulkEcho = (ids: string[]): BulkResult => ({ succeeded: ids.map((id) => ({ id })), failed: [] })
  mocks.bulkPublishRoutes.mockReset().mockImplementation(bulkEcho)
  mocks.bulkOfflineRoutes.mockReset().mockImplementation(bulkEcho)
  mocks.bulkDeleteRoutes.mockReset().mockImplementation(bulkEcho)
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.toast.warning.mockReset()
  mocks.toast.info.mockReset()
})

/** 参数化 i18n 取值（{n}/{ok}/{fail} 占位替换；仅本段测试用。P3-d：{done}/{total} 已退役） */
function tf(key: string, params: Record<string, string | number>): string {
  let s = String(dig(zhCN, `v2.routes.${key}`))
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** 批量门禁矩阵夹具：两 PUBLISHED + 两 DRAFT + 一 OFFLINE + 一 CHANGING */
function batchNodes() {
  return [
    makeNode('p1', { route_name: 'pub_one', status: 'PUBLISHED' }),
    makeNode('p2', { route_name: 'pub_two', status: 'PUBLISHED' }),
    makeNode('d1', { route_name: 'draft_one', status: 'DRAFT' }),
    makeNode('d2', { route_name: 'draft_two', status: 'DRAFT' }),
    makeNode('o1', { route_name: 'off_one', status: 'OFFLINE' }),
    makeNode('c1', { route_name: 'chg_one', status: 'CHANGING' })
  ]
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
const rowCbx = (w: VueWrapper<any>, id: string) => one(w, `sel-row-${id}`)
/** 原生 checkbox 选中读数（ImportExport checkOf 先例：testid 落原生元素，element 直读 checked） */
const isChecked = (w: VueWrapper<any>, id: string) => (rowCbx(w, id).element as HTMLInputElement).checked
/** 手写 deferred：卡住 bulk 单请求，断言 busy/防重（P3-d：resolve 值 = BulkResult），resolve 后走完 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
/** statusFilter 分段钮（页面无 testid，按文案定位——Users.test.ts needSeg 同款） */
async function pickStatus(w: VueWrapper<any>, label: string) {
  const btn = w.findAll('.fc-segmented__item').find((b) => b.text().includes(label))
  expect(btn, `状态分段缺少选项「${label}」`).toBeDefined()
  await btn!.trigger('click')
}
const batchSource = () => fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')

describe('OPT-3 批量操作 — i18n key 双语存在（铁律 6）', () => {
  it.each(BATCH_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('OPT-3 选择态 — 选择列与全选', () => {
  it('初始：sel-all 未勾选、六行 checkbox 全渲染（含禁选的 c1）、bat-bar 不渲染', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    expect(one(wrapper, 'sel-all').exists()).toBe(true)
    expect((one(wrapper, 'sel-all').element as HTMLInputElement).checked).toBe(false)
    for (const id of ['p1', 'p2', 'd1', 'd2', 'o1', 'c1']) {
      expect(rowCbx(wrapper, id).exists(), `行 ${id} 应有选择框`).toBe(true)
    }
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('勾一行 → bat-bar 出现 + bat-count 计数 + sel-all 半选（indeterminate）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    expect(one(wrapper, 'bat-bar').exists()).toBe(true)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 1 }))
    const all = one(wrapper, 'sel-all').element as HTMLInputElement
    expect(all.checked).toBe(false)
    expect(all.indeterminate, '1/6 选中应为半选').toBe(true)
  })

  it('全选 → 非 CHANGING 全勾（c1 不入选）+ count 5 + sel-all 全选态非半选', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await one(wrapper, 'sel-all').setValue(true)
    for (const id of ['p1', 'p2', 'd1', 'd2', 'o1']) {
      expect(isChecked(wrapper, id), `全选应勾中 ${id}`).toBe(true)
    }
    expect(isChecked(wrapper, 'c1')).toBe(false)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 5 }))
    const all = one(wrapper, 'sel-all').element as HTMLInputElement
    expect(all.checked).toBe(true)
    expect(all.indeterminate).toBe(false)
  })

  it('全选后再取消全选 → 全不勾 + bat-bar 退场', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await one(wrapper, 'sel-all').setValue(true)
    await one(wrapper, 'sel-all').setValue(false)
    for (const id of ['p1', 'p2', 'd1', 'd2', 'o1']) {
      expect(isChecked(wrapper, id), `取消全选应清掉 ${id}`).toBe(false)
    }
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('筛选下 sel-all 仅作用可见行（merge 语义）：DRAFT 视图全选只入 d1/d2，切回 ALL 已选保留', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await pickStatus(wrapper, t('v2.routes.statusDraft'))
    await one(wrapper, 'sel-all').setValue(true)
    expect(isChecked(wrapper, 'd1')).toBe(true)
    expect(isChecked(wrapper, 'd2')).toBe(true)
    expect(isChecked(wrapper, 'p1'), '筛选外 PUBLISHED 不应被波及').toBe(false)
    await pickStatus(wrapper, t('v2.routes.filterAll'))
    expect(isChecked(wrapper, 'd1')).toBe(true)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 2 }))
  })

  it('展开/收起与 keyword 筛选不丢已选（页面无分页，选择集跨视图存活）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await wrapper.find('[data-testid="route-expand-p1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="route-expand-p1"]').trigger('click')
    await flushPromises()
    expect(isChecked(wrapper, 'p1')).toBe(true)
    expect(one(wrapper, 'bat-bar').exists()).toBe(true)
    const kw = wrapper.find(`input[aria-label="${t('v2.routes.searchPlaceholder')}"]`)
    await kw.setValue('zzz-no-match')
    expect(rowCbx(wrapper, 'p1').exists(), '行应被筛没').toBe(false)
    expect(one(wrapper, 'bat-count').text(), '行消失但已选保留').toContain(tf('batSelected', { n: 1 }))
    await kw.setValue('')
    expect(isChecked(wrapper, 'p1')).toBe(true)
  })

  it('点击行 checkbox 不触发行展开（onRowClick 的 input 守卫）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').trigger('click')
    await flushPromises()
    expect(isChecked(wrapper, 'p1')).toBe(true)
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists()).toBe(false)
  })

  it('单条删除已选行后同步剔除：选 p1+d1 → act-delete 删 d1 → 重拉后 count=1（幽灵计数防护）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 2 }))
    await wrapper.find('[data-testid="route-expand-d1"]').trigger('click')
    await flushPromises()
    mocks.listRoutes.mockResolvedValue(batchNodes().filter((n) => n.id !== 'd1'))
    await cell(wrapper, 'd1', 'act-delete').trigger('click')
    await flushPromises()
    expect(rowCbx(wrapper, 'd1').exists(), 'd1 行应已消失').toBe(false)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 1 }))
    expect(isChecked(wrapper, 'p1')).toBe(true)
  })
})

describe('OPT-3 批量条 — 门禁矩阵与呈现', () => {
  beforeEach(() => {
    mocks.listRoutes.mockReset().mockResolvedValue(batchNodes())
  })

  it('全 PUBLISHED（p1+p2）：下线可用；删除/发布禁用；enabled 钮无不可操作提示', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'p2').setValue(true)
    expect(one(wrapper, 'bat-offline').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-delete').attributes('disabled'), '全 PUBLISHED 删除应禁用').toBeDefined()
    expect(one(wrapper, 'bat-publish').attributes('disabled')).toBeDefined()
    expect(one(wrapper, 'bat-hint-offline').exists()).toBe(false)
    expect(one(wrapper, 'bat-hint-delete').exists()).toBe(false)
  })

  it('全 DRAFT|OFFLINE（d1+d2+o1）：删除/发布可用；下线禁用', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    await rowCbx(wrapper, 'o1').setValue(true)
    expect(one(wrapper, 'bat-delete').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-publish').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-offline').attributes('disabled'), '无可下线项应禁用').toBeDefined()
  })

  it('仅 OFFLINE（o1）也满足删除/发布门禁（OFFLINE ∈ DRAFT|OFFLINE）', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'o1').setValue(true)
    expect(one(wrapper, 'bat-delete').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-publish').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-offline').attributes('disabled')).toBeDefined()
  })

  it('混合（p1+d1）：三钮全可用 + 三个不可操作提示各计 1', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    expect(one(wrapper, 'bat-offline').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-delete').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-publish').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'bat-hint-offline').text()).toContain(tf('batHintOffline', { n: 1 }))
    expect(one(wrapper, 'bat-hint-delete').text()).toContain(tf('batHintDelete', { n: 1 }))
    expect(one(wrapper, 'bat-hint-publish').text()).toContain(tf('batHintPublish', { n: 1 }))
  })

  it('CHANGING 行 checkbox disabled 且点击不入选（三动作均不适用）', async () => {
    const { wrapper } = await factory()
    const c = one(wrapper, 'sel-row-c1')
    expect(c.attributes('disabled'), 'CHANGING 应禁选').toBeDefined()
    await c.trigger('click')
    expect(isChecked(wrapper, 'c1')).toBe(false)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('bat-clear 清空选择 → checkbox 复位 + bat-bar 退场', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    await one(wrapper, 'bat-clear').trigger('click')
    expect(isChecked(wrapper, 'p1')).toBe(false)
    expect(isChecked(wrapper, 'd1')).toBe(false)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('无障碍：sel-all aria-label=selectAll 文案；行 checkbox aria-label=route_name', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'sel-all').attributes('aria-label')).toBe(t('v2.routes.selectAll'))
    expect(rowCbx(wrapper, 'd1').attributes('aria-label')).toBe('draft_one')
  })
})

describe('OPT-3 批量删除 — confirm → bulkDeleteRoutes 单请求 → busy/明细/收尾', () => {
  beforeEach(() => {
    mocks.listRoutes.mockReset().mockResolvedValue(batchNodes())
  })

  it('成功链：confirm(danger,{n=选中数}) → bulkDeleteRoutes 恰一次（ids=[d1,d2] 按行序）→ toast.success(已删 2) → 重拉 + 清空选择', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(tf('batDeleteConfirm', { n: 2 }))
    }))
    expect(mocks.bulkDeleteRoutes, 'bulk 单请求：恰一次调用').toHaveBeenCalledTimes(1)
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['d1', 'd2'])
    expect(mocks.deleteRoute, '批量不再走单条端点（单条留给 undo/行内操作）').not.toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith(tf('batDeleteSuccess', { n: 2 }))
    expect(mocks.listRoutes.mock.calls.length, '完成后应重拉一次').toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists(), '完成后清空选择').toBe(false)
    expect(one(wrapper, 'bat-progress').exists()).toBe(false)
    expect(one(wrapper, 'bat-fail-detail').exists()).toBe(false)
  })

  it('confirm=false → bulk 零调用、不重拉、选择保留', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.bulkDeleteRoutes).not.toHaveBeenCalled()
    expect(mocks.bulkOfflineRoutes, 'confirm 取消不得波及其它 bulk 端点').not.toHaveBeenCalled()
    expect(mocks.bulkPublishRoutes).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length).toBe(before)
    expect(one(wrapper, 'bat-bar').exists(), '取消后选择保留').toBe(true)
  })

  it('部分失败：明细改源 BulkResult.failed（d2 败）→ toast.warning(2 成 1 败) + bat-fail-d2（名称+服务端 reason）→ 重拉 + 清空', async () => {
    // P3-d：明细不再来自逐条 catch，而是 bulk 响应原生 failed[{id,reason}]
    mocks.bulkDeleteRoutes.mockResolvedValue({
      succeeded: [{ id: 'd1' }, { id: 'o1' }],
      failed: [{ id: 'd2', reason: '上游仍引用该路由' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    await rowCbx(wrapper, 'o1').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['d1', 'd2', 'o1'])
    expect(mocks.toast.warning).toHaveBeenCalledWith(tf('batPartial', { ok: 2, fail: 1 }))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(one(wrapper, 'bat-fail-detail').exists()).toBe(true)
    expect(one(wrapper, 'bat-fail-detail').text()).toContain(t('v2.routes.batFailTitle'))
    const failRow = one(wrapper, 'bat-fail-d2')
    expect(failRow.exists()).toBe(true)
    expect(failRow.text()).toContain('draft_two')
    expect(failRow.text()).toContain('上游仍引用该路由')
    expect(one(wrapper, 'bat-fail-d1').exists(), 'succeeded 项不进明细').toBe(false)
    expect(one(wrapper, 'bat-fail-o1').exists(), 'succeeded 项不进明细').toBe(false)
    expect(mocks.listRoutes.mock.calls.length, '部分成功仍重拉').toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('全部失败：BulkResult 全员 failed → toast.error(删除失败) + 不重拉 + 明细两行 + 选择保留', async () => {
    mocks.bulkDeleteRoutes.mockResolvedValue({
      succeeded: [],
      failed: [{ id: 'd1', reason: 'boom' }, { id: 'd2', reason: 'boom' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.bulkDeleteRoutes, '单请求不因 failed 明细中断').toHaveBeenCalledTimes(1)
    expect(mocks.toast.error).toHaveBeenCalledWith(t('v2.routes.batDeleteFailed'))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.toast.warning).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '全败不重拉（单条「失败不重拉」口径延伸，契约不变）').toBe(before)
    expect(one(wrapper, 'bat-fail-d1').text()).toContain('draft_one')
    expect(one(wrapper, 'bat-fail-d1').text()).toContain('boom')
    expect(one(wrapper, 'bat-fail-d2').text()).toContain('draft_two')
    expect(one(wrapper, 'bat-bar').exists(), '全败保留选择（便于修正后重试）').toBe(true)
  })

  it('busy 态与防重：bulk 请求 pending → bat-progress 渲染（busy）+ 三钮 disabled + bulk 恰一次；resolve 后退场收尾', async () => {
    // P3-d：bulk 单请求无逐条进度 → bat-progress 退化为 busy 态（渲染于执行中 / 完成后退场），
    // 不再断言 {done}/{total} 文案（batProgress 文案退役属 C 步 i18n，测试层不锁具体字样）
    const gate = deferred<BulkResult>()
    mocks.bulkDeleteRoutes.mockImplementationOnce(() => gate.promise)
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    await rowCbx(wrapper, 'o1').setValue(true)
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.bulkDeleteRoutes, 'bulk 单请求：执行中恰一次（无逐条循环 / 无重复并发）').toHaveBeenCalledTimes(1)
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['d1', 'd2', 'o1'])
    const progress = one(wrapper, 'bat-progress')
    expect(progress.exists(), '执行中 bat-progress busy 态渲染').toBe(true)
    expect(progress.attributes('role'), 'busy 态以 status 角色播报（无障碍语义不随进度退化丢失）').toBe('status')
    expect(one(wrapper, 'bat-delete').attributes('disabled'), '执行中防重复点击').toBeDefined()
    expect(one(wrapper, 'bat-publish').attributes('disabled')).toBeDefined()
    gate.resolve({ succeeded: [{ id: 'd1' }, { id: 'd2' }, { id: 'o1' }], failed: [] })
    await flushPromises()
    expect(one(wrapper, 'bat-progress').exists(), '完成后 bat-progress 退场').toBe(false)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
    expect(mocks.bulkDeleteRoutes, '整个执行周期恰一次请求').toHaveBeenCalledTimes(1)
    expect(mocks.toast.success).toHaveBeenCalledWith(tf('batDeleteSuccess', { n: 3 }))
  })

  it('服务端门禁拒绝（P3-d 行为变化点）：选 p1+d1+d2 → bulk 全量 ids → p1 经 failed 进明细（有 reason），不再前端静默跳过 → toast.warning(2 成 1 败)', async () => {
    mocks.bulkDeleteRoutes.mockResolvedValue({
      succeeded: [{ id: 'd1' }, { id: 'd2' }],
      failed: [{ id: 'p1', reason: '已发布路由不可删除，请先下线' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    // bat-hint 前端预估计数不变（呈现契约原样保留）
    expect(one(wrapper, 'bat-hint-delete').text()).toContain(tf('batHintDelete', { n: 1 }))
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    // confirm {n} = 选中数（门禁移交服务端后请求为全量口径，与「选中的 {n} 条」文案一致）
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(tf('batDeleteConfirm', { n: 3 }))
    }))
    expect(mocks.bulkDeleteRoutes, '选中全量一次交服务端（不做前端预过滤）').toHaveBeenCalledTimes(1)
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['p1', 'd1', 'd2'])
    expect(mocks.toast.warning).toHaveBeenCalledWith(tf('batPartial', { ok: 2, fail: 1 }))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    const failRow = one(wrapper, 'bat-fail-p1')
    expect(failRow.exists(), '服务端门禁拒绝项进失败明细（原「跳过不计失败」退役）').toBe(true)
    expect(failRow.text()).toContain('pub_one')
    expect(failRow.text()).toContain('请先下线')
    expect(mocks.listRoutes.mock.calls.length, '部分成功仍重拉').toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('请求级失败：bulk 整体抛错（envelope code≠0 / 网络）→ toast.error(后端消息) + 不重拉 + 选择保留 + 无明细行', async () => {
    mocks.bulkDeleteRoutes.mockRejectedValue(new Error('批量删除网关忙，请重试'))
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('批量删除网关忙'))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.toast.warning).not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '请求级失败不重拉').toBe(before)
    expect(one(wrapper, 'bat-bar').exists(), '请求级失败保留选择').toBe(true)
    expect(one(wrapper, 'bat-fail-detail').exists(), '明细只收 BulkResult.failed，请求级失败无明细行').toBe(false)
    expect(one(wrapper, 'bat-progress').exists(), '失败后 busy 态必须退场（batchRunning 需复位）').toBe(false)
  })
})

describe('OPT-3 批量下线 — confirm → bulkOfflineRoutes 单请求', () => {
  beforeEach(() => {
    mocks.listRoutes.mockReset().mockResolvedValue(batchNodes())
  })

  it('成功链：confirm(danger,{n}) → bulkOfflineRoutes 恰一次（ids=[p1,p2] 按行序）→ toast(已下线 2) → 重拉 + 清空选择', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'p2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-offline').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(tf('batOfflineConfirm', { n: 2 }))
    }))
    expect(mocks.bulkOfflineRoutes, 'bulk 单请求：恰一次调用').toHaveBeenCalledTimes(1)
    expect(mocks.bulkOfflineRoutes).toHaveBeenCalledWith(['p1', 'p2'])
    expect(mocks.offlineRoute, '批量不再走单条端点（单条留给行内操作）').not.toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith(tf('batOfflineSuccess', { n: 2 }))
    expect(mocks.listRoutes.mock.calls.length).toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('confirm=false → bulk 零调用、选择保留', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await one(wrapper, 'bat-offline').trigger('click')
    await flushPromises()
    expect(mocks.bulkOfflineRoutes).not.toHaveBeenCalled()
    expect(one(wrapper, 'bat-bar').exists()).toBe(true)
  })

  it('服务端门禁拒绝（P3-d 行为变化点）：选 p1+d1 → bulkOfflineRoutes([p1,d1]) → d1 经 failed 进明细 → toast.warning(1 成 1 败)', async () => {
    // 门禁移交服务端：非 PUBLISHED 项不再前端静默跳过，由服务端拒绝并回传 reason
    mocks.bulkOfflineRoutes.mockResolvedValue({
      succeeded: [{ id: 'p1' }],
      failed: [{ id: 'd1', reason: '仅 PUBLISHED 状态可下线' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    expect(one(wrapper, 'bat-hint-offline').text()).toContain(tf('batHintOffline', { n: 1 }))
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-offline').trigger('click')
    await flushPromises()
    expect(mocks.bulkOfflineRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.bulkOfflineRoutes).toHaveBeenCalledWith(['p1', 'd1'])
    expect(mocks.toast.warning).toHaveBeenCalledWith(tf('batPartial', { ok: 1, fail: 1 }))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    const failRow = one(wrapper, 'bat-fail-d1')
    expect(failRow.exists()).toBe(true)
    expect(failRow.text()).toContain('draft_one')
    expect(failRow.text()).toContain('仅 PUBLISHED 状态可下线')
    expect(mocks.listRoutes.mock.calls.length, '部分成功仍重拉').toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })
})

describe('OPT-3 批量发布 — confirm → bulkPublishRoutes 单请求（不传 changeDescription）', () => {
  beforeEach(() => {
    mocks.listRoutes.mockReset().mockResolvedValue(batchNodes())
  })

  it('成功链：bulkPublishRoutes 恰一次（ids=[d1,o1] 按行序、不传 changeDescription）→ toast(已发布 2) → 重拉 + 清空选择', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'o1').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-publish').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(tf('batPublishConfirm', { n: 2 }))
    }))
    expect(mocks.bulkPublishRoutes, 'bulk 单请求：恰一次调用').toHaveBeenCalledTimes(1)
    // 单参调用 = 不传 changeDescription（无 body 兼容契约原样保留）
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledWith(['d1', 'o1'])
    expect(mocks.publishRoute, '批量不再走单条端点').not.toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith(tf('batPublishSuccess', { n: 2 }))
    expect(mocks.listRoutes.mock.calls.length).toBeGreaterThan(before)
    expect(one(wrapper, 'bat-bar').exists()).toBe(false)
  })

  it('服务端门禁拒绝（P3-d 行为变化点）：选 p1+d1 → bulkPublishRoutes([p1,d1]) → p1 经 failed 进明细 → toast.warning(1 成 1 败)', async () => {
    // 混合选择不再「前端跳过 PUBLISHED」：全量交服务端，由服务端拒绝并回传 reason
    mocks.bulkPublishRoutes.mockResolvedValue({
      succeeded: [{ id: 'd1' }],
      failed: [{ id: 'p1', reason: '已发布路由不可重复发布' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'd1').setValue(true)
    // bat-hint 前端预估计数不变（呈现契约原样保留）
    expect(one(wrapper, 'bat-hint-publish').text()).toContain(tf('batHintPublish', { n: 1 }))
    await one(wrapper, 'bat-publish').trigger('click')
    await flushPromises()
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledWith(['p1', 'd1'])
    expect(mocks.toast.warning).toHaveBeenCalledWith(tf('batPartial', { ok: 1, fail: 1 }))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    const failRow = one(wrapper, 'bat-fail-p1')
    expect(failRow.exists()).toBe(true)
    expect(failRow.text()).toContain('pub_one')
    expect(failRow.text()).toContain('已发布路由不可重复发布')
  })
})

describe('OPT-3 源码契约 — List.vue fs 抽查（testid + bulk 端点接入，P4f① 先例）', () => {
  it('选择列/批量条 testid 字面量 + bulk* 三端点接入（P3-d 契约演进）+ CHANGING 禁选门禁 + 全选半选', () => {
    const src = batchSource()
    expect(src).toContain('data-testid="sel-all"')
    expect(src).toContain('sel-row-')
    expect(src).toContain('data-testid="bat-bar"')
    expect(src).toContain('data-testid="bat-count"')
    expect(src).toContain('data-testid="bat-offline"')
    expect(src).toContain('data-testid="bat-delete"')
    expect(src).toContain('data-testid="bat-publish"')
    expect(src).toContain('data-testid="bat-clear"')
    expect(src).toContain('data-testid="bat-progress"')
    expect(src).toContain('bat-fail-')
    // P3-d：批量执行接入 bulk 三端点（单请求），逐条单条端点接线退役
    //（offlineRoute/deleteRoute 仍被单条操作引用属正常，故只正断言 bulk 接入不断言单条缺席）
    expect(src).toContain('bulkPublishRoutes')
    expect(src).toContain('bulkOfflineRoutes')
    expect(src).toContain('bulkDeleteRoutes')
    expect(src).toContain("'CHANGING'")
    expect(src).toContain('indeterminate')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LOW-3 — 路由列表树形上下文（父子缩进 + 折叠组；docs/ui-v2/gateway4j-v2优化.md 低优先级 #9，对标 APISIX）
// RED：行为未实现（List.vue 真实存在、mount 成功，只是没有折叠钮/折叠态），本段应先红。
//
// 语义契约（T 步裁决固化，C 按此实现）：
//   缩进（现状锁定，勿回归）：flattenTree 平铺带 depth，行内 .rt-name 内联 padding-left
//     = depth * 16px（根 0px / 一级 16px / 二级 32px；固定像素即契约，C 可换成 token/rem，
//     但每级宽度必须保持 16px 等值且仍在 .rt-name 上可断言）。
//   折叠（本票新增）：有子代（children.length > 0，任意层级）的行渲染折叠钮
//     data-testid="tree-toggle-<id>"；无子代行不渲染。默认全部展开（现状不回归）：
//     collapsedIds 语义 = 空集即全展开。点击切换该行**整组后代**可见性
//     （嵌套组各自独立：折叠 c1 只隐藏 g1，兄弟分支与祖先不受影响；祖先链任一组折叠即隐藏）。
//     aria-expanded：展开 true / 折叠 false 翻转；aria-label 随状态翻转
//     （collapseChildren=「折叠子路由」/ expandChildren=「展开子路由」）。
//   键盘可达：折叠钮为原生 <button>（平台默认 Tab 聚焦 + Enter/Space 激活，无需显式
//     @keydown 转发——jsdom 不派发按钮 Enter 合成 click（T 步实测），故契约固化在
//     元素形态 + aria 语义，不做 keydown 行为断言）。
//   三态叠加裁决（折叠 × 状态筛选 × 选择，与 OPT-3 语义对齐）：
//     ① 可见性独立运作：状态筛选 v-show 隐藏与树折叠隐藏互不覆盖（AND 合成）——
//        折叠不解除筛选、筛选切换不解除折叠；折叠态跨筛选往返存活。
//     ② 折叠隐藏走 v-show 保挂载（与 OPT-3 状态维度同通道）：子行仍在 DOM，
//        选中读数不丢；hidden 不等于除名。
//     ③ 选择集存活：selectedIds 与可见性解耦——折叠时已选子行仍计入 bat-count
//        （bat-bar 不退场），重新展开后 checkbox 仍 checked。全选读数不在此契约内
//        （折叠组是否参与 sel-all 由 C 裁决，仅要求与 visibleRows 派生链同一出口）。
//   与 route-expand（行详情展开）严格互异：两钮并存 testid 不复用；树折叠不触发行详情
//     （onRowClick 的 button 守卫 + @click.stop），详情开合不改变子组折叠态。
// DOM 契约（新 testid 全表）：tree-toggle-<id>（唯一新增元素，落在 route-row-<id> 作用域内）
// i18n（v2.routes.* 树追加，双语铁律 6）：collapseChildren / expandChildren
// ═══════════════════════════════════════════════════════════════════════════

const TREE_KEYS = ['collapseChildren', 'expandChildren'].map((k) => `v2.routes.${k}`)

describe('LOW-3 树形折叠 — i18n key 双语存在（铁律 6）', () => {
  it.each(TREE_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

/** LOW-3 树形夹具：p1(DISPATCH, depth0) → c1(depth1) → g1(depth2) + c2(depth1, OFFLINE)；solo 无子代对照。
 *  状态混合（g1=DRAFT）专供「折叠 × 状态筛选」叠加断言；upstream_url 留空照 DISPATCH 惯例 */
function treeNodes() {
  return [
    makeNode('p1', {
      route_name: 'dispatch_root', route_type: 'DISPATCH', upstream_url: '',
      children: [
        makeNode('c1', {
          route_name: 'child_one',
          children: [makeNode('g1', { route_name: 'grand_child', status: 'DRAFT' })]
        }),
        makeNode('c2', { route_name: 'child_two', status: 'OFFLINE' })
      ]
    }),
    makeNode('solo', { route_name: 'solo_leaf' })
  ]
}

const treeToggle = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="tree-toggle-${id}"]`)
/** 行 display 内联读数（v-show 保挂载通道：'' 可见 / 'none' 隐藏；DOMWrapper.element 需显式 HTMLElement 断言，isChecked 同款；jsdom 实测口径见 T 步探针） */
const rowDisplay = (w: VueWrapper<any>, id: string) => (row(w, id).element as HTMLElement).style.display
const rowShown = (w: VueWrapper<any>, id: string) => rowDisplay(w, id) !== 'none'
const treeSource = () => fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')

describe('LOW-3 树形折叠 — 缩进与折叠钮渲染契约', () => {
  beforeEach(() => {
    mocks.listRoutes.mockResolvedValue(treeNodes())
  })

  it('子行视觉缩进（现状锁定）：.rt-name 内联 padding-left 根 0px / 一级 16px / 二级 32px', async () => {
    const { wrapper } = await factory()
    const namePad = (id: string) => (row(wrapper, id).find('.rt-name').element as HTMLElement).style.paddingLeft
    expect(namePad('p1'), '根行不缩进').toBe('0px')
    expect(namePad('c1'), '一级子行缩进 16px').toBe('16px')
    expect(namePad('c2'), '一级子行缩进 16px').toBe('16px')
    expect(namePad('g1'), '二级孙行缩进 32px').toBe('32px')
  })

  it('有子代行渲染折叠钮 tree-toggle-{id}（p1/c1）；无子代行不渲染（c2/g1/solo）', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), 'p1 有子代应有折叠钮').toBe(true)
    expect(treeToggle(wrapper, 'c1').exists(), 'c1 有孙代也应有折叠钮').toBe(true)
    expect(treeToggle(wrapper, 'c2').exists(), 'c2 叶子不应有折叠钮').toBe(false)
    expect(treeToggle(wrapper, 'g1').exists(), 'g1 叶子不应有折叠钮').toBe(false)
    expect(treeToggle(wrapper, 'solo').exists(), 'solo 无子代不应有折叠钮').toBe(false)
  })

  it('折叠钮与行详情展开钮并存且互异：同父行内 tree-toggle 与 route-expand 同时存在', async () => {
    const { wrapper } = await factory()
    const p1 = row(wrapper, 'p1')
    expect(p1.find('[data-testid="tree-toggle-p1"]').exists(), '树折叠钮（本票新增）').toBe(true)
    expect(p1.find('[data-testid="route-expand-p1"]').exists(), '行详情展开钮（既有）').toBe(true)
  })

  it('源码契约 fs 抽查：tree-toggle- 动态 testid + collapseChildren/expandChildren 接入（P4f① 先例）', () => {
    const src = treeSource()
    expect(src).toContain('tree-toggle-')
    expect(src).toContain('collapseChildren')
    expect(src).toContain('expandChildren')
    expect(src).toContain('collapsedIds')
  })
})

describe('LOW-3 树形折叠 — 默认展开与点击切换', () => {
  beforeEach(() => {
    mocks.listRoutes.mockResolvedValue(treeNodes())
  })

  it('默认全部展开（现状不回归）：子行可见 + 折叠钮 aria-expanded=true', async () => {
    const { wrapper } = await factory()
    for (const id of ['c1', 'c2', 'g1']) {
      expect(rowShown(wrapper, id), `子行 ${id} 默认应可见`).toBe(true)
    }
    expect(treeToggle(wrapper, 'p1').attributes('aria-expanded')).toBe('true')
    expect(treeToggle(wrapper, 'c1').attributes('aria-expanded')).toBe('true')
  })

  it('点击折叠：整组后代 display:none 隐藏但仍挂载（v-show 保挂载），aria-expanded 翻 false', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    for (const id of ['c1', 'c2', 'g1']) {
      const r = row(wrapper, id)
      expect(r.exists(), `子行 ${id} 仍应挂载（不卸行）`).toBe(true)
      expect((r.element as HTMLElement).style.display, `子行 ${id} 应被折叠隐藏`).toBe('none')
    }
    expect(rowShown(wrapper, 'p1'), '父行本身不隐藏').toBe(true)
    expect(treeToggle(wrapper, 'p1').attributes('aria-expanded')).toBe('false')
  })

  it('再点击展开：子行恢复可见 + aria-expanded 回 true（折叠可逆）', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    await treeToggle(wrapper, 'p1').trigger('click')
    for (const id of ['c1', 'c2', 'g1']) {
      expect(rowShown(wrapper, id), `子行 ${id} 应恢复可见`).toBe(true)
    }
    expect(treeToggle(wrapper, 'p1').attributes('aria-expanded')).toBe('true')
  })

  it('折叠只作用本组：折叠 p1 不波及同表无关节 solo', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(rowShown(wrapper, 'solo'), '无关节不应被波及').toBe(true)
    expect(rowDisplay(wrapper, 'g1')).toBe('none')
  })

  it('嵌套组独立折叠：折叠 c1 仅隐藏 g1，c2/p1 不受影响；折叠 p1 后重开，c1 折叠态独立存活', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'c1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'c1').trigger('click')
    expect(rowDisplay(wrapper, 'g1'), '孙代应随 c1 折叠').toBe('none')
    expect(rowShown(wrapper, 'c2'), '兄弟分支不受影响').toBe(true)
    expect(rowShown(wrapper, 'p1'), '父行本身不隐藏').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(rowDisplay(wrapper, 'g1'), 'c1 折叠态不受父级开合影响').toBe('none')
    expect(rowShown(wrapper, 'c2'), 'p1 重开后 c2 恢复可见').toBe(true)
  })

  it('折叠钮不触发行详情：点击后 route-detail 不挂载；折叠态下行详情仍可独立展开', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists()).toBe(false)
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists(), '树折叠不得触发行详情').toBe(false)
    expect(rowDisplay(wrapper, 'c2'), '子组应已折叠').toBe('none')
    await wrapper.find('[data-testid="route-expand-p1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists(), '折叠态下详情行仍可展开').toBe(true)
    expect(rowDisplay(wrapper, 'c2'), '详情展开不得反向解锁折叠').toBe('none')
  })

  it('详情展开态下折叠子组：详情行保留 + 子行隐藏（两套展开互不覆盖）', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await wrapper.find('[data-testid="route-expand-p1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists()).toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(wrapper.find('[data-testid="route-detail-p1"]').exists(), '详情不应被子组折叠波及').toBe(true)
    expect(rowDisplay(wrapper, 'c1'), '子行应被折叠').toBe('none')
  })
})

describe('LOW-3 树形折叠 — 折叠 × 选择（selectedIds 跨折叠存活，OPT-3 语义延伸）', () => {
  beforeEach(() => {
    mocks.listRoutes.mockResolvedValue(treeNodes())
  })

  it('折叠时已选子行仍计入 bat-count 且选择框保持挂载（隐藏不除名）', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'c2').setValue(true)
    expect(one(wrapper, 'bat-count').text()).toContain(tf('batSelected', { n: 1 }))
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(rowDisplay(wrapper, 'c2'), '已选子行应被折叠隐藏').toBe('none')
    expect(rowCbx(wrapper, 'c2').exists(), '隐藏但仍挂载（读数不丢）').toBe(true)
    expect(one(wrapper, 'bat-count').text(), '折叠不得把已选子行除名').toContain(tf('batSelected', { n: 1 }))
    expect(one(wrapper, 'bat-bar').exists(), '选择集非空批量条不退场').toBe(true)
  })

  it('重新展开后已选子行 checkbox 仍 checked（折叠往返不丢选择）', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'c2').setValue(true)
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    await treeToggle(wrapper, 'p1').trigger('click')
    expect(isChecked(wrapper, 'c2'), '折叠往返后选中读数保留').toBe(true)
  })
})

describe('LOW-3 树形折叠 — 折叠 × 状态筛选叠加（可见性独立运作）', () => {
  beforeEach(() => {
    mocks.listRoutes.mockResolvedValue(treeNodes())
  })

  it('组合：折叠 p1 后切 DRAFT —— p1/solo 被筛选隐藏，DRAFT 的 g1 仍被折叠隐藏（AND 合成）', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    await pickStatus(wrapper, t('v2.routes.statusDraft'))
    expect(rowDisplay(wrapper, 'p1'), 'PUBLISHED 父行被状态筛选隐藏').toBe('none')
    expect(rowDisplay(wrapper, 'solo'), 'PUBLISHED 无关节被状态筛选隐藏').toBe('none')
    expect(rowDisplay(wrapper, 'g1'), 'DRAFT 命中筛选但仍被折叠隐藏（两维独立）').toBe('none')
    expect(rowCbx(wrapper, 'g1').exists(), '叠加隐藏仍保挂载').toBe(true)
  })

  it('筛选切换不丢折叠态：DRAFT → ALL 往返后父行恢复可见而子行仍隐藏', async () => {
    const { wrapper } = await factory()
    expect(treeToggle(wrapper, 'p1').exists(), '折叠钮契约未实现').toBe(true)
    await treeToggle(wrapper, 'p1').trigger('click')
    await pickStatus(wrapper, t('v2.routes.statusDraft'))
    await pickStatus(wrapper, t('v2.routes.filterAll'))
    expect(rowShown(wrapper, 'p1'), '父行不受自身折叠影响应恢复').toBe(true)
    expect(rowShown(wrapper, 'solo')).toBe(true)
    for (const id of ['c1', 'c2', 'g1']) {
      expect(rowDisplay(wrapper, id), `子行 ${id} 折叠态跨筛选存活`).toBe('none')
    }
  })
})

describe('LOW-3 树形折叠 — 键盘可达与无障碍语义', () => {
  beforeEach(() => {
    mocks.listRoutes.mockResolvedValue(treeNodes())
  })

  it('折叠钮为原生 <button>（平台默认 Tab 聚焦 + Enter/Space 激活）且带 aria-expanded', async () => {
    const { wrapper } = await factory()
    const tg = treeToggle(wrapper, 'p1')
    expect(tg.exists(), '折叠钮契约未实现').toBe(true)
    // jsdom 不派发原生按钮的 Enter 合成 click（T 步实测），键盘可达性契约固化在元素形态：
    // 原生 button 即承诺用户代理默认键盘行为，无需显式 @keydown 转发（Monitor 行下钻先例仅 div 需要）
    expect(tg.element.tagName).toBe('BUTTON')
    expect(tg.attributes('tabindex')).not.toBe('-1')
    expect(tg.attributes('aria-expanded'), 'aria-expanded 必须存在（真值随状态翻转）').toBeDefined()
  })

  it('aria-label 随状态翻转：展开态=collapseChildren 文案、折叠态=expandChildren 文案', async () => {
    const { wrapper } = await factory()
    const tg = treeToggle(wrapper, 'p1')
    expect(tg.exists(), '折叠钮契约未实现').toBe(true)
    expect(tg.attributes('aria-label')).toBe(t('v2.routes.collapseChildren'))
    await tg.trigger('click')
    expect(treeToggle(wrapper, 'p1').attributes('aria-label')).toBe(t('v2.routes.expandChildren'))
  })
})
