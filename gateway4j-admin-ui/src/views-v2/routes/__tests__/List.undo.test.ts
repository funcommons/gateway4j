/**
 * LOW-4【T/RED】：单条删除 undo 窗口——乐观移除 + 5s 撤销（优化.md 低优先级 #10「删除即走 confirm+永久，无软删窗口」）。
 * 先红是预期：List.vue 已实现（S3-C/OPT-3/OPT-6 在案），但 undo 窗口未实现——行为缺失型 RED，
 * 由 C 步实现后转绿；既有 List.test.ts（P4f① + OPT-3 全部用例）零改动零误伤（本文件独立，纯增量）。
 *
 * ── 主 agent 裁决（测试据此，后端零改动：gw_route 本就 @TableLogic 软删）─────────
 * onDelete 现链路 fcConfirm → deleteRoute → reload → pruneSelection 改为：
 *   确认删除（confirm 参数与门禁不变）→ 行立即乐观消失（本地过滤，不重拉）→ 出现带倒计时的 undo 提示
 *   → 5s 内点「撤销」：行恢复原位（零 API 调用、不重拉）
 *   → 5s 超时：才真正调 deleteRoute(id) → 静默完成（已有 undo 提示即通知，不重复 toast）→ 重拉一次
 * 范围仅单条删除 onDelete；OPT-3 批量删除维持即时语义，不在本票。
 *
 * ── T 步裁决固化（各争议点在此钉死，C 按此实现）──────────────────────────────
 * ① undo 提示体 = 页根级条（非 ElMessage）：toast 被 mock 无法承载可点击钮+每条独立倒计时；
 *    页根级条与 bat-bar / bat-fail-detail 同一家族，jsdom 可交互可断言。
 * ② 多条并发删除 = 独立窗口各自 timer（非排队/覆盖）：每条各自 5s 起点与倒计时，
 *    撤销/到期互不影响（E 组钉死）。
 * ③ 恢复保真度：行位置全保真（rows 数组永不被 mutation，乐观移除只发生在派生层过滤 →
 *    撤销零成本回原位）；展开态全保真（expanded Set 不动，spark 缓存存活不重请求）；
 *    勾选态【不】保真：进窗口即把该 id 剔出 selectedIds（对齐 OPT-3 pruneSelection
 *    「已消失 id 视为不合格」口径，防 bat-count 幽灵计数），撤销后行恢复但 checkbox 复位（C3 钉死）。
 * ④ 超时完成 = 静默：deleteRoute 恰一次 → 重拉一次 → 条目退场；不补 toast.success
 *    （undo 条目本身即已通知，不重复播报）。
 * ⑤ 超时失败 = 回滚（数据安全侧）：deleteRoute reject → 行恢复原位 + toast.error(e.message
 *    ‖ deleteFailed) + 不重拉 + 条目退场（用户须看到行回来才知道没删成）。
 * ⑥ 乐观移除行与门禁/筛选互斥（防幽灵/防复活）：不进 bat-count/门禁矩阵/全选（进窗口即
 *    prune）；不因状态筛选复活（乐观移除落在 keywordRows 上游派生层，v-show 只能藏不能造行）。
 * ⑦ 卸载/离开窗口期 = 放弃删除（安全侧裁决）：onBeforeUnmount 清全部 pending timer，
 *    永不后台补刀——不删 = 安全（用户走了还悄悄删数据才是事故）（F1 钉死）。
 * ⑧ 倒计时 = 整数秒文本 5→1（每秒步进），到期即触发真删。
 *
 * ── DOM 契约（data-testid，del-undo-* 新家族，全表）────────────────────────
 * del-undo-bar：撤销条容器，pendingDeletes.length ≥ 1 时渲染于页根级（bat-fail-detail 同位），
 *   role="status"；多条并存时容器恰一枚。
 * del-undo-<id>：单条 pending 条目（文案 delUndoDeleted「已删除「{name}」」+ 倒计时 + 撤销钮）。
 * del-undo-btn-<id>：撤销按钮（文案 v2.routes.delUndoBtn）。
 * del-undo-countdown-<id>：倒计时文本（v2.routes.delUndoCountdown，整数秒 5→1）。
 * 泛化说明：任务样例名 del-undo / del-undo-btn / del-undo-countdown 因②「独立窗口」语义
 * 需按 id 定位，统一泛化为带 -<id> 后缀（上表即全表）。
 *
 * ── i18n（v2.routes.* 树追加，双语同位，铁律 6）────────────────────────────
 * delUndoDeleted：'已删除「{name}」' / 'Deleted "{name}"'
 * delUndoCountdown：'{n}s' / '{n}s'
 * delUndoBtn：'撤销' / 'Undo'
 *
 * ── C 步实现要点（pendingDeletes 数据结构建议）────────────────────────────
 *   interface PendingDelete { row: DisplayRow; timer: ReturnType<typeof setTimeout>;
 *     tick: ReturnType<typeof setInterval>; remaining: number }
 *   const pendingDeletes = ref(new Map<string, PendingDelete>())   // Map 保插入序
 *   const pendingIds = computed(() => new Set(pendingDeletes.value.keys()))
 *   const aliveRows = computed(() => rows.value.filter((r) => !pendingIds.value.has(r.id)))
 *   - keywordRows / selectedStatuses 的 statusById / pruneSelection 的 alive 集 /
 *     批量 qualified 源，全部改挂 aliveRows（一处派生，四处天然互斥）。
 *   - onDelete 确认后：selectedIds.delete(id) → pendingDeletes.set(id, {…}) →
 *     setTimeout(5000) 内 await execCommand(deleteRoute(id))，成功 → reload() + pruneSelection()
 *     + pendingDeletes.delete(id)（零 toast）；失败 → pendingDeletes.delete(id) + toast.error。
 *   - 撤销：clearTimeout + clearInterval + pendingDeletes.delete(id)（零 API、零 reload）。
 *   - onBeforeUnmount：遍历 clearTimeout/clearInterval + map.clear()。
 *   - 既有「P4f① 删除成功链 / deleteRoute 失败」两用例语义将过时（F 轮 justified 更新，
 *     见报告冲突清单）；本 RED 阶段不碰它们。
 * ── fake timers 手法：List.sync.test.ts 同款（beforeEach useFakeTimers +
 *    afterEach useRealTimers；getSyncStatus mock 成 pending 防同步轮询噪声）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
// 真品 usePublishSync 的依赖：只 mock getSyncStatus（List.sync.test.ts 同款，pending 防噪声）
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
/** 参数化 i18n 取值（{n}/{name} 占位替换；List.test.ts tf 同款） */
function tf(key: string, params: Record<string, string | number>): string {
  let s = String(dig(zhCN, `v2.routes.${key}`))
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** undo 窗口宽度（主 agent 裁决：5s） */
const UNDO_WINDOW_MS = 5000

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
    // r5 须过 act-delete 门禁（DRAFT|OFFLINE，List.vue L242）供 E 组二次删除：取 OFFLINE 而非 DRAFT——B3「唯一草稿入窗后 DRAFT 视图呈空态」钉死 r4 唯一 DRAFT
    makeNode('r5', { route_name: 'orphan_svc', status: 'OFFLINE' })
  ]
}
function defaultTraffic() {
  return [makeTraffic('r1'), makeTraffic('r2'), makeTraffic('r3'), makeTraffic('r4')]
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
const row = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="route-row-${id}"]`)
const cell = (w: VueWrapper<any>, id: string, name: string) => w.find(`[data-testid="route-row-${id}"] [data-testid="${name}"]`)
const rowCbx = (w: VueWrapper<any>, id: string) => one(w, `sel-row-${id}`)
/** 当前可见行 id 序列（tbody v-for 文档序 = 原位保真断言通道） */
function rowOrder(w: VueWrapper<any>): string[] {
  return w.findAll('[data-testid^="route-row-"]').map((e) => String(e.attributes('data-testid')).slice('route-row-'.length))
}
/** 展开 r 并点行内删除（act-delete 仅 DRAFT|OFFLINE 展开卡可见），confirm 默认同意 */
async function deleteViaCard(w: VueWrapper<any>, id: string) {
  await w.find(`[data-testid="route-expand-${id}"]`).trigger('click')
  await flushPromises()
  await cell(w, id, 'act-delete').trigger('click')
  await flushPromises()
}
/** 状态分段钮（页面无 testid，按文案定位——List.test.ts pickStatus 同款） */
async function pickStatus(w: VueWrapper<any>, label: string) {
  const btn = w.findAll('.fc-segmented__item').find((b) => b.text().includes(label))
  expect(btn, `状态分段缺少选项「${label}」`).toBeDefined()
  await btn!.trigger('click')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'copy-1' })
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue({ status: 'OFFLINE' })
  mocks.publishRoute.mockReset().mockResolvedValue({ id: 'ok' })
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.fetchRouteTimeseries.mockReset().mockResolvedValue({ source: 'prometheus', data_points: [] })
  mocks.getSyncStatus.mockReset().mockImplementation(() => new Promise(() => {}))
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

const UNDO_KEYS = ['delUndoDeleted', 'delUndoCountdown', 'delUndoBtn'].map((k) => `v2.routes.${k}`)

// ═══ A — i18n key 双语存在（铁律 6）═══
describe('LOW-4 删除 undo 窗口 — i18n key 双语存在（铁律 6）', () => {
  it.each(UNDO_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ═══ B — 确认后乐观移除 + undo bar（验收点 1）═══
describe('LOW-4 确认删除 → 乐观移除 + del-undo-bar（零 API）', () => {
  it('确认删除后：行乐观消失 + undo 条目/撤销钮/倒计时出现 + deleteRoute 零调用 + 不重拉 + 不提前报成功；confirm 参数不变', async () => {
    const { wrapper } = await factory()
    const before = mocks.listRoutes.mock.calls.length
    await deleteViaCard(wrapper, 'r4')
    // confirm 步不变（danger + title + content 照 P4f① 口径）
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.routes.confirmDeleteTitle')),
      content: expect.stringContaining(t('v2.routes.confirmDelete'))
    }))
    // 乐观移除：行立即可见消失
    expect(row(wrapper, 'r4').exists(), '确认后行应乐观消失').toBe(false)
    // undo 家族出现
    const bar = one(wrapper, 'del-undo-bar')
    expect(bar.exists(), '页根级撤销条 del-undo-bar 应出现').toBe(true)
    expect(bar.attributes('role'), '撤销条应可活区播报 role=status').toBe('status')
    const item = one(wrapper, 'del-undo-r4')
    expect(item.exists(), '单条 pending 条目 del-undo-<id> 应出现').toBe(true)
    expect(item.text(), '条目文案应为 已删除「{name}」').toContain(tf('delUndoDeleted', { name: 'draft_svc' }))
    expect(one(wrapper, 'del-undo-btn-r4').exists(), '撤销钮 del-undo-btn-<id> 应出现').toBe(true)
    expect(one(wrapper, 'del-undo-countdown-r4').exists(), '倒计时 del-undo-countdown-<id> 应出现').toBe(true)
    expect(one(wrapper, 'del-undo-countdown-r4').text(), '窗口起点倒计时应为 5').toContain('5')
    // 窗口期零 API：不真删、不重拉、不提前报成功
    expect(mocks.deleteRoute, 'undo 窗口内不得真调 deleteRoute').not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '乐观移除不得重拉列表').toBe(before)
    expect(mocks.toast.success, '窗口期不提前报「已删除」').not.toHaveBeenCalled()
  })

  it('乐观移除只隐该行：其余行原序保真（r4 缺席、r1/r2/r3/r5 顺序不变）', async () => {
    const { wrapper } = await factory()
    expect(rowOrder(wrapper)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    await deleteViaCard(wrapper, 'r4')
    expect(row(wrapper, 'r4').exists()).toBe(false)
    expect(rowOrder(wrapper), '其余行必须原位保真不得重排').toEqual(['r1', 'r2', 'r3', 'r5'])
  })

  it('乐观移除行不因状态筛选复活：DRAFT 视图看不到它（空态出现）；撤销后回到 DRAFT 视图（验收点 6）', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    await pickStatus(wrapper, t('v2.routes.statusDraft'))
    expect(row(wrapper, 'r4').exists(), '乐观移除行不得被状态筛选复活').toBe(false)
    expect(one(wrapper, 'route-empty').exists(), 'DRAFT 视图应因唯一草稿入窗而呈空态').toBe(true)
    expect(one(wrapper, 'del-undo-r4').exists(), '撤销条为页根级，不随筛选退场').toBe(true)
    // 撤销 → 行回到 DRAFT 视图
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists(), '撤销后行应回到当前视图').toBe(true)
    expect(one(wrapper, 'route-empty').exists()).toBe(false)
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
  })
})

// ═══ C — 5s 内撤销（验收点 2 + 裁决③⑥）═══
describe('LOW-4 撤销 — 行恢复原位、零 API、toast 退场', () => {
  it('5s 内点撤销：行恢复原位（全序保真）+ deleteRoute/listRoutes 零调用 + 条目退场', async () => {
    const { wrapper } = await factory()
    const before = mocks.listRoutes.mock.calls.length
    await deleteViaCard(wrapper, 'r4')
    expect(row(wrapper, 'r4').exists()).toBe(false)
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(rowOrder(wrapper), '撤销后行必须回到原位').toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(one(wrapper, 'del-undo-bar').exists(), '无剩余 pending 时撤销条应退场').toBe(false)
    expect(mocks.deleteRoute, '撤销是纯本地恢复，不得发删除请求').not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '撤销不得重拉列表').toBe(before)
    expect(mocks.toast.success, '撤销以行恢复为反馈，不补 toast').not.toHaveBeenCalled()
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('展开态保真：删前已展开 → 撤销后 route-detail 仍在且 spark 不重请求（缓存存活）', async () => {
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="route-expand-r4"]').trigger('click')
    await flushPromises()
    expect(mocks.fetchRouteTimeseries).toHaveBeenCalledTimes(1)
    await cell(wrapper, 'r4', 'act-delete').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists()).toBe(false)
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists()).toBe(true)
    expect(wrapper.find('[data-testid="route-detail-r4"]').exists(), '展开态应保真').toBe(true)
    expect(mocks.fetchRouteTimeseries, 'spark 缓存存活不得重请求').toHaveBeenCalledTimes(1)
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
  })

  it('勾选态裁决：入窗即剔出选择集（bat-bar 退场防幽灵计数）；撤销后行恢复但勾选复位（裁决③固化）', async () => {
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'r4').setValue(true)
    expect(one(wrapper, 'bat-bar').exists()).toBe(true)
    await deleteViaCard(wrapper, 'r4')
    expect(row(wrapper, 'r4').exists()).toBe(false)
    expect(one(wrapper, 'bat-bar').exists(), '乐观移除行必须同步剔出选择集（不残留幽灵计数）').toBe(false)
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists()).toBe(true)
    expect((rowCbx(wrapper, 'r4').element as HTMLInputElement).checked, '勾选态不保真（防幽灵计数优先于恢复保真）').toBe(false)
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
  })
})

// ═══ D — 超时真删（验收点 3/4 + 裁决④⑤⑧）═══
describe('LOW-4 超时 — deleteRoute 恰一次 → 静默重拉；失败回滚', () => {
  it('5s 超时：deleteRoute 恰调一次（参数=id）→ 重拉恰一次 → 条目退场 → toast.success 零调用（静默完成不重复播报）', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
    mocks.listRoutes.mockResolvedValue(defaultNodes().filter((n) => n.id !== 'r4'))
    const before = mocks.listRoutes.mock.calls.length
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    await flushPromises()
    expect(mocks.deleteRoute, '超时后应真删').toHaveBeenCalledTimes(1)
    expect(mocks.deleteRoute).toHaveBeenCalledWith('r4')
    expect(mocks.listRoutes.mock.calls.length, '超时完成应重拉恰一次').toBe(before + 1)
    expect(row(wrapper, 'r4').exists(), '重拉后行应消失').toBe(false)
    expect(one(wrapper, 'del-undo-bar').exists(), '完成后撤销条应退场').toBe(false)
    expect(mocks.toast.success, '超时完成静默（undo 条目即通知，不重复 toast）').not.toHaveBeenCalled()
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('窗口边界钉死 5000ms：4999ms 未删，+1ms 恰删', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1)
    await flushPromises()
    expect(mocks.deleteRoute, '窗口内（4999ms）不得真删').not.toHaveBeenCalled()
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(mocks.deleteRoute, '满 5000ms 应恰删一次').toHaveBeenCalledTimes(1)
    expect(mocks.deleteRoute).toHaveBeenCalledWith('r4')
  })

  it('超时失败回滚（数据安全侧）：行恢复原位 + toast.error(后端原因) + 不重拉 + 条目退场', async () => {
    mocks.deleteRoute.mockRejectedValue(new Error('上游仍引用该路由'))
    const { wrapper } = await factory()
    const before = mocks.listRoutes.mock.calls.length
    await deleteViaCard(wrapper, 'r4')
    expect(row(wrapper, 'r4').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    await flushPromises()
    expect(mocks.deleteRoute).toHaveBeenCalledTimes(1)
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('上游仍引用'))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(rowOrder(wrapper), '删除失败必须回滚行（原位）').toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(mocks.listRoutes.mock.calls.length, '失败不重拉').toBe(before)
    expect(one(wrapper, 'del-undo-bar').exists(), '终态落定后条目应退场').toBe(false)
  })

  it('倒计时整数秒步进 5→1（验收点 4），步进全程零 API', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    const cnt = () => one(wrapper, 'del-undo-countdown-r4')
    for (const expectN of [5, 4, 3, 2, 1]) {
      expect(cnt().text(), `倒计时应为 ${expectN}s`).toContain(String(expectN))
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
    }
    // 此时已走满 5s：恰在最后一步到期
    expect(mocks.deleteRoute, '走满 5000ms 应已真删').toHaveBeenCalledTimes(1)
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(false)
  })
})

// ═══ E — 独立窗口（验收点 5 + 裁决②）═══
describe('LOW-4 窗口期内再删另一条 — 独立窗口各自 timer', () => {
  it('双条独立计时：r4 删后 2s 删 r5 → r5 以自己的 5s 起点（r4 已走到 3s）；r4 到期只删 r4；r5 到期再删 r5', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    await deleteViaCard(wrapper, 'r5')
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(true)
    expect(one(wrapper, 'del-undo-r5').exists(), '第二条应有自己的独立条目').toBe(true)
    expect(wrapper.findAll('[data-testid="del-undo-bar"]').length, '多条并存时容器恰一枚').toBe(1)
    expect(one(wrapper, 'del-undo-countdown-r4').text(), 'r4 已走过 2s 应剩 3').toContain('3')
    expect(one(wrapper, 'del-undo-countdown-r5').text(), 'r5 起点应满 5（独立窗口非接管剩余时间）').toContain('5')
    // r4 到期（t=5s）：只删 r4，r5 条目不受牵连
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(mocks.deleteRoute.mock.calls.map((c) => c[0]), 'r4 到期只删 r4').toEqual(['r4'])
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(false)
    expect(one(wrapper, 'del-undo-r5').exists(), 'r5 条目应存活').toBe(true)
    expect(one(wrapper, 'del-undo-countdown-r5').text(), 'r5 此刻应剩 2').toContain('2')
    // r5 到期（t=7s）
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(mocks.deleteRoute.mock.calls.map((c) => c[0])).toEqual(['r4', 'r5'])
    expect(one(wrapper, 'del-undo-bar').exists()).toBe(false)
  })

  it('独立撤销互不干扰：撤销 r4 后 r5 条目仍存活；再撤销 r5 全恢复，全程零 API', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    await deleteViaCard(wrapper, 'r5')
    expect(rowOrder(wrapper)).toEqual(['r1', 'r2', 'r3'])
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists(), '撤销 r4 行应恢复').toBe(true)
    expect(one(wrapper, 'del-undo-r5').exists(), 'r5 窗口不得被 r4 的撤销牵连').toBe(true)
    expect(row(wrapper, 'r5').exists(), 'r5 未撤销前应保持乐观移除').toBe(false)
    await one(wrapper, 'del-undo-btn-r5').trigger('click')
    await flushPromises()
    expect(rowOrder(wrapper), '全部撤销后全序恢复').toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(one(wrapper, 'del-undo-bar').exists()).toBe(false)
    expect(mocks.deleteRoute).not.toHaveBeenCalled()
  })
})

// ═══ F — 卸载放弃删除（验收点 7 + 裁决⑦：不删=安全侧）═══
describe('LOW-4 卸载/离开窗口期 — 放弃删除（永不后台补刀）', () => {
  it('窗口期 unmount → timer 全清 → 推进 10s deleteRoute 仍零调用（放弃=安全侧裁决固化）', async () => {
    const { wrapper } = await factory()
    await deleteViaCard(wrapper, 'r4')
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(true)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(mocks.deleteRoute, '卸载后不得后台补刀删除').not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '卸载后亦不得重拉').toBeLessThanOrEqual(1)
  })
})

// ═══ G — 源码契约 fs 抽查（P4f①/OPT-3 先例）═══
describe('LOW-4 源码契约 — List.vue fs 抽查（testid 字面量 + 卸载清理接线）', () => {
  const source = () => fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')

  it('del-undo-* 家族 + 批量删入口保留 + onBeforeUnmount 清理 + 确认链保留', () => {
    const src = source()
    expect(src).toContain('data-testid="del-undo-bar"')
    expect(src).toContain('del-undo-')
    expect(src).toContain('del-undo-btn-')
    expect(src).toContain('del-undo-countdown-')
    // 卸载放弃删除：必须有 onBeforeUnmount 清理接线（裁决⑦）
    expect(src).toContain('onBeforeUnmount')
    // 确认步与门禁不变；批量删除入口不在本票范围
    expect(src).toContain('confirmDeleteTitle')
    expect(src).toContain('data-testid="act-delete"')
    expect(src).toContain('deleteRoute')
  })
})
