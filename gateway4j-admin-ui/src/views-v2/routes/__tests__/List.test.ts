/**
 * S3-T：v2 路由列表页测试（对应契约 §4 S3 + 字段契约见 src/api/v2.ts；视觉参照 prototype-v2/02-route-list.html）。
 * 先红是预期：页面由 S3-C 实现（当前为 V2PagePlaceholder 占位）。
 *
 * 数据契约（S3-C 按此实现）：行集合 = listRoutes()（@/api/routes，RouteNode 树平铺）；
 *   流量列 = fetchTrafficSummary()（@/api/v2，按 route_id 合并；未命中的行流量列 —）；
 *   展开懒加载 = fetchRouteTimeseries(id,'24h','1h')（@/api/v2，按行缓存，收起再展开不重复请求）；
 *   复制配置 = duplicateRoute(id)（@/api/routes）。
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
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  duplicateRoute: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  fetchRouteTimeseries: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  duplicateRoute: mocks.duplicateRoute
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
