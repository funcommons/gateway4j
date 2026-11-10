/**
 * LOW-1 T（写测试，先红为预期）：审计日志 actor/target 行内可点筛选（上下文断裂修复）。
 * 依据 docs/ui-v2/gateway4j-v2优化.md 低优先级 #7（对标 Kong Konnect 审计流「点击即填充
 * 筛选条件」）；裁决惯例 docs/ui-v2/实施契约.md §6 OPT 批次（OPT-1 下钻先例：单击触发 +
 * Enter 键盘等价 + 复用行级家族 testid 命名）。
 * 本文件只落用例：零业务代码改动、不动既有 Settings.test.ts 用例（纯增量同仓并行）；
 * C 步接线后转绿。
 * 修订（LOW-1 独立复核，fixture-only）：makeAudit 的 target_type/target_id 由 ?? 改
 * 'in' over 判定 —— ?? 吞显式 undefined，9203/9204「缺字段」被默认值 'ROUTE'/'3001'
 * 覆写，9201/9204 target 三字段逐字节同形致「空值不可点」契约不可满足；用例意图零改动。
 *
 * ── 页面现状侦察（C 步实现要点）────────────────────────────────────────────
 * - Settings.vue audit 分区（v-show 常驻 DOM）：筛选条 set-audit-filters 现有
 *   action(FcSelect) / actor(FcInput) / range(FcDatePicker) 三筛选位；表格
 *   set-audit-table 行 set-audit-row-{id}，actor 列 = {{ row.actor || '-' }}、target 列 =
 *   {{ auditTargetText(row) }} —— 两列均为纯文本，无可点语义（本票要修的断点）。
 * - 查询链路：loadAuditPage() 组 params（page/pageSize + action/actor.trim()/from/to），
 *   onAuditFilterChange() = 页码重置回 1 + loadAuditPage（既有契约，Settings.test.ts 钉过）。
 * - 后端 GET /v1/audit/logs 的 target 参数是对 target_id 的 LIKE 模糊（AuditLogService.
 *   listLogs :39-41 wrapper.like(AuditLog::getTargetId)），AuditLogQuery.target 前端类型
 *   已备而页面未用 —— target 筛选是「类型有、UI 缺」的纯前端缺口。
 * - 【语义裁决·防假成功】target 点击填充「查询载荷值」= row.target || row.target_id，
 *   不是单元格显示文本 auditTargetText(row)：显示文本 'ROUTE:3001' 拿去 LIKE target_id
 *   ('3001') 一行都不中 —— 若按显示文本填，mapper-mock 单测全绿而实播必空表（OPT 批次
 *   教训④：mapper-mock 型单测对语义盲区全盲）。仅 target_type 无 target_id 的行（显示
 *   'ROLE'）没有可查载荷 → 不可点；草稿 target 字段（'USER:8001'）优先随迁
 *   （auditTargetText 同序：target → target_type:target_id → '-'）。
 *
 * ── C 步实现清单（本文件测试即契约）────────────────────────────────────────
 * 1. actor/target 两列非空值包原生 <button type="button" class="set-audit-btn"
 *    data-testid="set-audit-actor-btn-{id}" / "set-audit-target-btn-{id}"
 *    :aria-label="t('v2.settings.auditFilterByValue', { value })">；空值（actor 空 /
 *    target 载荷空）保持纯文本回落 '-'，不渲染按钮、无任何 role=button 语义
 * 2. 两钮 @click 同一 handler：填入筛选值 + onAuditFilterChange()（页码重置回 1 + 重查；
 *    actor 填 row.actor，target 填 row.target || row.target_id）
 * 3. @keydown.enter 挂同一 handler（OPT-1 先例；原生 button 的 Enter→click 由浏览器
 *    兜底，显式挂卫 jsdom 与非鼠标输入双保险）
 * 4. 新筛选位：FcInput v-model="auditTarget" clearable data-testid="set-audit-filter-target"
 *    label/placeholder 用新 key v2.settings.auditTarget（与 auditActor 家族位同款），
 *    @change="onAuditFilterChange"；loadAuditPage 非空时 params.target = trim 值
 * 5. i18n 双语两 key：v2.settings.auditTarget（'目标'/'Target'）、
 *    v2.settings.auditFilterByValue（'按此值筛选：{value}'/'Filter by this value: {value}'，
 *    命名插值 {value} 必须保留 —— 可访问名必须含该行值，否则多行按钮不可分辨）
 * 6. 样式：.set-audit-btn { cursor: pointer }（token 化 focus-ring 归 Hallmark V 轮门禁，
 *    本票不另立样式体系、不动既有规则）
 *
 * ── 幂等判词（任务点 4，本票固化）──────────────────────────────────────────
 * 重复点击同值 = 筛选状态幂等 + 查询允许重发：第二次点击不改变筛选值（不做 toggle
 * 反选、不做 no-op guard），每次点击恰发一次同参查询（重查兼作刷新 affordance）。
 *
 * ── testid 契约全表（本票新增 3 个，余沿用既有 set-audit- 家族零改名）─────────
 * set-audit-actor-btn-{id}    行内 actor 可点钮（原生 button，仅 row.actor 非空渲染）
 * set-audit-target-btn-{id}   行内 target 可点钮（原生 button，仅 target 载荷非空渲染）
 * set-audit-filter-target     target 筛选输入框（FcInput，testid 落原生 input，P4e 先例）
 * （既有复用：set-audit-row-{id} / set-audit-filter-action / set-audit-filter-actor /
 *   set-audit-filter-range / set-audit-table / set-audit-action-{action} /
 *   set-audit-result-{id}）
 *
 * ── i18n key 清单（本票新增 2 个，v2.settings 显式树，双语同步）──────────────
 * v2.settings.auditTarget          zh '目标' / en 'Target'（新筛选位 label/placeholder）
 * v2.settings.auditFilterByValue   zh '按此值筛选：{value}' / en 'Filter by this value: {value}'
 *
 * ── RED 口径 ─────────────────────────────────────────────────────────────
 * Settings.vue 与既有分区/行/筛选 DOM 均真实存在，失败点只能是「行为/元素未落」：
 * 按钮、target 筛选位不存在（need 可读失败）、i18n key 缺失、源码契约不匹配 ——
 * 不得出现 import/语法级失败。「空值不可点」反断言类用例在 RED 期天然绿（护栏：
 * 防 C 把空值也做成可点），非本票 RED 证据。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n, type I18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper, type DOMWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  getDict: vi.fn(),
  listChanges: vi.fn(),
  listAuditLogs: vi.fn(),
  mapFieldErrors: vi.fn(() => ({}) as Record<string, string>),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/misc', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  getDict: mocks.getDict,
  listChanges: mocks.listChanges,
  listAuditLogs: mocks.listAuditLogs
}))
vi.mock('@/api/http', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, mapFieldErrors: mocks.mapFieldErrors }
})
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// 只替换 toast；Fc* 组件保留真实实现（Settings.test.ts / P4a-2 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import Settings from '@/views-v2/system/Settings.vue'


const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
/** i18n 实例显式 I18n<> 类型（Settings.test.ts factory 同款签名；TSC:0 口径含测试文件） */
type TestI18n = I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false>

const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（Settings.test.ts 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
/** tZh: zh 文案取值 + {name} 命名插值复算（断言 aria-label 全等用，文案同源不改写） */
function tZh(key: string, params?: Record<string, string>): string {
  const raw = String(dig(zhCN, key) ?? '')
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => (name in params ? params[name] : `{${name}}`))
}

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Settings.vue'), 'utf-8')
}

// ── fixtures（独立于既有 Settings.test.ts，行号错位防同页用例互扰）────────────
type AuditOver = { id?: string; action?: string; target_type?: string; target_id?: string; target?: string; actor?: string; result?: string; created_at?: string | number }

/**
 * 四行 fixture，覆盖可点性矩阵（actor × target 正交）：
 *   9201 actor='alice' + target 组合 ROUTE/3001      → 两钮全有（主力行）
 *   9202 actor=''（'-' 不可点）+ 草稿 target='USER:8001'（可点，载荷填原文）
 *   9203 actor='bob'（可点）+ 仅 target_type='ROLE'（显示 'ROLE' 但无查询载荷 → target 不可点）
 *   9204 actor='carol'（可点）+ target 全空（'-' 不可点）
 */
function makeAudit(over: AuditOver = {}) {
  return {
    id: over.id ?? '9201',
    action: over.action ?? 'route.publish',
    // 'in' 判定而非 ??：区分「键缺省」（取默认）与「显式 undefined」（真实缺字段）——
    // ?? 会把后者吞成默认值（其余字段 fixture 未传 undefined，维持 ?? 不动）
    target_type: 'target_type' in over ? over.target_type : 'ROUTE',
    target_id: 'target_id' in over ? over.target_id : '3001',
    target: over.target,
    actor: over.actor ?? 'alice',
    result: over.result ?? 'SUCCESS',
    created_at: over.created_at ?? '2026-01-15T02:30:00+00:00'
  }
}

function defaultAuditPage() {
  return {
    records: [
      makeAudit(),
      makeAudit({ id: '9202', action: 'user.resetPassword', target_type: undefined, target_id: undefined, target: 'USER:8001', actor: '', result: 'FAIL', created_at: '' }),
      makeAudit({ id: '9203', action: 'role.update', target_type: 'ROLE', target_id: undefined, target: undefined, actor: 'bob', result: 'SUCCESS', created_at: 1768453200 }),
      makeAudit({ id: '9204', action: 'login', target_type: undefined, target_id: undefined, target: undefined, actor: 'carol', result: 'ALLOWED', created_at: '2026-01-16T08:00:00+00:00' })
    ],
    total: '7', size: 20, current: 1, pages: 1
  }
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router; i18n: TestI18n }> {
  const i18n = createI18n(i18nBase)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/settings', name: 'V2Settings', component: Settings as any },
      { path: '/v2/nowhere', name: 'V2Nowhere', component: stub }
    ]
  })
  await router.push('/v2/settings')
  await router.isReady()
  const wrapper = mount(Settings, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router, i18n }
}

const one = (w: VueWrapper<any> | DOMWrapper<Element>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读） */
const need = (w: VueWrapper<any> | DOMWrapper<Element>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any> | DOMWrapper<Element>, tid: string) => w.find(`input[data-testid="${tid}"], textarea[data-testid="${tid}"]`)
const inputVal = (w: VueWrapper<any> | DOMWrapper<Element>, tid: string) => (inputOf(w, tid).element as HTMLInputElement).value
/** 切分区：audit 面板 v-show 常驻 DOM，切 Tab 仅对齐真实使用路径（Settings.test.ts 先例） */
async function openAudit(w: VueWrapper<any>) {
  const tab = one(w, 'set-section-nav').findAll('.fc-tab').find((b) => b.text().includes(String(dig(zhCN, 'v2.settings.tabAudit'))))
  expect(tab, '缺少审计分区 Tab').toBeDefined()
  await tab!.trigger('click')
  await flushPromises()
}
const vm = (w: VueWrapper<any>) => w.vm as any

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.listChanges.mockReset().mockResolvedValue([])
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

// ── 点击填充 + 触发查询 ──────────────────────────────────────────────────
describe('LOW-1 — actor/target 行内可点：填充筛选值 + 触发一次 audit 查询', () => {
  it('点击行内 actor 值（9201）→ set-audit-filter-actor 填入该值 + 恰发一次带 actor 的查询', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const row = need(wrapper, 'set-audit-row-9201', '常规行')
    const btn = need(row, 'set-audit-actor-btn-9201', '行内 actor 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-actor'), 'actor 筛选框应填入被点行值').toBe('alice')
    expect(mocks.listAuditLogs, '点击应恰发一次查询').toHaveBeenCalledTimes(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, actor: 'alice' })
  })

  it('点击组合 target（9201 显示 ROUTE:3001）→ set-audit-filter-target 填入查询载荷 \'3001\'（非显示文本，后端 LIKE target_id 才可命中）+ 带 target 查询', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const row = need(wrapper, 'set-audit-row-9201', '常规行')
    expect(row.text(), '前置：显示文本为组合形态').toContain('ROUTE:3001')
    const btn = need(row, 'set-audit-target-btn-9201', '行内 target 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-target'), 'target 筛选框应填查询载荷 target_id（填显示文本会 LIKE 不中任何行）').toBe('3001')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, target: '3001' })
  })

  it('点击草稿 target 字段（9202 target=\'USER:8001\'）→ 筛选框填原文（draft 优先随迁 auditTargetText 同序）', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const btn = need(need(wrapper, 'set-audit-row-9202', '草稿 target 行'), 'set-audit-target-btn-9202', '草稿 target 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-target')).toBe('USER:8001')
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, target: 'USER:8001' })
  })

  it('翻页态（auditPage=3）点击行内值 → 走筛选链路重置回第 1 页（onAuditFilterChange 语义随迁，不得停留在当前页查询）', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    vm(wrapper).auditPage = 3
    const btn = need(wrapper, 'set-audit-actor-btn-9201', '行内 actor 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('click')
    await flushPromises()
    expect(vm(wrapper).auditPage, '点击填充属筛选变化，页码重置回 1').toBe(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, actor: 'alice' })
  })
})

// ── 空值不可点（RED 期天然绿的反断言护栏）────────────────────────────────
describe('LOW-1 — 空值不可点（无按钮语义、不触发）', () => {
  it('actor 空（9202）→ 行内不渲染 set-audit-actor-btn-*，\'-\' 纯文本回落', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const row = need(wrapper, 'set-audit-row-9202', 'actor 空行')
    expect(one(row, 'set-audit-actor-btn-9202').exists(), '空 actor 不得有可点钮').toBe(false)
    expect(row.text(), '空 actor 以 \'-\' 回落').toContain('-')
  })

  it('target 无查询载荷 → 不可点：9204 全空（\'-\'）与 9203 仅 target_type（显示 \'ROLE\' 无 target_id）都不渲染 target 钮', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const row4 = need(wrapper, 'set-audit-row-9204', 'target 全空行')
    expect(one(row4, 'set-audit-target-btn-9204').exists(), '全空 target 不得有可点钮').toBe(false)
    expect(row4.text()).toContain('-')
    const row3 = need(wrapper, 'set-audit-row-9203', '仅 target_type 行')
    expect(row3.text(), '前置：仅 target_type 仍显示组合文本 ROLE').toContain('ROLE')
    expect(one(row3, 'set-audit-target-btn-9203').exists(), '无 target_id 载荷不得有可点钮（LIKE 必空表）').toBe(false)
  })
})

// ── 按钮语义 + 键盘可达 ──────────────────────────────────────────────────
describe('LOW-1 — 可点性呈现：原生 button 语义 + aria-label 含值 + Enter 键盘等价', () => {
  it('行内可点值是原生 <button>（隐式 role=button + 可聚焦，非 div/span 凑数）；本 fixture 应恰渲染 5 钮', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const rendered = wrapper.findAll('[data-testid^="set-audit-actor-btn-"], [data-testid^="set-audit-target-btn-"]')
    expect(rendered.length, '可点矩阵：9201 actor+target / 9202 target / 9203 actor / 9204 actor').toBe(5)
    for (const btn of rendered) {
      expect(btn.element.tagName, `${btn.attributes('data-testid')} 应为原生 button 元素`).toBe('BUTTON')
    }
  })

  it('aria-label = auditFilterByValue 插值该行值（可访问名必须含值；zh 源文案须带 {value} 命名插值）', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    expect(String(dig(zhCN, 'v2.settings.auditFilterByValue')), 'zh 文案必须保留 {value} 命名插值').toContain('{value}')
    const actorBtn = need(wrapper, 'set-audit-actor-btn-9201', 'actor 可点钮')
    expect(actorBtn.attributes('aria-label'), '可访问名 = 文案插值该行 actor').toBe(tZh('v2.settings.auditFilterByValue', { value: 'alice' }))
    const targetBtn = need(wrapper, 'set-audit-target-btn-9201', 'target 可点钮')
    expect(targetBtn.attributes('aria-label'), '可访问名 = 文案插值该行 target 载荷').toBe(tZh('v2.settings.auditFilterByValue', { value: '3001' }))
  })

  it('Enter 键盘等价（actor）：keydown.enter → 填充 actor 筛选 + 查询（OPT-1 键盘惯例随迁）', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const btn = need(wrapper, 'set-audit-actor-btn-9201', 'actor 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('keydown.enter')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-actor')).toBe('alice')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, actor: 'alice' })
  })

  it('Enter 键盘等价（target）：keydown.enter → 填充 target 筛选 + 查询', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const btn = need(wrapper, 'set-audit-target-btn-9201', 'target 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('keydown.enter')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-target')).toBe('3001')
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, target: '3001' })
  })
})

// ── 重复点击同值幂等（判词固化：状态幂等 + 查询允许重发）─────────────────
describe('LOW-1 — 重复点击同值幂等（契约：筛选状态不变、不 toggle、每击恰一次同参查询）', () => {
  it('同值两连点 → 筛选框仍为该值（不反选不清空）、恰两次调用、两次参数相同、页码恒 1', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    const btn = need(wrapper, 'set-audit-actor-btn-9201', 'actor 可点钮')
    mocks.listAuditLogs.mockClear()
    await btn.trigger('click')
    await flushPromises()
    await btn.trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-actor'), '二次点击不得 toggle/清空筛选值').toBe('alice')
    expect(vm(wrapper).auditActor, 'vm 侧筛选状态同步幂等').toBe('alice')
    expect(mocks.listAuditLogs, '每次点击恰发一次查询（重发兼作刷新 affordance）').toHaveBeenCalledTimes(2)
    expect(mocks.listAuditLogs).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 20, actor: 'alice' })
    expect(mocks.listAuditLogs).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 20, actor: 'alice' })
    expect(vm(wrapper).auditPage).toBe(1)
  })
})

// ── 点选后手动清空恢复全量 ────────────────────────────────────────────────
describe('LOW-1 — 点选后筛选框可手动清空恢复全量（DOM 通道：setValue + change）', () => {
  it('actor 点选后清空 set-audit-filter-actor（setValue(\'\') + change）→ 查询不带 actor 键', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    await need(wrapper, 'set-audit-actor-btn-9201', 'actor 可点钮').trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-actor')).toBe('alice')
    const input = inputOf(wrapper, 'set-audit-filter-actor')
    await input.setValue('')
    await input.trigger('change')
    await flushPromises()
    expect(vm(wrapper).auditActor).toBe('')
    expect(mocks.listAuditLogs, '清空后恢复全量查询（无 actor 实键）').toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('target 点选后清空 set-audit-filter-target（setValue(\'\') + change）→ 查询不带 target 键（新筛选位走同一 @change 链路）', async () => {
    const { wrapper } = await factory()
    await openAudit(wrapper)
    await need(wrapper, 'set-audit-target-btn-9201', 'target 可点钮').trigger('click')
    await flushPromises()
    expect(inputVal(wrapper, 'set-audit-filter-target')).toBe('3001')
    const input = inputOf(wrapper, 'set-audit-filter-target')
    await input.setValue('')
    await input.trigger('change')
    await flushPromises()
    expect(mocks.listAuditLogs).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })
})

// ── testid / i18n / 可点样式源码契约 ─────────────────────────────────────
describe('LOW-1 — 源码契约（新增 testid 落位 / i18n 双语 / cursor:pointer）', () => {
  it('源码落位三个新 testid + .set-audit-btn 类规则带 cursor:pointer（样式契约同式源码钉，375 先例）', () => {
    const source = readSource()
    for (const tid of ['set-audit-actor-btn-', 'set-audit-target-btn-', 'set-audit-filter-target', 'set-audit-btn']) {
      expect(source, `源码缺少 ${tid}`).toContain(tid)
    }
    expect(source, '可点性呈现：.set-audit-btn 须带 cursor:pointer').toMatch(/\.set-audit-btn\s*\{[^}]*cursor:\s*pointer/)
  })

  it('i18n 双语两 key 存在 + auditFilterByValue 保留 {value} 命名插值（LOW-1 新增，进 v2.settings 显式树）', () => {
    for (const key of ['v2.settings.auditTarget', 'v2.settings.auditFilterByValue']) {
      expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
      expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
    }
    expect(String(dig(zhCN, 'v2.settings.auditFilterByValue')), 'zh 文案须含 {value}').toContain('{value}')
    expect(String(dig(enUS, 'v2.settings.auditFilterByValue')), 'en 文案须含 {value}').toContain('{value}')
  })
})
