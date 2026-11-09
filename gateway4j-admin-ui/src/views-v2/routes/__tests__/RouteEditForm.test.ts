/**
 * P4c-2-T：RouteEditForm 组件测试 —— 契约 docs/ui-v2/实施契约.md §4.5 P4c 行（P4c-2 段）。
 * 路由编辑入口方案 a：抽独立 RouteEditForm.vue（旧 src/views/routes/Editor.vue 661 行四 Tab
 * 收敛为 basic+conditions+bindings 三区 + chain 只读预览常驻段）嵌入 Detail 页；
 * dtl-action-edit 同步修正（Detail.vue:406-409 现跳旧画布 /routes/:id/canvas → 改开编辑态，
 * 画布保持结构编辑定位；见 Detail.test.ts V16/V17）。先红是预期：组件由 P4c-2-C 实现
 * （当前 src/views-v2/routes/RouteEditForm.vue 不存在，RED 形态 = Failed to resolve import，
 * vitest 与 vue-tsc(TS2307) 同理，合规先红，Settings.test.ts 先例）。
 *
 * ── 旧 Editor.vue 语义权威（逐字随迁点）─────────────────────────────────────
 * 字段表：route_name（required + /^[a-zA-Z0-9_]{2,50}$/，maxlength 50）/ route_type
 *   （BACKEND|DISPATCH）/ parent_route_id（候选 = 仅 DISPATCH + 排除自己）/ path
 *   （仅 BACKEND 必填 + /^\/[^\s]+$/，maxlength 500）/ upstream_url（仅 BACKEND 必填 +
 *   /^https?:\/\/\S+$/，maxlength 500）/ sort_order（1-9999）/ remark（maxlength 200）/
 *   tags（maxlength 200）/ environment（envReady 才渲染；PATCH 仅用户显式改动时携带——
 *   契约「缺省保持」）。DISPATCH 的 path/upstream_url 不校验（upstream 空语义）。
 * 装载：loadEpoch 竞态守卫（陈旧成功不覆写表单、陈旧失败不复活错误条）；getRoute 一次取全
 *   （conditions 从 detail 读，旧页二次 getRoute 的拆分随单组件收敛消亡）+ listRoutes
 *   （parent 候选）+ listBindings（失败不清空）+ getPluginChain + listBuiltinTypes
 *   （插件选项来源）并行；getRoute 失败 → 错误态 + 保存阻断；listRoutes 失败 → 降级警告条
 *   表单照常；bindings/chain 失败 → secondary 错误条不清数据。
 * 保存时序：canEdit → loading/saving 双击防重 → 字段校验 → DISPATCH 且 conditions 空 →
 *   客户端预检阻断（不调任何 API）→ DISPATCH 且有 conditions → validateRoute({route_id,
 *   conditions}) 服务端预检（在 updateRoute 之前，失败阻断）→ updateRoute(id, payload)。
 * payload：route_name/route_type/path/upstream_url/sort_order/remark/tags||''/
 *   parent_route_id||undefined/conditions 映射 6 字段（condition_type/operator/condition_key/
 *   condition_value/target_route_id/priority）/bindings 映射（plugin_id/binding_config||'{}'/
 *   sort_order ?? index）；edit 模式追加 expected_version = String(config_version)
 *   （Long→String 契约）+ environment（仅改动时）。
 * 10402：e.code === 10402 → 独立分支：conflict-bar + toast.warning，不落通用 save-error、
 *   不自动覆盖表单；conflict-refresh 显式点击才重拉覆盖。
 * conditions 七 operator：EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT；WEIGHT 行特例（operator/value
 *   禁用 + 权重输入 + 和校验）由 C 按旧语义随迁，本文件不展开行为用例。
 * bindings：增改删 + 排序上下移（契约「增改删排序」；旧页无上下移、无启停——启停禁臆造）；
 *   MAX_BINDINGS 20 上限；增改走 FcDialog（plugin 选项 = listBuiltinTypes）；config
 *   maxlength 10000、缺省 '{}'。
 * 脏离开：dirtyTracking（载入完成后才开）+ watch(form, deep) + FcFormDraftBanner(visible=dirty)
 *   + onBeforeRouteLeave（vue-router；dirty && !saving → confirm(danger) → false 阻断）。
 *
 * ── v2 落位裁决（相对旧页，C 按此实现）─────────────────────────────────────
 * ① 组件仅编辑态（props.routeId 必填；创建走既有 /v2/wizard，不入组件职责）；不含
 *    publish/offline/PublishSyncStatus（发布语义在 /v2/publish 页，Detail 已有入口）。
 * ② 三区导航 = FcTabsPanel（Settings set-section-* 同款）：tab 根 ref-section-nav
 *    （.fc-tab × 3，SDK tabs prop 无 testid 通道），面板 ref-section-basic/conditions/
 *    bindings，默认 basic；chain 不是 Tab（契约「收敛为三区」字面）= 常驻只读段 ref-chain。
 * ③ 三区手写 Fc* 表单（P4a-1 ped-* 先例，无 el-form）；字段错误逐 prop 注入
 *    ref-field-error-{field}（客户端校验与服务端 mapFieldErrors 共用通道）。
 * ④ 宿主接口：props { routeId: string }；emits { saved（保存成功，宿主刷新页头）/
 *    close（取消完成收起请求）/ dirty-change(isDirty: boolean) }。成功语义照旧 Editor：
 *    toast + dirty=false + 自 load() 重拉（留在编辑态）+ emit('saved')。取消 ref-action-cancel
 *    自带 confirm（dirty → danger → false 则不 emit close）；宿主收到 close 无条件收起。
 *    路由级脏离开由组件自带 onBeforeRouteLeave 承担。
 * ⑤ 键值校验（v2 增量，钉死）：condition_key 必填；condition_value 必填但 EXISTS/WEIGHT 行
 *    可空（EXISTS 无值语义 / WEIGHT 值留空契约）；错误位 ref-cond-error-{n}，保存阻断。
 * ⑥ vm 通道（jsdom 无法驱动 FcSelect/FcInputNumber/FcSegmented 交互面；Settings/ImportExport
 *    先例）：form / conditions / bindings / chain / parentOptions / operatorOptions /
 *    expectedVersion / dirty / conflict / tabs / formEnvironment / save / addCondition /
 *    removeCondition / dialogOpen / bindingForm 需可经 wrapper.vm 访问。
 *
 * ── testid 契约表（前缀 ref-*，与宿主 dtl-* 界限清晰；任务书全表 + ②⑤ 标注 T 裁决扩展）──
 * 容器/状态: ref-form（根，任何状态都在）/ ref-skeleton / ref-load-error（getRoute 失败，
 *   此时三区不渲染）/ ref-retry / ref-parent-error（listRoutes 失败降级警告条，表单照常）/
 *   ref-secondary-error（bindings/chain 二源失败共用，不清数据）
 * 分区导航: ref-section-nav（.fc-tab × 3）；面板 ref-section-basic / ref-section-conditions /
 *   ref-section-bindings（默认 basic）
 * basic 字段: ref-input-route_name / ref-input-route_type（FcSegmented 根 role=radiogroup）/
 *   ref-input-parent_route_id（FcSelect 容器）/ ref-input-path / ref-input-upstream_url /
 *   ref-input-sort_order（FcInputNumber 内 input）/ ref-input-remark（textarea）/
 *   ref-input-tags / ref-input-environment（envReady 才渲染）
 * 错误通道: ref-field-error-{field}（field ∈ 9 字段）；conditions 行级 ref-cond-error-{n}
 * conditions: ref-cond-add / ref-cond-row-{n}（n=0 起 index）/ ref-cond-type-{n} /
 *   ref-cond-operator-{n} / ref-cond-key-{n} / ref-cond-value-{n} / ref-cond-target-{n} /
 *   ref-cond-priority-{n} / ref-cond-remove-{n} / ref-cond-error-{n}
 * bindings: ref-binding-add / ref-binding-dialog（增改共用 FcDialog）/ ref-binding-dialog-save /
 *   ref-binding-plugin-{id}（dialog 内 FcSelect 容器）/ ref-binding-config-{id}（dialog 内
 *   textarea，maxlength 10000）/ ref-binding-row-{id}（id=binding_id；新增行临时 new-{n}）/
 *   ref-binding-edit-{id} / ref-binding-remove-{id} / ref-binding-up-{id} /
 *   ref-binding-down-{id} / ref-binding-max（20 上限提示；启停语义不设，禁臆造）
 * chain 只读段: ref-chain（常驻，非 Tab）/ ref-chain-row-{n}（n=0 起，DOM 序 =
 *   pre_chain+post_chain）/ ref-chain-empty；区内禁任何可编辑位
 * 动作/反馈: ref-action-save / ref-action-cancel（canEdit=false → save 不渲染 +
 *   ref-readonly-hint）/ ref-dirty-banner / ref-conflict-bar / ref-conflict-refresh /
 *   ref-save-error / ref-toast-success / ref-toast-error（行为断言走 toast mock，DOM
 *   testid 源码抽查，P4d-2 先例）
 *
 * ── i18n key 全表（v2.edit.*，zh/en 同步加，铁律 6；独立新树不混 v2.detail、不引旧树）──
 * title / sectionBasic / sectionConditions / sectionBindings / chainTitle / chainEmpty /
 * fieldRouteName / fieldType / fieldParent / fieldPath / fieldUpstream / fieldSortOrder /
 * fieldRemark / fieldTags / fieldEnvironment / parentNone / parentHint /
 * dispatchNeedsConditions / validationFailed / conflictModified / conflictRefresh /
 * conditionsLoadFailed / bindingsLoadFailed / chainLoadFailed / parentOptionsError /
 * condType / condOperator / condKey / condValue / condTarget / condPriority / condAdd /
 * condRemove / operatorEq / operatorNe / operatorContains / operatorRegex / operatorExists /
 * operatorGt / operatorLt / typeBackend / typeDispatch / bindingAdd / bindingEdit /
 * bindingRemove / bindingUp / bindingDown / bindingPlugin / bindingConfig / bindingMax /
 * bindingDialogTitle / bindingDialogSave / discardChanges / save / cancel / readonlyHint /
 * saveSuccess / saveFailed / loadFailed / retry / keyRequired / valueRequired
 *
 * ── API mock 面（组件允许的 import 面 = @/api/routes 6 成员 + @/api/plugins 1 成员 +
 * @/api/http 仅 mapFieldErrors）另 mock：@/composables/useFcConfirm（confirm）、
 * @/composables/usePermission（canEdit）、@/store/environment（useEnvironments）、
 * '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，P4a-2/P4d 先例）。
 * createRoute/publishRoute 等 6 成员之外不进 mock——组件若误用直接 TypeError 自曝。
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
import { FcFormDraftBanner } from '@/components'
import { BusinessError } from '@/api/http'

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
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
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
// C 步修正（机制性，非契约变更）：同步工厂里 `BusinessError: BusinessError` 自引用
// 被本文件 import 的 mocked 模块绑定 → 工厂执行期 TDZ，整文件 collect 即崩（0 test）。
// 改用 Users/Settings/Roles.test.ts 同款 importOriginal 保真其余成员，语义不变：
// BusinessError 仍为真实现，仅 mapFieldErrors 走 mock。
vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
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
vi.mock('@/store/environment', () => ({
  useEnvironments: () => envState
}))
vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, toast: mocks.toast }
})

import RouteEditForm from '@/views-v2/routes/RouteEditForm.vue'

// 环境维度（组件 useEnvironments() 的返回态；用例可就地改 available 模拟 404 降级）。
// 必须 vi.hoisted：vi.mock 工厂引用它，而工厂随 import 提升执行，普通 const 会踩 TDZ。
const envState = vi.hoisted(() => ({
  available: true,
  current: 'prod',
  options: [
    { value: 'prod', label: 'prod' },
    { value: 'dev', label: 'dev' }
  ]
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（Detail.test.ts / Settings.test.ts 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../RouteEditForm.vue'), 'utf-8')
}

// ── fixtures（真实 API 形状，snake_case 原样透传；旧 Editor load 字段口径）────

/** RouteDetail（getRoute）：basic 9 字段 + conditions/bindings + status/config_version */
function makeRoute(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', sort_order: 1, remark: '旧备注',
    parent_route_id: null, tags: 'edge', environment: 'prod',
    status: 'DRAFT', config_version: '42',
    conditions: [] as unknown[], children: [], ...over
  }
}

/** RouteConditionDto：6 字段映射口径（旧 Editor payload 映射逐字） */
function makeCond(over: Record<string, unknown> = {}) {
  return {
    condition_type: 'HEADER', operator: 'EQ', condition_key: 'X-Canary',
    condition_value: 'on', target_route_id: 'r2', priority: 1, ...over
  }
}

/** PluginBinding（listBindings 行）：binding_id/plugin_id/plugin_name/binding_config/sort_order */
function makeBinding(id: string, over: Record<string, unknown> = {}) {
  return {
    binding_id: id, plugin_id: 'p1', plugin_name: 'rate-limit',
    binding_config: '{"limit":10}', sort_order: 0, ...over
  }
}

/** 默认路由树：r2 是唯一 DISPATCH 候选；r3 BACKEND 不可挂；c1 自身 BACKEND 不可挂 */
function defaultNodes() {
  return [
    makeRoute('r1', {
      route_type: 'DISPATCH', upstream_url: '', path: '/api/r1/**',
      children: [makeRoute('c1', { route_type: 'BACKEND', path: '/api/c1/**' })]
    }),
    makeRoute('r2', { route_type: 'DISPATCH', upstream_url: '', path: '/api/r2/**' }),
    makeRoute('r3', { route_type: 'BACKEND', path: '/api/r3/**' })
  ]
}

function defaultBindings() {
  return [
    makeBinding('b1', { sort_order: 0 }),
    makeBinding('b2', { plugin_id: 'p2', plugin_name: 'signature', binding_config: '{"mode":"strict"}', sort_order: 1 })
  ]
}

function defaultChain() {
  return {
    pre_chain: [{ plugin_id: 'p1', plugin_name: 'rate-limit' }],
    post_chain: [{ plugin_id: 'p9', plugin_name: 'audit' }]
  }
}

async function factory(routeId = 'r1', over: Record<string, unknown> = {}): Promise<{
  wrapper: VueWrapper<any>; router: Router
}> {
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
    props: { routeId, ...over },
    global: { plugins: [ElementPlus, createPinia(), i18n, router] }
  })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any> | ReturnType<VueWrapper<any>['find']>, tid: string) =>
  w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，ImportExport.test.ts 先例） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
const areaOf = (w: VueWrapper<any>, tid: string) => w.find(`textarea[data-testid="${tid}"]`)
const inputVal = (w: VueWrapper<any>, tid: string) => String((inputOf(w, tid).element as HTMLInputElement)?.value ?? '')
const areaVal = (w: VueWrapper<any>, tid: string) => String((areaOf(w, tid).element as HTMLTextAreaElement)?.value ?? '')
const vmOf = (w: VueWrapper<any>) => w.vm as any
const lastCallArg = (fn: ReturnType<typeof vi.fn>, i = 0) => fn.mock.calls[fn.mock.calls.length - 1][i]

beforeEach(() => {
  setActivePinia(createPinia())
  envState.available = true
  envState.current = 'prod'
  mocks.getRoute.mockReset().mockImplementation(async (id: string) => makeRoute(id, {
    conditions: id === 'r1' ? [makeCond()] : []
  }))
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.updateRoute.mockReset().mockResolvedValue(makeRoute('r1'))
  mocks.validateRoute.mockReset().mockResolvedValue({})
  mocks.listBindings.mockReset().mockResolvedValue(defaultBindings())
  mocks.getPluginChain.mockReset().mockResolvedValue(defaultChain())
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([
    { plugin_id: 'p1', plugin_name: 'rate-limit' },
    { plugin_id: 'p2', plugin_name: 'signature' },
    { plugin_id: 'p3', plugin_name: 'groovy-demo' }
  ])
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReset().mockReturnValue(true)
})

// ── i18n key 全表（v2.edit.*，62 key；独立新树不混 v2.detail、不引旧树 route.*）────

const KEYS = [
  'title', 'sectionBasic', 'sectionConditions', 'sectionBindings', 'chainTitle', 'chainEmpty',
  'fieldRouteName', 'fieldType', 'fieldParent', 'fieldPath', 'fieldUpstream', 'fieldSortOrder',
  'fieldRemark', 'fieldTags', 'fieldEnvironment', 'parentNone', 'parentHint',
  'dispatchNeedsConditions', 'validationFailed', 'conflictModified', 'conflictRefresh',
  'conditionsLoadFailed', 'bindingsLoadFailed', 'chainLoadFailed', 'parentOptionsError',
  'condType', 'condOperator', 'condKey', 'condValue', 'condTarget', 'condPriority', 'condAdd',
  'condRemove', 'operatorEq', 'operatorNe', 'operatorContains', 'operatorRegex',
  'operatorExists', 'operatorGt', 'operatorLt', 'typeBackend', 'typeDispatch', 'bindingAdd',
  'bindingEdit', 'bindingRemove', 'bindingUp', 'bindingDown', 'bindingPlugin', 'bindingConfig',
  'bindingMax', 'bindingDialogTitle', 'bindingDialogSave', 'discardChanges', 'save', 'cancel',
  'readonlyHint', 'saveSuccess', 'saveFailed', 'loadFailed', 'retry', 'keyRequired', 'valueRequired'
].map((k) => `v2.edit.${k}`)

describe('v2 edit — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })

  it('不引用旧树 route.*（v2.edit 独立自洽，旧树随 P4f 摘除不牵连）', () => {
    expect(readSource()).not.toMatch(/t\('route\./)
    expect(readSource()).not.toMatch(/t\('v2\.detail\./)
  })
})

// ── 装载与竞态 ────────────────────────────────────────────────────────────

describe('装载 — 五源并行与回显', () => {
  it('挂载即 getRoute+listRoutes+listBindings+getPluginChain+listBuiltinTypes 五源齐调（routeId 透传）', async () => {
    await factory('r1')
    expect(mocks.getRoute).toHaveBeenCalledWith('r1')
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.listBindings).toHaveBeenCalledWith('r1')
    expect(mocks.getPluginChain).toHaveBeenCalledWith('r1')
    expect(mocks.listBuiltinTypes).toHaveBeenCalledTimes(1)
  })

  it('getRoute 回显全字段：basic 9 字段进表单 + expectedVersion=String(config_version)（Long→String）', async () => {
    const { wrapper } = await factory('r1')
    expect(inputVal(wrapper, 'ref-input-route_name')).toBe('r1_svc')
    expect(inputVal(wrapper, 'ref-input-path')).toBe('/api/r1/**')
    expect(inputVal(wrapper, 'ref-input-upstream_url')).toBe('http://10.0.0.11:9001')
    expect(inputVal(wrapper, 'ref-input-sort_order')).toBe('1')
    expect(areaVal(wrapper, 'ref-input-remark')).toBe('旧备注')
    expect(inputVal(wrapper, 'ref-input-tags')).toBe('edge')
    const vm = vmOf(wrapper)
    expect(vm.form.route_type).toBe('BACKEND')
    expect(vm.form.parent_route_id ?? '').toBe('')
    expect(vm.formEnvironment).toBe('prod')
    expect(vm.expectedVersion).toBe('42')
  })

  it('conditions/bindings/chain 回显：vm.conditions 取自 getRoute detail；vm.bindings 取 listBindings 原始五元组', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    expect(vm.conditions).toHaveLength(1)
    expect(vm.conditions[0].condition_key).toBe('X-Canary')
    expect(vm.bindings).toHaveLength(2)
    expect(vm.bindings[0]).toEqual({
      binding_id: 'b1', plugin_id: 'p1', plugin_name: 'rate-limit',
      binding_config: '{"limit":10}', sort_order: 0
    })
    expect(vm.chain).toHaveLength(2)
  })

  it('loadEpoch 竞态：routeId 变更后陈旧 getRoute("r1") 迟到成功不覆写 r2 表单', async () => {
    const deferred: Record<string, (v: unknown) => void> = {}
    mocks.getRoute.mockImplementation((id: string) => new Promise((res) => { deferred[id] = res }))
    const { wrapper } = await factory('r1')
    await wrapper.setProps({ routeId: 'r2' })
    await flushPromises()
    deferred.r2?.(makeRoute('r2', { route_name: 'r2_svc' }))
    await flushPromises()
    deferred.r1?.(makeRoute('r1', { route_name: 'STALE_R1' }))
    await flushPromises()
    expect(vmOf(wrapper).form.route_name).toBe('r2_svc')
  })

  it('getRoute reject → ref-load-error+ref-retry，三区不渲染；点 ref-retry → getRoute 第二次调用', async () => {
    mocks.getRoute.mockRejectedValue(new Error('route down'))
    const { wrapper } = await factory('r1')
    expect(need(wrapper, 'ref-load-error', '加载失败错误态').text()).toContain(t('v2.edit.loadFailed'))
    expect(one(wrapper, 'ref-section-nav').exists()).toBe(false)
    await need(wrapper, 'ref-retry', '重试钮').trigger('click')
    await flushPromises()
    expect(mocks.getRoute).toHaveBeenCalledTimes(2)
  })

  it('listRoutes reject → ref-parent-error 降级警告条 + basic 表单照常回显（旧 route-list-error 语义）', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('tree down'))
    const { wrapper } = await factory('r1')
    expect(need(wrapper, 'ref-parent-error', '父级候选降级条').exists()).toBe(true)
    expect(inputVal(wrapper, 'ref-input-route_name')).toBe('r1_svc')
    expect(one(wrapper, 'ref-secondary-error').exists()).toBe(false)
  })

  it('listBindings reject → ref-secondary-error（bindingsLoadFailed）不清空既有 bindings；getPluginChain reject → 同通道 + ref-chain-empty', async () => {
    mocks.listBindings.mockRejectedValue(new Error('bindings down'))
    const { wrapper } = await factory('r1')
    expect(need(wrapper, 'ref-secondary-error', '二源错误条').text()).toContain(t('v2.edit.bindingsLoadFailed'))
    mocks.listBindings.mockResolvedValue(defaultBindings())
    mocks.getPluginChain.mockRejectedValue(new Error('chain down'))
    const second = await factory('r1')
    expect(need(second.wrapper, 'ref-secondary-error', 'chain 失败同通道').text()).toContain(t('v2.edit.chainLoadFailed'))
    expect(need(second.wrapper, 'ref-chain-empty', 'chain 空态').exists()).toBe(true)
  })

  it('loading 挂起期 ref-skeleton 渲染、ref-action-save 不在（保存阻断直到 basic 就绪，旧 loading gate）', async () => {
    mocks.getRoute.mockImplementation(() => new Promise(() => { /* 挂起不 resolve */ }))
    const { wrapper } = await factory('r1')
    expect(need(wrapper, 'ref-skeleton', '骨架').exists()).toBe(true)
    expect(one(wrapper, 'ref-action-save').exists()).toBe(false)
  })
})

// ── basic 区：字段边界/校验/联动 ──────────────────────────────────────────

describe('basic — 字段边界与校验（旧 RouteBasicForm rules 逐字随迁）', () => {
  it('maxlength DOM 属性：name 50 / path 500 / upstream 500 / remark 200 / tags 200', async () => {
    const { wrapper } = await factory('r1')
    expect(inputOf(wrapper, 'ref-input-route_name').attributes('maxlength')).toBe('50')
    expect(inputOf(wrapper, 'ref-input-path').attributes('maxlength')).toBe('500')
    expect(inputOf(wrapper, 'ref-input-upstream_url').attributes('maxlength')).toBe('500')
    expect(areaOf(wrapper, 'ref-input-remark').attributes('maxlength')).toBe('200')
    expect(inputOf(wrapper, 'ref-input-tags').attributes('maxlength')).toBe('200')
  })

  it('route_name 必填 + pattern ^[a-zA-Z0-9_]{2,50}$：空与 "a!" 都落 ref-field-error-route_name 且阻断保存', async () => {
    const first = await factory('r1')
    vmOf(first.wrapper).form.route_name = ''
    await need(first.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(first.wrapper, 'ref-field-error-route_name', 'name 错误位').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()

    const second = await factory('r1')
    vmOf(second.wrapper).form.route_name = 'a!'
    await need(second.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(second.wrapper, 'ref-field-error-route_name', 'pattern 错误位').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('BACKEND path 必填：清空保存 → ref-field-error-path + 不调 updateRoute', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.path = ''
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-field-error-path', 'path 错误位').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('BACKEND upstream_url 必填 + http(s) pattern：空值 → ref-field-error-upstream_url + 阻断', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.upstream_url = ''
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-field-error-upstream_url', 'upstream 错误位').exists()).toBe(true)
    vmOf(wrapper).form.upstream_url = 'ftp://nope'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-field-error-upstream_url', 'pattern 错误位').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('DISPATCH 的 path/upstream_url 不校验：清空仍可保存（upstream 空语义，旧 isBackend 条件分支）', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    vm.form.route_type = 'DISPATCH'
    vm.form.path = ''
    vm.form.upstream_url = ''
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ref-field-error-path').exists()).toBe(false)
    expect(one(wrapper, 'ref-field-error-upstream_url').exists()).toBe(false)
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
  })

  it('sort_order 边界：0 与 10000 都落 ref-field-error-sort_order（1-9999，旧 rules min/max）', async () => {
    const first = await factory('r1')
    vmOf(first.wrapper).form.sort_order = 0
    await need(first.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(first.wrapper, 'ref-field-error-sort_order', '下界').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()

    const second = await factory('r1')
    vmOf(second.wrapper).form.sort_order = 10000
    await need(second.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(second.wrapper, 'ref-field-error-sort_order', '上界').exists()).toBe(true)
  })

  it('parent 候选 = 仅 DISPATCH + 排除自己：vm.parentOptions 恰为 ["r2"]（r3 BACKEND / c1 BACKEND / 自身 r1 都排除）', async () => {
    const { wrapper } = await factory('r1')
    const values = vmOf(wrapper).parentOptions.map((o: { value: string }) => o.value)
    expect(values).toEqual(['r2'])
  })

  it('route_type 位 = FcSegmented（role=radiogroup）；环境字段 envReady 才渲染（404 降级整体不在）', async () => {
    const first = await factory('r1')
    expect(need(first.wrapper, 'ref-input-route_type', '类型位').attributes('role')).toBe('radiogroup')
    expect(need(first.wrapper, 'ref-input-environment', '环境字段').exists()).toBe(true)
    envState.available = false
    const second = await factory('r1')
    expect(one(second.wrapper, 'ref-input-environment').exists()).toBe(false)
  })

  it('environment PATCH 仅显式改动携带（缺省保持契约）：formEnvironment 不动 → body 无 environment；改 dev → body.environment=dev', async () => {
    const first = await factory('r1')
    await need(first.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(lastCallArg(mocks.updateRoute, 1)).not.toHaveProperty('environment')

    const second = await factory('r1')
    vmOf(second.wrapper).formEnvironment = 'dev'
    await need(second.wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(lastCallArg(mocks.updateRoute, 1).environment).toBe('dev')
  })
})

// ── conditions 区：七 operator / 增删行 / 键值校验 ─────────────────────────

describe('conditions — 七 operator 与行操作', () => {
  const SEVEN = ['EQ', 'NE', 'CONTAINS', 'REGEX', 'EXISTS', 'GT', 'LT']

  it('vm.operatorOptions 恰为七枚举（顺序照旧表）：EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT', async () => {
    const { wrapper } = await factory('r1')
    expect(vmOf(wrapper).operatorOptions.map((o: { value: string }) => o.value)).toEqual(SEVEN)
  })

  it.each(SEVEN)('%s 是可选 operator（value 原样枚举，不经 i18n 转换）', async (op) => {
    const { wrapper } = await factory('r1')
    expect(vmOf(wrapper).operatorOptions.some((o: { value: string }) => o.value === op)).toBe(true)
  })

  it('行 DOM 位齐全：ref-cond-row-0 内 type/operator/key/value/target/priority 全部落位', async () => {
    const { wrapper } = await factory('r1')
    const row = need(wrapper, 'ref-cond-row-0', '条件行')
    for (const cell of ['ref-cond-type-0', 'ref-cond-operator-0', 'ref-cond-key-0', 'ref-cond-value-0', 'ref-cond-target-0', 'ref-cond-priority-0']) {
      expect(row.find(`[data-testid="${cell}"]`).exists(), `行内缺 ${cell}`).toBe(true)
    }
  })

  it('ref-cond-add 加行 → vm.conditions +1 且默认形态照旧表（HEADER/EQ/键值空/priority 1）', async () => {
    const { wrapper } = await factory('r1')
    expect(vmOf(wrapper).conditions).toHaveLength(1)
    await need(wrapper, 'ref-cond-add', '加行钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.conditions).toHaveLength(2)
    expect(vm.conditions[1]).toEqual({
      condition_type: 'HEADER', operator: 'EQ', condition_key: '',
      condition_value: '', target_route_id: '', priority: 1
    })
    expect(one(wrapper, 'ref-cond-row-1').exists()).toBe(true)
  })

  it('ref-cond-remove-{n} 删行按 index：删第 0 行 → 剩原第 1 行内容', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).addCondition()
    await flushPromises()
    await need(wrapper, 'ref-cond-remove-0', '删行钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.conditions).toHaveLength(1)
    expect(vm.conditions[0].condition_key).toBe('')
  })

  it('键值校验（v2 增量钉死）：condition_key 空 → ref-cond-error-0 + 阻断（validateRoute/updateRoute 都不调）', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).conditions[0].condition_key = ''
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-cond-error-0', '行级错误位').text()).toContain(t('v2.edit.keyRequired'))
    expect(mocks.validateRoute).not.toHaveBeenCalled()
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('value 校验的 EXISTS 例外：operator=EXISTS 且 value 空 → 不落行错、保存照常（EXISTS 无值语义）', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    vm.conditions[0].operator = 'EXISTS'
    vm.conditions[0].condition_value = ''
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ref-cond-error-0').exists()).toBe(false)
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
  })
})

// ── bindings 区：增改删排序（契约「增改删排序」；旧页无上下移为 v2 增量、无启停禁臆造）──

describe('bindings — 增改删与上下移排序', () => {
  it('服务端行渲染：ref-binding-row-{binding_id} 按行落位 + plugin_name 直出', async () => {
    const { wrapper } = await factory('r1')
    expect(need(wrapper, 'ref-binding-row-b1', '行 b1').text()).toContain('rate-limit')
    expect(need(wrapper, 'ref-binding-row-b2', '行 b2').text()).toContain('signature')
  })

  it('加行：ref-binding-add → ref-binding-dialog 开；确认 → 行 +1（临时 id new-1、sort_order 顺延）+ dialog 关', async () => {
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-binding-add', '绑插件钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-binding-dialog', '弹窗').exists()).toBe(true)
    const vm = vmOf(wrapper)
    vm.bindingForm.plugin_id = 'p3'
    vm.bindingForm.binding_config = '{"x":1}'
    await need(wrapper, 'ref-binding-dialog-save', '弹窗确认').trigger('click')
    await flushPromises()
    const vm2 = vmOf(wrapper)
    expect(vm2.bindings).toHaveLength(3)
    expect(vm2.bindings[2].binding_id).toBe('new-1')
    expect(vm2.bindings[2].sort_order).toBe(2)
    expect(one(wrapper, 'ref-binding-dialog').exists()).toBe(false)
  })

  it('20 上限：已满 20 行再点加行 → ref-binding-max 提示 + 行数不变 + dialog 不开', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    for (let i = 0; i < 20; i++) {
      vm.bindings.push({ binding_id: `x${i}`, plugin_id: 'p1', plugin_name: 'rate-limit', binding_config: '{}', sort_order: i })
    }
    await need(wrapper, 'ref-binding-add').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-binding-max', '上限提示').exists()).toBe(true)
    expect(vmOf(wrapper).bindings).toHaveLength(20)
    expect(one(wrapper, 'ref-binding-dialog').exists()).toBe(false)
  })

  it('改行：ref-binding-edit-b1 → dialog 回填该行值；改 config 确认 → 原行更新（binding_id 不变）', async () => {
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-binding-edit-b1', '改行钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.dialogOpen).toBe(true)
    expect(vm.bindingForm.plugin_id).toBe('p1')
    expect(vm.bindingForm.binding_config).toBe('{"limit":10}')
    vm.bindingForm.binding_config = '{"limit":99}'
    await need(wrapper, 'ref-binding-dialog-save').trigger('click')
    await flushPromises()
    const vm2 = vmOf(wrapper)
    expect(vm2.bindings[0].binding_id).toBe('b1')
    expect(vm2.bindings[0].binding_config).toBe('{"limit":99}')
  })

  it('删行：ref-binding-remove-b2 → 行 -1 只剩 b1', async () => {
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-binding-remove-b2', '删行钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.bindings).toHaveLength(1)
    expect(vm.bindings[0].binding_id).toBe('b1')
  })

  it('上移：ref-binding-up-b2 点击 → 顺序 [b2,b1] 且 sort_order 重排 [0,1]', async () => {
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-binding-up-b2', '上移钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.bindings.map((b: { binding_id: string }) => b.binding_id)).toEqual(['b2', 'b1'])
    expect(vm.bindings.map((b: { sort_order: number }) => b.sort_order)).toEqual([0, 1])
  })

  it('下移：ref-binding-down-b1 点击 → 顺序 [b2,b1]；首行 up 禁用 / 末行 down 禁用（边界）', async () => {
    const { wrapper } = await factory('r1')
    expect(inputOf(wrapper, 'ref-input-route_name').exists()).toBe(true) // 装载就绪哨兵
    expect(need(wrapper, 'ref-binding-up-b1', '首行上移').attributes('disabled')).toBeDefined()
    expect(need(wrapper, 'ref-binding-down-b2', '末行下移').attributes('disabled')).toBeDefined()
    await need(wrapper, 'ref-binding-down-b1').trigger('click')
    await flushPromises()
    expect(vmOf(wrapper).bindings.map((b: { binding_id: string }) => b.binding_id)).toEqual(['b2', 'b1'])
  })
})

// ── chain 只读段（契约「三区」字面：chain 非 Tab，常驻只读预览）──────────────

describe('chain — 只读预览常驻段', () => {
  it('分区枚举恰为三区：vm.tabs = [basic, conditions, bindings]，chain 不是 Tab', async () => {
    const { wrapper } = await factory('r1')
    expect(vmOf(wrapper).tabs).toEqual(['basic', 'conditions', 'bindings'])
    expect(need(wrapper, 'ref-chain', 'chain 常驻段').exists()).toBe(true)
  })

  it('行序 = pre_chain+post_chain 拼接（DOM 序即链路序）：row-0 rate-limit、row-1 audit', async () => {
    const { wrapper } = await factory('r1')
    const rows = wrapper.findAll('[data-testid^="ref-chain-row-"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('rate-limit')
    expect(rows[1].text()).toContain('audit')
  })

  it('空链 → ref-chain-empty；只读断言：ref-chain 内无 input/textarea/button 可编辑位', async () => {
    mocks.getPluginChain.mockResolvedValue({ pre_chain: [], post_chain: [] })
    const { wrapper } = await factory('r1')
    const chainEl = need(wrapper, 'ref-chain', 'chain 段')
    expect(need(wrapper, 'ref-chain-empty', '空态').exists()).toBe(true)
    expect(chainEl.findAll('input,textarea,button')).toHaveLength(0)
  })
})

// ── 保存：payload 形态 / DISPATCH 双预检 / 10402 / 失败通道 ─────────────────

describe('保存 — 时序与 payload（旧 Editor.save 逐字随迁）', () => {
  it('payload 全形态：9 字段 + conditions 6 字段映射（无多余键）+ bindings 映射剥离 plugin_name/binding_id + expected_version=42', async () => {
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
    const [id, body] = mocks.updateRoute.mock.calls[0]
    expect(id).toBe('r1')
    expect(body).toMatchObject({
      route_name: 'r1_svc', route_type: 'BACKEND', path: '/api/r1/**',
      upstream_url: 'http://10.0.0.11:9001', sort_order: 1, remark: '旧备注', tags: 'edge',
      expected_version: '42'
    })
    expect(body.parent_route_id).toBeUndefined()
    expect(body.conditions[0]).toStrictEqual({
      condition_type: 'HEADER', operator: 'EQ', condition_key: 'X-Canary',
      condition_value: 'on', target_route_id: 'r2', priority: 1
    })
    expect(body.bindings[0]).toStrictEqual({ plugin_id: 'p1', binding_config: '{"limit":10}', sort_order: 0 })
    expect(body.bindings[1].plugin_id).toBe('p2')
  })

  it('payload bindings 缺省：binding_config 空串 → \'{}\'；sort_order 缺 → ?? index；parent 有值 → 透传', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    vm.bindings.push({ binding_id: 'n9', plugin_id: 'p3', plugin_name: 'groovy-demo', binding_config: '', sort_order: undefined })
    vm.form.parent_route_id = 'r2'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    const body = mocks.updateRoute.mock.calls[0][1]
    expect(body.bindings[2]).toStrictEqual({ plugin_id: 'p3', binding_config: '{}', sort_order: 2 })
    expect(body.parent_route_id).toBe('r2')
  })

  it('DISPATCH 且 conditions 空 → 客户端预检 ref-save-error（dispatchNeedsConditions）+ 双 API 都不调', async () => {
    const { wrapper } = await factory('r1')
    const vm = vmOf(wrapper)
    vm.form.route_type = 'DISPATCH'
    vm.conditions = []
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-save-error', '保存错误位').text()).toContain(t('v2.edit.dispatchNeedsConditions'))
    expect(mocks.validateRoute).not.toHaveBeenCalled()
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('DISPATCH 且有 conditions → validateRoute({route_id, conditions}) 先于 updateRoute（服务端预检时序）', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.route_type = 'DISPATCH'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(mocks.validateRoute).toHaveBeenCalledTimes(1)
    expect(mocks.validateRoute.mock.calls[0][0]).toMatchObject({ route_id: 'r1' })
    expect(mocks.validateRoute.mock.calls[0][0].conditions[0].condition_key).toBe('X-Canary')
    expect(mocks.validateRoute.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateRoute.mock.invocationCallOrder[0])
  })

  it('validateRoute reject → ref-save-error（服务端预检文案）+ updateRoute 不调', async () => {
    mocks.validateRoute.mockRejectedValue(new Error('circular route'))
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.route_type = 'DISPATCH'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-save-error', '预检失败位').exists()).toBe(true)
    expect(mocks.updateRoute).not.toHaveBeenCalled()
  })

  it('保存成功：toast.success(saveSuccess) + dirty 清零 + emit saved + 自 load() 重拉（getRoute 第二次）', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.remark = '改一下'
    await flushPromises()
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.edit.saveSuccess'))
    expect(vmOf(wrapper).dirty).toBe(false)
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(mocks.getRoute).toHaveBeenCalledTimes(2)
  })

  it('10402 冲突：ref-conflict-bar（conflictModified）+ toast.warning + ref-save-error 不落 + 本地改值不被覆盖', async () => {
    mocks.updateRoute.mockRejectedValue(new BusinessError(10402, 'route modified elsewhere'))
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.route_name = 'LOCAL_EDIT'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-conflict-bar', '冲突条').text()).toContain(t('v2.edit.conflictModified'))
    expect(mocks.toast.warning).toHaveBeenCalled()
    expect(one(wrapper, 'ref-save-error').exists()).toBe(false)
    expect(inputVal(wrapper, 'ref-input-route_name')).toBe('LOCAL_EDIT')
  })

  it('ref-conflict-refresh 显式刷新：conflict 清 + getRoute 重拉 + 表单被服务端值覆盖', async () => {
    mocks.updateRoute.mockRejectedValue(new BusinessError(10402, 'route modified elsewhere'))
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.route_name = 'LOCAL_EDIT'
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    await need(wrapper, 'ref-conflict-refresh', '冲突刷新钮').trigger('click')
    await flushPromises()
    expect(mocks.getRoute).toHaveBeenCalledTimes(2)
    expect(one(wrapper, 'ref-conflict-bar').exists()).toBe(false)
    expect(inputVal(wrapper, 'ref-input-route_name')).toBe('r1_svc')
  })

  it('其他保存失败：mapFieldErrors → ref-field-error-route_name 注入后端原文 + ref-save-error 落 e.message', async () => {
    mocks.mapFieldErrors.mockReturnValue({ route_name: '名称已存在' })
    mocks.updateRoute.mockRejectedValue(new Error('boom'))
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-action-save').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'ref-field-error-route_name', '字段错通道').text()).toContain('名称已存在')
    expect(need(wrapper, 'ref-save-error', '保存错误位').text()).toContain('boom')
  })

  it('canEdit=false → ref-action-save 不渲染 + ref-readonly-hint（门禁，旧 canEdit gate）', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory('r1')
    expect(one(wrapper, 'ref-action-save').exists()).toBe(false)
    expect(need(wrapper, 'ref-readonly-hint', '只读提示').exists()).toBe(true)
  })

  it('saving 防重：updateRoute 挂起期再点保存不重发（双击只发一次）', async () => {
    let resolveSave!: (v: unknown) => void
    mocks.updateRoute.mockImplementation(() => new Promise((res) => { resolveSave = res }))
    const { wrapper } = await factory('r1')
    await need(wrapper, 'ref-action-save').trigger('click')
    await need(wrapper, 'ref-action-save').trigger('click')
    resolveSave(makeRoute('r1'))
    await flushPromises()
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
  })
})

// ── 脏态与离开（旧 Editor dirtyTracking + FcFormDraftBanner + onBeforeRouteLeave 语义）──

describe('脏离开 — dirty 暴露宿主 + 组件自带确认', () => {
  it('表单改动 → vm.dirty=true + ref-dirty-banner 渲染 + emit dirty-change(true)', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.remark = '脏了'
    await flushPromises()
    expect(vmOf(wrapper).dirty).toBe(true)
    expect(need(wrapper, 'ref-dirty-banner', '脏提示条').exists()).toBe(true)
    const evts = wrapper.emitted('dirty-change')
    expect(evts?.[evts.length - 1]?.[0]).toBe(true)
  })

  it('载入期改动不误报脏（dirtyTracking 载入完成后才开）：回显本身不触发 dirty-change', async () => {
    const { wrapper } = await factory('r1')
    expect(vmOf(wrapper).dirty).toBe(false)
    expect(wrapper.emitted('dirty-change')).toBeFalsy()
  })

  it('ref-dirty-banner discard → confirm(danger) → 重拉（getRoute 第二次）+ dirty 清零', async () => {
    const { wrapper } = await factory('r1')
    vmOf(wrapper).form.remark = '脏了'
    await flushPromises()
    wrapper.findComponent(FcFormDraftBanner).vm.$emit('discard')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    expect(mocks.getRoute).toHaveBeenCalledTimes(2)
    expect(vmOf(wrapper).dirty).toBe(false)
  })

  it('取消：dirty 时 confirm(danger) 通过才 emit close；confirm 拒绝不 emit；未脏直接 close（confirm 不弹）', async () => {
    const dirtyCase = await factory('r1')
    vmOf(dirtyCase.wrapper).form.remark = '脏了'
    await flushPromises()
    mocks.fcConfirm.mockResolvedValue(false)
    await need(dirtyCase.wrapper, 'ref-action-cancel').trigger('click')
    await flushPromises()
    expect(dirtyCase.wrapper.emitted('close')).toBeFalsy()

    mocks.fcConfirm.mockResolvedValue(true)
    await need(dirtyCase.wrapper, 'ref-action-cancel').trigger('click')
    await flushPromises()
    expect(dirtyCase.wrapper.emitted('close')).toBeTruthy()

    const cleanCase = await factory('r1')
    // C 步修正（可满足性，非契约变更）：同 it 块内 dirtyCase 已消耗 2 次 confirm，
    // `not.toHaveBeenCalled()` 在计数上不可满足；改为钉「clean 取消不新增 confirm」的
    // 原意 = 调用数维持 dirtyCase 的 2 次不变。
    const confirmCallsBeforeClean = mocks.fcConfirm.mock.calls.length
    await need(cleanCase.wrapper, 'ref-action-cancel').trigger('click')
    await flushPromises()
    expect(cleanCase.wrapper.emitted('close')).toBeTruthy()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(confirmCallsBeforeClean)
  })
})

// ── 源码契约（铁律 2 SDK-only / 旧树零引用 / 机制抽查）──────────────────────

describe('源码契约 — SDK-only 与机制抽查', () => {
  it('无 <el- 直用、无 element-plus runtime import（toast/消息一律走 SDK）', () => {
    const src = readSource()
    expect(src).not.toMatch(/<el-/)
    expect(src).not.toMatch(/from 'element-plus'/)
  })

  it('template 块无 CJK（文案一律 t()；中文注释仅允许出现在 script 块）', () => {
    const template = readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    expect(template).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it('禁旧树引用：无 @/views import（画布/旧编辑器零牵连，P4f 摘除不回改本组件）', () => {
    expect(readSource()).not.toMatch(/from '@\/views\//)
  })

  it('API import 白名单：@/api/routes 6 成员（createRoute 不在——组件仅编辑态自曝）+ @/api/plugins 仅 listBuiltinTypes + @/api/http 仅 mapFieldErrors/BusinessError', () => {
    const src = readSource()
    const routesMembers = (src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/api\/routes'/)?.[1] ?? '')
      .split(',').map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean)
    const ROUTES_ALLOWED = ['getRoute', 'listRoutes', 'updateRoute', 'validateRoute', 'listBindings', 'getPluginChain']
    for (const m of routesMembers) {
      expect(ROUTES_ALLOWED, `@/api/routes 白名单外的成员: ${m}`).toContain(m)
    }
    expect(routesMembers).not.toContain('createRoute')
    expect(src).toMatch(/import\s*\{\s*listBuiltinTypes\s*\}\s*from\s*'@\/api\/plugins'/)
    const httpMembers = (src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/api\/http'/)?.[1] ?? '')
      .split(',').map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean)
    for (const m of httpMembers) {
      expect(['BusinessError', 'mapFieldErrors'], `@/api/http 白名单外的成员: ${m}`).toContain(m)
    }
  })

  it('脏离开机制：onBeforeRouteLeave 从 vue-router 导入（非 vue）+ loadEpoch 竞态守卫 + dirtyTracking 载入后开', () => {
    const src = readSource()
    expect(src).toMatch(/import\s*\{[^}]*onBeforeRouteLeave[^}]*\}\s*from\s*'vue-router'/)
    expect(src).toMatch(/loadEpoch/)
    expect(src).toMatch(/dirtyTracking/)
  })

  it('testid 抽查：ref-form / ref-section-basic / ref-action-save / ref-conflict-bar / ref-dirty-banner / ref-chain 全在源码', () => {
    const src = readSource()
    for (const tid of ['ref-form', 'ref-section-basic', 'ref-action-save', 'ref-conflict-bar', 'ref-dirty-banner', 'ref-chain']) {
      expect(src).toContain(`data-testid="${tid}"`)
    }
  })

  it('bindings 无启停语义（旧页没有，禁臆造）：源码无 FcSwitch', () => {
    expect(readSource()).not.toMatch(/FcSwitch/)
  })
})
