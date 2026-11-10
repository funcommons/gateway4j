/**
 * OPT-6-FE【RED】：路由列表页全局同步状态 chip（v2 优化建议 #5「最后一公里」）。
 * 先红是预期：页面存在（S3-C/OPT-3 已实现），但全局同步 chip（lst-sync-*）未实现——行为缺失型 RED，
 * 由 C 步实现后转绿；既有 List.test.ts（含 OPT-3 全部用例）零改动零误伤（本文件独立，纯增量）。
 *
 * ── 侦察结论与落点裁决（如实固化）───────────────────────────────────────────
 * ① usePublishSync 注释铁律：「一个页面实例一个轮询，不要每行一个」→ 本页 chip 是【全局一枚】，
 *    不随路由行渲染（与 per-route 无关；per-route 仅详情页 dtl-sync-badge，见 Detail.sync.test.ts）。
 * ② List 行内 act-publish 与 Detail 的发布钮一样只是跳转 /v2/publish/{id}（无页内发布成功回调）；
 *    页内唯一的发布成功回调 = OPT-3 批量发布收尾（runBatchAction('publish') okCount>0）。
 * ③ 轮询策略（固化，采纳任务建议的变体）：chip 整页共用一个 usePublishSync() 真品实例（默认
 *    1s/15s 参数），【挂载即 start()】——常态（已同步）首发查询即 synced 终止 = 等效「查一次」；
 *    未同步场景轻轮询至 15s 封顶转 delayed + 重试钮。【批量发布收尾 okCount>0 → start() 重启一轮】
 *    到 synced 即停。单条 act-publish 仅导航，不重启轮询（回调在 Publish 页）。
 *
 * ── DOM 契约（data-testid，lst-* 新家族）──────────────────────────────────
 * lst-sync-chip：全局同步 chip，位于工具条区（FcFilterBar 一带，route-create 同区），整页恰一枚
 *   （任意行数下 count===1）；挂载即渲染（phase !== 'idle' 即渲染）；data-phase ∈ polling |
 *   synced | delayed（usePublishSync 语义原样）；文案随 phase：polling→syncSyncing（同步中）/
 *   synced→syncSynced（已生效）/ delayed→syncDelayed（同步延迟）。
 * lst-sync-retry：仅 delayed 时出现的重试按钮（文案 syncRetry），点击 → start() 重启一轮。
 *
 * ── i18n（v2.routes.* 树追加，双语同位，铁律 6；与 Publish/Detail 共用一棵）────────
 * syncSyncing / syncSynced / syncDelayed / syncRetry
 *
 * ── C 步实现要点（含旧测试兼容说明）────────────────────────────────────────
 * - const sync = usePublishSync()；onMounted 里与 reload 并行 sync.start()；
 *   runBatchAction('publish') 收尾分支（!fails.length 或 okCount>0）加 sync.start()。
 * - 批量下线/删除收尾【不】重启同步轮询（配置未变更语义……注：下线也是变更，但本票范围以
 *   批量发布为界，下线/删除不触发——如实固化，后续票可扩展）。
 * - 旧 List.test.ts 兼容：其未 mock @/api/misc → 真 composable 走真 axios，jsdom 内失败被
 *   composable catch 降级 delayed，不触碰任何既有断言、无浮动 rejection。
 * - SDK-only：chip 禁 <el- 直用；文案一律 t()；template 块禁 CJK。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  publishRoute: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  fetchRouteTimeseries: vi.fn(),
  getSyncStatus: vi.fn(),
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
  publishRoute: mocks.publishRoute
}))
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
// 真品 usePublishSync 的依赖：只 mock getSyncStatus（其自身测试同款惯例）
vi.mock('@/api/misc', () => ({
  getSyncStatus: mocks.getSyncStatus
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
// dig: 按点路径取 locale 值；undefined = key 缺失（List.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

/** 全局同步状态（GET /v1/config/sync-status 契约，src/api/misc.ts SyncStatusResponse） */
function inSync(v: boolean) {
  return {
    available: true,
    gateway: { version: v ? 42 : 41, fingerprint: 'fp', updated_at: 1, instance: 'gw-1' },
    db_version: 42,
    in_sync: v
  }
}
/** 永不 resolve 的查询（卡在 polling 态观察「同步中」） */
const pending = () => new Promise(() => {})

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
function defaultNodes() {
  return [
    makeNode('r1', { route_name: 'user_service' }),
    makeNode('r2', { route_name: 'order_service', upstream_url: 'http://10.0.0.12:9002' }),
    makeNode('r3', { route_name: 'api_gateway', route_type: 'DISPATCH', upstream_url: '' }),
    makeNode('r4', { route_name: 'draft_svc', status: 'DRAFT' }),
    makeNode('r5', { route_name: 'orphan_svc' })
  ]
}
function defaultTraffic() {
  return [makeTraffic('r1'), makeTraffic('r2'), makeTraffic('r3'), makeTraffic('r4')]
}
/** 批量门禁矩阵夹具（List.test.ts batchNodes 同款：两 PUBLISHED + 两 DRAFT + 一 OFFLINE + 一 CHANGING） */
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

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
const rowCbx = (w: VueWrapper<any>, id: string) => one(w, `sel-row-${id}`)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'copy-1' })
  mocks.deleteRoute.mockReset().mockResolvedValue({})
  mocks.offlineRoute.mockReset().mockResolvedValue({})
  mocks.publishRoute.mockReset().mockResolvedValue({ id: 'ok' })
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.fetchRouteTimeseries.mockReset().mockResolvedValue({ source: 'prometheus', data_points: [] })
  mocks.getSyncStatus.mockReset().mockImplementation(pending)
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.toast.warning.mockReset()
  mocks.toast.info.mockReset()
  mocks.canEdit.mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

const KEYS = ['syncSyncing', 'syncSynced', 'syncDelayed', 'syncRetry'].map((k) => `v2.routes.${k}`)

describe('OPT-6 列表同步 chip — i18n key 双语存在（铁律 6，v2.routes.sync* 跨页共用）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── S2 挂载即查 + polling 态 ──────────────────────────────────────────────

describe('S2 — 挂载即查一次：lst-sync-chip 出现 data-phase=polling「同步中」', () => {
  it('挂载后 getSyncStatus 首查即时发出（未同步期间轻轮询），chip 渲染同步中', async () => {
    mocks.getSyncStatus.mockImplementation(pending)
    const { wrapper } = await factory()
    expect(mocks.getSyncStatus, '挂载应立即发出第一次同步查询').toHaveBeenCalledTimes(1)
    const chip = one(wrapper, 'lst-sync-chip')
    expect(chip.exists(), '工具条区应挂全局同步 chip lst-sync-chip').toBe(true)
    expect(chip.attributes('data-phase')).toBe('polling')
    expect(chip.text()).toContain(t('v2.routes.syncSyncing'))
  })
})

// ── S3 synced 态 + 全局唯一 + 即停 ────────────────────────────────────────

describe('S3 — in_sync=true → synced「已生效」即停；chip 全局恰一枚（非每行）', () => {
  it('常态（已同步）首发查询即 synced 终止 = 等效「查一次」；6 行路由下 chip 仍只 1 枚', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(0)
    const chip = one(wrapper, 'lst-sync-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.attributes('data-phase')).toBe('synced')
    expect(chip.text()).toContain(t('v2.routes.syncSynced'))
    expect(wrapper.findAll('[data-testid="lst-sync-chip"]').length, 'chip 必须全局一枚，不随行渲染').toBe(1)
    // synced 即停：再推进 5s 不产生新查询
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })
})

// ── S4 15s 超时 → delayed + 重试 ──────────────────────────────────────────

describe('S4 — 15s 超时 → delayed「同步延迟」+ lst-sync-retry；重试回 polling', () => {
  it('持续 in_sync=false → 轻轮询至 15s 封顶转 delayed 并停止', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(14000)
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('polling')
    await vi.advanceTimersByTimeAsync(2000)
    const chip = one(wrapper, 'lst-sync-chip')
    expect(chip.attributes('data-phase'), '15s 超时应转 delayed').toBe('delayed')
    expect(chip.text()).toContain(t('v2.routes.syncDelayed'))
    const calls = mocks.getSyncStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus.mock.calls.length).toBe(calls)
  })

  it('delayed → lst-sync-retry（重试）出现；点击 → chip 回 polling 并重启查询', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(16000)
    const retry = one(wrapper, 'lst-sync-retry')
    expect(retry.exists(), 'delayed 应出现重试入口').toBe(true)
    expect(retry.text()).toContain(t('v2.routes.syncRetry'))
    mocks.getSyncStatus.mockImplementation(pending)
    await retry.trigger('click')
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('polling')
    expect(mocks.getSyncStatus.mock.calls.length, '重试应立即重启查询').toBeGreaterThanOrEqual(1)
  })
})

// ── S5 接口不可用降级 ─────────────────────────────────────────────────────

describe('S5 — 接口不可用（404/网络失败）→ 立即 delayed + 重试，不空转 15s', () => {
  it('getSyncStatus reject → 立即 delayed（同步延迟）+ retry，仅一次调用不再续查', async () => {
    mocks.getSyncStatus.mockRejectedValue(new Error('404'))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(0)
    const chip = one(wrapper, 'lst-sync-chip')
    expect(chip.attributes('data-phase')).toBe('delayed')
    expect(chip.text()).toContain(t('v2.routes.syncDelayed'))
    expect(one(wrapper, 'lst-sync-retry').exists()).toBe(true)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })
})

// ── S6 批量发布收尾重启轮询 ────────────────────────────────────────────────

describe('S6 — 批量发布成功收尾 → start() 重启同步轮询到 synced 即停', () => {
  it('选 d1,d2 → bat-publish → confirm → publishRoute×2 成功 → 同步查询第二轮启动（chip 回同步中→已生效）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    // 第一轮（挂载）：立即 synced 终止
    mocks.getSyncStatus.mockResolvedValueOnce(inSync(true))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(0)
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('synced')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    // 第二轮（批量发布收尾 start()）完成值延迟 100ms：beforeEach 的 pending 永不 resolve，
    // 事后 mockResolvedValue 回填不了已挂起的查询（完成值调用时即绑定）——不延迟则断言集
    // 同时要求「已发出/未返回/之后以新配置完成」，自相矛盾（mock 时序缺陷修补，断言意图不变）
    mocks.getSyncStatus.mockImplementationOnce(
      () => new Promise((r) => setTimeout(() => r(inSync(true)), 100))
    )
    // 批量发布两条 DRAFT
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    await one(wrapper, 'bat-publish').trigger('click')
    await flushPromises()
    expect(mocks.publishRoute).toHaveBeenCalledTimes(2)
    expect(mocks.toast.success).toHaveBeenCalled()
    // 收尾重启：同步查询第二轮即时发出（新一轮 start()），chip 回 polling
    expect(mocks.getSyncStatus, '批量发布收尾应重启同步轮询').toHaveBeenCalledTimes(2)
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('polling')
    // 第二轮同步成功 → synced 即停（推进 100ms 触发上面延迟完成值）
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    await vi.advanceTimersByTimeAsync(100)
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('synced')
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(2)
  })

  it('批量下线/删除收尾不重启同步轮询（本票固化范围：仅批量发布触发）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    mocks.getSyncStatus.mockResolvedValueOnce(inSync(true))
    const { wrapper } = await factory()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    // 批量下线两条 PUBLISHED
    await rowCbx(wrapper, 'p1').setValue(true)
    await rowCbx(wrapper, 'p2').setValue(true)
    await one(wrapper, 'bat-offline').trigger('click')
    await flushPromises()
    expect(mocks.offlineRoute).toHaveBeenCalledTimes(2)
    expect(mocks.getSyncStatus, '批量下线收尾不重启同步轮询').toHaveBeenCalledTimes(1)
    expect(one(wrapper, 'lst-sync-chip').attributes('data-phase')).toBe('synced')
  })
})

// ── S7 单条 act-publish 仅导航，不重启轮询 ─────────────────────────────────

describe('S7 — 行内 act-publish 仅导航到 Publish 页（回调在那边），List 不重启同步轮询', () => {
  it('展开 r1 → act-publish → 跳转 /v2/publish/r1，getSyncStatus 不新增调用', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    const { wrapper, router } = await factory()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await one(wrapper, 'route-expand-r1').trigger('click')
    await flushPromises()
    await one(wrapper, 'act-publish').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/publish/r1')
    expect(mocks.getSyncStatus, '单条发布入口是导航语义，不触发同步轮询').toHaveBeenCalledTimes(1)
  })
})
