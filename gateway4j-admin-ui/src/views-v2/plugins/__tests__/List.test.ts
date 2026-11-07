/**
 * P4a-2-T：v2 插件管理列表页测试 —— 契约 docs/ui-v2/实施契约.md §4 P4 表 P4a-2 行
 * （独立管理列表页 /v2/plugins，plugin:read，旧 List.vue 等价；2026-11-07）。
 * 先红是预期：页面由 P4a-2-C 实现（当前 src/views-v2/plugins/List.vue 不存在，
 * RED 形态 = Failed to resolve import，vitest 与 vue-tsc(TS2307) 同理，合规先红）。
 *
 * ── 移植源头与覆盖点继承（旧 src/views/plugins/List.vue，366 行 + 13 个旧测试文件）──
 * List.test.ts（默认参数/选项集/透传/动作/分页/loading）→ 初始加载/筛选/行动作/分页/骨架段
 * List.keyword-debounce + List.search → keyword 300ms 防抖（fake timers 行为化）+ 筛选重置页码
 * List.load-epoch → loadEpoch 竞态（陈旧响应不覆盖、陈旧 reject 不污染）
 * List.reload-error → plg-load-error（文案 + 清陈旧行 + 成功清错）
 * List.actions-error + List.action-feedback → plg-action-error + toast.success 三连
 * List.id-fallback → enable/disable/delete = instance_id || id（逐字随迁）
 * List.uninstalled → UNINSTALLED = pending 徽标 + 无启用钮 + status 筛选含 UNINSTALLED
 * List.grouped → 双视图切换 + 按 plugin_type 聚类 + 计数
 * List.navigation-await → 编辑跳转 await router.push（行为化断言收编）
 * List.enum-i18n → 类型/阶段/作用域一律 i18n 文案，不渲染原文枚举
 *
 * ── v2 语义差异裁决（相对旧页六处，C 按此实现）────────────────────────────────
 * ① 编辑跳 v2 编辑器：/v2/plugins/editor/{行主键}（旧为 /plugins/{id}/edit 旧页）；
 *    编辑【直取 row.id，不走 instance_id 回退】（旧 onEdit 同款 —— 编辑器 getPlugin 吃行主键）；
 *    enable/disable/delete 保留 instance_id || id 回退（fixture 刻意错位 id=7002 /
 *    instance_id='inst-9x'，传错即红）。
 * ② 新增 scope 筛选（旧页只有 keyword/type/status；契约 P4a-2 行明写 scope；
 *    listPlugins 已支持 scope 透传 —— v2 增量能力）。
 * ③ 筛选控件 = FcSegmented（routes/List.vue S9a 先例 + Editor.vue 先例），首项
 *    「全部」(filterAll) = 'ALL' 哨兵 → 对应参数 undefined 不透传；不再用 el-select 系。
 * ④ 表格 = 语义化 <table> + Fc 原子（S9a 先例；禁 FcTable/el-table —— 行级 testid 需挂载点）；
 *    行动作 = 行内平铺 FcButton（旧为 FcDropdown 下拉：语义化表格无挂载点 + 可测性裁决），
 *    可见性口径逐字继承：edit 恒在 / enable 仅 DISABLED / disable 仅 ENABLED + confirm(danger) /
 *    delete 仅非 ENABLED + confirm(danger)（删除确认由旧 default 升级 danger，本步 T 裁决）。
 *    分组卡动作保持旧口径：edit/enable/disable，无 delete。
 * ⑤ 错误态 = 整体替换表区（Editor.vue ped-load-error 先例）：loadError 时表区与 plg-empty
 *    都不渲染（错误态不是空态）；动作错误条独立共存（plg-action-error），动作失败不清列表。
 * ⑥ i18n 全部进 v2.plugins.* 新树（不引用 plugin.* / common.* 旧树）。
 *
 * ── API mock 面（vi.mock('@/api/plugins') 导出全成员；页面允许的 import 面 = 4 成员）──
 * 允许：listPlugins / enablePlugin / disablePlugin / deletePlugin（源码断言钉死 import 块）。
 * 禁用名单（import 即契约违规，源码断言拦截）：listGlobalPlugins（P4a 裁决随拆旧废弃）/
 *   sortGlobalPlugins（Chain 页职责）/ getPlugin / updatePlugin / createPlugin /
 *   validateConfig / validateGroovy / getBuiltinSchema / listBuiltinTypes / getRuntimeStatus
 *   （编辑器与 Chain 页职责）。
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission（canEdit）、
 *   '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，Editor.test.ts 先例）。
 *   useDebounce 走真实实现（@/composables），防抖由 fake timers 行为化验证，不 mock。
 *
 * ── i18n key 全表（v2.plugins.* 树延续，zh/en 同步加，铁律 6；28 个新 key）────────
 * searchPlaceholder / filterAll / tableView / groupedView /
 * colName / colId / colType / colPhase / colScope / colStatus / colActions /
 * statusEnabled / statusDisabled / statusUninstalled /
 * create / edit / enable / disable / delete /
 * enableSuccess / disableSuccess / deleteSuccess /
 * confirmDisable / confirmDeleteTitle / confirmDelete /
 * actionFailed / empty / readonlyHint
 * 复用既有 v2.plugins.loadFailed（P4a-1）；另有 v2.page.pluginList 与 v2.nav.pluginList
 * 两个非 plugins 树 key，在 src/router/v2.routing.test.ts P4a-2 追加段断言。
 *
 * ── DOM 契约（data-testid 前缀 plg-，全表）──────────────────────────────────
 * plg-page（根，加载失败也在）
 * plg-skeleton（加载挂起期间；此时表区/空态/错误条都不渲染）
 * plg-load-error（列表加载失败错误条 role=alert：loadFailed 文案 + e.message；
 *   此时表区与 plg-empty 都不渲染 —— 裁决⑤）
 * plg-action-error（动作失败错误条 role=alert：e.message 兜底 actionFailed；无错不渲染；
 *   与列表并存，动作失败不清列表）
 * plg-readonly-hint（canEdit('plugin')=false 只读提示条 = readonlyHint；true 不渲染）
 * plg-f-keyword（搜索 input，FcInput attrs 透传；300ms 防抖）
 * plg-f-type / plg-f-status / plg-f-scope（FcSegmented 根 role=radiogroup；
 *   选项 = 全部 + 枚举；点击选项 → v-model → 筛选生效 + 页码重置 1）
 * plg-create（新建钮 → /v2/plugins/editor/new；canEdit=false 不渲染）
 * plg-view-toggle（视图切换钮；表格态文案 = groupedView，分组态 = tableView —— 旧语义随迁）
 * plg-table-view（表视图容器：语义化 <table> 七列 + plg-pagination）
 * plg-grouped-view（分组视图容器）
 * plg-row-<id>（表格行 <tr>，key = 行主键）
 * plg-name-<id> / plg-pid-<id>（名称 / 业务标识单元格）
 * plg-type-<id>（FcTag：BUILTIN=primary / JAR=warning / GROOVY=success / GROUP=brand
 *   —— 旧 'info' 不在 FcTag 色板内，取 brand 为最近档，T 裁决；未知类型 = gray）
 * plg-phase-<id> / plg-scope-<id>（i18n 文案单元格）
 * plg-status-<id>（FcStatusBadge 根：ENABLED=tone-success+dot / DISABLED=tone-neutral 无 dot /
 *   UNINSTALLED=tone-pending 无 dot）
 * plg-act-edit-<id> / plg-act-enable-<id> / plg-act-disable-<id> / plg-act-delete-<id>
 *   （行内动作钮；canEdit=false 全体退场；分组卡复用同名 testid —— 两视图互斥渲染）
 * plg-pagination（FcPagination：v-model:current-page / v-model:page-size / :total 透传）
 * plg-group-<plugin_type>（分组容器，头含类型 tag）+ plg-group-count-<plugin_type>（计数）
 * plg-card-<id>（分组卡：name + pid + 状态徽标 + 动作钮）
 * plg-empty（空态 = FcEmpty：rows 空且无错误时渲染，两视图共用）
 *
 * ── fixtures ──────────────────────────────────────────────────────────────
 * makeRow(over) → listPlugins 行：id='7001'（行主键）≠ plugin_id='my-plugin'（业务标识），
 *   刻意错位防错参回归（Editor.test.ts 同款）；7002 行带 instance_id='inst-9x' 锁回退优先级。
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

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  getPlugin: vi.fn(),
  createPlugin: vi.fn(),
  updatePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  validateConfig: vi.fn(),
  validateGroovy: vi.fn(),
  getBuiltinSchema: vi.fn(),
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
  listPlugins: mocks.listPlugins,
  getPlugin: mocks.getPlugin,
  createPlugin: mocks.createPlugin,
  updatePlugin: mocks.updatePlugin,
  deletePlugin: mocks.deletePlugin,
  validateConfig: mocks.validateConfig,
  validateGroovy: mocks.validateGroovy,
  getBuiltinSchema: mocks.getBuiltinSchema,
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
// 只替换 toast；Fc* 组件保留真实实现（Editor.test.ts 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import List from '@/views-v2/plugins/List.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（Editor.test.ts 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../List.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

type RowOver = {
  id?: string
  instance_id?: string
  plugin_id?: string
  plugin_name?: string
  plugin_type?: 'BUILTIN' | 'JAR' | 'GROOVY' | 'GROUP'
  plugin_phase?: 'PRE' | 'POST'
  scope?: 'GLOBAL' | 'ROUTE'
  status?: 'ENABLED' | 'DISABLED' | 'UNINSTALLED'
}

/** listPlugins 行：行主键 7001 ≠ plugin_id 'my-plugin'（错位防错参）；
 *  7002 带 instance_id='inst-9x'（启停删回退优先级锁 —— 头注裁决①） */
function makeRow(over: RowOver = {}) {
  return {
    id: over.id ?? '7001',
    instance_id: over.instance_id,
    plugin_name: over.plugin_name ?? '我的插件',
    plugin_id: over.plugin_id ?? 'my-plugin',
    plugin_type: over.plugin_type ?? ('GROOVY' as const),
    plugin_phase: over.plugin_phase ?? ('PRE' as const),
    scope: over.scope ?? ('ROUTE' as const),
    status: over.status ?? ('ENABLED' as const),
    sort_order: 3,
    config: '{}',
    remark: ''
  }
}

/** 默认三行：7001 ENABLED/GROOVY/PRE/ROUTE · 7002 DISABLED/JAR/POST/GLOBAL(+instance_id) ·
 *  7003 UNINSTALLED/BUILTIN/PRE/GLOBAL */
function defaultRows() {
  return [
    makeRow(),
    makeRow({
      id: '7002', instance_id: 'inst-9x', plugin_name: '插件乙', plugin_id: 'other-jar',
      plugin_type: 'JAR', plugin_phase: 'POST', scope: 'GLOBAL', status: 'DISABLED'
    }),
    makeRow({
      id: '7003', plugin_name: '插件丙', plugin_id: 'builtin-x',
      plugin_type: 'BUILTIN', scope: 'GLOBAL', status: 'UNINSTALLED'
    })
  ]
}

/** Page<T> 形状（src/api/plugins.ts）；total 缺省 42 供分页透传断言 */
function pageOf(rows: ReturnType<typeof makeRow>[], total = 42) {
  return { records: rows, total, size: 20, current: 1, pages: 3 }
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/plugins', name: 'V2PluginList', component: List as any },
      { path: '/v2/plugins/editor/:id?', name: 'V2PluginEditor', component: stub },
      { path: '/v2/plugins/chain', component: stub }
    ]
  })
  await router.push('/v2/plugins')
  await router.isReady()
  const wrapper = mount(List, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，Editor.test.ts 先例） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
/** FcSegmented 选项：按 label 文案定位容器内按钮（Editor.test.ts 先例） */
const segOption = (w: VueWrapper<any>, tid: string, label: string) =>
  one(w, tid).findAll('button').find((b) => b.text().includes(label))
const needSeg = (w: VueWrapper<any>, tid: string, label: string) => {
  const opt = segOption(w, tid, label)
  expect(opt, `「${tid}」内缺少选项「${label}」`).toBeDefined()
  return opt!
}
/** 最近一次 listPlugins 调用的参数对象 */
const lastCall = () => {
  const calls = mocks.listPlugins.mock.calls
  expect(calls.length, 'listPlugins 应至少被调用一次').toBeGreaterThan(0)
  return calls[calls.length - 1][0] as Record<string, unknown>
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listPlugins.mockReset().mockImplementation(() => Promise.resolve(pageOf(defaultRows())))
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.deletePlugin.mockReset().mockResolvedValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'searchPlaceholder', 'filterAll', 'tableView', 'groupedView',
  'colName', 'colId', 'colType', 'colPhase', 'colScope', 'colStatus', 'colActions',
  'statusEnabled', 'statusDisabled', 'statusUninstalled',
  'create', 'edit', 'enable', 'disable', 'delete',
  'enableSuccess', 'disableSuccess', 'deleteSuccess',
  'confirmDisable', 'confirmDeleteTitle', 'confirmDelete',
  'actionFailed', 'empty', 'readonlyHint'
].map((k) => `v2.plugins.${k}`)

describe('P4a-2 — i18n key 全表双语存在（铁律 6，v2.plugins.* 树延续）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 初始加载 ──────────────────────────────────────────────────────────────
describe('P4a-2 — 初始加载（默认参数 / 骨架 / 行渲染 / 单次取数）', () => {
  it('挂载即拉一次：listPlugins({ page:1, pageSize:20 })，无筛选参数透传（旧默认语义随迁）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-page').exists()).toBe(true)
    expect(mocks.listPlugins).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual({ page: 1, pageSize: 20 })
  })

  it('加载挂起 → plg-skeleton 渲染且表区/空态不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.listPlugins.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-skeleton').exists()).toBe(true)
    expect(one(wrapper, 'plg-table-view').exists()).toBe(false)
    expect(one(wrapper, 'plg-empty').exists()).toBe(false)
    resolveLoad(pageOf(defaultRows()))
    await flushPromises()
    expect(one(wrapper, 'plg-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'plg-table-view').exists()).toBe(true)
  })

  it('行渲染：三行 → plg-row-<行主键> + 名称/标识单元格（行 key = id 非 plugin_id）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(true)
    expect(one(wrapper, 'plg-row-7002').exists()).toBe(true)
    expect(one(wrapper, 'plg-row-7003').exists()).toBe(true)
    expect(need(wrapper, 'plg-name-7001', '名称单元格').text()).toBe('我的插件')
    expect(need(wrapper, 'plg-pid-7001', '标识单元格').text()).toBe('my-plugin')
  })

  it('total 透传 FcPagination（:total=42）', async () => {
    const { wrapper } = await factory()
    const pagination = wrapper.findComponent({ name: 'FcPagination' })
    expect(pagination.exists(), 'plg-table-view 内需挂 FcPagination（plg-pagination）').toBe(true)
    expect(pagination.props('total')).toBe(42)
    expect(pagination.props('currentPage')).toBe(1)
    expect(pagination.props('pageSize')).toBe(20)
  })
})

// ── keyword 防抖（fake timers）────────────────────────────────────────────
describe('P4a-2 — keyword 300ms 防抖（List.keyword-debounce 语义随迁，fake timers）', () => {
  it('输入后 299ms 内不发请求，满 300ms 才发一次且携带 keyword', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      const before = mocks.listPlugins.mock.calls.length
      await inputOf(wrapper, 'plg-f-keyword').setValue('abc')
      await vi.advanceTimersByTimeAsync(299)
      expect(mocks.listPlugins.mock.calls.length, '防抖窗口内不得发请求').toBe(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.listPlugins.mock.calls.length).toBe(before + 1)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'abc' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('防抖窗口内连续输入只发一次、以末值发送（末值语义）', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      const before = mocks.listPlugins.mock.calls.length
      await inputOf(wrapper, 'plg-f-keyword').setValue('a')
      await vi.advanceTimersByTimeAsync(200)
      await inputOf(wrapper, 'plg-f-keyword').setValue('ab')
      await vi.advanceTimersByTimeAsync(300)
      expect(mocks.listPlugins.mock.calls.length, '连续输入只应发一次').toBe(before + 1)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'ab' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keyword 触发搜索时页码重置 1（List.search 语义随迁）', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      const vm = wrapper.vm as any
      vm.page = 2
      await vi.advanceTimersByTimeAsync(0)
      await inputOf(wrapper, 'plg-f-keyword').setValue('kw')
      await vi.advanceTimersByTimeAsync(300)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'kw', page: 1 }))
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── 筛选透传 ──────────────────────────────────────────────────────────────
describe('P4a-2 — type/status/scope 筛选透传（query 参数断言）', () => {
  it('type 筛选：点 BUILTIN → pluginType=BUILTIN 且页码重置 1', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.page = 2
    await flushPromises()
    await needSeg(wrapper, 'plg-f-type', t('v2.plugins.typeBuiltin')).trigger('click')
    await flushPromises()
    const arg = lastCall()
    expect(arg.pluginType).toBe('BUILTIN')
    expect(arg.page).toBe(1)
  })

  it('status 筛选：点 UNINSTALLED → status=UNINSTALLED（List.uninstalled 语义随迁）', async () => {
    const { wrapper } = await factory()
    await needSeg(wrapper, 'plg-f-status', t('v2.plugins.statusUninstalled')).trigger('click')
    await flushPromises()
    expect(lastCall().status).toBe('UNINSTALLED')
  })

  it('scope 筛选：点 GLOBAL → scope=GLOBAL（v2 新增筛选，旧页没有）', async () => {
    const { wrapper } = await factory()
    await needSeg(wrapper, 'plg-f-scope', t('v2.plugins.scopeGlobal')).trigger('click')
    await flushPromises()
    expect(lastCall().scope).toBe('GLOBAL')
  })

  it('「全部」哨兵退空：选 BUILTIN 再点全部 → pluginType 回落 undefined', async () => {
    const { wrapper } = await factory()
    await needSeg(wrapper, 'plg-f-type', t('v2.plugins.typeBuiltin')).trigger('click')
    await flushPromises()
    await needSeg(wrapper, 'plg-f-type', t('v2.plugins.filterAll')).trigger('click')
    await flushPromises()
    expect(lastCall().pluginType).toBeUndefined()
  })
})

// ── 表格列 ────────────────────────────────────────────────────────────────
describe('P4a-2 — 表格列（语义化 <table> 七列）', () => {
  it('列头顺序钉死：名称/标识/类型/阶段/作用域/状态/操作', async () => {
    const { wrapper } = await factory()
    const heads = wrapper.findAll('[data-testid="plg-table-view"] thead th')
    expect(heads.map((h) => h.text())).toEqual([
      t('v2.plugins.colName'), t('v2.plugins.colId'), t('v2.plugins.colType'),
      t('v2.plugins.colPhase'), t('v2.plugins.colScope'), t('v2.plugins.colStatus'),
      t('v2.plugins.colActions')
    ])
  })

  it.each([
    ['BUILTIN', 'typeBuiltin', 'color-primary'],
    ['JAR', 'typeJar', 'color-warning'],
    ['GROOVY', 'typeGroovy', 'color-success'],
    ['GROUP', 'typeGroup', 'color-brand']
  ])('%s 类型 tag → %s 文案 + %s 色（不渲染原文枚举，List.enum-i18n 随迁）', async (type, key, color) => {
    mocks.listPlugins.mockImplementation(() =>
      Promise.resolve(pageOf([makeRow({ id: '7100', plugin_type: type as RowOver['plugin_type'] })])))
    const { wrapper } = await factory()
    const tag = need(wrapper, 'plg-type-7100', `${type} 行类型 tag`)
    expect(tag.text()).toBe(t(`v2.plugins.${key}`))
    expect(tag.classes(), `${type} 应带 ${color}`).toContain(color)
  })

  it.each([
    ['ENABLED', 'statusEnabled', 'tone-success', true],
    ['DISABLED', 'statusDisabled', 'tone-neutral', false],
    ['UNINSTALLED', 'statusUninstalled', 'tone-pending', false]
  ])('%s 状态徽标 → %s / %s%s', async (status, key, tone, withDot) => {
    mocks.listPlugins.mockImplementation(() =>
      Promise.resolve(pageOf([makeRow({ id: '7100', status: status as RowOver['status'] })])))
    const { wrapper } = await factory()
    const badge = need(wrapper, 'plg-status-7100', `${status} 行状态徽标`)
    expect(badge.text()).toBe(t(`v2.plugins.${key}`))
    expect(badge.classes(), `${status} 应带 ${tone}`).toContain(tone)
    expect(badge.classes().includes('has-dot'), `${status} dot=${withDot}`).toBe(withDot)
  })

  it('phase/scope 列走 i18n 文案（PRE→前置 / POST→后置 / ROUTE→路由级 / GLOBAL→全局）', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'plg-phase-7001', '7001 阶段').text()).toBe(t('v2.plugins.phasePre'))
    expect(need(wrapper, 'plg-scope-7001', '7001 作用域').text()).toBe(t('v2.plugins.scopeRoute'))
    expect(need(wrapper, 'plg-phase-7002', '7002 阶段').text()).toBe(t('v2.plugins.phasePost'))
    expect(need(wrapper, 'plg-scope-7002', '7002 作用域').text()).toBe(t('v2.plugins.scopeGlobal'))
  })
})

// ── 双视图 ────────────────────────────────────────────────────────────────
describe('P4a-2 — 双视图切换与分组（List.grouped 语义随迁）', () => {
  it('初始表格视图；切换钮文案 = groupedView；点击后分组视图渲染、表格退场、文案反转', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-table-view').exists()).toBe(true)
    expect(one(wrapper, 'plg-grouped-view').exists()).toBe(false)
    const toggle = need(wrapper, 'plg-view-toggle', '视图切换钮')
    expect(toggle.text()).toBe(t('v2.plugins.groupedView'))
    await toggle.trigger('click')
    expect(one(wrapper, 'plg-table-view').exists()).toBe(false)
    expect(one(wrapper, 'plg-grouped-view').exists()).toBe(true)
    expect(need(wrapper, 'plg-view-toggle', '视图切换钮').text()).toBe(t('v2.plugins.tableView'))
  })

  it('分组按 plugin_type 聚类：GROOVY 组 2 卡计数 2、JAR 组 1 卡计数 1', async () => {
    mocks.listPlugins.mockImplementation(() => Promise.resolve(pageOf([
      makeRow({ id: '7001' }),
      makeRow({ id: '7004', plugin_name: '插件丁' }),
      makeRow({ id: '7002', instance_id: 'inst-9x', plugin_name: '插件乙', plugin_id: 'other-jar', plugin_type: 'JAR', status: 'DISABLED' })
    ])))
    const { wrapper } = await factory()
    await need(wrapper, 'plg-view-toggle', '视图切换钮').trigger('click')
    const groovyGroup = need(wrapper, 'plg-group-GROOVY', 'GROOVY 分组')
    expect(one(wrapper, 'plg-group-JAR').exists()).toBe(true)
    expect(groovyGroup.findAll('[data-testid="plg-card-7001"]').length).toBe(1)
    expect(groovyGroup.findAll('[data-testid="plg-card-7004"]').length).toBe(1)
    expect(need(wrapper, 'plg-group-count-GROOVY', 'GROOVY 计数').text().trim()).toBe('2')
    expect(need(wrapper, 'plg-group-count-JAR', 'JAR 计数').text().trim()).toBe('1')
  })

  it('卡片渲染 name/pid/状态徽标；动作口径随迁：DISABLED 卡有启用、ENABLED 卡有停用、UNINSTALLED 卡两者皆无、卡上无删除', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'plg-view-toggle', '视图切换钮').trigger('click')
    const card1 = need(wrapper, 'plg-card-7001', 'ENABLED 卡')
    expect(card1.text()).toContain('我的插件')
    expect(card1.text()).toContain('my-plugin')
    expect(one(wrapper, 'plg-act-disable-7001').exists()).toBe(true)
    expect(one(wrapper, 'plg-act-enable-7002').exists()).toBe(true)
    expect(one(wrapper, 'plg-act-enable-7003').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-disable-7003').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-delete-7002').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-edit-7003').exists()).toBe(true)
  })

  it('rows 空 → plg-empty 空态（两视图共用；错误态另走 plg-load-error）', async () => {
    mocks.listPlugins.mockImplementation(() => Promise.resolve(pageOf([])))
    const { wrapper } = await factory()
    expect(need(wrapper, 'plg-empty', '空态').text()).toContain(t('v2.plugins.empty'))
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(false)
    await need(wrapper, 'plg-view-toggle', '视图切换钮').trigger('click')
    expect(one(wrapper, 'plg-empty').exists()).toBe(true)
    expect(one(wrapper, 'plg-card-7001').exists()).toBe(false)
  })
})

// ── 行动作 ────────────────────────────────────────────────────────────────
describe('P4a-2 — 行动作（可见性口径 + 编辑 v2 化 + 启停删随迁）', () => {
  it('新建钮 → /v2/plugins/editor/new（v2 编辑器 create 模式）', async () => {
    const { wrapper, router } = await factory()
    await need(wrapper, 'plg-create', '新建钮').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/plugins/editor/new')
  })

  it('编辑 → /v2/plugins/editor/{行主键}（v2 编辑器，非旧页 /plugins/{id}/edit）', async () => {
    const { wrapper, router } = await factory()
    await need(wrapper, 'plg-act-edit-7001', '7001 编辑钮').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/plugins/editor/7001')
  })

  it('编辑直取行主键 id，不走 instance_id 回退（旧 onEdit 语义；7002 行 id=7002 ≠ instance_id=inst-9x）', async () => {
    const { wrapper, router } = await factory()
    await need(wrapper, 'plg-act-edit-7002', '7002 编辑钮').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/plugins/editor/7002')
  })

  it('启用仅 DISABLED 行可见（ENABLED / UNINSTALLED 行无启用钮，List.uninstalled 随迁）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-act-enable-7001').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-enable-7002').exists()).toBe(true)
    expect(one(wrapper, 'plg-act-enable-7003').exists()).toBe(false)
  })

  it('停用仅 ENABLED 行可见', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-act-disable-7001').exists()).toBe(true)
    expect(one(wrapper, 'plg-act-disable-7002').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-disable-7003').exists()).toBe(false)
  })

  it('删除仅非 ENABLED 行可见（DISABLED / UNINSTALLED 有，ENABLED 无 —— 旧口径逐字随迁）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-act-delete-7001').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-delete-7002').exists()).toBe(true)
    expect(one(wrapper, 'plg-act-delete-7003').exists()).toBe(true)
  })

  it('启用：enablePlugin(instance_id||id) + toast.success(enableSuccess) + 重拉（7002 行 → inst-9x）', async () => {
    const { wrapper } = await factory()
    const before = mocks.listPlugins.mock.calls.length
    await need(wrapper, 'plg-act-enable-7002', '7002 启用钮').trigger('click')
    await flushPromises()
    expect(mocks.enablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.enablePlugin).toHaveBeenCalledWith('inst-9x')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.enableSuccess'))
    expect(mocks.listPlugins.mock.calls.length).toBe(before + 1)
  })

  it('启用回退：无 instance_id 行 → enablePlugin(id)', async () => {
    mocks.listPlugins.mockImplementation(() =>
      Promise.resolve(pageOf([makeRow({ id: '7100', status: 'DISABLED' })])))
    const { wrapper } = await factory()
    await need(wrapper, 'plg-act-enable-7100', '7100 启用钮').trigger('click')
    await flushPromises()
    expect(mocks.enablePlugin).toHaveBeenCalledWith('7100')
  })

  it('停用：先 confirm({ variant:danger, title:confirmDisable })；确认后 disablePlugin + toast + 重拉', async () => {
    const { wrapper } = await factory()
    const before = mocks.listPlugins.mock.calls.length
    await need(wrapper, 'plg-act-disable-7001', '7001 停用钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.plugins.confirmDisable'))
    }))
    expect(mocks.disablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.disablePlugin).toHaveBeenCalledWith('7001')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.disableSuccess'))
    expect(mocks.listPlugins.mock.calls.length).toBe(before + 1)
  })

  it('停用：confirm=false → 不发 disablePlugin 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    const before = mocks.listPlugins.mock.calls.length
    await need(wrapper, 'plg-act-disable-7001', '7001 停用钮').trigger('click')
    await flushPromises()
    expect(mocks.disablePlugin).not.toHaveBeenCalled()
    expect(mocks.listPlugins.mock.calls.length).toBe(before)
  })

  it('删除：confirm({ variant:danger, title:confirmDeleteTitle, content:confirmDelete })；确认后 deletePlugin + toast.success(deleteSuccess) + 重拉', async () => {
    const { wrapper } = await factory()
    const before = mocks.listPlugins.mock.calls.length
    await need(wrapper, 'plg-act-delete-7003', '7003 删除钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.plugins.confirmDeleteTitle')),
      content: expect.stringContaining(t('v2.plugins.confirmDelete'))
    }))
    expect(mocks.deletePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.deletePlugin).toHaveBeenCalledWith('7003')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.deleteSuccess'))
    expect(mocks.listPlugins.mock.calls.length).toBe(before + 1)
  })

  it('删除：confirm=false → 不发 deletePlugin 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    const before = mocks.listPlugins.mock.calls.length
    await need(wrapper, 'plg-act-delete-7003', '7003 删除钮').trigger('click')
    await flushPromises()
    expect(mocks.deletePlugin).not.toHaveBeenCalled()
    expect(mocks.listPlugins.mock.calls.length).toBe(before)
  })
})

// ── 竞态与双错误条 ────────────────────────────────────────────────────────
describe('P4a-2 — loadEpoch 竞态与加载/动作双错误条', () => {
  it('loadEpoch 竞态：慢搜索挂起期间新加载先行生效；慢响应后到不覆盖（List.load-epoch 随迁）', async () => {
    const { wrapper } = await factory()
    const fastPage = pageOf([makeRow({ id: '7901', plugin_name: '最新行' })])
    let resolveSlow!: (v: unknown) => void
    mocks.listPlugins.mockImplementation((params: any) => {
      if (params?.keyword === 'slow') return new Promise((r) => { resolveSlow = r })
      return Promise.resolve(fastPage)
    })
    vi.useFakeTimers()
    try {
      await inputOf(wrapper, 'plg-f-keyword').setValue('slow')
      await vi.advanceTimersByTimeAsync(300)
      ;(wrapper.vm as any).page = 3
      await vi.advanceTimersByTimeAsync(0)
      expect(need(wrapper, 'plg-name-7901', '新加载应生效').text()).toBe('最新行')
      resolveSlow(pageOf([makeRow({ id: '7900', plugin_name: '陈旧行' })]))
      await vi.advanceTimersByTimeAsync(0)
      expect(need(wrapper, 'plg-name-7901', '陈旧响应后到不得覆盖').text()).toBe('最新行')
      expect(one(wrapper, 'plg-name-7900').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('listPlugins reject → plg-load-error（loadFailed 文案 + e.message）；表区与空态都不渲染（裁决⑤）', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('boom'))
    const { wrapper } = await factory()
    const err = need(wrapper, 'plg-load-error', '加载错误条')
    expect(err.text()).toContain(t('v2.plugins.loadFailed'))
    expect(err.text()).toContain('boom')
    expect(one(wrapper, 'plg-table-view').exists()).toBe(false)
    expect(one(wrapper, 'plg-empty').exists()).toBe(false)
    expect(one(wrapper, 'plg-action-error').exists()).toBe(false)
    expect(one(wrapper, 'plg-page').exists()).toBe(true)
  })

  it('失败清陈旧行：先有数据，翻页失败 → 错误态整体替换表区（不残留旧行、不出空态）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(true)
    mocks.listPlugins.mockRejectedValue(new Error('later fails'))
    ;(wrapper.vm as any).page = 2
    await flushPromises()
    expect(need(wrapper, 'plg-load-error', '加载错误条').exists()).toBe(true)
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(false)
    expect(one(wrapper, 'plg-empty').exists()).toBe(false)
  })

  it('成功重载清错误：错误态后再成功 → plg-load-error 退场、表区回归（List.reload-error 随迁）', async () => {
    mocks.listPlugins.mockRejectedValueOnce(new Error('first fails'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-load-error').exists()).toBe(true)
    mocks.listPlugins.mockImplementation(() => Promise.resolve(pageOf(defaultRows())))
    ;(wrapper.vm as any).page = 2
    await flushPromises()
    expect(one(wrapper, 'plg-load-error').exists()).toBe(false)
    expect(one(wrapper, 'plg-table-view').exists()).toBe(true)
  })

  it('启用失败 → plg-action-error 含 e.message；无成功 toast；列表行保留（动作错误不清列表）', async () => {
    mocks.enablePlugin.mockRejectedValue(new Error('row locked'))
    const { wrapper } = await factory()
    await need(wrapper, 'plg-act-enable-7002', '7002 启用钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'plg-action-error', '动作错误条').text()).toContain('row locked')
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(true)
    expect(one(wrapper, 'plg-load-error').exists()).toBe(false)
  })

  it('动作失败兜底文案：reject 非 Error → plg-action-error = actionFailed', async () => {
    mocks.enablePlugin.mockRejectedValue(undefined)
    const { wrapper } = await factory()
    await need(wrapper, 'plg-act-enable-7002', '7002 启用钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'plg-action-error', '动作错误条').text()).toContain(t('v2.plugins.actionFailed'))
  })

  it('动作错误条在下一次动作成功后清空（actionError 生命周期，List.actions-error 随迁）', async () => {
    mocks.enablePlugin.mockRejectedValueOnce(new Error('row locked'))
    const { wrapper } = await factory()
    await need(wrapper, 'plg-act-enable-7002', '7002 启用钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'plg-action-error').exists()).toBe(true)
    await need(wrapper, 'plg-act-enable-7002', '7002 启用钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'plg-action-error').exists()).toBe(false)
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.enableSuccess'))
  })
})

// ── 权限降级 ──────────────────────────────────────────────────────────────
describe("P4a-2 — 只读权限降级（canEdit('plugin')）", () => {
  it("canEdit=false → plg-readonly-hint 渲染；新建钮与全部动作钮退场；视图切换保留（只读可看）", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(need(wrapper, 'plg-readonly-hint', '只读提示条').text()).toContain(t('v2.plugins.readonlyHint'))
    expect(one(wrapper, 'plg-create').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-edit-7001').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-disable-7001').exists()).toBe(false)
    expect(one(wrapper, 'plg-act-delete-7003').exists()).toBe(false)
    expect(one(wrapper, 'plg-view-toggle').exists()).toBe(true)
    expect(one(wrapper, 'plg-row-7001').exists()).toBe(true)
  })

  it("canEdit=true → 提示条不渲染", async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'plg-readonly-hint').exists()).toBe(false)
    expect(one(wrapper, 'plg-create').exists()).toBe(true)
  })
})

// ── 分页 ──────────────────────────────────────────────────────────────────
describe('P4a-2 — 分页（页码/每页条数 → query 透传）', () => {
  it('翻页与改每页条数 → listPlugins({ page:3, pageSize:50 }) 透传；FcPagination props 跟随', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.page = 3
    await flushPromises()
    vm.pageSize = 50
    await flushPromises()
    expect(lastCall()).toEqual(expect.objectContaining({ page: 3, pageSize: 50 }))
    const pagination = wrapper.findComponent({ name: 'FcPagination' })
    expect(pagination.props('currentPage')).toBe(3)
    expect(pagination.props('pageSize')).toBe(50)
  })

  it('翻页不重置筛选（page 变更单独触发 reload，不触碰 keyword/type/status/scope）', async () => {
    const { wrapper } = await factory()
    await needSeg(wrapper, 'plg-f-type', t('v2.plugins.typeBuiltin')).trigger('click')
    await flushPromises()
    ;(wrapper.vm as any).page = 4
    await flushPromises()
    const arg = lastCall()
    expect(arg).toEqual(expect.objectContaining({ page: 4, pluginType: 'BUILTIN' }))
    expect(arg.keyword).toBeUndefined()
  })
})

// ── SDK-only 源码契约 ─────────────────────────────────────────────────────
describe('P4a-2 — SDK-only 源码契约（S9a 先例）', () => {
  it('无 <el- 直用、无 FcTable（语义化 <table> + Fc 原子）；template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source).not.toMatch(/FcTable/)
    expect(source).toMatch(/<table[\s>]/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/plugins 仅 listPlugins/enablePlugin/disablePlugin/deletePlugin（P4a 裁决：listGlobalPlugins 随拆旧废弃）", () => {
    const importBlock = readSource().match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/plugins'/)?.[0] ?? ''
    expect(importBlock, '页面需从 @/api/plugins 具名导入').toBeTruthy()
    for (const allowed of ['listPlugins', 'enablePlugin', 'disablePlugin', 'deletePlugin']) {
      expect(importBlock).toContain(allowed)
    }
    for (const banned of [
      'listGlobalPlugins', 'sortGlobalPlugins', 'getRuntimeStatus', 'listBuiltinTypes',
      'getBuiltinSchema', 'validateConfig', 'validateGroovy', 'getPlugin', 'updatePlugin', 'createPlugin'
    ]) {
      expect(importBlock, `禁用成员 ${banned} 出现在 import 面（页面职责越界）`).not.toContain(banned)
    }
  })
})
