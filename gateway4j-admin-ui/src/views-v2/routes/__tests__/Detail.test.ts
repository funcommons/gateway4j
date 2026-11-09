/**
 * S8-T：v2 路由详情页测试（契约 §4 S8 行 + 侦察结论 8 条已裁决 + 原型 prototype-v2/07-route-detail.html
 * 与 shots/07-route-detail.png）。先红是预期：页面由 S8-C 实现（当前 Detail.vue 为 10 行
 * V2PagePlaceholder 占位 stub）。
 *
 * ── API 封装（全部 mock；页面只准 import 这几个成员，多了 runtime 自曝）────────────
 * @/api/routes：listRoutes()（页头数据源：Route 实体无 plugins、getRoute(id) 裸实体不可用——
 *   mock 不含 getRoute，页面若误用直接 TypeError）+ getRouteVersions(id) +
 *   getRouteVersionDiff(id, from, to)（S5a，Publish.vue 同款）。
 * @/api/v2：fetchTrafficSummary()（页头 hits/qps + 状态码环图，按 route_id find）+
 *   fetchRouteTimeseries(routeId, '24h', '1h')（QPS/延迟/错误率三卡）——两成员必须同时 mock
 *   （页面两者都用；fetchDecisionTree 不在 mock 内，页面不得 import）。
 * @/api/misc：listAuditLogs({ target, page, pageSize, ... })（TimeseriesResponse 仅 type import，
 *   不进入运行时 mock 粒度）。
 *
 * ── 侦察结论落点（§4 S8，已裁决）─────────────────────────────────────────────
 * ① 页头 = listRoutes() 树按 id 递归 find（含嵌套 children）；树中无 id → dtl-not-found
 *    （BusinessError 双收 10601 主 / 10400 兼容，DecisionTree 口径——fixture 用 10601）。
 * ② 链路时间线 = 静态预览：客户端→匹配(path)→插件链（plugins 按 sort_order）→转发→上游→响应；
 *    分段耗时无数据源 → dtl-chain-dur-* 渲染 '—' 或不渲染（两种实现都合规，勿回退成只认一种）；
 *    「N 实例」禁渲染（S2 单上游语义：UpstreamHealthProbe 单 URL 探测，原型的
 *    「user-pool · 2 实例」不落实现，渲染文本断言无「实例」）。
 * ③ 四联图 = SVG 自绘（polyline/rect/stroke-dasharray 环图，不用 ECharts——源码断言无 echarts）：
 *    QPS 曲线 1 线；延迟 p50+p95 双线，source='snapshot' 时点缺 p50 → 单 p95 线 + dtl-snapshot-hint
 *    （提示口径跟 source，不跟 quantile_fallback——S2 语义注记：traffic-summary 与 timeseries 两处
 *    quantile_fallback 含义不同，S8 只按 timeseries 的 source 判）；错误率 rect 柱（每 data_point ≥1 根，
 *    fixture 六点全 >0 保证柱非零）；状态码环 = fetchTrafficSummary() 按 route_id find 的
 *    status_codes 三桶（计数走 formatHits 口径 + 占比 %）；无该 route 行 → 环图空态 + 页头 hits/qps '—'。
 * ④ 变更历史 = getRouteVersions 按返回序（config_version 倒序）渲染，最新行挂「当前」徽章
 *    （无草稿版本概念）；diff 懒加载：未点不调 getRouteVersionDiff，点击 → (id, 前一版本, 本版本)。
 * ⑤ 「命中日志」是硬缺口（引擎访问日志仅 Kafka/ES 外送无读端点，audit_logs 是管理审计）→
 *    卡降级为「操作记录」= listAuditLogs({ target: routeId, page: 1, pageSize })；文案如实
 *    auditTitle（操作记录语义），渲染结果禁出现「命中日志」字样（不冒充请求命中）。
 * ⑥ 刷新 = 手动按钮 dtl-refresh（不做 setInterval）：点击重发 fetchTrafficSummary +
 *    fetchRouteTimeseries（各第二次调用）。
 * ⑦ List.vue 行操作加「详情」跳转归 S8-C（本文件只 import Detail.vue，不测 List）。
 * ⑧ 权限 usePermission().canEdit('route')：false → 发布/编辑动作（dtl-action-publish/edit）不渲染，
 *    只读分区（链路/四联图/历史/操作记录）保留。
 *
 * ── i18n key 全表（v2.detail.*，zh/en 同步加，铁律 6；31 个）───────────────────
 * notFound / errorLoad / childCount('{n} 条后置') / pluginCount('{n} 个插件') / hitsLabel / qpsLabel /
 * chainTitle / chainClient / chainMatch / chainForward / chainUpstream / chainResponse /
 * historyTitle / current / changeCreate / changePublish / changeOffline / viewDiff / historyEmpty /
 * errorHistory / diffTitle / qpsTitle / latencyTitle / errorRateTitle / statusCodeTitle /
 * snapshotHint / errorCharts / statusEmpty / auditTitle / errorAudit / refresh
 * （changeOffline 本文件行为用例未覆盖 OFFLINE 行，仅为 C 补齐枚举标签预留；其余 key 均有用例触达）
 *
 * ── testid 全表（前缀 dtl-*）────────────────────────────────────────────────
 * dtl-page（根，任何状态都在）；dtl-error（listRoutes 非 not-found 失败错误条）；dtl-not-found；
 * dtl-scroll（375 横滚容器，overflow-x:auto，包住页头与四段内容）；
 * dtl-header（页头：dtl-name / dtl-status（原始字典值如 PUBLISHED）/ dtl-path / dtl-environment /
 *   dtl-plugin-count / dtl-plugin-chip-<plugin_id>（按 sort_order）/ dtl-child-count（children 非空才渲染）/
 *   dtl-hits / dtl-qps / dtl-action-publish + dtl-action-edit（仅 canEdit=true））；
 * dtl-chain（请求链路卡，头文案 chainTitle；节点统一前缀 dtl-chain-node-*：client / match /
 *   plugin-<plugin_id>（按 sort_order）/ forward / upstream / response，按 DOM 序即链路序；
 *   耗时位 dtl-chain-dur-*，无数据 → '—' 或不渲染）；
 * dtl-charts（四联图行：dtl-chart-qps / dtl-chart-latency / dtl-chart-error / dtl-chart-status；
 *   线=非空 points 的 polyline，柱=rect，环图元素带 stroke-dasharray；桶行 dtl-bucket-c2xx/c4xx/c5xx
 *   （格式化计数 + 占比 %）；快照提示 dtl-snapshot-hint；四联图错误条 dtl-charts-error）；
 * dtl-history（变更历史卡：行 dtl-version-row-<config_version> 按返回序；最新行 dtl-badge-current；
 *   每行 dtl-time-<v>（非空）+ dtl-diff-btn-<v>（文案 viewDiff）；空态 dtl-history-empty；错误条 dtl-history-error）；
 * dtl-diff（懒加载 diff 卡：头文案 diffTitle；行 dtl-diff-row-<field> 含 field / from / to 原文）；
 * dtl-audit（操作记录卡：行 dtl-audit-row-<id>（action/actor 原文）+ dtl-audit-time-<id>（非空）；
 *   错误条 dtl-audit-error，失败不崩）；
 * dtl-refresh（手动刷新按钮，文案 refresh）。
 *
 * ── 布局与其他声明 ──────────────────────────────────────────────────────────
 * - 数值口径复用 S3/S6/S5 formatHits（<1k 原样 / k 取整 / M、B 一位小数去尾 0：1500→'2k'、
 *   8000→'8k'、84000→'84k'）；qps Math.round；无数据 '—'。
 * - 上游节点（dtl-chain-node-upstream）对 DISPATCH（upstream_url 空）的数据内容留给 C，
 *   断言只查节点存在 + 标签走 t()。
 * - 取数并行、分区独立 try/catch：fetchRouteTimeseries reject 只拖垮四联图（dtl-charts-error），
 *   页头 / 历史 / 操作记录照常渲染（V14）。
 * - SDK-only（铁律 2）：源码禁 <el- 直用；template 块禁 CJK（文案一律 t()）；禁 echarts import。
 *
 * ── P4c-2 增补（2026-11-09，契约 §4.5 P4c 行裁决：编辑入口方案 a）────────────
 * dtl-action-edit 不再跳旧画布 /routes/:id/canvas（V17 源码断言 /canvas 全退场，画布保持
 * 结构编辑定位）→ 改开页内编辑态：dtl-edit-panel 内嵌 RouteEditForm（./RouteEditForm.vue；
 * 组件契约见 __tests__/RouteEditForm.test.ts 头注：props routeId / emits saved·close·
 * dirty-change / testid 前缀 ref-* / i18n v2.edit.* 独立树）。编辑态打开时 dtl-action-edit
 * 隐藏（防重挂载丢脏数据）；组件 emit saved → 页头重拉（listRoutes 二次调用）；emit close →
 * 面板收起、可再重开。本文件对 RouteEditForm 走 vi.mock factory stub（不依赖组件文件存在），
 * V16（行为）/V17（源码）由 P4c-2-C 实现时转绿，先红是预期；既有 V2-V15 零改动零误伤。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { BusinessError } from '@/api/http'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRouteVersions: vi.fn(),
  getRouteVersionDiff: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  fetchRouteTimeseries: vi.fn(),
  listAuditLogs: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRouteVersions: mocks.getRouteVersions,
  getRouteVersionDiff: mocks.getRouteVersionDiff
}))
vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary,
  fetchRouteTimeseries: mocks.fetchRouteTimeseries
}))
vi.mock('@/api/misc', () => ({
  listAuditLogs: mocks.listAuditLogs
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// P4c-2：RouteEditForm stub（vi.mock factory 不依赖组件文件存在；组件契约见
// RouteEditForm.test.ts 头注）。本文件只测 Detail 的编辑态挂载/收起/事件转发。
vi.mock('@/views-v2/routes/RouteEditForm.vue', () => ({
  default: { name: 'RouteEditFormStub', template: '<div data-testid="ref-form" />' }
}))

import Detail from '@/views-v2/routes/Detail.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 Publish.test.ts / DecisionTree.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Detail.vue'), 'utf-8')
}

// ── fixtures（真实 API 形状，snake_case 原样透传）────────────────────────────

const NOW = 1793750400000 // 2026-11-04T00:00:00Z 附近，仅作展示数据，时间断言不依赖具体格式

/** RouteNode（src/api/routes.ts）：plugins 四元组 + children 树形 */
function makeNode(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', status: 'PUBLISHED', sort_order: 0,
    environment: 'default', config_version: '1', created_at: 0, updated_at: 0,
    plugins: [], children: [], ...over
  }
}

/** 默认路由树：r1 为 DISPATCH（带 2 后置子路由 + 2 插件，plugins 故意乱序验证 sort_order 排序） */
function defaultNodes() {
  return [
    makeNode('r1', {
      route_name: 'user_service', route_type: 'DISPATCH', path: '/api/user/**',
      upstream_url: '', status: 'PUBLISHED', environment: 'prod',
      plugins: [
        { plugin_id: 'p2', plugin_name: 'rate-limit', plugin_phase: 'ROUTE_PRE', sort_order: 2 },
        { plugin_id: 'p1', plugin_name: 'signature', plugin_phase: 'ROUTE_PRE', sort_order: 1 }
      ],
      children: [
        makeNode('c1', { route_name: 'user_canary', path: '/api/user/canary/**' }),
        makeNode('c2', { route_name: 'user_main', path: '/api/user/main/**', upstream_url: 'http://10.0.0.12:9001' })
      ]
    })
  ]
}

/** RouteTrafficSummaryItem（src/api/v2.ts，S2 契约）；桶值 8000/1500/500 → 80%/15%/5% */
function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 84000, qps: 12, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 8000, c4xx: 1500, c5xx: 500 },
    upstream: { reachable: true, latency_ms: 8 }, source: 'prometheus', quantile_fallback: false, ...over
  }
}

/** S5a RouteVersionDto：接口按 config_version 倒序返回，页面按返回顺序渲染 */
function makeVersion(v: string, over: Record<string, unknown> = {}) {
  return {
    id: `ver-${v}`, route_id: 'r1', config_version: v,
    change_type: v === 'v1' ? 'CREATE' : 'PUBLISH',
    snapshot_data: { route_name: 'user_service', path: '/api/user/**', upstream_url: '' },
    change_description: v === 'v3' ? '新增限流插件并放宽超时' : null,
    actor: 'admin', published_at: NOW, ...over
  }
}
function defaultVersions() {
  return [makeVersion('v3'), makeVersion('v2'), makeVersion('v1')]
}
function defaultDiff() {
  return [
    { field: 'upstream_retry', from: '2', to: '3' },
    { field: 'timeout', from: '3s', to: '5s' },
    { field: 'plugins', from: '—', to: 'rate-limit' }
  ]
}

/** TimeseriesPoint（src/api/misc.ts）：ISO 时间戳 + 流量/错误 + 分位数；prometheus 有 p50，snapshot 缺 p50 */
function makePoint(i: number, over: Record<string, unknown> = {}) {
  return {
    timestamp: `2026-11-03T0${i}:00:00Z`,
    total_requests: 1200 + i * 100,
    error_count: 20 + i,
    error_rate: 0.02 + i * 0.005, // 六点全 >0，错误率柱不因 0 高度缺席
    ...over
  }
}
function makeTimeseries(source: 'prometheus' | 'snapshot' = 'prometheus', over: Record<string, unknown> = {}) {
  return {
    source,
    data_points: [1, 2, 3, 4, 5, 6].map((i) => (
      source === 'prometheus'
        ? makePoint(i, { p50_latency_ms: 20 + i, p95_latency_ms: 40 + i })
        : makePoint(i, { p95_latency_ms: 45 }) // snapshot：p50 缺 → 单 p95 线降级
    )),
    ...over
  }
}

/** AuditLogItem / AuditLogPage（src/api/misc.ts）：target_type + target_id，id 为字符串雪花 */
function makeAudit(id: string, over: Record<string, unknown> = {}) {
  return {
    id, action: 'ROUTE_PUBLISH', target_type: 'ROUTE', target_id: 'r1',
    actor: 'admin', result: 'SUCCESS', created_at: '2026-11-03T10:00:00Z', ...over
  }
}
function defaultAuditPage() {
  return {
    records: [
      makeAudit('1001', { action: 'ROUTE_PUBLISH', actor: 'admin' }),
      makeAudit('1002', { action: 'ROUTE_UPDATE', actor: 'op_zhang' })
    ],
    total: 2, size: 20, current: 1, pages: 1
  }
}

async function factory(routeId = 'r1'): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/:id/detail', component: Detail as any },
      { path: '/v2/routes', component: stub }
    ]
  })
  await router.push(`/v2/routes/${routeId}/detail`)
  await router.isReady()
  const wrapper = mount(Detail, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)
/** 图卡内「画出来的线」：points 非空的 polyline（容掉占位空壳节点） */
const drawnLines = (w: VueWrapper<any>, cardTid: string) =>
  byTestid(w, cardTid).findAll('polyline').filter((p) => (p.attributes('points') ?? '').trim() !== '')

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.getRouteVersions.mockReset().mockResolvedValue(defaultVersions())
  mocks.getRouteVersionDiff.mockReset().mockResolvedValue(defaultDiff())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue([makeTraffic('r1')])
  mocks.fetchRouteTimeseries.mockReset().mockResolvedValue(makeTimeseries('prometheus'))
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
  mocks.canEdit.mockReturnValue(true)
})

const KEYS = ['notFound', 'errorLoad', 'childCount', 'pluginCount', 'hitsLabel', 'qpsLabel',
  'chainTitle', 'chainClient', 'chainMatch', 'chainForward', 'chainUpstream', 'chainResponse',
  'historyTitle', 'current', 'changeCreate', 'changePublish', 'changeOffline', 'viewDiff',
  'historyEmpty', 'errorHistory', 'diffTitle', 'qpsTitle', 'latencyTitle', 'errorRateTitle',
  'statusCodeTitle', 'snapshotHint', 'errorCharts', 'statusEmpty', 'auditTitle', 'errorAudit', 'refresh']
  .map((k) => `v2.detail.${k}`)

describe('v2 detail — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── V2 页头 ────────────────────────────────────────────────────────────────

describe('V2 — 页头（listRoutes 树按 id find）', () => {
  it('名称/状态徽章/path chip/environment/插件数与链 chips（按 sort_order）/children 数/hits·qps', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(byTestid(wrapper, 'dtl-name').text()).toContain('user_service')
    expect(byTestid(wrapper, 'dtl-status').text()).toContain('PUBLISHED')
    expect(byTestid(wrapper, 'dtl-path').text()).toContain('/api/user/**')
    expect(byTestid(wrapper, 'dtl-environment').text()).toContain('prod')
    expect(byTestid(wrapper, 'dtl-plugin-count').text())
      .toContain(String(dig(zhCN, 'v2.detail.pluginCount')).replace('{n}', '2'))
    // 链 chips 按 sort_order（fixture 故意 p2 在前）
    expect(wrapper.findAll('[data-testid^="dtl-plugin-chip-"]').map((c) => c.attributes('data-testid')))
      .toEqual(['dtl-plugin-chip-p1', 'dtl-plugin-chip-p2'])
    expect(byTestid(wrapper, 'dtl-child-count').text())
      .toContain(String(dig(zhCN, 'v2.detail.childCount')).replace('{n}', '2'))
    // hits/qps 来自 fetchTrafficSummary 按 route_id find（formatHits：84000 → 84k；qps 取整）
    expect(byTestid(wrapper, 'dtl-header').text()).toContain(t('v2.detail.hitsLabel'))
    expect(byTestid(wrapper, 'dtl-hits').text()).toMatch(/84\s*k/)
    expect(byTestid(wrapper, 'dtl-qps').text()).toContain(t('v2.detail.qpsLabel'))
    expect(byTestid(wrapper, 'dtl-qps').text()).toMatch(/12/)
  })

  it('嵌套 children 里的 id 也能 find 到（递归整棵树，非仅顶层）', async () => {
    const { wrapper } = await factory('c1')
    expect(byTestid(wrapper, 'dtl-name').text()).toContain('user_canary')
    expect(byTestid(wrapper, 'dtl-not-found').exists()).toBe(false)
  })
})

// ── V3 not-found ──────────────────────────────────────────────────────────

describe('V3 — 路由不存在（DecisionTree 口径：BusinessError 双收 10601 主 / 10400 兼容）', () => {
  it('树中无此 id → dtl-not-found（notFound），不渲染任何业务分区', async () => {
    mocks.listRoutes.mockResolvedValue([makeNode('other', { route_name: 'unrelated' })])
    const { wrapper } = await factory('r1')
    const nf = byTestid(wrapper, 'dtl-not-found')
    expect(nf.exists()).toBe(true)
    expect(nf.text()).toContain(t('v2.detail.notFound'))
    expect(byTestid(wrapper, 'dtl-error').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-chain').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-history').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
  })

  it('listRoutes reject BusinessError(10601) → 同样落 dtl-not-found（10400 同口径，fixture 用主码）', async () => {
    mocks.listRoutes.mockRejectedValue(new BusinessError(10601, '目标资源不存在或已被删除'))
    const { wrapper } = await factory('r1')
    expect(byTestid(wrapper, 'dtl-not-found').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-not-found').text()).toContain(t('v2.detail.notFound'))
    expect(byTestid(wrapper, 'dtl-error').exists()).toBe(false)
  })

  it('listRoutes reject 普通异常 → dtl-error（errorLoad）+ 页面不崩，不误判 not-found', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('db down'))
    const { wrapper } = await factory('r1')
    expect(byTestid(wrapper, 'dtl-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-error').text()).toContain(t('v2.detail.errorLoad'))
    expect(byTestid(wrapper, 'dtl-not-found').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
  })
})

// ── V4 链路时间线 ─────────────────────────────────────────────────────────

describe('V4 — 请求链路时间线（静态预览，侦察结论 ②）', () => {
  it('节点序列 客户端→匹配(path)→插件链(p1→p2 按 sort_order)→转发→上游→响应，标签走 t()', async () => {
    const { wrapper } = await factory()
    const chain = byTestid(wrapper, 'dtl-chain')
    expect(chain.exists()).toBe(true)
    expect(chain.text()).toContain(t('v2.detail.chainTitle'))
    const nodes = wrapper.findAll('[data-testid^="dtl-chain-node-"]')
    expect(nodes.map((n) => n.attributes('data-testid'))).toEqual([
      'dtl-chain-node-client', 'dtl-chain-node-match',
      'dtl-chain-node-plugin-p1', 'dtl-chain-node-plugin-p2',
      'dtl-chain-node-forward', 'dtl-chain-node-upstream', 'dtl-chain-node-response'
    ])
    expect(byTestid(wrapper, 'dtl-chain-node-client').text()).toContain(t('v2.detail.chainClient'))
    expect(byTestid(wrapper, 'dtl-chain-node-match').text()).toContain(t('v2.detail.chainMatch'))
    expect(byTestid(wrapper, 'dtl-chain-node-match').text()).toContain('/api/user/**')
    expect(byTestid(wrapper, 'dtl-chain-node-plugin-p1').text()).toContain('signature')
    expect(byTestid(wrapper, 'dtl-chain-node-plugin-p2').text()).toContain('rate-limit')
    expect(byTestid(wrapper, 'dtl-chain-node-forward').text()).toContain(t('v2.detail.chainForward'))
    expect(byTestid(wrapper, 'dtl-chain-node-upstream').text()).toContain(t('v2.detail.chainUpstream'))
    expect(byTestid(wrapper, 'dtl-chain-node-response').text()).toContain(t('v2.detail.chainResponse'))
  })

  it('分段耗时无数据源 → dur 位渲染 — 或不渲染（绝不造数）；不出现「N 实例」（单上游语义）', async () => {
    const { wrapper } = await factory()
    const durs = wrapper.findAll('[data-testid^="dtl-chain-dur-"]')
    for (const dur of durs) {
      expect(dur.text()).toContain('—')
      expect(dur.text()).not.toMatch(/\d/)
    }
    expect(byTestid(wrapper, 'dtl-chain').text()).not.toMatch(/实例/)
  })
})

// ── V5 变更历史 ───────────────────────────────────────────────────────────

describe('V5 — 变更历史（getRouteVersions 按返回序，最新挂「当前」）', () => {
  it('倒序渲染 3 条：最新行「当前」徽章 + actor/时间/changeType/change_description + 查看 diff', async () => {
    const { wrapper } = await factory()
    const history = byTestid(wrapper, 'dtl-history')
    expect(history.text()).toContain(t('v2.detail.historyTitle'))
    const rows = wrapper.findAll('[data-testid^="dtl-version-row-"]')
    expect(rows.map((r) => r.attributes('data-testid')))
      .toEqual(['dtl-version-row-v3', 'dtl-version-row-v2', 'dtl-version-row-v1'])
    expect(rows[0].find('[data-testid="dtl-badge-current"]').text()).toContain(t('v2.detail.current'))
    expect(rows[0].text()).toContain('admin')
    expect(rows[0].text()).toContain('新增限流插件并放宽超时')
    expect(rows[0].text()).toContain(t('v2.detail.changePublish'))
    expect(rows[2].text()).toContain(t('v2.detail.changeCreate'))
    for (const row of rows) {
      expect(row.find('[data-testid^="dtl-time-"]').text()).not.toBe('')
    }
    expect(rows[0].find('[data-testid="dtl-diff-btn-v3"]').text()).toContain(t('v2.detail.viewDiff'))
  })

  it('版本为空 → dtl-history-empty（historyEmpty），不渲染版本行', async () => {
    mocks.getRouteVersions.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-history-empty').text()).toContain(t('v2.detail.historyEmpty'))
    expect(wrapper.findAll('[data-testid^="dtl-version-row-"]').length).toBe(0)
  })

  it('getRouteVersions reject → dtl-history-error（errorHistory）+ 页面不崩（pub-error 同款分区口径）', async () => {
    mocks.getRouteVersions.mockRejectedValue(new Error('versions down'))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-history-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-history-error').text()).toContain(t('v2.detail.errorHistory'))
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
  })
})

// ── V6 diff 懒加载 ────────────────────────────────────────────────────────

describe('V6 — diff 懒加载（Publish.vue 同款：未点不调，点击 → (id, 前一版本, 本版本)）', () => {
  it('挂载后未调用 getRouteVersionDiff；点 v3 → getRouteVersionDiff(r1, v2, v3) + 字段行渲染', async () => {
    const { wrapper } = await factory()
    expect(mocks.getRouteVersionDiff).not.toHaveBeenCalled()
    await byTestid(wrapper, 'dtl-diff-btn-v3').trigger('click')
    await flushPromises()
    expect(mocks.getRouteVersionDiff).toHaveBeenCalledWith('r1', 'v2', 'v3')
    const diff = byTestid(wrapper, 'dtl-diff')
    expect(diff.exists()).toBe(true)
    expect(diff.text()).toContain(t('v2.detail.diffTitle'))
    const rows = wrapper.findAll('[data-testid^="dtl-diff-row-"]')
    expect(rows.length).toBe(3)
    expect(rows[0].text()).toContain('upstream_retry')
    expect(rows[0].text()).toContain('2')
    expect(rows[0].text()).toContain('3')
    expect(rows[1].text()).toContain('timeout')
    expect(rows[1].text()).toContain('3s')
    expect(rows[1].text()).toContain('5s')
    await byTestid(wrapper, 'dtl-diff-btn-v2').trigger('click')
    await flushPromises()
    expect(mocks.getRouteVersionDiff).toHaveBeenCalledWith('r1', 'v1', 'v2')
  })
})

// ── V7 四联图（SVG 自绘）──────────────────────────────────────────────────

describe('V7 — 四联图：调用参数 + QPS 线 / 延迟双线 / 错误率柱（SVG 自绘）', () => {
  it("挂载即 fetchRouteTimeseries('r1','24h','1h')；QPS ≥1 线（points 绑定）、延迟 2 线（p50+p95）、错误率 ≥6 rect", async () => {
    const { wrapper } = await factory()
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledWith('r1', '24h', '1h')
    expect(byTestid(wrapper, 'dtl-chart-qps').text()).toContain(t('v2.detail.qpsTitle'))
    const qpsLines = drawnLines(wrapper, 'dtl-chart-qps')
    expect(qpsLines.length).toBeGreaterThanOrEqual(1)
    expect(qpsLines[0].attributes('points')).toMatch(/[\d.]+,[\d.]+/)
    expect(byTestid(wrapper, 'dtl-chart-latency').text()).toContain(t('v2.detail.latencyTitle'))
    expect(drawnLines(wrapper, 'dtl-chart-latency').length).toBe(2) // p50 + p95 双线
    expect(byTestid(wrapper, 'dtl-chart-error').text()).toContain(t('v2.detail.errorRateTitle'))
    expect(byTestid(wrapper, 'dtl-chart-error').findAll('rect').length).toBeGreaterThanOrEqual(6) // 每 data_point ≥1 柱
    expect(byTestid(wrapper, 'dtl-snapshot-hint').exists()).toBe(false)
  })

  it("source='snapshot'（点缺 p50）→ dtl-snapshot-hint（snapshotHint）+ 延迟降级单 p95 线", async () => {
    mocks.fetchRouteTimeseries.mockResolvedValue(makeTimeseries('snapshot'))
    const { wrapper } = await factory()
    const hint = byTestid(wrapper, 'dtl-snapshot-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.detail.snapshotHint'))
    expect(drawnLines(wrapper, 'dtl-chart-latency').length).toBe(1)
    expect(byTestid(wrapper, 'dtl-chart-qps').exists()).toBe(true)
  })
})

// ── V8 状态码环图 + 页头 hits/qps ─────────────────────────────────────────

describe('V8 — 状态码环图（fetchTrafficSummary 按 route_id find）', () => {
  it('三桶计数（formatHits 口径）与占比渲染；环图元素带 stroke-dasharray', async () => {
    const { wrapper } = await factory()
    const status = byTestid(wrapper, 'dtl-chart-status')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain(t('v2.detail.statusCodeTitle'))
    expect(status.find('[stroke-dasharray]').exists()).toBe(true)
    const b2 = byTestid(wrapper, 'dtl-bucket-c2xx')
    const b4 = byTestid(wrapper, 'dtl-bucket-c4xx')
    const b5 = byTestid(wrapper, 'dtl-bucket-c5xx')
    expect(b2.text()).toMatch(/8\s*k/) // 8000 → 8k
    expect(b2.text()).toMatch(/80(\.0)?\s*%/)
    expect(b4.text()).toMatch(/2\s*k/) // 1500 → formatHits k 取整 → 2k
    expect(b4.text()).toMatch(/15(\.0)?\s*%/)
    expect(b5.text()).toMatch(/500/) // <1k 原样
    expect(b5.text()).toMatch(/5(\.0)?\s*%/)
  })

  it('该 route 无 traffic 行 → 环图空态（statusEmpty）+ 页头 hits/qps 落 —，其余分区不受影响', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue([makeTraffic('other-route')])
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-status-empty').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-status-empty').text()).toContain(t('v2.detail.statusEmpty'))
    expect(byTestid(wrapper, 'dtl-bucket-c2xx').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-hits').text()).toContain('—')
    expect(byTestid(wrapper, 'dtl-qps').text()).toContain('—')
    expect(byTestid(wrapper, 'dtl-name').text()).toContain('user_service')
    expect(byTestid(wrapper, 'dtl-version-row-v3').exists()).toBe(true)
  })
})

// ── V9 操作记录卡（命中日志降级，侦察结论 ⑤）────────────────────────────────

describe('V9 — 操作记录卡（listAuditLogs({ target })，禁冒充命中日志）', () => {
  it('调用含 target=routeId + page/pageSize；记录行渲染 action/actor/时间；标题是「操作记录」语义', async () => {
    const { wrapper } = await factory()
    expect(mocks.listAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'r1', page: 1, pageSize: expect.any(Number) })
    )
    const audit = byTestid(wrapper, 'dtl-audit')
    expect(audit.exists()).toBe(true)
    expect(audit.text()).toContain(t('v2.detail.auditTitle'))
    expect(audit.text()).not.toMatch(/命中日志/)
    const rows = wrapper.findAll('[data-testid^="dtl-audit-row-"]')
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['dtl-audit-row-1001', 'dtl-audit-row-1002'])
    expect(rows[0].text()).toContain('ROUTE_PUBLISH')
    expect(rows[0].text()).toContain('admin')
    expect(rows[1].text()).toContain('ROUTE_UPDATE')
    expect(rows[1].text()).toContain('op_zhang')
    for (const row of rows) {
      expect(row.find('[data-testid^="dtl-audit-time-"]').text()).not.toBe('')
    }
  })

  it('listAuditLogs reject → dtl-audit-error（errorAudit）+ 卡降级不崩，历史分区照常', async () => {
    mocks.listAuditLogs.mockRejectedValue(new Error('audit down'))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-audit-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-audit-error').text()).toContain(t('v2.detail.errorAudit'))
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-version-row-v3').exists()).toBe(true)
  })
})

// ── V10 手动刷新 ──────────────────────────────────────────────────────────

describe('V10 — 手动刷新（不做 setInterval，侦察结论 ⑥）', () => {
  it('dtl-refresh 存在；点击后 fetchTrafficSummary 与 fetchRouteTimeseries 各第二次调用（参数不变）', async () => {
    const { wrapper } = await factory()
    expect(mocks.fetchTrafficSummary).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(1)
    const btn = byTestid(wrapper, 'dtl-refresh')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain(t('v2.detail.refresh'))
    await btn.trigger('click')
    await flushPromises()
    expect(mocks.fetchTrafficSummary).toHaveBeenCalledTimes(2)
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(2)
    expect(mocks.fetchRouteTimeseries).toHaveBeenLastCalledWith('r1', '24h', '1h')
  })
})

// ── V11 权限 ──────────────────────────────────────────────────────────────

describe('V11 — 权限（canEdit=false → 发布/编辑动作不渲染，只读分区保留）', () => {
  it('canEdit=true → dtl-action-publish/edit 在；false → 动作消失，链路/历史/四联图保留', async () => {
    const first = await factory()
    expect(byTestid(first.wrapper, 'dtl-action-publish').exists()).toBe(true)
    expect(byTestid(first.wrapper, 'dtl-action-edit').exists()).toBe(true)
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-action-publish').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-action-edit').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-chain').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-chart-qps').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-history').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-audit').exists()).toBe(true)
  })
})

// ── V12/V13/V15 源码契约 ──────────────────────────────────────────────────

describe('V12 — SDK-only（源码 grep，铁律 2）', () => {
  it('源码无 <el- 直用', () => {
    expect(readSource()).not.toMatch(/<el-/)
  })

  it('template 块无 CJK（文案一律 t()；中文注释仅允许出现在 script 块）', () => {
    const template = readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    expect(template).not.toMatch(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff5e]/)
  })
})

describe('V13 — 375 视口横滚容器', () => {
  it('dtl-scroll 包住页头与四段内容 + 源码 overflow-x:auto（jsdom 无法实测 scrollWidth）', async () => {
    const { wrapper } = await factory()
    const scroller = byTestid(wrapper, 'dtl-scroll')
    expect(scroller.exists()).toBe(true)
    expect(scroller.find('[data-testid="dtl-header"]').exists()).toBe(true)
    expect(scroller.find('[data-testid="dtl-chain"]').exists()).toBe(true)
    expect(scroller.find('[data-testid="dtl-charts"]').exists()).toBe(true)
    expect(scroller.find('[data-testid="dtl-history"]').exists()).toBe(true)
    expect(readSource()).toMatch(/overflow-x:\s*auto/)
  })
})

describe('V15 — SVG 自绘（侦察结论 ③：无 ECharts 生命周期负担）', () => {
  it('源码无 echarts import（大小写不敏感）', () => {
    expect(readSource().toLowerCase()).not.toContain('echarts')
  })
})

// ── V14 并行取数分区独立 ──────────────────────────────────────────────────

describe('V14 — 并行取数不互相拖垮（分区独立 try/catch）', () => {
  it('fetchRouteTimeseries reject → dtl-charts-error（errorCharts）；页头与变更历史照常渲染', async () => {
    mocks.fetchRouteTimeseries.mockRejectedValue(new Error('prometheus down'))
    const { wrapper } = await factory()
    const chartsError = byTestid(wrapper, 'dtl-charts-error')
    expect(chartsError.exists()).toBe(true)
    expect(chartsError.text()).toContain(t('v2.detail.errorCharts'))
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-name').text()).toContain('user_service')
    expect(byTestid(wrapper, 'dtl-hits').text()).toMatch(/84\s*k/)
    expect(byTestid(wrapper, 'dtl-version-row-v3').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-audit-row-1001').exists()).toBe(true)
  })
})

// ── V16 P4c-2 编辑态（dtl-action-edit 改开页内 RouteEditForm，不再跳旧画布）────

describe('V16 — dtl-action-edit 开编辑态（P4c-2 契约：嵌入 RouteEditForm）', () => {
  it('点击 → dtl-edit-panel 渲染（内含 RouteEditForm）+ currentRoute 保持详情页（不再 /routes/:id/canvas）', async () => {
    const { wrapper, router } = await factory()
    expect(router.currentRoute.value.path).toBe('/v2/routes/r1/detail')
    await byTestid(wrapper, 'dtl-action-edit').trigger('click')
    await flushPromises()
    const panel = byTestid(wrapper, 'dtl-edit-panel')
    expect(panel.exists(), '编辑态面板缺失（Detail 未挂 dtl-edit-panel）').toBe(true)
    expect(panel.find('[data-testid="ref-form"]').exists(), '面板内缺 RouteEditForm（ref-form）').toBe(true)
    expect(router.currentRoute.value.path).toBe('/v2/routes/r1/detail')
  })

  it('编辑态打开时 dtl-action-edit 隐藏（防重挂载丢脏数据）+ 只读分区不被遮挡', async () => {
    const { wrapper } = await factory()
    await byTestid(wrapper, 'dtl-action-edit').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'dtl-action-edit').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-chain').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-history').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-charts').exists()).toBe(true)
  })

  it('组件 emit close → 面板收起；再点 dtl-action-edit 可重开（编辑态生命周期）', async () => {
    const { wrapper } = await factory()
    await byTestid(wrapper, 'dtl-action-edit').trigger('click')
    await flushPromises()
    const stub = wrapper.findComponent({ name: 'RouteEditFormStub' })
    expect(stub.exists(), '编辑面板内缺 RouteEditFormStub').toBe(true)
    stub.vm.$emit('close')
    await flushPromises()
    expect(byTestid(wrapper, 'dtl-edit-panel').exists()).toBe(false)
    await byTestid(wrapper, 'dtl-action-edit').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'dtl-edit-panel').exists()).toBe(true)
  })

  it('组件 emit saved → 详情页头重拉（listRoutes 第二次调用）', async () => {
    const { wrapper } = await factory()
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    await byTestid(wrapper, 'dtl-action-edit').trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'RouteEditFormStub' }).vm.$emit('saved')
    await flushPromises()
    expect(mocks.listRoutes).toHaveBeenCalledTimes(2)
  })
})

// ── V17 P4c-2 源码契约（旧画布入口退场 + RouteEditForm 嵌入）────────────────

describe('V17 — P4c-2 源码契约：编辑钮不再跳旧画布 + 嵌入 RouteEditForm', () => {
  it('源码全文不再含 /canvas 导航语义（旧画布入口退场，画布保持结构编辑定位）', () => {
    expect(readSource()).not.toMatch(/\/canvas/)
  })

  it('源码 import RouteEditForm（./ 或 @ 别名均可）+ dtl-edit-panel 挂载点在源码', () => {
    const src = readSource()
    expect(src).toMatch(/import\s+RouteEditForm\s+from\s+'(\.\/|@\/views-v2\/routes\/)RouteEditForm\.vue'/)
    expect(src).toContain('dtl-edit-panel')
  })
})
