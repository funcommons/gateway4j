/**
 * P4a-1-T：v2 插件编辑器页测试 —— 契约 docs/ui-v2/实施契约.md §4 P4 表 P4a 行（2026-11-07 侦察裁决）。
 * 先红是预期：页面由 P4a-1-C 实现（当前 src/views-v2/plugins/Editor.vue 不存在，
 * RED 形态 = Failed to resolve import，vitest 与 vue-tsc(TS2307) 同理，合规先红）。
 * 移植源头 = 旧 src/views/plugins/Editor.vue（407 行：四 tab 语义/手写字段校验/FormData
 * 保存/脏离开/loadEpoch 竞态/骨架与错误态全随迁）；校验走【手写 Wizard 模式】
 * （src/views-v2/routes/Wizard.vue validateStep 先例）不用 el-form，字段错误逐 prop 注入。
 *
 * ── 路由与模式裁决（P4a 行①）──────────────────────────────────────────────
 * ① 路由 = /v2/plugins/editor/:id?（name V2PluginEditor，LayoutV2 插件组第二叶子，
 *    permission plugin:edit，meta.title=v2.page.pluginEditor —— 见 v2.routing.test.ts 追加段）。
 * ② :id 缺省或 id==='new'（保留字）= create 模式（不发 getPlugin）；其余 id = edit 模式
 *    （getPlugin(id) 用【行主键】，不传 plugin_id）。
 * ③ query.type 预选：create 模式下 query.type ∈ {BUILTIN,JAR,GROOVY,GROUP} 时预选该类型
 *    （Chain 市场区深链 /v2/plugins/editor/new?type=JAR|GROOVY 依赖此语义）；非法/缺省 → GROOVY。
 * ④ 【编辑模式不回传禁改字段】（本步 T 裁决，相对旧 Editor.vue 的语义收紧）：name/id/type
 *    在 edit 模式 disabled（旧 UI 已如此），且 updatePlugin 的 payload —— JSON 与 FormData
 *    一并 —— 【不回传 plugin_name/plugin_id/plugin_type】（旧 JSON 曾回传 plugin_name、
 *    旧 FormData 曾回传 plugin_name：字段既已禁改，回传即说谎，v2 一律剔除）。
 *    scope 随 F 步修正加入 edit 禁改（V 轮实播实证：PATCH /v1/plugins/{id} 对 scope 变更
 *    静默忽略，可改 scope = 保存成功假象；payload 仍携 scope 现值，键集断言不变）。
 *    phase 实测可正常变更，保持可改不动。
 * ⑤ create 成功 = toast.success + router.push('/v2/plugins/chain')（v2 插件市场区所在页，
 *    是 P4a-1 时点唯一已注册的 v2 插件落点；/v2/plugins 列表页归 P4a-2，此处不指向未注册路由）；
 *    edit 成功 = toast.success + 停留本页 + getPlugin 重拉（旧语义随迁）+ dirty 清零。
 *
 * ── 手写校验裁决（不用 el-form，Wizard 模式）──────────────────────────────
 * save() 前置 validateAll()：任一字段不过 → 阻断 + 对应 ped-err-<prop> 错误条渲染；全过 → 清空。
 * - plugin_name：必填 + /^[a-zA-Z0-9_]{2,50}$/（2-50 位字母数字下划线，旧规则原样随迁）
 * - plugin_id：必填
 * - plugin_phase：必填（Segmented 缺省 PRE，理论上不可空 —— 规则保留兜底）
 * - config：非空时必须 JSON.parse 可过（空/空白合法，缺省 '{}'）
 * - sort_order：1-9999 之外报 sortOrderRange（夹取靠 FcInputNumber :min=1 :max=9999，源码断言钉死）
 * 后端字段错误注入：updatePlugin/createPlugin reject 的 BusinessError.errors 经
 * mapFieldErrors（@/api/http）→ 逐 prop 渲染到同一 ped-err-<prop> 位（后端原文，不走 i18n）。
 *
 * ── API mock 面（vi.mock('@/api/plugins') 导出全成员 = 页面允许的 import 面）──
 * getPlugin / createPlugin / updatePlugin / deletePlugin / validateConfig / validateGroovy /
 * getBuiltinSchema / listPlugins / listBuiltinTypes / listGlobalPlugins / enablePlugin /
 * disablePlugin / sortGlobalPlugins / getRuntimeStatus
 * （页面实际只用：getPlugin/createPlugin/updatePlugin/validateGroovy/listPlugins +
 *   '@/api/http' 的 mapFieldErrors/BusinessError【真实模块，不 mock】。）
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission（canEdit）、
 * '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，Wizard.test.ts 先例）。
 *
 * ── i18n key 全表（v2.plugins.* 新树，zh/en 同步加，铁律 6；43 个；不引用旧 plugin.* 树）──
 * tabBasic / tabGroovy / tabJar / tabGroup
 * fieldName / fieldId / fieldType / fieldPhase / fieldScope / fieldConfig / fieldSortOrder /
 *   fieldRemark / fieldScript / fieldJar / fieldGroupMembers
 * typeBuiltin / typeJar / typeGroovy / typeGroup / phasePre / phasePost / scopeRoute / scopeGlobal
 * nameRequired / namePattern / idRequired / phaseRequired / configJsonInvalid / sortOrderRange /
 *   jarRequired / jarSizeExceeded / scriptRequired / scriptSizeExceeded / validateFailed /
 *   groovyValid / groovyInvalid
 * createTitle / editTitle / loadFailed / saveFailed / saveSuccess / jarSelected / unsavedChanges
 *
 * ── DOM 契约（data-testid 前缀 ped-，全表）────────────────────────────────
 * ped-page（根，加载失败也在）
 * ped-skeleton（edit 拉取挂起期间的骨架；create 模式不渲染）
 * ped-load-error（加载失败错误态，文案含 loadFailed；此时 ped-tabs 不渲染）
 * ped-tabs（FcTabsPanel 根）
 *   tab 触发钮不设 testid：FcTabsPanel 由 tabs prop 渲染按钮，页面无法逐钮挂 testid ——
 *   测试按 .fc-tab 内文案定位（LayoutV2.test.ts findNavItem 先例）。tab 集 = basic 恒在 +
 *   groovy/jar/group 按 plugin_type 条件渲染（BASIC 恒为初始激活 tab）。
 * ped-f-name / ped-f-plugin-id（input 本体，attrs 透传）；edit 模式两者 disabled
 * ped-f-type / ped-f-phase / ped-f-scope（FcSegmented 根 role=radiogroup；disabled 时根含
 *   is-disabled 类且点击选项无效果。edit 模式：type/scope disabled（F 步修正），phase 可改）
 * ped-f-config（textarea 本体，maxlength=10000）
 * ped-f-sort-order（FcInputNumber 内 input；:min=1 :max=9999 夹取）
 * ped-f-remark（textarea 本体，maxlength=200）
 * ped-err-<prop>（字段错误条，prop ∈ plugin_name|plugin_id|plugin_phase|config|sort_order；
 *   无错不渲染；客户端文案走 v2.plugins.*，后端字段错误显示原文）
 * ped-f-script（Groovy textarea 本体，maxlength=65536）
 * ped-groovy-validate（校验钮）/ ped-groovy-result（结果条；无结果不渲染）
 * ped-jar-dropzone（FcDropZone 根）/ ped-jar-file（已选文件名提示；未选不渲染）
 * ped-f-group-members（GROUP 成员多选 FcSelect 容器）
 * ped-save / ped-cancel（footer：保存/取消；canEdit('plugin')=false → ped-save 不渲染）
 * ped-save-error（保存失败错误条：客户端拦截文案或后端 e.message；无错不渲染）
 *
 * ── fixtures ──────────────────────────────────────────────────────────────
 * makeRow(over) → PluginItem：id='7001'（行主键）≠ plugin_id='my-plugin'（业务标识），
 *   刻意错位防错参回归（S10b 90x/8x 先例）：getPlugin/updatePlugin 一旦收到 'my-plugin'
 *   而非 '7001' 立刻红。type/phase/scope/config/script_content 均可覆写。
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
  getPlugin: vi.fn(),
  createPlugin: vi.fn(),
  updatePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  validateConfig: vi.fn(),
  validateGroovy: vi.fn(),
  getBuiltinSchema: vi.fn(),
  listPlugins: vi.fn(),
  listBuiltinTypes: vi.fn(),
  listGlobalPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  getRuntimeStatus: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/plugins', () => ({
  getPlugin: mocks.getPlugin,
  createPlugin: mocks.createPlugin,
  updatePlugin: mocks.updatePlugin,
  deletePlugin: mocks.deletePlugin,
  validateConfig: mocks.validateConfig,
  validateGroovy: mocks.validateGroovy,
  getBuiltinSchema: mocks.getBuiltinSchema,
  listPlugins: mocks.listPlugins,
  listBuiltinTypes: mocks.listBuiltinTypes,
  listGlobalPlugins: mocks.listGlobalPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  getRuntimeStatus: mocks.getRuntimeStatus
}))
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
// 只替换 toast；Fc* 组件保留真实实现（Wizard.test.ts 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import Editor from '@/views-v2/plugins/Editor.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（Chain.test.ts 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Editor.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

type RowOver = {
  id?: string
  plugin_id?: string
  plugin_name?: string
  plugin_type?: 'BUILTIN' | 'JAR' | 'GROOVY' | 'GROUP'
  plugin_phase?: 'PRE' | 'POST'
  scope?: 'GLOBAL' | 'ROUTE'
  config?: string
  script_content?: string
  sort_order?: number
  remark?: string
  group_member_ids?: string[]
}

/** gw_plugin 行：行主键 7001 ≠ plugin_id 'my-plugin'（错位防错参，见头注 fixtures） */
function makeRow(over: RowOver = {}) {
  return {
    id: over.id ?? '7001',
    plugin_id: over.plugin_id ?? 'my-plugin',
    plugin_name: over.plugin_name ?? '我的插件',
    plugin_type: over.plugin_type ?? 'GROOVY',
    plugin_phase: over.plugin_phase ?? 'PRE',
    scope: over.scope ?? 'ROUTE',
    status: 'ENABLED',
    sort_order: over.sort_order ?? 3,
    config: over.config ?? '{"limit":10}',
    remark: over.remark ?? '备注甲',
    script_content: over.script_content ?? 'def x = 1; return true',
    group_member_ids: over.group_member_ids ?? []
  }
}

/** GROUP 成员候选（listPlugins({page:1,pageSize:200}) 返回） */
function memberRows() {
  return [
    makeRow({ id: '7002', plugin_id: 'mem-a', plugin_name: '成员甲' }),
    makeRow({ id: '7003', plugin_id: 'mem-b', plugin_name: '成员乙' })
  ]
}

async function factory(opts: { id?: string; type?: string } = {}): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/plugins/editor/:id?', name: 'V2PluginEditor', component: Editor as any },
      { path: '/v2/plugins/chain', component: stub },
      { path: '/v2/plugins', component: stub }
    ]
  })
  const query: Record<string, string> = {}
  if (opts.type) query.type = opts.type
  await router.push({ path: opts.id ? `/v2/plugins/editor/${opts.id}` : '/v2/plugins/editor/new', query })
  await router.isReady()
  const wrapper = mount(Editor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，避免 empty-wrapper trigger 噪音） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
const inputVal = (w: VueWrapper<any>, tid: string) => (w.find(`input[data-testid="${tid}"]`).element as HTMLInputElement).value
const areaVal = (w: VueWrapper<any>, tid: string) => (w.find(`textarea[data-testid="${tid}"]`).element as HTMLTextAreaElement).value
const areaOf = (w: VueWrapper<any>, tid: string) => w.find(`textarea[data-testid="${tid}"]`)
/** tab 触发钮：FcTabsPanel 由 props 渲染按钮，按文案定位（头注 DOM 契约） */
const findTab = (w: VueWrapper<any>, key: 'basic' | 'groovy' | 'jar' | 'group') =>
  w.findAll('.fc-tab').find((b) => b.text().includes(t(`v2.plugins.tab${key[0].toUpperCase()}${key.slice(1)}`)))
const needTab = (w: VueWrapper<any>, key: 'basic' | 'groovy' | 'jar' | 'group') => {
  const tab = findTab(w, key)
  expect(tab, `缺少「${t(`v2.plugins.tab${key[0].toUpperCase()}${key.slice(1)}`)}」tab 触发钮`).toBeDefined()
  return tab!
}
/** FcSegmented 选项：按 label 文案定位容器内 radio 按钮 */
const segOption = (w: VueWrapper<any>, tid: string, label: string) =>
  one(w, tid).findAll('button').find((b) => b.text().includes(label))
const needSeg = (w: VueWrapper<any>, tid: string, label: string) => {
  const opt = segOption(w, tid, label)
  expect(opt, `「${tid}」内缺少选项「${label}」`).toBeDefined()
  return opt!
}

const EDIT_ROW = makeRow()

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getPlugin.mockReset().mockImplementation(() => Promise.resolve({ ...EDIT_ROW }))
  mocks.createPlugin.mockReset().mockResolvedValue({})
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.deletePlugin.mockReset().mockResolvedValue({})
  mocks.validateConfig.mockReset().mockResolvedValue({ is_valid: true })
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getBuiltinSchema.mockReset().mockResolvedValue({})
  mocks.listPlugins.mockReset().mockImplementation(() => Promise.resolve({
    records: memberRows().map((r) => ({ ...r })), total: 2, size: 200, current: 1, pages: 1
  }))
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'tabBasic', 'tabGroovy', 'tabJar', 'tabGroup',
  'fieldName', 'fieldId', 'fieldType', 'fieldPhase', 'fieldScope', 'fieldConfig', 'fieldSortOrder',
  'fieldRemark', 'fieldScript', 'fieldJar', 'fieldGroupMembers',
  'typeBuiltin', 'typeJar', 'typeGroovy', 'typeGroup', 'phasePre', 'phasePost', 'scopeRoute', 'scopeGlobal',
  'nameRequired', 'namePattern', 'idRequired', 'phaseRequired', 'configJsonInvalid', 'sortOrderRange',
  'jarRequired', 'jarSizeExceeded', 'scriptRequired', 'scriptSizeExceeded', 'validateFailed',
  'groovyValid', 'groovyInvalid',
  'createTitle', 'editTitle', 'loadFailed', 'saveFailed', 'saveSuccess', 'jarSelected', 'unsavedChanges'
].map((k) => `v2.plugins.${k}`)

describe('P4a-1 — i18n key 全表双语存在（铁律 6，v2.plugins.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 模式判定与回填 ────────────────────────────────────────────────────────
describe('P4a-1 — 模式判定（new 保留字 / 行主键 edit）', () => {
  it('create 模式：ped-page 渲染、不发 getPlugin、默认值 GROOVY/PRE/ROUTE/{}/sort_order 输入框在', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'ped-page').exists()).toBe(true)
    expect(mocks.getPlugin).not.toHaveBeenCalled()
    expect(one(wrapper, 'ped-skeleton').exists()).toBe(false)
    expect(inputVal(wrapper, 'ped-f-name')).toBe('')
    expect(inputVal(wrapper, 'ped-f-plugin-id')).toBe('')
    expect(areaVal(wrapper, 'ped-f-config')).toBe('{}')
    expect(inputVal(wrapper, 'ped-f-sort-order')).toBe('1')
    expect(one(wrapper, 'ped-f-type').attributes('role')).toBe('radiogroup')
    // 缺省 GROOVY → Groovy tab 在、JAR/GROUP tab 不在
    expect(findTab(wrapper, 'groovy')).toBeDefined()
    expect(findTab(wrapper, 'jar')).toBeUndefined()
    expect(findTab(wrapper, 'group')).toBeUndefined()
    expect(segOption(wrapper, 'ped-f-type', t('v2.plugins.typeGroovy'))?.attributes('aria-checked')).toBe('true')
    expect(segOption(wrapper, 'ped-f-phase', t('v2.plugins.phasePre'))?.attributes('aria-checked')).toBe('true')
    expect(segOption(wrapper, 'ped-f-scope', t('v2.plugins.scopeRoute'))?.attributes('aria-checked')).toBe('true')
  })

  it("'/v2/plugins/editor/new'（保留字）等同 create：getPlugin 不调", async () => {
    const { wrapper } = await factory({ id: 'new' })
    expect(mocks.getPlugin).not.toHaveBeenCalled()
    expect(one(wrapper, 'ped-load-error').exists()).toBe(false)
    expect(inputVal(wrapper, 'ped-f-name')).toBe('')
  })

  it('edit 模式：getPlugin(行主键 7001) 回填 name/id/type/phase/scope/config/sort_order/remark/script_content', async () => {
    const { wrapper } = await factory({ id: '7001' })
    expect(mocks.getPlugin).toHaveBeenCalledTimes(1)
    expect(mocks.getPlugin).toHaveBeenCalledWith('7001')
    expect(inputVal(wrapper, 'ped-f-name')).toBe('我的插件')
    expect(inputVal(wrapper, 'ped-f-plugin-id')).toBe('my-plugin')
    expect(areaVal(wrapper, 'ped-f-config')).toBe('{"limit":10}')
    expect(inputVal(wrapper, 'ped-f-sort-order')).toBe('3')
    expect(areaVal(wrapper, 'ped-f-remark')).toBe('备注甲')
    expect(segOption(wrapper, 'ped-f-type', t('v2.plugins.typeGroovy'))?.attributes('aria-checked')).toBe('true')
    // 非 GROOVY 行 → Groovy tab 退场（回填驱动条件渲染）
    const jarRow = makeRow({ plugin_type: 'JAR', script_content: '' })
    mocks.getPlugin.mockImplementation(() => Promise.resolve(jarRow))
    const { wrapper: w2 } = await factory({ id: '7001' })
    expect(findTab(w2, 'jar')).toBeDefined()
    expect(findTab(w2, 'groovy')).toBeUndefined()
  })

  it('query.type 预选：?type=JAR → JAR（tab-jar 渲染）；?type=GROOVY → GROOVY（tab-groovy 渲染）', async () => {
    const jar = await factory({ type: 'JAR' })
    expect(segOption(jar.wrapper, 'ped-f-type', t('v2.plugins.typeJar'))?.attributes('aria-checked')).toBe('true')
    expect(findTab(jar.wrapper, 'jar')).toBeDefined()
    const groovy = await factory({ type: 'GROOVY' })
    expect(segOption(groovy.wrapper, 'ped-f-type', t('v2.plugins.typeGroovy'))?.attributes('aria-checked')).toBe('true')
  })
})

// ── edit 禁改 ─────────────────────────────────────────────────────────────
describe('P4a-1 — edit 模式 name/id/type 禁改（disabled）', () => {
  it('name/plugin_id input disabled；type Segmented 根 is-disabled 且点击选项无效', async () => {
    const { wrapper } = await factory({ id: '7001' })
    expect(inputOf(wrapper, 'ped-f-name').attributes('disabled')).toBeDefined()
    expect(inputOf(wrapper, 'ped-f-plugin-id').attributes('disabled')).toBeDefined()
    const typeSeg = one(wrapper, 'ped-f-type')
    expect(typeSeg.classes().some((c) => c.includes('is-disabled')), 'type Segmented 需带 is-disabled').toBe(true)
    await needSeg(wrapper, 'ped-f-type', t('v2.plugins.typeJar')).trigger('click')
    expect(segOption(wrapper, 'ped-f-type', t('v2.plugins.typeGroovy'))?.attributes('aria-checked')).toBe('true')
    // phase 仍可改；scope 随 F 步修正加入禁改（PATCH 对 scope 变更静默忽略，可改即欺骗）
    expect(one(wrapper, 'ped-f-phase').classes().some((c) => c.includes('is-disabled'))).toBe(false)
    expect(one(wrapper, 'ped-f-scope').classes().some((c) => c.includes('is-disabled'))).toBe(true)
  })
})

// ── F 步修正：scope 编辑语义（edit 禁改 / create 可选）────────────────────
// V 轮实播实证：PATCH /v1/plugins/{id} 对 scope 变更静默忽略（返回 200 但记录仍原值）——
// edit 模式可改 scope = 保存成功假象（UX 欺骗），故禁改；create 模式仍可选。
describe('F 步 — scope 编辑语义（edit 禁改 / create 可选）', () => {
  it('edit 模式：ped-f-scope 根 is-disabled + 选项钮原生 disabled + 点击 GLOBAL 无效果（仍 ROUTE）', async () => {
    const { wrapper } = await factory({ id: '7001' })
    const seg = one(wrapper, 'ped-f-scope')
    expect(seg.classes().some((c) => c.includes('is-disabled')), 'scope Segmented 需带 is-disabled').toBe(true)
    const globalBtn = needSeg(wrapper, 'ped-f-scope', t('v2.plugins.scopeGlobal'))
    expect(globalBtn.attributes('disabled')).toBeDefined()
    await globalBtn.trigger('click')
    expect(segOption(wrapper, 'ped-f-scope', t('v2.plugins.scopeRoute'))?.attributes('aria-checked')).toBe('true')
    expect(segOption(wrapper, 'ped-f-scope', t('v2.plugins.scopeGlobal'))?.attributes('aria-checked')).toBe('false')
  })

  it('create 模式：ped-f-scope 不禁改（根无 is-disabled、钮无原生 disabled、点击可切 GLOBAL）', async () => {
    const { wrapper } = await factory()
    const seg = one(wrapper, 'ped-f-scope')
    expect(seg.classes().some((c) => c.includes('is-disabled'))).toBe(false)
    const globalBtn = needSeg(wrapper, 'ped-f-scope', t('v2.plugins.scopeGlobal'))
    expect(globalBtn.attributes('disabled')).toBeUndefined()
    await globalBtn.trigger('click')
    expect(segOption(wrapper, 'ped-f-scope', t('v2.plugins.scopeGlobal'))?.attributes('aria-checked')).toBe('true')
  })
})

// ── BASIC 手写校验 ────────────────────────────────────────────────────────
describe('P4a-1 — BASIC 手写校验（Wizard 模式，字段错误逐 prop 注入）', () => {
  const fillValid = async (w: VueWrapper<any>) => {
    await inputOf(w, 'ped-f-name').setValue('my_plugin')
    await inputOf(w, 'ped-f-plugin-id').setValue('my-plugin')
  }

  it('name 空 → ped-err-plugin_name=nameRequired、阻断不发 createPlugin', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-plugin_name').text()).toContain(t('v2.plugins.nameRequired'))
    expect(one(wrapper, 'ped-save-error').exists()).toBe(false)
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('name 1 位（下界外）→ namePattern；51 位（上界外）→ namePattern；2 位合法无错', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    await inputOf(wrapper, 'ped-f-name').setValue('a')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-plugin_name').text()).toContain(t('v2.plugins.namePattern'))
    await inputOf(wrapper, 'ped-f-name').setValue('a'.repeat(51))
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-plugin_name').text()).toContain(t('v2.plugins.namePattern'))
    await inputOf(wrapper, 'ped-f-name').setValue('ab')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-plugin_name').exists()).toBe(false)
  })

  it('plugin_id 空 → ped-err-plugin_id=idRequired、阻断', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-plugin_id').text()).toContain(t('v2.plugins.idRequired'))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('config 非 JSON → ped-err-config=configJsonInvalid；合法 JSON / 空串放行', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await areaOf(wrapper, 'ped-f-config').setValue('not-json')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-config').text()).toContain(t('v2.plugins.configJsonInvalid'))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
    await areaOf(wrapper, 'ped-f-config').setValue('{"ok":1}')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-config').exists()).toBe(false)
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
  })

  it('sort_order 越界（0 / 10000）→ ped-err-sort_order=sortOrderRange、阻断（校验层面；夹取归 :min/:max 源码断言）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    const vm = wrapper.vm as any
    vm.form.sort_order = 0
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-sort_order').text()).toContain(t('v2.plugins.sortOrderRange'))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
    vm.form.sort_order = 10000
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-sort_order').text()).toContain(t('v2.plugins.sortOrderRange'))
    vm.form.sort_order = 9999
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-sort_order').exists()).toBe(false)
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
  })
})

// ── GROOVY tab ────────────────────────────────────────────────────────────
describe('P4a-1 — GROOVY tab（validateGroovy 校验 + 64KB Blob 上限）', () => {
  it('校验钮：script 空 → ped-groovy-result=scriptRequired 且不发 validateGroovy；有脚本走 validateGroovy，is_valid=false → groovyInvalid + error_message', async () => {
    const { wrapper } = await factory()
    await needTab(wrapper, 'groovy').trigger('click')
    await flushPromises()
    await need(wrapper, 'ped-groovy-validate', 'Groovy 校验钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-groovy-result').text()).toContain(t('v2.plugins.scriptRequired'))
    expect(mocks.validateGroovy).not.toHaveBeenCalled()
    await areaOf(wrapper, 'ped-f-script').setValue('def x =')
    await need(wrapper, 'ped-groovy-validate', 'Groovy 校验钮').trigger('click')
    await flushPromises()
    expect(mocks.validateGroovy).toHaveBeenCalledWith('def x =')
    mocks.validateGroovy.mockResolvedValue({ is_valid: false, error_message: 'unexpected token' })
    await need(wrapper, 'ped-groovy-validate', 'Groovy 校验钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-groovy-result').text()).toContain(t('v2.plugins.groovyInvalid'))
    expect(one(wrapper, 'ped-groovy-result').text()).toContain('unexpected token')
  })

  it('validateGroovy reject → ped-groovy-result=validateFailed（不崩）', async () => {
    mocks.validateGroovy.mockRejectedValue(new Error('compiler down'))
    const { wrapper } = await factory()
    await needTab(wrapper, 'groovy').trigger('click')
    await areaOf(wrapper, 'ped-f-script').setValue('def x = 1')
    await need(wrapper, 'ped-groovy-validate', 'Groovy 校验钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-groovy-result').text()).toContain(t('v2.plugins.validateFailed'))
  })

  it('create GROOVY 脚本超 64KB（Blob 字节数）→ ped-save-error=scriptSizeExceeded、不发 createPlugin', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    const vm = wrapper.vm as any
    vm.form.script_content = 'a'.repeat(64 * 1024 + 1)
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-save-error').text()).toContain(t('v2.plugins.scriptSizeExceeded'))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('edit GROOVY 脚本超 64KB → 同样拦截、不发 updatePlugin', async () => {
    const { wrapper } = await factory({ id: '7001' })
    const vm = wrapper.vm as any
    vm.form.script_content = 'a'.repeat(64 * 1024 + 1)
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-save-error').text()).toContain(t('v2.plugins.scriptSizeExceeded'))
    expect(mocks.updatePlugin).not.toHaveBeenCalled()
  })
})

// ── JAR tab ───────────────────────────────────────────────────────────────
describe('P4a-1 — JAR tab（FcDropZone .jar 50MB / FormData 保存）', () => {
  it('源码契约：FcDropZone accept=".jar" :max-size=50MB :multiple="false"（旧 Editor 语义随迁）', () => {
    const source = readSource()
    const tag = source.match(/<FcDropZone[^>]*>/)?.[0]
    expect(tag, 'JAR tab 需用 FcDropZone').toBeTruthy()
    expect(tag).toMatch(/accept="\.jar"/)
    expect(tag).toMatch(/:multiple="false"/)
    expect(tag).toMatch(/:max-size="/)
    expect(tag).toMatch(/MAX_JAR_SIZE|50\s*\*\s*1024\s*\*\s*1024|52428800/)
  })

  it('drop 合法 .jar → ped-jar-file 显示文件名', async () => {
    const { wrapper } = await factory({ type: 'JAR' })
    const file = new File([new Uint8Array(1024)], 'upstream-retry.jar')
    await need(wrapper, 'ped-jar-dropzone', 'JAR 拖放区').trigger('drop', { dataTransfer: { files: [file] } })
    await flushPromises()
    expect(one(wrapper, 'ped-jar-file').text()).toContain('upstream-retry.jar')
    expect(one(wrapper, 'ped-jar-file').text()).toContain(t('v2.plugins.jarSelected'))
  })

  it('create JAR 未选文件保存 → ped-save-error=jarRequired、不发 createPlugin', async () => {
    const { wrapper } = await factory({ type: 'JAR' })
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-save-error').text()).toContain(t('v2.plugins.jarRequired'))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('create JAR 已选文件 → createPlugin(FormData)：含 plugin_name/plugin_id/plugin_type/plugin_phase/scope/config/sort_order/jar_file', async () => {
    const { wrapper } = await factory({ type: 'JAR' })
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    const file = new File([new Uint8Array(10)], 'upstream-retry.jar')
    await need(wrapper, 'ped-jar-dropzone', 'JAR 拖放区').trigger('drop', { dataTransfer: { files: [file] } })
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    const fd = mocks.createPlugin.mock.calls[0][0] as FormData
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get('plugin_name')).toBe('my_plugin')
    expect(fd.get('plugin_id')).toBe('my-plugin')
    expect(fd.get('plugin_type')).toBe('JAR')
    expect(fd.get('plugin_phase')).toBe('PRE')
    expect(fd.get('scope')).toBe('ROUTE')
    expect(fd.get('config')).toBe('{}')
    expect(fd.get('sort_order')).toBe('1')
    expect(fd.get('jar_file')).toBe(file)
  })

  it('edit JAR 换新文件 → updatePlugin(行主键, FormData)：jar_file 在；禁改字段不回传（plugin_name/plugin_id/plugin_type 缺席）', async () => {
    const { wrapper } = await factory({ id: '7001' })
    mocks.getPlugin.mockImplementation(() => Promise.resolve(makeRow({ plugin_type: 'JAR', script_content: '' })))
    const { wrapper: w2 } = await factory({ id: '7001' })
    expect(findTab(w2, 'jar')).toBeDefined()
    const file = new File([new Uint8Array(10)], 'replaced.jar')
    await need(w2, 'ped-jar-dropzone', 'JAR 拖放区').trigger('drop', { dataTransfer: { files: [file] } })
    await need(w2, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.updatePlugin.mock.calls[0][0]).toBe('7001')
    const fd = mocks.updatePlugin.mock.calls[0][1] as FormData
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get('jar_file')).toBe(file)
    expect(fd.get('plugin_id')).toBeNull()
    expect(fd.get('plugin_name')).toBeNull()
    expect(fd.get('plugin_type')).toBeNull()
    expect(fd.get('plugin_phase')).toBe('PRE')
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('edit JAR 不换文件 → JSON PATCH：keys 恰为可变集（无 name/id/type/jar_file/script_content）', async () => {
    const { wrapper } = await factory({ id: '7001' })
    mocks.getPlugin.mockImplementation(() => Promise.resolve(makeRow({ plugin_type: 'JAR', script_content: '' })))
    const { wrapper: w2 } = await factory({ id: '7001' })
    await need(w2, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.updatePlugin.mock.calls[0][0]).toBe('7001')
    const payload = mocks.updatePlugin.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toBeInstanceOf(FormData)
    expect(Object.keys(payload).sort()).toEqual(['config', 'plugin_phase', 'remark', 'scope', 'sort_order'])
  })
})

// ── GROUP tab ─────────────────────────────────────────────────────────────
describe('P4a-1 — GROUP tab（成员多选 → group_member_ids）', () => {
  it('type=GROUP → tab-group 渲染；成员候选 = listPlugins({ page:1, pageSize:200 })', async () => {
    const { wrapper } = await factory({ type: 'GROUP' })
    expect(findTab(wrapper, 'group')).toBeDefined()
    expect(one(wrapper, 'ped-f-group-members').exists()).toBe(true)
    expect(mocks.listPlugins).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 200 }))
  })

  it('create GROUP payload 含 group_member_ids（选中成员行主键）；非 GROUP 类型不携带', async () => {
    const { wrapper } = await factory({ type: 'GROUP' })
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    const vm = wrapper.vm as any
    vm.form.group_member_ids = ['7002', '7003']
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    expect(mocks.createPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({
      plugin_type: 'GROUP',
      group_member_ids: ['7002', '7003']
    }))
    const { wrapper: w2 } = await factory({ type: 'GROOVY' })
    await inputOf(w2, 'ped-f-name').setValue('my_plugin')
    await inputOf(w2, 'ped-f-plugin-id').setValue('my-plugin')
    await need(w2, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    const payload = mocks.createPlugin.mock.calls[1][0] as Record<string, unknown>
    expect(payload.group_member_ids).toBeUndefined()
  })
})

// ── 保存 create / edit ────────────────────────────────────────────────────
describe('P4a-1 — 保存：create → createPlugin + 跳转；edit → updatePlugin（不回传禁改字段）+ 重拉', () => {
  it('create GROOVY JSON 全字段 payload + toast.success + 跳 /v2/plugins/chain', async () => {
    const { wrapper, router } = await factory()
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    await areaOf(wrapper, 'ped-f-config').setValue('{"a":1}')
    await areaOf(wrapper, 'ped-f-remark').setValue('备注')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    expect(mocks.createPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({
      plugin_name: 'my_plugin',
      plugin_id: 'my-plugin',
      plugin_type: 'GROOVY',
      plugin_phase: 'PRE',
      scope: 'ROUTE',
      config: '{"a":1}',
      sort_order: 1,
      remark: '备注',
      script_content: ''
    }))
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.saveSuccess'))
    expect(router.currentRoute.value.path).toBe('/v2/plugins/chain')
  })

  it('edit GROOVY JSON PATCH：keys 恰为可变集（无 plugin_name/plugin_id/plugin_type）+ 成功后 getPlugin 重拉 + toast', async () => {
    const { wrapper } = await factory({ id: '7001' })
    await areaOf(wrapper, 'ped-f-remark').setValue('改过的备注')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.updatePlugin.mock.calls[0][0]).toBe('7001')
    const payload = mocks.updatePlugin.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['config', 'plugin_phase', 'remark', 'scope', 'script_content', 'sort_order'])
    expect(payload.remark).toBe('改过的备注')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.saveSuccess'))
    // 停留本页 + 重拉（旧语义随迁）
    expect(mocks.getPlugin).toHaveBeenCalledTimes(2)
    expect(mocks.getPlugin).toHaveBeenLastCalledWith('7001')
  })

  it('edit GROUP → payload 含 group_member_ids', async () => {
    const { wrapper } = await factory({ id: '7001' })
    mocks.getPlugin.mockImplementation(() => Promise.resolve(makeRow({ plugin_type: 'GROUP', script_content: '', group_member_ids: ['7002'] })))
    const { wrapper: w2 } = await factory({ id: '7001' })
    const vm = w2.vm as any
    vm.form.group_member_ids = ['7002', '7003']
    await need(w2, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    const payload = mocks.updatePlugin.mock.calls[0][1] as Record<string, unknown>
    expect(payload.group_member_ids).toEqual(['7002', '7003'])
  })

  it('后端字段错误注入：BusinessError.errors → 逐 prop 渲染原文到 ped-err-<prop> + ped-save-error', async () => {
    const { wrapper } = await factory({ id: '7001' })
    mocks.updatePlugin.mockRejectedValueOnce(new BusinessError(10100, '参数有误', undefined, [
      { field: 'config', code: 'FORMAT', message: 'limit 必须 > 0', value: 'not-json' },
      { field: 'remark', code: 'TOO_LONG', message: '备注过长', value: 'x' }
    ]))
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-err-config').text()).toContain('limit 必须 > 0')
    expect(one(wrapper, 'ped-err-remark').text()).toContain('备注过长')
    expect(one(wrapper, 'ped-save-error').text()).toContain('参数有误')
  })

  it('后端无字段错误（普通 Error）→ 仅 ped-save-error=e.message，字段错误条不渲染', async () => {
    const { wrapper } = await factory({ id: '7001' })
    mocks.updatePlugin.mockRejectedValueOnce(new Error('row locked'))
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'ped-save-error').text()).toContain('row locked')
    expect(one(wrapper, 'ped-err-config').exists()).toBe(false)
  })
})

// ── edit 拉取横切（骨架/错误态/竞态）──────────────────────────────────────
describe('P4a-1 — edit 加载横切（骨架 / 错误态 / loadEpoch 竞态）', () => {
  it('getPlugin 挂起 → ped-skeleton 渲染且 ped-tabs 不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.getPlugin.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/v2/plugins/editor/:id?', name: 'V2PluginEditor', component: Editor as any },
        { path: '/v2/plugins/chain', component: stub }
      ]
    })
    await router.push('/v2/plugins/editor/7001')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
    await flushPromises()
    expect(one(wrapper, 'ped-skeleton').exists()).toBe(true)
    expect(one(wrapper, 'ped-tabs').exists()).toBe(false)
    resolveLoad({ ...EDIT_ROW })
    await flushPromises()
    expect(one(wrapper, 'ped-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'ped-tabs').exists()).toBe(true)
  })

  it('getPlugin reject → ped-load-error（loadFailed）+ ped-tabs 不渲染', async () => {
    mocks.getPlugin.mockRejectedValue(new Error('plugin gone'))
    const { wrapper } = await factory({ id: '7001' })
    expect(one(wrapper, 'ped-load-error').exists()).toBe(true)
    expect(one(wrapper, 'ped-load-error').text()).toContain(t('v2.plugins.loadFailed'))
    expect(one(wrapper, 'ped-load-error').text()).toContain('plugin gone')
    expect(one(wrapper, 'ped-tabs').exists()).toBe(false)
  })

  it('loadEpoch 竞态：慢 7001 挂起期间切 7002（快）→ 7002 生效；慢响应后到不覆盖', async () => {
    let resolveP1!: (v: unknown) => void
    mocks.getPlugin.mockImplementation((id: string) => {
      if (id === '7001') return new Promise((r) => { resolveP1 = r })
      return Promise.resolve(makeRow({ id: '7002', plugin_id: 'other', plugin_name: '插件乙' }))
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/v2/plugins/editor/:id?', name: 'V2PluginEditor', component: Editor as any },
        { path: '/v2/plugins/chain', component: stub }
      ]
    })
    await router.push('/v2/plugins/editor/7001')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
    await flushPromises()
    await router.push('/v2/plugins/editor/7002')
    await flushPromises()
    expect(inputVal(wrapper, 'ped-f-name')).toBe('插件乙')
    resolveP1({ ...makeRow({ plugin_name: '陈旧插件甲' }) })
    await flushPromises()
    // 陈旧响应后到，不得覆盖最新数据
    expect(inputVal(wrapper, 'ped-f-name')).toBe('插件乙')
  })
})

// ── 脏离开 ────────────────────────────────────────────────────────────────
describe('P4a-1 — 脏离开确认（onBeforeRouteLeave）', () => {
  const dirtyAndPush = async (confirmResult: boolean) => {
    mocks.fcConfirm.mockResolvedValue(confirmResult)
    const { wrapper, router } = await factory({ id: '7001' })
    // name 输入触发 dirty（basic tab 恒在；load 完成后 dirtyTracking 才开启）
    await inputOf(wrapper, 'ped-f-name').setValue('x')
    await router.push('/v2/plugins/chain')
    await flushPromises()
    return { wrapper, router }
  }

  it('表单已改 → confirm({ variant:danger, title:unsavedChanges })；confirm=true → 放行离开', async () => {
    const { router } = await dirtyAndPush(true)
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.plugins.unsavedChanges'))
    }))
    expect(router.currentRoute.value.path).toBe('/v2/plugins/chain')
  })

  it('confirm=false → 留在编辑页（导航被守卫拦下）', async () => {
    const { router } = await dirtyAndPush(false)
    expect(router.currentRoute.value.path).toBe('/v2/plugins/editor/7001')
  })

  it('表单未改 → 不弹确认直接离开', async () => {
    const { router } = await factory({ id: '7001' })
    await router.push('/v2/plugins/chain')
    await flushPromises()
    expect(mocks.fcConfirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/plugins/chain')
  })
})

// ── 权限与源码横切 ────────────────────────────────────────────────────────
describe('P4a-1 — 权限与源码横切', () => {
  it("canEdit('plugin')=false → ped-save 不渲染（只读可看）", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(one(wrapper, 'ped-save').exists()).toBe(false)
    expect(one(wrapper, 'ped-cancel').exists()).toBe(true)
  })

  it('SDK-only：源码无 <el- 直用（铁律 2）；template 块无 CJK（文案一律 t()）', () => {
    expect(readSource()).not.toMatch(/<el-/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it('长度上限源码契约：config 10000 / remark 200 / script 65536 / name maxlength=50；sort_order :min=1 :max=9999', () => {
    const source = readSource()
    expect(source).toMatch(/10000/)
    expect(source).toMatch(/200/)
    expect(source).toMatch(/65536/)
    expect(source).toMatch(/maxlength="50"/)
    expect(source).toMatch(/:min="1"/)
    expect(source).toMatch(/:max="9999"/)
  })
})
