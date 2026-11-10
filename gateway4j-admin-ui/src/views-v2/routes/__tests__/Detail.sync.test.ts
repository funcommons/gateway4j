/**
 * OPT-6-FE【RED】：路由详情页 per-route 同步角标（v2 优化建议 #5「最后一公里」）。
 * 先红是预期：页面存在（S8-C 已实现），但 per-route 同步角标（dtl-sync-*）未实现——行为缺失型 RED，
 * 由 C 步实现后转绿；既有 Detail.test.ts（V2-V17）零改动零误伤（本文件独立，纯增量）。
 *
 * ── 侦察结论与落点裁决（如实固化）───────────────────────────────────────────
 * ① Detail.vue 的 dtl-action-publish 仅 router.push('/v2/publish/{id}')，页面【无发布成功回调】；
 *    「发布成功 → usePublishSync 轮询」三态角标落 Publish 页（见 ../publish/__tests__/Publish.sync.test.ts）。
 * ② 本页角标改挂【per-route 端点】GET /v1/routes/{id}/sync-status（OPT-6 后端正在实现，C 步在
 *    src/api/routes.ts 新增封装 getRouteSyncStatus(id)，本测试 mock 之）。响应契约：
 *      { route_id, route_config_version(字符串数字, Long→String), available, gateway(available=false
 *       时为 null, 形状同 @/api/misc GatewaySyncInfo), db_version, in_sync }
 *    in_sync 为【全局口径】（网关已加载到与 DB 一致版本）。
 * ③ 轮询策略（固化）：【挂载查询一次 + dtl-refresh 手动重查，不做 setInterval】——沿用本页
 *    侦察结论 ⑥「刷新 = 手动按钮，不做轮询」既有裁决；「同步中」轮询语义归 Publish/List，
 *    本页只呈现终态快照。
 * ④ route_config_version 对照展示裁决：【不在角标展示】——版本对照已由 dtl-version-row-* 时间线
 *    与后端 in_sync 口径承担，角标保持单状态语义（C 步无需渲染版本数字）。
 *
 * ── DOM 契约（data-testid，dtl-* 家族新增）──────────────────────────────────
 * dtl-sync-badge：per-route 同步角标，位于页头（dtl-header 内、dtl-status/dtl-environment 同排）；
 *   仅【查询成功返回后】渲染（查询中 / 失败 / 旧版后端 404 → 不渲染，如实降级不摆假警报）；
 *   data-state 属性 ∈ synced | delayed | unknown，文案：
 *     in_sync=true                         → synced  「已生效」（v2.routes.syncSynced）
 *     available=true && in_sync=false      → delayed 「同步延迟」（v2.routes.syncDelayed）
 *     available=false（gateway=null,状态未知）→ unknown 「状态未知」（v2.routes.syncUnknown）
 *   无独立重试钮：delayed/unknown 的重查走既有 dtl-refresh（本角标不新增按钮）。
 *
 * ── i18n（v2.routes.* 树追加，双语同位，铁律 6；与 Publish/List 共用一棵）────────
 * syncSynced / syncDelayed / syncUnknown（本页用 3 个；syncing/retry 两 key 由 Publish/List 用例覆盖）
 *
 * ── C 步实现要点（含旧测试兼容机制，务必遵守）─────────────────────────────────
 * - getRouteSyncStatus 调用必须放在【独立的内部 try/catch】里（如 loadSyncBadge：catch → 角标置
 *   null 且 promise 正常 resolve），绝不允许浮动 rejection、也不并入 loadAll 的五源 allSettled
 *   数组——旧 Detail.test.ts 的 @/api/routes mock 只含 listRoutes/getRouteVersions/getRouteVersionDiff
 *   三成员，页面新增 import 该名后在其 mock 下为 undefined，同步调用抛 TypeError 必须被内部
 *   try/catch 吞掉（角标静默隐藏），旧用例 V2-V17 才能保持全绿。
 * - dtl-refresh 点击在既有两源（fetchTrafficSummary/fetchRouteTimeseries）之外加发一次
 *   getRouteSyncStatus(routeId)（参数不变）。
 * - SDK-only：角标禁 <el- 直用；文案一律 t()；template 块禁 CJK。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { BusinessError } from '@/api/http'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRouteVersions: vi.fn(),
  getRouteVersionDiff: vi.fn(),
  getRouteSyncStatus: vi.fn(),
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
  getRouteVersionDiff: mocks.getRouteVersionDiff,
  getRouteSyncStatus: mocks.getRouteSyncStatus
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
vi.mock('@/views-v2/routes/RouteEditForm.vue', () => ({
  default: { name: 'RouteEditFormStub', template: '<div data-testid="ref-form" />' }
}))

import Detail from '@/views-v2/routes/Detail.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
// dig: 按点路径取 locale 值；undefined = key 缺失（Detail.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function makeNode(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', status: 'PUBLISHED', sort_order: 0,
    environment: 'prod', config_version: '1', created_at: 0, updated_at: 0,
    plugins: [], children: [], ...over
  }
}
function defaultNodes() {
  return [
    makeNode('r1', {
      route_name: 'user_service', route_type: 'DISPATCH', path: '/api/user/**', upstream_url: '',
      children: [makeNode('c1'), makeNode('c2')]
    })
  ]
}
function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 84000, qps: 12, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 8000, c4xx: 1500, c5xx: 500 },
    upstream: { reachable: true, latency_ms: 8 }, source: 'prometheus', quantile_fallback: false, ...over
  }
}
function makeTimeseries() {
  return {
    source: 'prometheus',
    data_points: [1, 2, 3].map((i) => ({
      timestamp: `2026-11-03T0${i}:00:00Z`, total_requests: 100 + i, error_count: 2,
      error_rate: 0.02, p50_latency_ms: 20, p95_latency_ms: 40
    }))
  }
}
const NOW = 1793750400000
function makeVersion(v: string, over: Record<string, unknown> = {}) {
  return {
    id: `ver-${v}`, route_id: 'r1', config_version: v,
    change_type: 'PUBLISH', snapshot_data: {}, change_description: null,
    actor: 'admin', published_at: NOW, ...over
  }
}
function defaultVersions() {
  return [makeVersion('v3'), makeVersion('v2')]
}
function defaultAuditPage() {
  return {
    records: [{ id: '1001', action: 'ROUTE_PUBLISH', target_type: 'ROUTE', target_id: 'r1', actor: 'admin', result: 'SUCCESS', created_at: '2026-11-03T10:00:00Z' }],
    total: 1, size: 20, current: 1, pages: 1
  }
}

/** per-route 同步状态（GET /v1/routes/{id}/sync-status 契约；in_sync 全局口径） */
function routeSync(over: Record<string, unknown> = {}) {
  return {
    route_id: 'r1',
    route_config_version: '42',
    available: true,
    gateway: { version: 42, fingerprint: 'fp', updated_at: 1, instance: 'gw-1' },
    db_version: 42,
    in_sync: true,
    ...over
  }
}

async function factory(routeId = 'r1'): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/:id/detail', component: Detail as any },
      { path: '/v2/routes', component: stub },
      { path: '/v2/publish/:id', component: stub }
    ]
  })
  await router.push(`/v2/routes/${routeId}/detail`)
  await router.isReady()
  const wrapper = mount(Detail, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.getRouteVersions.mockReset().mockResolvedValue(defaultVersions())
  mocks.getRouteVersionDiff.mockReset().mockResolvedValue([])
  mocks.getRouteSyncStatus.mockReset().mockResolvedValue(routeSync())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue([makeTraffic('r1')])
  mocks.fetchRouteTimeseries.mockReset().mockResolvedValue(makeTimeseries())
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
  mocks.canEdit.mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

const KEYS = ['syncSynced', 'syncDelayed', 'syncUnknown'].map((k) => `v2.routes.${k}`)

describe('OPT-6 详情同步角标 — i18n key 双语存在（铁律 6，v2.routes.sync* 跨页共用）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── S2 挂载查询一次 + synced 态 ───────────────────────────────────────────

describe('S2 — 挂载查询一次 per-route 端点；in_sync=true → synced「已生效」', () => {
  it("挂载即 getRouteSyncStatus('r1') 恰一次；角标渲染 data-state=synced 文案「已生效」", async () => {
    mocks.getRouteSyncStatus.mockResolvedValue(routeSync({ in_sync: true }))
    const { wrapper } = await factory()
    expect(mocks.getRouteSyncStatus, '挂载应查询一次 per-route 同步状态').toHaveBeenCalledTimes(1)
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledWith('r1')
    const badge = byTestid(wrapper, 'dtl-sync-badge')
    expect(badge.exists(), '查询成功后应渲染 dtl-sync-badge').toBe(true)
    expect(badge.attributes('data-state')).toBe('synced')
    expect(badge.text()).toContain(t('v2.routes.syncSynced'))
    // 角标位于页头内
    expect(byTestid(wrapper, 'dtl-header').find('[data-testid="dtl-sync-badge"]').exists()).toBe(true)
  })
})

// ── S3 delayed 态 ─────────────────────────────────────────────────────────

describe('S3 — available=true && in_sync=false → delayed「同步延迟」', () => {
  it('网关落后于 DB → data-state=delayed；无独立重试钮（重查走既有 dtl-refresh）', async () => {
    mocks.getRouteSyncStatus.mockResolvedValue(routeSync({ in_sync: false, gateway: { version: 41, fingerprint: 'fp', updated_at: 1, instance: 'gw-1' } }))
    const { wrapper } = await factory()
    const badge = byTestid(wrapper, 'dtl-sync-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('data-state')).toBe('delayed')
    expect(badge.text()).toContain(t('v2.routes.syncDelayed'))
    expect(byTestid(wrapper, 'dtl-sync-retry').exists()).toBe(false)
  })
})

// ── S4 unknown 态 ─────────────────────────────────────────────────────────

describe('S4 — available=false（gateway=null，状态未知）→ unknown「状态未知」', () => {
  it('引擎状态未知 → data-state=unknown，不误报「同步延迟」假警报', async () => {
    mocks.getRouteSyncStatus.mockResolvedValue(routeSync({ available: false, gateway: null, in_sync: false }))
    const { wrapper } = await factory()
    const badge = byTestid(wrapper, 'dtl-sync-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('data-state')).toBe('unknown')
    expect(badge.text()).toContain(t('v2.routes.syncUnknown'))
    expect(badge.text()).not.toContain(t('v2.routes.syncDelayed'))
  })
})

// ── S5 查询失败：角标隐藏 + 分区独立（V14 口径 + 旧测试兼容机制）─────────────

describe('S5 — per-route 查询失败（旧版后端 404/网络失败）→ 角标不渲染，页面其余分区照常', () => {
  it('getRouteSyncStatus reject → dtl-sync-badge 不存在 + dtl-name/历史/四联图照常（内部 try/catch 静默降级）', async () => {
    mocks.getRouteSyncStatus.mockRejectedValue(new BusinessError(10400, '接口不存在'))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'dtl-sync-badge').exists()).toBe(false)
    expect(byTestid(wrapper, 'dtl-page').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-name').text()).toContain('user_service')
    expect(byTestid(wrapper, 'dtl-version-row-v3').exists()).toBe(true)
    expect(byTestid(wrapper, 'dtl-chart-qps').exists()).toBe(true)
  })

  it('挂载后推进 3s 角标仍不出现、无第二轮查询（失败不轮询、不重试）', async () => {
    mocks.getRouteSyncStatus.mockRejectedValue(new Error('network down'))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(3000)
    expect(byTestid(wrapper, 'dtl-sync-badge').exists()).toBe(false)
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledTimes(1)
  })
})

// ── S6 手动刷新覆盖同步角标 ────────────────────────────────────────────────

describe('S6 — dtl-refresh 手动刷新加发一次 per-route 同步查询（不做 setInterval）', () => {
  it("点击 dtl-refresh → getRouteSyncStatus('r1') 第二次调用（参数不变），角标随最新结果刷新", async () => {
    const { wrapper } = await factory()
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledTimes(1)
    mocks.getRouteSyncStatus.mockResolvedValue(routeSync({ in_sync: false }))
    await byTestid(wrapper, 'dtl-refresh').trigger('click')
    await flushPromises()
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledTimes(2)
    expect(mocks.getRouteSyncStatus).toHaveBeenLastCalledWith('r1')
    expect(byTestid(wrapper, 'dtl-sync-badge').attributes('data-state')).toBe('delayed')
    // 手动刷新语义：不启动周期轮询
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledTimes(2)
  })
})

// ── S7 无轮询固化 ─────────────────────────────────────────────────────────

describe('S7 — 详情角标为一次性快照：挂载后无任何周期轮询（侦察结论 ⑥ 口径）', () => {
  it('挂载后推进 3s，getRouteSyncStatus 仍只 1 次', async () => {
    mocks.getRouteSyncStatus.mockResolvedValue(routeSync({ in_sync: false }))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.getRouteSyncStatus).toHaveBeenCalledTimes(1)
  })
})
