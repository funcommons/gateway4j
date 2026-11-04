/**
 * S6-T：v2 拓扑总览页测试（契约 docs/ui-v2/实施契约.md §4 S6 + §1 V2Overview /v2/overview monitor:read；
 * 视觉参照 prototype-v2/01-overview-topology.html 与 shots/01-overview-topology.png）。
 * 先红是预期：页面由 S6-C 实现（当前为 V2PagePlaceholder 占位）。
 *
 * ── 数据源与 mock（真实封装位置已侦察，不需要新封装）──────────────────────────
 * - fetchTrafficSummary()（@/api/v2）：KPI 聚合 + 节点 stats + 上游健康 + 待处理计数 + snapshot 提示
 * - getTopology()（@/api/misc 已有封装）：画布路由节点 + 条件连线
 * - listAuditLogs({page,pageSize})（@/api/misc 已有封装）：实时事件（前端按 created_at 倒序取 5）
 * - 明确不消费：GET /v1/monitor/routes/status（traffic-summary.upstream 已覆盖健康位，
 *   active_connections/error_rate 无 UI 承接）、getSyncStatus（网关为固定节点，单实例语义，不渲染版本/实例数）
 *
 * ── 接口形状对照表（提示词猜测 vs 后端实际，MonitorController.java L122-157 / misc.ts）──
 * - GET /v1/monitor/topology 实际：{nodes:[{id,name,type:'DISPATCH'|'BACKEND',status:'HEALTHY'|'ERROR'}],
 *   edges:[{source_id,target_id,condition:'PATH CONTAINS /api/user'（conditionType+operator+conditionKey）}]}
 *   → 无 path、无 children、无固定网关/客户端/上游节点。连线信息足够（分发→后置父子关系），
 *   故【降级契约】：前端拼固定 client/gw 节点自行布线；边标签 path 取 traffic-summary.path（按 route_id 合并）。
 * - GET /v1/audit/logs 实际：信封分页 {records:[{id(字符串雪花),action('PUBLISH_ROUTE'式英文码),
 *   target_type,target_id,actor,result,created_at(ISO)],total,size,current,pages}（misc.ts AuditLogPage）
 * - 事件渲染契约：action 英文码原文直出（不映射中文文案——audit 无「上游下线/证书到期」事件源，
 *   提示词里的 eventRoutePublish/eventUpstreamDown/eventCertExpire 三 key 不设）；测试不断言钟点（时区脆）。
 *
 * ── KPI 4 卡选型声明（T 定死，C 照做）───────────────────────────────────────
 * 原型 4 卡为 今日请求/平均延迟/错误率/活跃路由；错误率无全局数据 → 按任务契约第 4 卡改「上游健康」。
 * 最终选型：kpiRequests=Σhits_24h（复用 S3 formatHits 口径：k 取整、M/B 一位小数去尾 0，1,720,000→1.7M）
 *   kpiQps=Σqps 四舍五入取整；kpiP95=非 null p95 均值四舍五入 + ms（全 null → —，口径同 S3 formatMs）
 *   kpiUpstream=上游可达占比 x/y（x=reachable 数，y=upstream!=null 的路由数，无探测数据不计分母；y=0 → —）。
 * 「活跃路由」不设卡：信息量低于上游健康（活跃性可从画布节点状态读出），此为 T 的明确取舍。
 *
 * ── i18n key 全表（v2.overview.*，zh/en 同步加，铁律 6；23 个）──────────────────
 * kpiRequests/kpiQps/kpiP95/kpiUpstream/canvasTitle/canvasHint/clientLabel/nodeGateway/nodeDispatch/
 * nodeBackend/nodeUpstream/pendingTitle/pendingPublish('{n} 条路由待发布')/pendingUpstream('{n} 个上游不可达')/
 * pendingEmpty/eventsTitle/eventsEmpty/healthTitle/seeAll/upstreamOk/upstreamBad/snapshotHint/loadFailed
 *
 * ── testid 全表 ──────────────────────────────────────────────────────────
 * kpi-requests/kpi-qps/kpi-p95/kpi-upstream（KPI 4 卡）；overview-source-hint；overview-error；
 * topo-canvas；topo-node-client；topo-node-gateway；topo-node-dispatch-<routeId>；topo-node-backend-<routeId>；
 * topo-up-<routeId>（后置节点内上游 chip，S2 单上游端点语义：upstream!=null 才渲染，无池节点/实例数）；
 * topo-edge-<src>-<dst>（src/dst ∈ client|gw|routeId）；topo-qps/topo-p95（节点内，traffic 合并值）；
 * topo-dot（节点/chip 内健康点，data-state='ok'|'warn'）；pending-card/pending-list/pending-count（徽标总数）/
 * pending-publish/pending-upstream；events-card/event-item；upstream-card/upstream-row-<routeId>/upstream-pbar
 *
 * ── 其它 DOM 细节契约 ────────────────────────────────────────────────────
 * - 连线 derivation：client→gw 固定 1 条；gw→每个 DISPATCH 根节点 + 每个无父 BACKEND 各 1 条；
 *   分发→后置按 topology.edges（默认数据 2 条）⇒ 默认共 6 条。上游 chip 挂节点内，不设 upstream 边。
 * - snapshot 提示：凡 source==='snapshot' 即提示（S6 不等 quantile_fallback，比 S3 现条件宽松，勿回退）。
 * - pending：待发布=status∈{DRAFT,CHANGING} 计数 + 不可达上游=upstream.reachable===false 计数。
 * - upstream-pbar 宽度 = Math.round(x/y*100)+'%'。
 * - 权限：monitor:read 由路由 meta 控制（S1 路由表测试已覆盖）；本页只读无写操作，
 *   故不 mock canEdit 断言按钮显隐，改为断言页面无任何 act-* 操作按钮（usePermission 仅按 S3 惯例 mock 防实现引用）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
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

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 LayoutV2.test.ts / List.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))
const tv = (key: string, n: number | string) => t(key).replace('{n}', String(n))

function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 312000, qps: 118, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
    upstream: null, source: 'prometheus', quantile_fallback: false, ...over
  }
}

/** 默认 5 路由：d1 分发 + b1/b2/b3 后置 + dr1 草稿。
 * 预置聚合值：Σhits=1,720,000→'1.7M'；Σqps=474.4→'474'；非 null p95=[31,112,37]→均值 60→'60 ms'；
 * 上游非 null=[b1,b2] 可达 1 → '1/2'、pbar 50%；待发布=[b2 CHANGING, dr1 DRAFT]=2、不可达上游=1、徽标 3 */
function defaultTraffic() {
  return [
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', hits_24h: 1200000, qps: 221, p95_latency_ms: null }),
    makeTraffic('b1', { route_name: 'user_service', path: '/api/user/**', upstream: { reachable: true, latency_ms: 8 } }),
    makeTraffic('b2', { route_name: 'order_service', path: '/api/order/**', hits_24h: 121000, qps: 85, p95_latency_ms: 112, status: 'CHANGING', upstream: { reachable: false, latency_ms: null } }),
    makeTraffic('b3', { route_name: 'product_service', path: '/api/product/**', hits_24h: 84000, qps: 49.4, p95_latency_ms: 37 }),
    makeTraffic('dr1', { route_name: 'draft_svc', path: '/api/draft/**', status: 'DRAFT', hits_24h: 3000, qps: 1, p95_latency_ms: null })
  ]
}

/** topology 实际形状（无 path/无网关节点）：edges = 分发 d1 的 2 条条件路由（seed 同款 PATH CONTAINS） */
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

/** 刻意乱序放入（14:01/14:32/13:47），期望展示按 created_at 倒序：UPDATE_PLUGIN → PUBLISH_ROUTE → CREATE_ROUTE */
function defaultAuditPage() {
  return {
    records: [
      { id: '9003', action: 'PUBLISH_ROUTE', target_type: 'ROUTE', target_id: '12', actor: 'admin', result: 'SUCCESS', created_at: '2026-11-04T14:01:00+08:00' },
      { id: '9002', action: 'UPDATE_PLUGIN', target_type: 'PLUGIN', target_id: '3', actor: 'admin', result: 'SUCCESS', created_at: '2026-11-04T14:32:00+08:00' },
      { id: '9001', action: 'CREATE_ROUTE', target_type: 'ROUTE', target_id: '30', actor: '可可', result: 'SUCCESS', created_at: '2026-11-04T13:47:00+08:00' }
    ],
    total: 3, size: 5, current: 1, pages: 1
  }
}

async function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/v2/overview', component: Overview as any }]
  })
  await router.push('/v2/overview')
  await router.isReady()
  const wrapper = mount(Overview, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.getTopology.mockReset().mockResolvedValue(defaultTopology())
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
})

const KEYS = ['kpiRequests', 'kpiQps', 'kpiP95', 'kpiUpstream', 'canvasTitle', 'canvasHint', 'clientLabel',
  'nodeGateway', 'nodeDispatch', 'nodeBackend', 'nodeUpstream', 'pendingTitle', 'pendingPublish', 'pendingUpstream',
  'pendingEmpty', 'eventsTitle', 'eventsEmpty', 'healthTitle', 'seeAll', 'upstreamOk', 'upstreamBad',
  'snapshotHint', 'loadFailed'].map((k) => `v2.overview.${k}`)

describe('v2 overview — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 overview — KPI 4 卡聚合（Σhits 缩写 / Σqps 取整 / P95 均值 / 上游可达占比）', () => {
  it('默认数据：1.7M / 474 / 60 ms / 1/2，且四卡 label 来自 i18n', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'kpi-requests').text()).toContain(t('v2.overview.kpiRequests'))
    expect(one(wrapper, 'kpi-requests').text()).toContain('1.7M')
    expect(one(wrapper, 'kpi-qps').text()).toContain(t('v2.overview.kpiQps'))
    expect(one(wrapper, 'kpi-qps').text()).toContain('474')
    expect(one(wrapper, 'kpi-p95').text()).toContain(t('v2.overview.kpiP95'))
    expect(one(wrapper, 'kpi-p95').text()).toMatch(/60\s*ms/)
    expect(one(wrapper, 'kpi-upstream').text()).toContain(t('v2.overview.kpiUpstream'))
    expect(one(wrapper, 'kpi-upstream').text()).toContain('1/2')
  })

  it('p95 全为 null → 平均 P95 卡显示 —', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, p95_latency_ms: null })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'kpi-p95').text()).toContain('—')
  })

  it('traffic-summary 空数组 → 请求/QPS 为 0，P95/上游为 —（分母 0）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(one(wrapper, 'kpi-requests').text()).toContain('0')
    expect(one(wrapper, 'kpi-qps').text()).toContain('0')
    expect(one(wrapper, 'kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'kpi-upstream').text()).toContain('—')
  })
})

describe('v2 overview — 拓扑画布（固定坐标 SVG：客户端→网关→分发→后置→上游 chip）', () => {
  it('节点渲染：client/gateway 固定节点 + dispatch-d1/backend-b1 路由节点 + up-b1/up-b2 chip；b3 无探测数据不渲染 chip', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'topo-node-client').text()).toContain(t('v2.overview.clientLabel'))
    expect(one(wrapper, 'topo-node-gateway').text()).toContain(t('v2.overview.nodeGateway'))
    const dispatch = one(wrapper, 'topo-node-dispatch-d1')
    expect(dispatch.exists()).toBe(true)
    expect(dispatch.text()).toContain('api_gateway')
    expect(dispatch.text()).toContain(t('v2.overview.nodeDispatch'))
    const backend = one(wrapper, 'topo-node-backend-b1')
    expect(backend.exists()).toBe(true)
    expect(backend.text()).toContain('user_service')
    expect(one(wrapper, 'topo-node-backend-dr1').exists()).toBe(true)
    expect(one(wrapper, 'topo-up-b1').text()).toContain(t('v2.overview.nodeUpstream'))
    expect(one(wrapper, 'topo-up-b2').exists()).toBe(true)
    expect(one(wrapper, 'topo-up-b3').exists()).toBe(false)
  })

  it('连线 6 条（client→gw、gw→d1、gw→b3、gw→dr1、d1→b1、d1→b2），路由边标签含目标 path（取 traffic-summary）', async () => {
    const { wrapper } = await factory()
    const canvas = one(wrapper, 'topo-canvas')
    expect(canvas.exists()).toBe(true)
    expect(canvas.text()).toContain(t('v2.overview.canvasTitle'))
    expect(canvas.text()).toContain(t('v2.overview.canvasHint'))
    expect(wrapper.findAll('[data-testid^="topo-edge-"]').length).toBe(6)
    for (const tid of ['topo-edge-client-gw', 'topo-edge-gw-d1', 'topo-edge-gw-b3', 'topo-edge-gw-dr1', 'topo-edge-d1-b1', 'topo-edge-d1-b2']) {
      expect(one(wrapper, tid).exists(), `缺少边 ${tid}`).toBe(true)
    }
    expect(one(wrapper, 'topo-edge-gw-d1').text()).toContain('/api/**')
    expect(one(wrapper, 'topo-edge-d1-b1').text()).toContain('/api/user/**')
    expect(one(wrapper, 'topo-edge-d1-b2').text()).toContain('/api/order/**')
    expect(one(wrapper, 'topo-edge-gw-b3').text()).toContain('/api/product/**')
  })

  it('节点 stats 合并 traffic：QPS/P95 数字 + topo-dot data-state（可达 ok/不可达 warn）；无 P95 → —', async () => {
    const { wrapper } = await factory()
    const b1 = one(wrapper, 'topo-node-backend-b1')
    expect(b1.find('[data-testid="topo-qps"]').text()).toContain('118')
    expect(b1.find('[data-testid="topo-p95"]').text()).toMatch(/31\s*ms/)
    expect(b1.find('[data-testid="topo-dot"]').attributes('data-state')).toBe('ok')
    const b2 = one(wrapper, 'topo-node-backend-b2')
    expect(b2.find('[data-testid="topo-p95"]').text()).toMatch(/112\s*ms/)
    expect(b2.find('[data-testid="topo-dot"]').attributes('data-state')).toBe('warn')
    expect(one(wrapper, 'topo-up-b2').find('[data-testid="topo-dot"]').attributes('data-state')).toBe('warn')
    const d1 = one(wrapper, 'topo-node-dispatch-d1')
    expect(d1.find('[data-testid="topo-qps"]').text()).toContain('221')
    expect(d1.find('[data-testid="topo-p95"]').text()).toContain('—')
    expect(one(wrapper, 'topo-node-backend-dr1').find('[data-testid="topo-p95"]').text()).toContain('—')
  })
})

describe('v2 overview — snapshot 兜底提示条', () => {
  it('任一路由 source=snapshot → 顶部 overview-source-hint（S6 契约：凡 snapshot 即提示，不等 quantile_fallback）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, source: 'snapshot' })))
    const { wrapper } = await factory()
    const hint = one(wrapper, 'overview-source-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.overview.snapshotHint'))
  })

  it('全部 source=prometheus → 不出现提示条', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'overview-source-hint').exists()).toBe(false)
  })
})

describe('v2 overview — 右栏：待处理 / 实时事件 / 上游健康', () => {
  it('待处理：CHANGING+DRAFT=2 条待发布、不可达上游 1 个、徽标总数 3', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'pending-card').text()).toContain(t('v2.overview.pendingTitle'))
    expect(one(wrapper, 'pending-list').exists()).toBe(true)
    expect(one(wrapper, 'pending-count').text()).toContain('3')
    expect(one(wrapper, 'pending-publish').text()).toContain(tv('v2.overview.pendingPublish', 2))
    expect(one(wrapper, 'pending-upstream').text()).toContain(tv('v2.overview.pendingUpstream', 1))
  })

  it('全部已发布且上游可达 → 无待处理条目，显示 pendingEmpty', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({
      ...r, status: 'PUBLISHED', upstream: r.upstream ? { reachable: true, latency_ms: 8 } : null
    })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'pending-publish').exists()).toBe(false)
    expect(one(wrapper, 'pending-upstream').exists()).toBe(false)
    expect(one(wrapper, 'pending-list').text()).toContain(t('v2.overview.pendingEmpty'))
  })

  it('实时事件：listAuditLogs({page:1,pageSize:5})，3 条按 created_at 倒序（action 原文 + actor）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'events-card').text()).toContain(t('v2.overview.eventsTitle'))
    expect(mocks.listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 5 }))
    const items = wrapper.findAll('[data-testid="event-item"]')
    expect(items.length).toBe(3)
    expect(items[0].text()).toContain('UPDATE_PLUGIN')
    expect(items[1].text()).toContain('PUBLISH_ROUTE')
    expect(items[2].text()).toContain('CREATE_ROUTE')
    expect(items[2].text()).toContain('可可')
  })

  it('audit 拉取失败 → 事件区显示 eventsEmpty，页面不崩', async () => {
    mocks.listAuditLogs.mockRejectedValue(new Error('audit down'))
    const { wrapper } = await factory()
    await flushPromises()
    expect(one(wrapper, 'events-card').text()).toContain(t('v2.overview.eventsEmpty'))
    expect(one(wrapper, 'topo-node-gateway').exists()).toBe(true)
  })

  it('上游健康卡：逐行可达/不可达文案 + P95、汇总 pbar 宽 50%（1/2）、seeAll 入口', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'upstream-card')
    expect(card.text()).toContain(t('v2.overview.healthTitle'))
    expect(card.text()).toContain(t('v2.overview.seeAll'))
    const r1 = one(wrapper, 'upstream-row-b1')
    expect(r1.text()).toContain(t('v2.overview.upstreamOk'))
    expect(r1.text()).toMatch(/8\s*ms/)
    expect(one(wrapper, 'upstream-row-b2').text()).toContain(t('v2.overview.upstreamBad'))
    expect(one(wrapper, 'upstream-row-b3').exists()).toBe(false)
    expect(one(wrapper, 'upstream-pbar').attributes('style')).toContain('50%')
  })
})

describe('v2 overview — 加载失败态', () => {
  it('traffic-summary reject → overview-error 出现 + KPI 全 — + 画布仍渲染（页面不崩）', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    const { wrapper } = await factory()
    await flushPromises()
    expect(one(wrapper, 'overview-error').exists()).toBe(true)
    expect(one(wrapper, 'overview-error').text()).toContain(t('v2.overview.loadFailed'))
    expect(one(wrapper, 'kpi-requests').text()).toContain('—')
    expect(one(wrapper, 'kpi-qps').text()).toContain('—')
    expect(one(wrapper, 'kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'kpi-upstream').text()).toContain('—')
    expect(one(wrapper, 'topo-node-gateway').exists()).toBe(true)
  })
})

describe('v2 overview — 权限（monitor:read，只读页）', () => {
  it('本页无写操作：不出现任何 act-* 操作/发布类按钮', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="act-"]').length).toBe(0)
  })
})
