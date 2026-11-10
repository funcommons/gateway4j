/**
 * OPT-6-FE【RED】：发布同步状态角标——Publish 页（v2 优化建议 #5「最后一公里」，usePublishSync 首个消费方）。
 * 先红是预期：页面存在（S5-C 已实现），但同步角标（pub-sync-*）未实现——本文件为行为缺失型 RED，
 * 由 C 步实现后转绿；既有 Publish.test.ts 零改动零误伤（本文件独立，纯增量）。
 *
 * ── 侦察结论与落点裁决（如实固化）───────────────────────────────────────────
 * ① Detail.vue 的 dtl-action-publish 只是 router.push('/v2/publish/{id}') 导航，页面本身
 *    【没有发布成功回调】；全站发布成功回调唯一所在地 = 本页 onPublish()（List 行内 act-publish
 *    同样汇入本页）。故「发布成功 → usePublishSync start() → 三态角标」落在本页，而非 Detail。
 * ② usePublishSync（src/composables/usePublishSync.ts，P1-3 已带完整自测）此前全库零 .vue 消费；
 *    本页为其首个真实消费方：真品 composable + mock @/api/misc（跟 usePublishSync.test.ts 惯例）。
 * ③ 轮询策略（固化）：发布成功回调里 start() 一次，默认参数（1s 间隔 / 15s 超时）；
 *    synced 即停；15s 超时 → delayed + 重试按钮（retry() = 再来一轮完整轮询）。
 *    批量发布在 List 页就地完成，其收尾轮询归 List（见 List.sync.test.ts），与本页无关。
 *
 * ── DOM 契约（data-testid，pub-* 家族新增）──────────────────────────────────
 * pub-sync-badge：同步状态角标，位于发布表单卡（pub-publish-form）内、pub-publish-error 同区；
 *   仅 phase !== 'idle' 时渲染（= 发布成功后出现；未发布/发布失败不渲染）；
 *   data-phase 属性 ∈ polling | synced | delayed（usePublishSync 终态语义原样）；
 *   文案随 phase：polling→syncSyncing（同步中）/ synced→syncSynced（已生效）/ delayed→syncDelayed（同步延迟）。
 * pub-sync-retry：仅 delayed 时出现的重试按钮（文案 syncRetry），点击 → retry() → 角标回 polling。
 *
 * ── i18n（v2.routes.* 树追加，双语同位，铁律 6；跨页共用一棵，Detail/List 复用）────
 * syncSyncing（同步中 / Syncing）syncSynced（已生效 / Live）syncDelayed（同步延迟 / Sync delayed）
 * syncRetry（重试 / Retry）
 * （syncUnknown 仅 per-route 端点使用，见 Detail.sync.test.ts，本页三态词汇与 usePublishSync 一致）
 *
 * ── C 步实现要点 ──────────────────────────────────────────────────────────
 * - setup 里 const sync = usePublishSync()（真品）；onPublish 成功分支（ElMessage.success 之后）
 *   调 sync.start()；模板 v-if="sync.phase.value !== 'idle'"（script setup 里直接 phase）。
 * - 旧 Publish.test.ts 兼容：其未 mock @/api/misc → composable 走真 axios，仅发布成功才发请求，
 *   jsdom 内失败被 composable catch 降级 delayed，不触碰任何既有断言、无浮动 rejection。
 * - SDK-only：角标禁 <el- 直用，文案一律 t()；template 块禁 CJK。
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
  publishRoute: vi.fn(),
  getRouteVersions: vi.fn(),
  getRouteVersionDiff: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  getSyncStatus: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  getRouteVersions: mocks.getRouteVersions,
  getRouteVersionDiff: mocks.getRouteVersionDiff
}))
vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary
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

import Publish from '@/views-v2/publish/Publish.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
// dig: 按点路径取 locale 值；undefined = key 缺失（Publish.test.ts 同款）
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
    hits_24h: 84000, qps: 12, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 80000, c4xx: 3000, c5xx: 1000 },
    upstream: { reachable: true, latency_ms: 8 }, source: 'prometheus', quantile_fallback: false, ...over
  }
}
const NOW = 1793750400000
function makeVersion(v: string, over: Record<string, unknown> = {}) {
  return {
    id: `ver-${v}`, route_id: 'r1', config_version: v,
    change_type: v === 'v1' ? 'CREATE' : 'PUBLISH',
    snapshot_data: { route_name: 'api_gateway', path: '/api/**', upstream_url: '' },
    change_description: null,
    actor: 'admin', published_at: NOW, ...over
  }
}
function defaultVersions() {
  return [makeVersion('v3'), makeVersion('v2'), makeVersion('v1')]
}
function defaultDiff() {
  return [{ field: 'timeout', from: '3s', to: '5s' }]
}
function defaultNodes() {
  return [
    makeNode('r1', {
      route_name: 'api_gateway', route_type: 'DISPATCH', upstream_url: '',
      children: [makeNode('c1'), makeNode('c2')]
    })
  ]
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/publish/:id', component: Publish as any },
      { path: '/v2/routes', component: stub },
      { path: '/v2/routes/:id/detail', component: stub }
    ]
  })
  await router.push('/v2/publish/r1')
  await router.isReady()
  const wrapper = mount(Publish, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)
/** 发布一次（预置成功），走到发布成功回调之后 */
async function publishOnce(wrapper: VueWrapper<any>) {
  await byTestid(wrapper, 'pub-desc-input').setValue('首发限流保护')
  await byTestid(wrapper, 'pub-publish-btn').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.publishRoute.mockReset().mockResolvedValue({})
  mocks.getRouteVersions.mockReset().mockResolvedValue(defaultVersions())
  mocks.getRouteVersionDiff.mockReset().mockResolvedValue(defaultDiff())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue([makeTraffic('r1')])
  mocks.getSyncStatus.mockReset().mockImplementation(pending)
  mocks.canEdit.mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

const KEYS = ['syncSyncing', 'syncSynced', 'syncDelayed', 'syncRetry'].map((k) => `v2.routes.${k}`)

describe('OPT-6 同步角标 — i18n key 双语存在（铁律 6，v2.routes.sync* 跨页共用）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── S2 初始态：未发布不渲染 ────────────────────────────────────────────────

describe('S2 — 初始（未发布）：pub-sync-badge 不渲染、零同步查询', () => {
  it('挂载后角标不存在，getSyncStatus 未被调用（轮询只在发布成功后启动）', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'pub-sync-badge').exists()).toBe(false)
    expect(byTestid(wrapper, 'pub-sync-retry').exists()).toBe(false)
    expect(mocks.getSyncStatus).not.toHaveBeenCalled()
  })
})

// ── S3 发布成功 → polling「同步中」 ────────────────────────────────────────

describe('S3 — 发布成功回调启动轮询：角标出现 data-phase=polling「同步中」', () => {
  it('发布成功 → 角标出现（polling，同步中），且 getSyncStatus 首查即时发出', async () => {
    mocks.getSyncStatus.mockImplementation(pending)
    const { wrapper } = await factory()
    await publishOnce(wrapper)
    expect(mocks.publishRoute).toHaveBeenCalledWith('r1', '首发限流保护')
    const badge = byTestid(wrapper, 'pub-sync-badge')
    expect(badge.exists(), '发布成功后应出现同步角标 pub-sync-badge').toBe(true)
    expect(badge.attributes('data-phase')).toBe('polling')
    expect(badge.text()).toContain(t('v2.routes.syncSyncing'))
    expect(mocks.getSyncStatus, 'start() 应立即发出第一次查询').toHaveBeenCalledTimes(1)
  })
})

// ── S4 轮询到 synced ──────────────────────────────────────────────────────

describe('S4 — 轮询到 in_sync=true → synced「已生效」并停止轮询', () => {
  it('in_sync=true → 角标转 synced（已生效），且不再继续查询', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    const { wrapper } = await factory()
    await publishOnce(wrapper)
    await vi.advanceTimersByTimeAsync(0)
    const badge = byTestid(wrapper, 'pub-sync-badge')
    expect(badge.attributes('data-phase')).toBe('synced')
    expect(badge.text()).toContain(t('v2.routes.syncSynced'))
    expect(byTestid(wrapper, 'pub-sync-retry').exists()).toBe(false)
    // synced 即停：再推进 5s 不产生新查询
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })
})

// ── S5 15s 超时 → delayed + 重试 ──────────────────────────────────────────

describe('S5 — 15s 超时 → delayed「同步延迟」+ pub-sync-retry；重试回 polling', () => {
  it('持续 in_sync=false → 15s 后角标 delayed（同步延迟）并停止轮询', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { wrapper } = await factory()
    await publishOnce(wrapper)
    await vi.advanceTimersByTimeAsync(14000)
    expect(byTestid(wrapper, 'pub-sync-badge').attributes('data-phase')).toBe('polling')
    await vi.advanceTimersByTimeAsync(2000)
    const badge = byTestid(wrapper, 'pub-sync-badge')
    expect(badge.attributes('data-phase'), '15s 超时应转 delayed').toBe('delayed')
    expect(badge.text()).toContain(t('v2.routes.syncDelayed'))
    const calls = mocks.getSyncStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus.mock.calls.length).toBe(calls)
  })

  it('delayed → pub-sync-retry（重试）出现；点击 → 角标回 polling 并重启查询，随后可转 synced', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { wrapper } = await factory()
    await publishOnce(wrapper)
    await vi.advanceTimersByTimeAsync(16000)
    const retry = byTestid(wrapper, 'pub-sync-retry')
    expect(retry.exists(), 'delayed 应出现重试入口').toBe(true)
    expect(retry.text()).toContain(t('v2.routes.syncRetry'))
    // 重试：下一轮查询返回 in_sync=true → synced。
    // 首查完成值用 0ms 定时器延迟：mockResolvedValue 的已决 promise 会在 trigger 的
    // await 窗口内就把 phase 推到 synced，polling 态不可观测（mock 时序缺陷修补，断言意图不变）
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    mocks.getSyncStatus.mockImplementationOnce(
      () => new Promise((r) => setTimeout(() => r(inSync(true)), 0))
    )
    await retry.trigger('click')
    expect(byTestid(wrapper, 'pub-sync-badge').attributes('data-phase')).toBe('polling')
    await vi.advanceTimersByTimeAsync(0)
    expect(byTestid(wrapper, 'pub-sync-badge').attributes('data-phase')).toBe('synced')
    expect(byTestid(wrapper, 'pub-sync-retry').exists()).toBe(false)
  })
})

// ── S6 发布失败不触发轮询 ─────────────────────────────────────────────────

describe('S6 — 发布失败：角标不渲染、零同步查询（轮询只挂成功回调）', () => {
  it('publishRoute 拒绝 → pub-publish-error 出现，角标不存在且 getSyncStatus 未被调用', async () => {
    mocks.publishRoute.mockRejectedValueOnce(new Error('downstream 500'))
    const { wrapper } = await factory()
    await publishOnce(wrapper)
    expect(byTestid(wrapper, 'pub-publish-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'pub-sync-badge').exists()).toBe(false)
    expect(mocks.getSyncStatus).not.toHaveBeenCalled()
    // 失败后推进 15s 也不应产生任何查询
    await vi.advanceTimersByTimeAsync(15000)
    expect(mocks.getSyncStatus).not.toHaveBeenCalled()
  })
})
