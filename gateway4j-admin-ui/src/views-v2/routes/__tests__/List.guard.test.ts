/**
 * S7-3【T/RED】：List.vue 两颗非阻断观察转正为守卫（§7 候选③）。
 * 先红是预期：两守卫均未实现——行为缺失型 RED（零语法错、既有 undo/批量用例零改动零误伤，
 * 本文件独立纯增量），由 C 步实现后转绿。
 *
 * ── 观察一（源自 LOW-4 验证轮 P3 记录）：undo in-flight 竞态 ──────────────────
 * commitPendingDelete 的 deleteRoute await 期间条目尚在 Map（终态才 delete），撤销钮仍可点
 * → 点撤销行短暂复活，随后 commit 成功 reload 又消失（闪烁误导）。
 *
 * ── 守卫契约一（T 步固化，C 按此实现）──────────────────────────────────────
 * ① PendingDelete 增 committing: boolean 标记：undoPendingDelete 出窗语义不变；
 *    commitPendingDelete 在取到 pending 后、await deleteRoute 之前置 pending.committing = true。
 * ② UI 必须表达（disabled）：模板撤销钮 del-undo-btn-<id> 绑 :disabled="p.committing"——
 *    committing 期按钮渲染 disabled 属性（FcButton 透传原生 button，bat-delete 同断言通道）。
 * ③ 点击 no-op（双保险）：undoPendingDelete 对 pending.committing === true 早退——
 *    jsdom/b键盘激活仍派发 click（真浏览器 disabled 拦得住、jsdom 拦不住，onRowCheck 同款先例），
 *    仅 disabled 不够，必须程序化早退兜底：行不得复活（Map 不动 → aliveRows 不变）。
 * ④ 窗口边界不变：到期前（4999ms）撤销完全生效（行原位复活 + timer 清 + 零 API）——
 *    用户在窗口期最后瞬间点撤销是合理意图，守卫只在 commit 发起后收口。
 * ⑤ commit 落定照旧：成功=重拉+prune+条目退场（静默）；失败=回滚+toast.error+条目退场。
 *
 * ── 观察二（源自 P3-d 验证轮 P3 记录）：批量收尾 reload() 抛错 → 双 toast + 选择不清 ──
 * runBatchAction 全成/部分失败两分支 `await reload()` 若抛错会跳入外层 catch：第二枚 error
 * toast + selectedIds.clear() 被跳过；且 reload() 入口置 loading=true、抛错跳过出口复位
 * → 页面钉死骨架屏（第三重危害，本票一并守卫）。
 *
 * ── 守卫契约二（T 步固化，C 按此实现）──────────────────────────────────────
 * ① 收尾矩阵（全成 / 部分失败两分支）的 reload 调用包自身 try/catch；外层 catch 只管
 *    bulk 调用本身（请求级失败语义原样保留，本文件 G2.3 钉死不得被重构波及）。
 * ② reload 失败 → toast.error(t('v2.routes.batReloadFailed')) 恰一枚：固定 i18n 文案，
 *    不透传原始 e.message（刷新属平台关注点，原始抛错对用户不可操作）——文案同时是
 *    「外层 catch 未越权补刀」的可观判别通道（RED：今天漏出的是原始 e.message）。
 * ③ 选择清空语义保持（判词=清空优先）：两分支均照旧 selectedIds.clear()——bulk 已在
 *    服务端落定，陈旧选择集会诱导二次误操作；「保留以便重试」只属于全败分支，此处无重试语义。
 * ④ loading 复位：reload 抛错路径不得把页面钉死在 FcSkeleton（守卫 catch 内复位 loading），
 *    表格须仍渲染（陈旧行可见 + toast 告知刷新失败，是诚实降级）。
 * ⑤ batchRunning 于 finally 复位照旧；batchFails 明细不被 reload 失败污染/清除（明细只收
 *    BulkResult.failed）。
 * ⑥ i18n（v2.routes.* 树追加，双语同位，铁律 6）：
 *    batReloadFailed：'操作已提交，但列表刷新失败' / 'Applied, but the list refresh failed'
 *
 * ── RED 注入手法（为什么毒 getter 是唯一公共面）────────────────────────────
 * reload() 对 API 错误免疫（Promise.allSettled 吞掉 listRoutes / fetchTrafficSummary 双拒），
 * 唯一可令其 reject 的公共 mock 面是「listRoutes resolve 出带抛错 getter 的 children 的节点」
 * → flattenTree 的 { ...n } 展开枚举自有可枚举属性时调用 getter 抛错（发生在 rows 赋值前，
 * loading 停在 true）。初始挂载 reload 消费正常夹具，批量点击前才换毒数据——不污染挂载链路。
 *
 * ── fake timers 手法：List.undo.test.ts 同款（beforeEach useFakeTimers +
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
  bulkPublishRoutes: vi.fn(),
  bulkOfflineRoutes: vi.fn(),
  bulkDeleteRoutes: vi.fn(),
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
  publishRoute: mocks.publishRoute,
  bulkPublishRoutes: mocks.bulkPublishRoutes,
  bulkOfflineRoutes: mocks.bulkOfflineRoutes,
  bulkDeleteRoutes: mocks.bulkDeleteRoutes
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
// 真品 usePublishSync 的依赖：只 mock getSyncStatus（List.undo.test.ts 同款，pending 防噪声）
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
// 类型仅编译期使用（import type 运行时擦除，不触碰 vi.mock 工厂）
import type { BulkResult, RouteNode } from '@/api/routes'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
// dig: 按点路径取 locale 值；undefined = key 缺失（List.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))
/** 参数化 i18n 取值（{n}/{ok}/{fail} 占位替换；List.test.ts tf 同款） */
function tf(key: string, params: Record<string, string | number>): string {
  let s = String(dig(zhCN, `v2.routes.${key}`))
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** undo 窗口宽度（List.vue 同常量） */
const UNDO_WINDOW_MS = 5000
/** 毒 getter 抛错文案（RED：今天会从外层 catch 漏成 toast 原文，GREEN 后被 batReloadFailed 取代） */
const POISON_MSG = 'flatten-boom'

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
    makeNode('r5', { route_name: 'orphan_svc', status: 'OFFLINE' })
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

/**
 * 毒节点：children 为抛错 getter。flattenTree 的 { ...n } 展开枚举自有可枚举属性时调用它抛出
 * POISON_MSG → reload() 在 rows 赋值前 reject（loading 停在 true）。enumerable 必须为 true
 * （spread 只拷贝自有可枚举属性）。Object.defineProperty 绕开对象字面量 getter 的 TS 推断摩擦。
 */
function poisonNodes(): RouteNode[] {
  const node: Record<string, unknown> = { ...makeNode('z1', { route_name: 'poison_svc' }) }
  Object.defineProperty(node, 'children', {
    enumerable: true,
    get() { throw new Error(POISON_MSG) }
  })
  return [node as unknown as RouteNode]
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
/** 当前可见行 id 序列（tbody v-for 文档序 = 原位保真断言通道；List.undo.test.ts 同款） */
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
/** 手写 deferred：卡住 deleteRoute / bulk 单请求（List.test.ts 同款） */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'copy-1' })
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue({ status: 'OFFLINE' })
  mocks.publishRoute.mockReset().mockResolvedValue({ id: 'ok' })
  // bulk 三函数默认「回显全部入参 ids 为 succeeded」（List.test.ts P3-d 同款），用例按场景覆盖
  const bulkEcho = (ids: string[]): BulkResult => ({ succeeded: ids.map((id) => ({ id })), failed: [] })
  mocks.bulkPublishRoutes.mockReset().mockImplementation(bulkEcho)
  mocks.bulkOfflineRoutes.mockReset().mockImplementation(bulkEcho)
  mocks.bulkDeleteRoutes.mockReset().mockImplementation(bulkEcho)
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

// ═══ H — i18n key 双语存在（铁律 6；RED：batReloadFailed 未落档）═══
describe('S7-3 reload 失败收尾 — i18n key 双语存在（铁律 6）', () => {
  it.each(['v2.routes.batReloadFailed'])('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ═══ S — 源码契约 fs 抽查（P4f①/LOW-4 G 组先例；RED：committing 标记未接线）═══
describe('S7-3 源码契约 — List.vue fs 抽查（committing 标记 + undo 条家族保留）', () => {
  const source = () => fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')

  it('committing 守卫接线：PendingDelete.committing 标记存在 + del-undo 家族保留', () => {
    const src = source()
    // 守卫契约一：committing 状态标记必须进入 List.vue（模板 disabled 绑定 + undoPendingDelete 早退共用）
    expect(src).toContain('committing')
    // undo 条家族不被守卫改造误伤
    expect(src).toContain('data-testid="del-undo-bar"')
    expect(src).toContain('del-undo-btn-')
    expect(src).toContain('undoPendingDelete')
    // 确认链与删除端点保留
    expect(src).toContain('deleteRoute')
    expect(src).toContain('confirmDeleteTitle')
  })
})

// ═══ G1 — 守卫契约一：undo committing 态（观察一）═══
describe('S7-3 undo committing 守卫 — commit 发起后撤销不可回头（窗口内最后一刻仍生效）', () => {
  /** 夹具：删 r4 → 换 reload 数据（minus r4）→ deleteRoute 挂 deferred → 推满 5s 使 commit 发起后悬停 */
  async function commitStartedFixture() {
    const { wrapper } = await factory()
    const listCallsBefore = mocks.listRoutes.mock.calls.length
    await deleteViaCard(wrapper, 'r4')
    expect(one(wrapper, 'del-undo-r4').exists()).toBe(true)
    mocks.listRoutes.mockResolvedValue(defaultNodes().filter((n) => n.id !== 'r4'))
    const gate = deferred<void>()
    mocks.deleteRoute.mockImplementationOnce(() => gate.promise)
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    await flushPromises()
    expect(mocks.deleteRoute, '窗口到期 commit 已发起（恰一次）').toHaveBeenCalledTimes(1)
    expect(mocks.deleteRoute).toHaveBeenCalledWith('r4')
    return { wrapper, gate, listCallsBefore }
  }

  it('窗口边界不受守卫波及：4999ms 点撤销仍完全生效（行原位复活 + timer 清 + 零 API 零重拉，契约一④）', async () => {
    const { wrapper } = await factory()
    const before = mocks.listRoutes.mock.calls.length
    await deleteViaCard(wrapper, 'r4')
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1)
    await flushPromises()
    expect(mocks.deleteRoute, '4999ms 尚未 commit').not.toHaveBeenCalled()
    expect(one(wrapper, 'del-undo-btn-r4').attributes('disabled'), '窗口内撤销钮必须仍可点（守卫只收口 commit 发起后）').toBeUndefined()
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(rowOrder(wrapper), '最后一刻撤销是合理意图：行必须原位复活').toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(one(wrapper, 'del-undo-bar').exists(), '撤销后条目退场').toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(mocks.deleteRoute, '撤销后 timer 已清：不得补刀').not.toHaveBeenCalled()
    expect(mocks.listRoutes.mock.calls.length, '撤销不重拉').toBe(before)
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('commit 发起后（deleteRoute deferred 悬停）：撤销钮 disabled（UI 表达）+ 点击 no-op（行不复活）——契约一②③', async () => {
    const { wrapper } = await commitStartedFixture()
    // committing 期条目仍在（终态才退场——这正是竞态危害面）
    expect(one(wrapper, 'del-undo-r4').exists(), 'commit in-flight 期条目仍在 Map（终态才退场）').toBe(true)
    const btn = one(wrapper, 'del-undo-btn-r4')
    expect(btn.exists()).toBe(true)
    // ① UI 必须表达：disabled 属性（RED：今天无此绑定，attribute undefined）
    expect(btn.attributes('disabled'), 'committing 态撤销钮必须 disabled（UI 必须表达不可回头）').toBeDefined()
    // ② 点击 no-op（双保险）：jsdom 对 disabled 钮仍派发 click，程序化早退兜底——行不得复活
    await btn.trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists(), 'committing 后点撤销必须是 no-op：行不得短暂复活（闪烁误导根因）').toBe(false)
    expect(mocks.deleteRoute, 'no-op 撤销不得清 timer/中断 commit').toHaveBeenCalledTimes(1)
    expect(rowOrder(wrapper), '其余行不受波及').toEqual(['r1', 'r2', 'r3', 'r5'])
  })

  it('全弧线：committing 期点撤销 no-op → commit 完成 reload 后行真消失 + 条目退场 + 静默（契约一⑤）', async () => {
    const { wrapper, gate, listCallsBefore } = await commitStartedFixture()
    // 守卫生效：悬停期点击不复活行
    await one(wrapper, 'del-undo-btn-r4').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'r4').exists(), 'committing 期点击撤销不得复活行').toBe(false)
    // commit 落定：行真消失（与「复活后又消失」的闪烁链路对照）
    gate.resolve(undefined)
    await flushPromises()
    expect(row(wrapper, 'r4').exists(), 'commit 完成 reload 后行真消失').toBe(false)
    expect(rowOrder(wrapper), '真消失且原序保真').toEqual(['r1', 'r2', 'r3', 'r5'])
    expect(one(wrapper, 'del-undo-bar').exists(), '终态条目退场').toBe(false)
    expect(mocks.listRoutes.mock.calls.length, 'commit 收尾重拉恰一次').toBe(listCallsBefore + 1)
    expect(mocks.toast.error, '静默完成不报错').not.toHaveBeenCalled()
    expect(mocks.deleteRoute).toHaveBeenCalledTimes(1)
  })
})

// ═══ G2 — 守卫契约二：批量收尾 reload() 抛错（观察二）═══
describe('S7-3 批量收尾 reload 抛错守卫 — 恰一枚 batReloadFailed + 选择清空保持 + loading 复位', () => {
  it('全成分支：bulk 成功 + reload 抛错 → success toast 不回撤 + error 恰一枚且文案=batReloadFailed（外层 catch 不得补刀）+ 选择清空 + loading 复位', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    // 下一次 reload 注入抛错（初始挂载链路不被污染）
    mocks.listRoutes.mockResolvedValue(poisonNodes())
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    // bulk 本身成功落定，成功 toast 不得因 reload 失败回撤
    expect(mocks.bulkDeleteRoutes, 'bulk 单请求恰一次').toHaveBeenCalledTimes(1)
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['d1', 'd2'])
    expect(mocks.toast.success, '成功 toast 照常（bulk 已落定）').toHaveBeenCalledWith(tf('batDeleteSuccess', { n: 2 }))
    expect(mocks.toast.warning, '全成分支不得串入 warning').not.toHaveBeenCalled()
    // 守卫①②：reload 失败恰一枚固定文案 error toast；外层 catch 只管 bulk 本身
    expect(mocks.toast.error, 'reload 失败恰一枚 error toast').toHaveBeenCalledTimes(1)
    expect(mocks.toast.error, '文案=batReloadFailed（原始 e.message 不得漏出——这也是外层 catch 未越权的判别通道）')
      .toHaveBeenCalledWith(t('v2.routes.batReloadFailed'))
    // 守卫③：选择清空语义保持（bulk 已在服务端生效，陈旧选择集诱导二次误操作）
    expect(one(wrapper, 'bat-bar').exists(), 'reload 失败仍须清空选择（bat-bar 退场）').toBe(false)
    // 守卫④：loading 复位，不得钉死骨架屏（表格仍渲染陈旧行）
    expect(row(wrapper, 'd1').exists(), 'reload 抛错不得把页面钉死在 FcSkeleton').toBe(true)
    // 守卫⑤：busy 复位 + 明细不被 reload 失败污染
    expect(one(wrapper, 'bat-progress').exists(), 'batchRunning finally 复位照旧').toBe(false)
    expect(one(wrapper, 'bat-fail-detail').exists(), '明细只收 BulkResult.failed：reload 失败不造明细').toBe(false)
    // reload 确有发起（抛错发生在数据加工段，非 bulk 前置失败）
    expect(mocks.listRoutes.mock.calls.length).toBeGreaterThan(before)
  })

  it('部分失败分支：warning + reload 抛错 → error 恰一枚=batReloadFailed + 选择清空 + BulkResult 明细保留 + loading 复位', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    mocks.bulkDeleteRoutes.mockResolvedValue({
      succeeded: [{ id: 'd1' }],
      failed: [{ id: 'd2', reason: '上游仍引用该路由' }]
    })
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    mocks.listRoutes.mockResolvedValue(poisonNodes())
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.toast.warning, '部分失败 warning 照常').toHaveBeenCalledWith(tf('batPartial', { ok: 1, fail: 1 }))
    expect(mocks.toast.error, 'reload 失败恰一枚 error toast').toHaveBeenCalledTimes(1)
    expect(mocks.toast.error, '文案=batReloadFailed，不透传原始 e.message').toHaveBeenCalledWith(t('v2.routes.batReloadFailed'))
    expect(one(wrapper, 'bat-bar').exists(), '部分失败 + reload 抛错仍清空选择（契约二③同判词）').toBe(false)
    expect(one(wrapper, 'bat-fail-detail').exists(), 'BulkResult 明细不被 reload 失败清除').toBe(true)
    expect(one(wrapper, 'bat-fail-d2').text()).toContain('draft_two')
    expect(one(wrapper, 'bat-fail-d2').text()).toContain('上游仍引用该路由')
    expect(row(wrapper, 'd1').exists(), 'loading 复位（表格不被骨架屏吞掉）').toBe(true)
    expect(one(wrapper, 'bat-progress').exists()).toBe(false)
  })

  it('外层 catch 职责钉死（防 C 步重构波及）：bulk 请求级 reject → error 恰一枚=原始 message + 选择保留 + 不重拉（现状已绿，回归锚）', async () => {
    mocks.listRoutes.mockResolvedValue(batchNodes())
    mocks.bulkDeleteRoutes.mockRejectedValue(new Error('网络中断'))
    const { wrapper } = await factory()
    await rowCbx(wrapper, 'd1').setValue(true)
    await rowCbx(wrapper, 'd2').setValue(true)
    const before = mocks.listRoutes.mock.calls.length
    await one(wrapper, 'bat-delete').trigger('click')
    await flushPromises()
    expect(mocks.toast.error, '请求级失败恰一枚（外层 catch 只管 bulk 本身）').toHaveBeenCalledTimes(1)
    expect(mocks.toast.error, '请求级失败透传原始 message（与 reload 失败的固定文案形成判别）').toHaveBeenCalledWith('网络中断')
    expect(one(wrapper, 'bat-bar').exists(), '请求级失败保留选择（便于修正后重试）').toBe(true)
    expect(one(wrapper, 'bat-progress').exists()).toBe(false)
    expect(mocks.listRoutes.mock.calls.length, '请求级失败不重拉').toBe(before)
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.toast.warning).not.toHaveBeenCalled()
  })
})
