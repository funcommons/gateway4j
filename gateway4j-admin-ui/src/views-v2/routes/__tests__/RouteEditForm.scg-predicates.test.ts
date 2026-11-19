/**
 * S10-2-T：RouteEditForm 条件编辑器 SCG 谓词扩展 —— 组件契约测试（RED 先行，C 步照做）。
 * 背景：条件模型 100% SCG predicate 对齐，引擎票 S10-1 并行在跑（HOST/METHOD/COOKIE/
 * REMOTE_ADDR/AFTER/BEFORE/BETWEEN 七谓词）。本票只扩 UI 条件编辑器，三段契约 T 步钉死：
 *
 * ── 契约 §1：COND_TYPES 13 项 ─────────────────────────────────────────────
 * 既有 6（HEADER/PATH/QUERY/BODY/GROOVY/WEIGHT）扩为 13：既有非 WEIGHT 五类型在前、
 * 新七居中、WEIGHT 恒收尾。下拉 option 的 label = 类型名直出（既有 `label: v` 语义不变）。
 *
 * ── 契约 §2：类型化提示（行为断言，不钉实现）──────────────────────────────
 * 每类型对 condition_key/condition_value 的 placeholder/disabled 提示；C 步自由选择
 * i18n key 或内联常量，本文件只断言「对应类型时 key/value 的 placeholder 或 disabled 行为」：
 *   HOST        key 禁用（host 不需 key）        value 占位 **.example.com
 *   METHOD      key 禁用                          value 占位含 GET
 *   COOKIE      key 可编辑 + 占位 cookie 名       value 不钉占位（契约未定，禁臆造）
 *   REMOTE_ADDR key 禁用                          value 占位 1.2.3.0/24
 *   AFTER/BEFORE key 禁用                         value 占位 ISO-8601 形态（正则宽容实现文案）
 *   BETWEEN     key 禁用                          value 占位 start,end
 * 新七 value 恒可编辑（value 禁用是 WEIGHT 独占特例，不许外溢）。
 *
 * ── 契约 §3：键值校验沿用 ─────────────────────────────────────────────────
 * 新七均非 WEIGHT：value 必填（EXISTS 无值例外沿旧）；key 对禁用类型（HOST/METHOD/
 * REMOTE_ADDR/AFTER/BEFORE/BETWEEN）豁免；COOKIE key 未禁用 → 仍必填（C 不得过度豁免）。
 *
 * ── 契约 §4：保存载荷 ─────────────────────────────────────────────────────
 * 新类型行走既有 mapConditions（RouteEditForm.vue L736-745 六字段映射），天然覆盖：
 * condition_type/operator/condition_key/condition_value/target_route_id/priority 完整，
 * 禁键类型的 key 以空串原样透传（不剔除行）。
 *
 * ── RED 形态预期 ──────────────────────────────────────────────────────────
 * 新七相关 13 用例全红（COND_TYPES 未扩展落空：下拉 13 项断言直接落空、placeholder/
 * disabled 现为 undefined、禁键豁免未实现致 keyRequired 误拦、豁免未实现致保存阻断）；
 * 既有锚 2 用例全绿（既有五类型在前 + WEIGHT 收尾；WEIGHT 行 value 禁用 + key 数字输入
 * + operator 禁用，扩七不得回退）。C 步落地后 15/15 全绿。
 *
 * mount/fixture 惯例跟随同目录 RouteEditForm.test.ts（mock 面 / factory / vm 通道一致）。
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
  getRoute: vi.fn(),
  listRoutes: vi.fn(),
  updateRoute: vi.fn(),
  validateRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn(),
  mapFieldErrors: vi.fn(() => ({}) as Record<string, string>),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  getRoute: mocks.getRoute,
  listRoutes: mocks.listRoutes,
  updateRoute: mocks.updateRoute,
  validateRoute: mocks.validateRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain
}))
vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes
}))
vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, mapFieldErrors: mocks.mapFieldErrors }
})
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.canEdit,
    hasAnyPermission: mocks.canEdit,
    canEdit: mocks.canEdit
  })
}))
vi.mock('@/store/environment', () => ({
  useEnvironments: () => envState
}))
vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, toast: mocks.toast }
})

import RouteEditForm from '@/views-v2/routes/RouteEditForm.vue'

// 环境维度（组件 useEnvironments() 返回态；vi.hoisted 防 mock 工厂 TDZ，主文件先例）
const envState = vi.hoisted(() => ({
  available: true,
  current: 'prod',
  options: [
    { value: 'prod', label: 'prod' },
    { value: 'dev', label: 'dev' }
  ]
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值（主文件先例）；错误文案断言只复用既有 key（keyRequired/
// valueRequired 已在双语表），新提示文案的实现通道（i18n/内联）不钉
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

// ── fixtures（同主文件 makeRoute/makeCond 口径）────────────────────────────

function makeRoute(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', sort_order: 1, remark: '旧备注',
    parent_route_id: null, tags: 'edge', environment: 'prod',
    status: 'DRAFT', config_version: '42',
    conditions: [] as unknown[], children: [], ...over
  }
}

function defaultNodes() {
  return [
    makeRoute('r1', { route_type: 'BACKEND', path: '/api/r1/**' }),
    makeRoute('r2', { route_type: 'DISPATCH', upstream_url: '', path: '/api/r2/**' })
  ]
}

/** EditCondition 行构造：默认 EQ + target r2 + priority 1；禁键类型走 condition_key '' */
function condRow(type: string, over: Record<string, unknown> = {}) {
  return {
    condition_type: type, operator: 'EQ', condition_key: '',
    condition_value: '', target_route_id: 'r2', priority: 1, ...over
  }
}

async function factory(routeId = 'r1'): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/:id/detail', component: { template: '<div />' } },
      { path: '/v2/nowhere', component: { template: '<div />' } }
    ]
  })
  await router.push('/v2/routes/x/detail')
  await router.isReady()
  const wrapper = mount(RouteEditForm, {
    props: { routeId },
    global: { plugins: [ElementPlus, createPinia(), i18n, router] }
  })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，主文件 need 先例） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
const vmOf = (w: VueWrapper<any>) => w.vm as any
/** 条件行行级错误位（ref-cond-error-{n}，主文件既有通道） */
const rowError = (w: VueWrapper<any>, i = 0) => one(w, `ref-cond-error-${i}`)

beforeEach(() => {
  setActivePinia(createPinia())
  envState.available = true
  envState.current = 'prod'
  mocks.getRoute.mockReset().mockResolvedValue(makeRoute('r1'))
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.updateRoute.mockReset().mockResolvedValue(makeRoute('r1'))
  mocks.validateRoute.mockReset().mockResolvedValue({})
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([
    { plugin_id: 'p1', plugin_name: 'rate-limit' }
  ])
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReset().mockReturnValue(true)
})

// ── 新七谓词枚举（引擎票 S10-1 同名；顺序：既有在前新七在后、WEIGHT 收尾）────

const NEW_SEVEN = ['HOST', 'METHOD', 'COOKIE', 'REMOTE_ADDR', 'AFTER', 'BEFORE', 'BETWEEN']
/** key 禁用（不需 key）的六类型；COOKIE key 可编辑不在此列 */
const KEY_DISABLED_TYPES = ['HOST', 'METHOD', 'REMOTE_ADDR', 'AFTER', 'BEFORE', 'BETWEEN']
/** 既有五（非 WEIGHT）+ 新七 + WEIGHT = 13 项钉序 */
const THIRTEEN = ['HEADER', 'PATH', 'QUERY', 'BODY', 'GROOVY', ...NEW_SEVEN, 'WEIGHT']

// ── §2 类型化提示表（正则宽容 C 的实现文案；COOKIE value 契约未定不设断言）────

interface HintSpec {
  type: string
  keyDisabled: boolean
  keyPlaceholder?: RegExp
  valuePlaceholder?: RegExp
}
/** ISO-8601 形态：文案带 ISO/8601 字样或日期（2025-01-01）或带 T 的时刻示例均认 */
const ISO_RE = /ISO|8601|\d{4}-\d{2}-\d{2}|T\d{2}:/i
const HINT_SPECS: HintSpec[] = [
  { type: 'HOST', keyDisabled: true, valuePlaceholder: /\*\*\.example\.com/ },
  { type: 'METHOD', keyDisabled: true, valuePlaceholder: /GET/i },
  { type: 'COOKIE', keyDisabled: false, keyPlaceholder: /cookie/i },
  { type: 'REMOTE_ADDR', keyDisabled: true, valuePlaceholder: /1\.2\.3\.0\/24/ },
  { type: 'AFTER', keyDisabled: true, valuePlaceholder: ISO_RE },
  { type: 'BEFORE', keyDisabled: true, valuePlaceholder: ISO_RE },
  { type: 'BETWEEN', keyDisabled: true, valuePlaceholder: /start\s*,\s*end/i }
]

// ══════════════════════════════════════════════════════════════════════════
// §1 下拉 — COND_TYPES 13 项
// ══════════════════════════════════════════════════════════════════════════

describe('§1 下拉 — condTypeOptions 扩为 13 项', () => {
  it('恰 13 项且顺序钉死：既有 5 在前 + 新七 + WEIGHT 恒收尾；label = 类型名直出', async () => {
    const { wrapper } = await factory('r1')
    const opts = vmOf(wrapper).condTypeOptions
    expect(opts.map((o: { value: string }) => o.value)).toEqual(THIRTEEN)
    expect(opts.every((o: { label: string; value: string }) => o.label === o.value)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §2 类型化提示 — 七新谓词 key/value placeholder/disabled（行为断言，不钉实现）
// ══════════════════════════════════════════════════════════════════════════

describe('§2 类型化提示 — 七新谓词 per-type placeholder/disabled', () => {
  it.each(HINT_SPECS)('$type：key 禁用/占位 + value 占位按契约表', async (spec: HintSpec) => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).conditions = [condRow(spec.type)]
    await flushPromises()
    const keyInput = inputOf(wrapper, 'ref-cond-key-0')
    const valueInput = inputOf(wrapper, 'ref-cond-value-0')
    expect(keyInput.exists(), `${spec.type} 行 key 位`).toBe(true)
    expect(valueInput.exists(), `${spec.type} 行 value 位`).toBe(true)
    // key 禁用语义：禁键六类型 disabled 属性在位；COOKIE（可编辑）不得误禁
    expect(keyInput.attributes('disabled'), `${spec.type} key 契约禁用=${spec.keyDisabled}（true=disabled 属性须在位）`)
      .toBe(spec.keyDisabled ? '' : undefined)
    // value 恒可编辑：禁 value 是 WEIGHT 独占特例，不许外溢到新七
    expect(valueInput.attributes('disabled'), `${spec.type} value 不应禁用`).toBeUndefined()
    if (spec.keyPlaceholder) {
      expect(String(keyInput.attributes('placeholder') ?? ''), `${spec.type} key 占位`)
        .toMatch(spec.keyPlaceholder)
    }
    if (spec.valuePlaceholder) {
      expect(String(valueInput.attributes('placeholder') ?? ''), `${spec.type} value 占位`)
        .toMatch(spec.valuePlaceholder)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §3 键值校验 — 新七沿用非 WEIGHT 规则（value 必填；key 对禁用类型豁免）
// ══════════════════════════════════════════════════════════════════════════

// 行错位 ref-cond-error-{n} 仅在保存触发 validateConditions 后渲染 —— 行错断言一律
// 先点保存触发校验（用户行为路径），禁直读未触发校验的 DOM（空断言/恒真假绿）。
describe('§3 键值校验 — 禁键豁免与 value 必填沿用', () => {
  it('六禁键类型 key 留空豁免：key 空 + value 有 → 保存无行错且逐类型放行（updateRoute 逐次 +1）', async () => {
    const { wrapper } = await factory('r1')
    let saved = 0
    for (const tp of KEY_DISABLED_TYPES) {
      vmOf(wrapper).conditions = [condRow(tp, { condition_value: 'v1' })]
      await flushPromises()
      await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
      await flushPromises()
      expect(rowError(wrapper).exists(), `${tp} key 空不应落 keyRequired 行错`).toBe(false)
      saved += 1
      expect(mocks.updateRoute, `${tp} 豁免行应放行保存`).toHaveBeenCalledTimes(saved)
    }
  })

  it('六禁键类型 value 必填沿用：key 空豁免后 value 缺 → 保存落行错 = valueRequired（不得误报 keyRequired）+ 阻断', async () => {
    const { wrapper } = await factory('r1')
    for (const tp of KEY_DISABLED_TYPES) {
      vmOf(wrapper).conditions = [condRow(tp)]
      await flushPromises()
      await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
      await flushPromises()
      expect(rowError(wrapper).exists(), `${tp} value 缺应有行错`).toBe(true)
      expect(rowError(wrapper).text(), `${tp} 行错应为 valueRequired 而非 keyRequired`)
        .toContain(t('v2.edit.valueRequired'))
    }
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('EXISTS 无值例外沿用到新类型 + COOKIE key 未豁免守卫：HOST+EXISTS 值空保存无行错；COOKIE key 空 → keyRequired', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).conditions = [condRow('HOST', { operator: 'EXISTS' })]
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(rowError(wrapper).exists(), 'HOST+EXISTS 值空应豁免（沿旧例外）').toBe(false)
    expect(mocks.updateRoute, 'HOST+EXISTS 应放行').toHaveBeenCalledTimes(1)

    vmOf(wrapper).conditions = [condRow('COOKIE')]
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(rowError(wrapper).exists(), 'COOKIE key 空（key 未禁用）应落行错').toBe(true)
    expect(rowError(wrapper).text(), 'COOKIE key 仍必填（C 不得过度豁免）')
      .toContain(t('v2.edit.keyRequired'))
    expect(mocks.updateRoute, 'COOKIE 行错应阻断（仍只 HOST 一次）').toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §4 保存载荷 — 新类型行序列化完整（mapConditions 六字段天然覆盖锚定）
// ══════════════════════════════════════════════════════════════════════════

describe('§4 保存载荷 — 新类型行六字段完整', () => {
  it('HOST 行（key 豁免空串）保存载荷 toStrictEqual 六字段：禁键 key 空串原样透传不剔行', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).conditions = [condRow('HOST', { condition_value: '**.example.com', priority: 7 })]
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updateRoute, 'HOST 行校验应放行').toHaveBeenCalledTimes(1)
    expect(mocks.updateRoute.mock.calls[0][1].conditions[0]).toStrictEqual({
      condition_type: 'HOST', operator: 'EQ', condition_key: '',
      condition_value: '**.example.com', target_route_id: 'r2', priority: 7
    })
  })

  it('七新类型 condition_type 逐类型透传 payload：六字段全在（既有序列化逻辑天然覆盖）', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    for (const tp of NEW_SEVEN) {
      const key = tp === 'COOKIE' ? 'theme' : ''
      vm.conditions = [condRow(tp, { condition_key: key, condition_value: 'v1', priority: 2 })]
      await flushPromises()
      await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
      await flushPromises()
      const body = mocks.updateRoute.mock.calls[mocks.updateRoute.mock.calls.length - 1]?.[1]
      expect(body, `${tp} 行保存应到达 updateRoute（校验不得阻断）`).toBeDefined()
      expect(body.conditions[0]).toMatchObject({ condition_type: tp, condition_value: 'v1', priority: 2 })
      expect(body.conditions[0]).toHaveProperty('condition_key', key)
      expect(body.conditions[0]).toHaveProperty('target_route_id', 'r2')
      expect(body.conditions[0]).toHaveProperty('operator', 'EQ')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 既有锚 — 既有 6 类型与 WEIGHT 特例（既有用例未覆盖，补锚；扩七不得回退）
// ══════════════════════════════════════════════════════════════════════════

describe('既有锚 — 既有下拉与 WEIGHT 特例（本批前后恒绿）', () => {
  it('锚 1：既有五类型在前 + WEIGHT 存在且恒收尾（扩七后顺序稳定不变红）', async () => {
    const { wrapper } = await factory('r1')
    const values = vmOf(wrapper).condTypeOptions.map((o: { value: string }) => o.value)
    expect(values.slice(0, 5)).toEqual(['HEADER', 'PATH', 'QUERY', 'BODY', 'GROOVY'])
    expect(values).toContain('WEIGHT')
    expect(values[values.length - 1], 'WEIGHT 恒收尾').toBe('WEIGHT')
  })

  it('锚 2：WEIGHT 行特例不回退——value 禁用 + key 数字输入 + operator 禁用（HEADER 对照 value 不禁用）', async () => {
    const { wrapper } = await factory('r1')
    // 对照：注入 HEADER 行，value 可编辑
    vmOf(wrapper).conditions = [condRow('HEADER', { condition_value: 'on' })]
    await flushPromises()
    expect(inputOf(wrapper, 'ref-cond-value-0').attributes('disabled')).toBeUndefined()
    vmOf(wrapper).conditions[0].condition_type = 'WEIGHT'
    await flushPromises()
    expect(inputOf(wrapper, 'ref-cond-value-0').attributes('disabled'), 'WEIGHT value 禁用').toBe('')
    expect(inputOf(wrapper, 'ref-cond-key-0').attributes('type'), 'WEIGHT key 数字输入').toBe('number')
    // FcSelect 禁用 DOM：data-testid 落 .fc-select 根 + 内层 .el-select，禁用类在 .el-select__wrapper
    const selectWrapper = need(wrapper, 'ref-cond-operator-0', 'operator 位')
      .find('.el-select__wrapper')
    expect(selectWrapper.exists(), 'el-select wrapper 在位').toBe(true)
    expect(selectWrapper.classes().some((c) => c.includes('is-disabled')), 'WEIGHT operator 禁用').toBe(true)
  })
})
