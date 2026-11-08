/**
 * P4c-1-T：v2 导入导出页测试 —— 契约 docs/ui-v2/实施契约.md §4 P4 表 P4c-1 段
 * （新页 /v2/import-export，LayoutV2 路由组叶子，route:edit；2026-11-07）。
 * 先红是预期：页面由 P4c-1-C 实现（当前 src/views-v2/routes/ImportExport.vue 不存在，
 * RED 形态 = Failed to resolve import，vitest 与 vue-tsc(TS2307) 同理，合规先红）。
 *
 * ── 移植源头与覆盖点继承（旧 src/views/routes/ImportExport.vue，520 行 + 15 个旧测试文件 → 合并 8 describe）──
 * ImportExport.test.ts（初始状态 / onExport 参数 / 锚点下载 / onValidate 透传）→ D2 初始态 + D4 导出参数/下载
 * ImportExport.route-selection + keyword-filter → D3 表格选择 / keyword 大小写不敏感过滤
 * ImportExport.loading + load-epoch → D2 骨架态 + D9 loadEpoch 竞态（陈旧响应不覆盖）
 * ImportExport.json-parse → D5 D14 本地预检（非法 JSON 原因 / 缺 routes 数组原因，不调后端）
 * ImportExport.diff-view → D6 四类问题行 + diff 表聚合 + D7 自动快照 404 静默 / 成功回执
 * ImportExport.environment → D2/D4/D7 环境维度 + D8 环境对比 Tab 全量（三区 / 404 降级 / 默认值）
 * ImportExport.error + error-ui + action-feedback → D4/D5/D7 双错误条 + toast 反馈
 * ImportExport.permission → D9 route:edit 降级（v2 升级为提示条 + 钮退场）
 * ImportExport.maxlength + route-type-i18n + i18n-strategy → D5 textarea 100000 / D3 类型 i18n / D2 策略 t()
 * e2e-regression/05-import-export.spec.ts（10 用例）→ 全部语义归入本文件对应段（P4e 时改打新页）：
 *   05-01→D2 05-02→D3 05-03/05-04→D4 05-05/05-06/05-09→D5 05-07→D2/D6 05-08→D7 05-10→D2
 *
 * ── v2 语义差异裁决（相对旧页七处，C 按此实现）────────────────────────────────
 * ① i18n 全部进 v2.importExport.* 新树（不引用 importExport.* / route.* / common.* / env.* 旧树）。
 * ② 语义化 <table> 替代 FcTable/el-table（P4a-2 裁决④同款：行级 testid 需挂载点）；
 *    全选 = 表头 imp-select-all checkbox（旧 el-table 表头全选语义随迁）。
 * ③ 双错误条模式升级（P4a-2 裁决⑤同款）：旧页 listRoutes 失败静默清空 → v2 imp-load-error
 *    （loadFailed + e.message，错误态不是空态：此时导出表区 / skeleton / empty 都不渲染，
 *    只影响导出 Tab —— import / diff Tab 不受影响）；imp-action-error（导出/导入动作失败）
 *    随迁旧 action-error，页根级：动作失败不清列表、每个动作开始先清错。
 * ④ 权限降级升级：旧页仅藏三钮 → v2 加 imp-readonly-hint 提示条（P4a-2 同款）；
 *    环境对比 Tab 只读可用（旧页随迁：runEnvDiff 不做写权限校验）。
 * ⑤ 导入结果 errors 表：errors 空时整体不渲染（旧页 FcTable 恒渲染空表）。
 * ⑥ 空选 = 全量导出不阻断（旧口径逐字随迁：ids undefined → 后端全量导出）；「提示」=
 *    exportSuccess toast（e2e 05-04「提示而非静默失败」以 toast 计入，v2 不新增拦截语义）。
 * ⑦ 快照探测语义逐字随迁：先快照后导入（invocationCallOrder 断言）；404 / 其他错误一律静默
 *    跳过不阻塞 importRoutes；成功且带 snapshot_id → snapshotCreated toast 回执（含 id）。
 *
 * ── API mock 面（vi.mock 全成员；页面允许的 import 面 = '@/api/routes' 5 成员 + '@/api/environment' 仅 getEnvironmentDiff）──
 * 允许：exportRoutes / validateImport / importRoutes / listRoutes / createImportSnapshot /
 * getEnvironmentDiff（签名见 src/api/routes.ts:252-300 与 src/api/environment.ts:42）。
 * 禁用名单（import 面源码断言拦截）：路由 CRUD 全家族（createRoute/getRoute/updateRoute/
 * deleteRoute/duplicateRoute/publishRoute/offlineRoute 等）—— 本页职责只有「列表读 + 导出/
 * 预检/导入/快照 + 环境对比」。环境维度走【真实 Pinia store】（'@/store/environment' 不 mock，
 * 老环境用例同款）：listEnvironments mock（resolve = 环境可用 / reject = 404 降级）+
 * installMemoryStorage（本仓库 vitest jsdom 未暴露 localStorage，store 的 readStoredEnv 需要）。
 * 页面 import 面不含 listEnvironments（store 才 import）。另 mock：@/composables/usePermission
 * （canEdit）、'@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，P4a-2 先例）。
 *
 * ── vm setup 绑定名钉死（旧测试同款经 (wrapper.vm as any) 驱动，C 用同名 ref/computed）──
 * status / statusOpts / strategy / jsonText / exportEnv / targetEnv / diffFrom / diffTo /
 * routeKeyword / loadRoutes / exporting / importing
 *
 * ── i18n key 全表（v2.importExport.* 新树，zh/en 同步加，铁律 6；62 个新 key）────────
 * tabExport tabImport tabEnvDiff
 * envLabel status statusDraft statusPublished statusOffline routeName routeType typeDispatch
 * typeBackend keywordPlaceholder selectAll downloadPackage exportSuccess exportFailed empty
 * readonlyHint loadFailed
 * routePackage strategy skip overwrite error targetEnv preCheck doImport preCheckHint
 * reportValid reportInvalid reportEnvironment reportPackageEnvironment reportConflicts
 * reportMissingPlugins reportMissingTargets reportCycleWarnings
 * diffColName diffColAction diffColDetail actionCreate actionConflict diffCreateDetail
 * diffConflictDetail diffMissingPluginDetail diffMissingTargetDetail
 * jsonParseError validationFailed importSuccess importFailed snapshotCreated
 * diffUnavailable diffFrom diffTo diffRun diffOnlyInFrom diffOnlyInTo diffChanged diffNoChanges
 * diffColField diffColFrom diffColTo
 * （四类问题行 action 列复用 reportConflicts/reportMissingPlugins/reportMissingTargets/
 * reportCycleWarnings 同 key —— 旧树裸 conflicts/missingPlugins/... 与 report 前缀双份文案，
 * v2 收敛为一份。）另有 v2.page.importExport 与 v2.nav.importExport 两个非 importExport 树 key，
 * 在 src/router/v2.routing.test.ts P4c-1 追加段断言。
 *
 * ── DOM 契约（data-testid 前缀 imp-，全表）──────────────────────────────────
 * imp-page（根，加载失败也在）
 * imp-tabs（FcTabsPanel 根，attrs 透传；tab 按钮 = 内部 .fc-tab 按文案定位 —— SDK tabs prop
 *   无 testid 通道）；默认激活 import（旧页随迁）；三 tab = 导出/导入/环境对比
 * imp-readonly-hint（canEdit('route')=false 只读提示条 = readonlyHint；true 不渲染）
 * imp-action-error（动作失败错误条 role=alert：e.message 兜底 exportFailed/importFailed；
 *   无错不渲染；页根级，与 imp-load-error 独立共存）
 * imp-export-panel / imp-import-panel / imp-diff-panel（三 Tab 内容根容器）
 * imp-load-error（listRoutes 失败错误条 role=alert，在导出面板内替换 skeleton/表区/empty；
 *   import 与 diff Tab 不受影响）
 * imp-env-select（导出环境 FcSelect 容器，默认顶栏当前环境；envReady=false 不渲染）
 * imp-f-status（状态筛选 FcSelect 容器；三档 = statusOpts DRAFT/PUBLISHED/OFFLINE，可清空）
 * imp-f-keyword（keyword input；大小写不敏感过滤 route_name）
 * imp-skeleton（routesLoading；此时 imp-export-table / imp-export-empty / imp-load-error 都不渲染）
 * imp-export-table（语义化 <table>：thead 名称/类型两列 + 表头全选）
 * imp-select-all（表头全选 checkbox；change → 全部行进入选中集）
 * imp-row-<id>（行 <tr>）+ imp-row-check-<id>（行 checkbox）/ imp-row-name-<id>（名称格）/
 *   imp-row-type-<id>（类型格：DISPATCH→typeDispatch、BACKEND→typeBackend，不渲染原文枚举）
 * imp-export-empty（rows 空且无错误时 FcEmpty；语义化表格无内建空态，v2 新增）
 * imp-export-btn（导出钮；canEdit=false 退场；exporting 时 loading 且重入被卫）
 * imp-json-textarea（textarea 本体；maxlength=100000，旧 maxlength 用例随迁）
 * imp-strategy（FcSegmented 根：SKIP/OVERWRITE/ERROR 三选项按文案定位，aria-checked 选中态；
 *   默认 SKIP）
 * imp-target-env（导入目标环境 FcSelect 容器，默认顶栏当前环境；envReady=false 不渲染、
 *   importRoutes 不携带第三参）
 * imp-precheck-btn / imp-import-btn（canEdit=false 退场）
 * imp-precheck-hint（无报告空态 = FcEmpty；report 出现后退场）
 * imp-report（报告容器；verdict 文案 reportValid/reportInvalid 在容器文本内）
 * imp-report-reason（D14 失败原因行，无 reason 不渲染）
 * imp-report-environment / imp-report-package-environment（目标环境 / 包来源环境行，字段缺省不渲染）
 * imp-report-conflicts / imp-report-missing-plugins / imp-report-missing-targets /
 *   imp-report-cycle-warnings（四类问题行 = 标签 + join 名单；各自无该类问题时退场）
 * imp-diff-table（预检 diff 表；无行不渲染；行 = imp-diff-row 多行，行文本 = name+action+detail；
 *   冲突行 action 随策略翻转：SKIP→skip / OVERWRITE→overwrite / ERROR→actionConflict）
 * imp-result-table（导入结果 errors 逐条表；errors 空不渲染 —— 裁决⑤；行 = imp-result-row）
 * imp-diff-unavailable（环境降级 / diff 接口 404·失败空态 = FcEmpty；此时选择器与对比钮不渲染）
 * imp-diff-from / imp-diff-to（对比环境 FcSelect 容器；默认 default → 第二个环境）
 * imp-diff-run（对比钮；from/to 未选全或相同 → disabled 且点击不发请求）
 * imp-diff-only-from / imp-diff-only-to（仅 A 有 / 仅 B 有区；li 文案 = envDiffRouteLabel 归一：
 *   字符串原样 / 对象取 route_name 或 name）
 * imp-diff-changed（字段变更区；无变更 → imp-diff-no-changes 文案）
 * imp-diff-collapse（FcCollapse；每 changed 路由一个 FcCollapseItem，title=「route_name（N）」，
 *   N = 字段数；展开后内容 = 字段表，行 = imp-diff-field-row：field / from / to 三格，
 *   null·undefined·'' → '—'，对象 {from,to} → 'a → b'）
 *
 * ── fixtures ──────────────────────────────────────────────────────────────
 * defaultTree() → listRoutes 树：9001 dispatch-parent(DISPATCH){ 9002 leaf-backend } +
 *   9003 User API + 9004 user-service（拍平 4 行；keyword 'user' 命中 9003/9004 大小写各一）。
 * PKG / PKG_TEXT → 路由包（含嵌套 children，包内 3 名：pkg-alpha / pkg-beta / pkg-beta-child）。
 * FULL_REPORT → 四类问题齐发 + environment/package_environment；CLEAN_REPORT → 仅 is_valid。
 * DIFF → 三区齐发（字符串 + route_name 对象 + name 对象三种元素形状）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const mocks = vi.hoisted(() => ({
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn(),
  listRoutes: vi.fn(),
  createImportSnapshot: vi.fn(),
  listEnvironments: vi.fn(),
  getEnvironmentDiff: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes,
  listRoutes: mocks.listRoutes,
  createImportSnapshot: mocks.createImportSnapshot
}))
vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments,
  getEnvironmentDiff: mocks.getEnvironmentDiff
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// 只替换 toast；Fc* 组件保留真实实现（P4a-2 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import ImportExport from '@/views-v2/routes/ImportExport.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（Editor.test.ts 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../ImportExport.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

interface TreeNodeLike {
  id: string
  route_name: string
  route_type: 'DISPATCH' | 'BACKEND'
  path: string
  upstream_url: string
  status: string
  environment: string
  children: TreeNodeLike[]
}

type NodeOver = Partial<Pick<TreeNodeLike, 'id' | 'route_name' | 'route_type' | 'path'>> & {
  children?: TreeNodeLike[]
}

/** listRoutes 树节点（RouteNode 形状，src/api/routes.ts） */
function makeNode(over: NodeOver = {}): TreeNodeLike {
  return {
    id: over.id ?? '9001',
    route_name: over.route_name ?? 'dispatch-parent',
    route_type: over.route_type ?? ('BACKEND' as const),
    path: over.path ?? '/p',
    upstream_url: 'http://up-a',
    status: 'PUBLISHED',
    environment: 'default',
    children: over.children ?? []
  }
}

/** 拍平后 4 行：9001 dispatch-parent(DISPATCH){9002 leaf-backend} · 9003 User API · 9004 user-service */
function defaultTree() {
  return [
    makeNode({
      id: '9001', route_name: 'dispatch-parent', route_type: 'DISPATCH', path: '/p',
      children: [makeNode({ id: '9002', route_name: 'leaf-backend', path: '/p/c' })]
    }),
    makeNode({ id: '9003', route_name: 'User API', path: '/user' }),
    makeNode({ id: '9004', route_name: 'user-service', path: '/svc' })
  ]
}

interface PkgNodeLike {
  route_name: string
  route_type: string
  path: string
  upstream_url: string
  sort_order: number
  remark: string
  conditions: unknown[]
  plugins: unknown[]
  children: PkgNodeLike[]
}

function pkgNode(over: { route_name: string; children?: PkgNodeLike[] }): PkgNodeLike {
  return {
    route_name: over.route_name,
    route_type: 'BACKEND',
    path: `/${over.route_name}`,
    upstream_url: 'http://up',
    sort_order: 1,
    remark: '',
    conditions: [],
    plugins: [],
    children: over.children ?? []
  }
}

/** 路由包：包内 3 名（pkg-alpha / pkg-beta / pkg-beta-child，嵌套 children 供拍平走查） */
const PKG = {
  version: '1.0',
  exported_at: 1700000000000,
  environment: 'default',
  routes: [
    pkgNode({ route_name: 'pkg-alpha' }),
    pkgNode({ route_name: 'pkg-beta', children: [pkgNode({ route_name: 'pkg-beta-child' })] })
  ]
}
const PKG_TEXT = JSON.stringify(PKG)

/** 四类问题齐发 + 环境字段；CLEAN_REPORT = 仅 is_valid（旧后端无环境字段形态） */
const FULL_REPORT = {
  is_valid: false,
  conflicts: ['pkg-alpha'],
  missing_plugins: ['plg-x'],
  missing_targets: ['target-t'],
  cycle_warnings: ['pkg-alpha → pkg-beta → pkg-alpha'],
  environment: 'staging',
  package_environment: 'default'
}
const CLEAN_REPORT = { is_valid: true }

/** 环境对比三段齐发（元素形状：字符串 / route_name 对象 / name 对象） */
const DIFF = {
  from: 'default',
  to: 'staging',
  only_in_from: ['only-a', { route_name: 'only-obj' }],
  only_in_to: [{ name: 'to-obj' }],
  changed: [
    { route_name: 'chg-a', fields: { path: { from: '/a', to: '/b' }, upstream_url: { from: null, to: 'http://x' } } }
  ]
}

// ── 挂载与查找 ────────────────────────────────────────────────────────────

async function factory(): Promise<VueWrapper<any>> {
  const wrapper = mount(ImportExport, { global: { plugins: [ElementPlus, createPinia(), i18n] } })
  await flushPromises()
  return wrapper
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，Editor.test.ts 先例） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
const areaOf = (w: VueWrapper<any>, tid: string) => w.find(`textarea[data-testid="${tid}"]`)
const checkOf = (w: VueWrapper<any>, id: string) => w.find(`input[data-testid="imp-row-check-${id}"]`)
/** FcSegmented 选项：按 label 文案定位容器内按钮（Editor.test.ts 先例） */
const segOption = (w: VueWrapper<any>, tid: string, label: string) =>
  one(w, tid).findAll('button').find((b) => b.text().includes(label))
const needSeg = (w: VueWrapper<any>, tid: string, label: string) => {
  const opt = segOption(w, tid, label)
  expect(opt, `「${tid}」内缺少选项「${label}」`).toBeDefined()
  return opt!
}
/** 切 Tab：FcTabsPanel 内 .fc-tab 按文案定位（SDK tabs prop 无 testid 通道） */
async function openTab(w: VueWrapper<any>, label: string) {
  const tab = one(w, 'imp-tabs').findAll('.fc-tab').find((b) => b.text().includes(label))
  expect(tab, `缺少 Tab「${label}」`).toBeDefined()
  await tab!.trigger('click')
  await flushPromises()
}
/** 预检 diff 表全部行文本 */
const diffRows = (w: VueWrapper<any>) => w.findAll('[data-testid="imp-diff-row"]').map((r) => r.text())

// ── Blob 下载断言基座（旧 ImportExport.test.ts 拦截模式 + URL.createObjectURL spy）──
let createdAnchors: Array<{ href: string; download: string; clicked: boolean }> = []
const realCreateElement = document.createElement.bind(document)
function installDownloadSpies() {
  createdAnchors = []
  document.createElement = ((tag: string) => {
    const el = realCreateElement(tag)
    if (tag === 'a') {
      const a = el as HTMLAnchorElement
      const state = { href: '', download: '', clicked: false }
      Object.defineProperty(a, 'href', { get: () => state.href, set: (v) => { state.href = v } })
      Object.defineProperty(a, 'download', { get: () => state.download, set: (v) => { state.download = v } })
      a.click = () => { state.clicked = true }
      createdAnchors.push(state)
    }
    return el
  }) as typeof document.createElement
  ;(URL as any).createObjectURL = vi.fn(() => 'blob:mock-url')
  ;(URL as any).revokeObjectURL = vi.fn()
}
function restoreCreateElement() {
  document.createElement = realCreateElement
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listRoutes.mockReset().mockResolvedValue(defaultTree())
  mocks.listEnvironments.mockReset().mockResolvedValue({ environments: ['default', 'staging'] })
  mocks.getEnvironmentDiff.mockReset().mockResolvedValue(DIFF)
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1.0', exported_at: 1, environment: 'default', routes: [] })
  mocks.validateImport.mockReset().mockResolvedValue(CLEAN_REPORT)
  mocks.importRoutes.mockReset().mockResolvedValue({ total: 3, created: 3, updated: 0, skipped: 0, errors: [] })
  // 快照能力探测默认 404（不支持），静默跳过（旧页 beforeEach 同款）
  mocks.createImportSnapshot.mockReset().mockRejectedValue(new Error('Not Found'))
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
  installDownloadSpies()
})
afterEach(() => restoreCreateElement())

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'tabExport', 'tabImport', 'tabEnvDiff',
  'envLabel', 'status', 'statusDraft', 'statusPublished', 'statusOffline',
  'routeName', 'routeType', 'typeDispatch', 'typeBackend',
  'keywordPlaceholder', 'selectAll', 'downloadPackage', 'exportSuccess', 'exportFailed',
  'empty', 'readonlyHint', 'loadFailed',
  'routePackage', 'strategy', 'skip', 'overwrite', 'error', 'targetEnv', 'preCheck', 'doImport', 'preCheckHint',
  'reportValid', 'reportInvalid', 'reportEnvironment', 'reportPackageEnvironment',
  'reportConflicts', 'reportMissingPlugins', 'reportMissingTargets', 'reportCycleWarnings',
  'diffColName', 'diffColAction', 'diffColDetail', 'actionCreate', 'actionConflict',
  'diffCreateDetail', 'diffConflictDetail', 'diffMissingPluginDetail', 'diffMissingTargetDetail',
  'jsonParseError', 'validationFailed', 'importSuccess', 'importFailed', 'snapshotCreated',
  'diffUnavailable', 'diffFrom', 'diffTo', 'diffRun', 'diffOnlyInFrom', 'diffOnlyInTo',
  'diffChanged', 'diffNoChanges', 'diffColField', 'diffColFrom', 'diffColTo'
].map((k) => `v2.importExport.${k}`)

describe('P4c-1 — i18n key 全表双语存在（铁律 6，v2.importExport.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 初始加载与三 Tab 骨架 ─────────────────────────────────────────────────
describe('P4c-1 — 初始加载与三 Tab 骨架（ImportExport.test.ts 初始态 + loading 随迁）', () => {
  it('挂载即拉一次 listRoutes + 一次环境探测（ensureLoaded → listEnvironments）；imp-page 根在', async () => {
    const wrapper = await factory()
    expect(one(wrapper, 'imp-page').exists()).toBe(true)
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.listEnvironments).toHaveBeenCalledTimes(1)
  })

  it('默认激活导入 Tab（旧页随迁）；三 Tab 文案 = 导出/导入/环境对比', async () => {
    const wrapper = await factory()
    const tabs = one(wrapper, 'imp-tabs').findAll('.fc-tab')
    expect(tabs.length, '三个 Tab').toBe(3)
    expect(tabs.map((b) => b.text())).toEqual([
      t('v2.importExport.tabExport'), t('v2.importExport.tabImport'), t('v2.importExport.tabEnvDiff')
    ])
    expect(one(wrapper, 'imp-tabs').find('.fc-tab.active').text()).toBe(t('v2.importExport.tabImport'))
    expect(one(wrapper, 'imp-import-panel').exists()).toBe(true)
    expect(one(wrapper, 'imp-export-panel').exists()).toBe(false)
  })

  it('加载挂起 → imp-skeleton 渲染且表区/空态/错误条都不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.listRoutes.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-skeleton').exists()).toBe(true)
    expect(one(wrapper, 'imp-export-table').exists()).toBe(false)
    expect(one(wrapper, 'imp-export-empty').exists()).toBe(false)
    expect(one(wrapper, 'imp-load-error').exists()).toBe(false)
    resolveLoad(defaultTree())
    await flushPromises()
    expect(one(wrapper, 'imp-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'imp-export-table').exists()).toBe(true)
  })

  it('策略 Segmented 三选项（SKIP/OVERWRITE/ERROR，t() 文案不裸枚举）默认 SKIP 选中', async () => {
    const wrapper = await factory()
    expect(segOption(wrapper, 'imp-strategy', t('v2.importExport.skip'))?.attributes('aria-checked')).toBe('true')
    expect(segOption(wrapper, 'imp-strategy', t('v2.importExport.overwrite'))?.attributes('aria-checked')).toBe('false')
    await needSeg(wrapper, 'imp-strategy', t('v2.importExport.overwrite')).trigger('click')
    expect(segOption(wrapper, 'imp-strategy', t('v2.importExport.overwrite'))?.attributes('aria-checked')).toBe('true')
  })

  it('状态筛选三档 DRAFT/PUBLISHED/OFFLINE（statusOpts 值钉死）+ 导出环境选择器在（环境可用）', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.statusOpts.map((s: any) => s.value)).toEqual(['DRAFT', 'PUBLISHED', 'OFFLINE'])
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-f-status').exists()).toBe(true)
    expect(one(wrapper, 'imp-env-select').exists()).toBe(true)
  })
})

// ── 导出 Tab：表格 / 筛选 / 选择 ──────────────────────────────────────────
describe('P4c-1 — 导出表格：树拍平 / keyword 过滤 / 选择（route-selection + keyword-filter 随迁）', () => {
  it('树拍平 4 行（子路由也在表内）；类型列 i18n（DISPATCH→分发 / BACKEND→后置，不裸枚举）；名称格原文', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    for (const id of ['9001', '9002', '9003', '9004']) {
      expect(one(wrapper, `imp-row-${id}`).exists(), `行 imp-row-${id}`).toBe(true)
    }
    expect(need(wrapper, 'imp-row-name-9003', '名称格').text()).toBe('User API')
    expect(need(wrapper, 'imp-row-type-9001', 'DISPATCH 行类型格').text()).toBe(t('v2.importExport.typeDispatch'))
    expect(need(wrapper, 'imp-row-type-9003', 'BACKEND 行类型格').text()).toBe(t('v2.importExport.typeBackend'))
  })

  it("keyword 大小写不敏感：'user' → 2 行（User API/user-service，父/子退场）；'xyz' → 0 行 + imp-export-empty", async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    await inputOf(wrapper, 'imp-f-keyword').setValue('user')
    expect(one(wrapper, 'imp-row-9003').exists()).toBe(true)
    expect(one(wrapper, 'imp-row-9004').exists()).toBe(true)
    expect(one(wrapper, 'imp-row-9001').exists()).toBe(false)
    expect(one(wrapper, 'imp-row-9002').exists()).toBe(false)
    await inputOf(wrapper, 'imp-f-keyword').setValue('xyz')
    expect(one(wrapper, 'imp-row-9003').exists()).toBe(false)
    expect(need(wrapper, 'imp-export-empty', '无匹配空态').text()).toContain(t('v2.importExport.empty'))
  })

  it('表头全选 imp-select-all → 四行 checkbox 全 checked（旧 el-table 表头全选语义随迁）', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    await one(wrapper, 'imp-select-all').setValue(true)
    for (const id of ['9001', '9002', '9003', '9004']) {
      expect((checkOf(wrapper, id).element as HTMLInputElement).checked, `行 ${id} 应选中`).toBe(true)
    }
  })

  it('勾选 9001/9003 两行 → 仅这两行 checked（选择集逐行来源）', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    await checkOf(wrapper, '9001').setValue(true)
    await checkOf(wrapper, '9003').setValue(true)
    expect((checkOf(wrapper, '9001').element as HTMLInputElement).checked).toBe(true)
    expect((checkOf(wrapper, '9003').element as HTMLInputElement).checked).toBe(true)
    expect((checkOf(wrapper, '9002').element as HTMLInputElement).checked).toBe(false)
    expect((checkOf(wrapper, '9004').element as HTMLInputElement).checked).toBe(false)
  })
})

// ── 导出动作：exportRoutes 参数 / Blob 下载 / 空选 / 错误 ─────────────────
describe('P4c-1 — 导出动作（exportRoutes 参数三组合 + Blob 下载 + 空选口径）', () => {
  it("空选 + 无状态 → exportRoutes(undefined, undefined, 'default') 全量导出不阻断 + exportSuccess toast（空选提示口径 = 成功 toast，裁决⑥）", async () => {
    const wrapper = await factory()
    await (wrapper.vm as any).onExport()
    await flushPromises()
    expect(mocks.exportRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, undefined, 'default')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.importExport.exportSuccess'))
    expect(one(wrapper, 'imp-action-error').exists()).toBe(false)
  })

  it("状态筛选 PUBLISHED → exportRoutes(undefined, 'PUBLISHED', 'default')（环境可用携带当前环境）", async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.status = 'PUBLISHED'
    await vm.onExport()
    await flushPromises()
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, 'PUBLISHED', 'default')
  })

  it("勾选 9001/9003 + exportEnv 切 staging → exportRoutes(['9001','9003'], undefined, 'staging')（ids 优先于状态）", async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    await checkOf(wrapper, '9001').setValue(true)
    await checkOf(wrapper, '9003').setValue(true)
    ;(wrapper.vm as any).exportEnv = 'staging'
    await (wrapper.vm as any).onExport()
    await flushPromises()
    expect(mocks.exportRoutes).toHaveBeenCalledTimes(1)
    const [ids, status, env] = mocks.exportRoutes.mock.calls[0]
    expect([...ids].sort()).toEqual(['9001', '9003'])
    expect(status).toBeUndefined()
    expect(env).toBe('staging')
  })

  it('环境功能降级（listEnvironments 404）→ 不携带第三参（旧口径 body/query 形状保持）+ 环境选择器退场', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('Not Found'))
    const wrapper = await factory()
    expect(one(wrapper, 'imp-env-select').exists()).toBe(false)
    expect(one(wrapper, 'imp-target-env').exists()).toBe(false)
    await (wrapper.vm as any).onExport()
    await flushPromises()
    expect(mocks.exportRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.exportRoutes.mock.calls[0].length, '降级时两参').toBe(2)
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, undefined)
  })

  it('Blob 下载全链：createObjectURL 收 Blob(application/json) + 锚点 download=/^routes-\\d+\\.json$/ 已点击 + revokeObjectURL 回收', async () => {
    const wrapper = await factory()
    await (wrapper.vm as any).onExport()
    await flushPromises()
    const urlMock = (URL as any).createObjectURL as ReturnType<typeof vi.fn>
    expect(urlMock).toHaveBeenCalledTimes(1)
    const blob = urlMock.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
    expect(createdAnchors.length).toBeGreaterThanOrEqual(1)
    const anchor = createdAnchors[createdAnchors.length - 1]
    expect(anchor.clicked).toBe(true)
    expect(anchor.download).toMatch(/^routes-\d+\.json$/)
    expect((URL as any).revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.importExport.exportSuccess'))
  })

  it('导出挂起 → exporting=true 且重复触发不重入（旧页卫语句随迁）；resolve 后复位', async () => {
    let resolveExport!: (v: unknown) => void
    mocks.exportRoutes.mockImplementationOnce(() => new Promise((r) => { resolveExport = r }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const p = vm.onExport()
    await flushPromises()
    expect(vm.exporting).toBe(true)
    await vm.onExport()
    expect(mocks.exportRoutes).toHaveBeenCalledTimes(1)
    resolveExport({ version: '1.0', routes: [] })
    await p
    await flushPromises()
    expect(vm.exporting).toBe(false)
  })

  it('exportRoutes reject → imp-action-error 含 e.message + 无成功 toast（error-ui 随迁）', async () => {
    mocks.exportRoutes.mockRejectedValue(new Error('export boom'))
    const wrapper = await factory()
    await (wrapper.vm as any).onExport()
    await flushPromises()
    expect(need(wrapper, 'imp-action-error', '动作错误条').text()).toContain('export boom')
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 导入 Tab：本地预检（D14）───────────────────────────────────────────────
describe('P4c-1 — 本地预检 D14（maxlength + 非法 JSON/缺 routes 原因，不调后端）', () => {
  it('textarea maxlength=100000（maxlength 用例随迁）', async () => {
    const wrapper = await factory()
    expect(areaOf(wrapper, 'imp-json-textarea').attributes('maxlength')).toBe('100000')
  })

  it('空文本点预检 → 不发 validateImport、报告区仍是 imp-precheck-hint', async () => {
    const wrapper = await factory()
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(mocks.validateImport).not.toHaveBeenCalled()
    expect(one(wrapper, 'imp-precheck-hint').exists()).toBe(true)
    expect(one(wrapper, 'imp-report').exists()).toBe(false)
  })

  it('非法 JSON → imp-report-reason 含「JSON 解析失败」+ verdict=reportInvalid + validateImport 未调用（D14：本地问题不进后端）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = '{ this is not valid json '
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(mocks.validateImport).not.toHaveBeenCalled()
    expect(one(wrapper, 'imp-precheck-hint').exists()).toBe(false)
    const report = need(wrapper, 'imp-report', '预检报告')
    expect(report.text()).toContain(t('v2.importExport.reportInvalid'))
    expect(need(wrapper, 'imp-report-reason', '失败原因').text()).toContain('JSON 解析失败')
  })

  it('缺 routes 数组（{"version":"1.0"}）→ reason 提到 routes + validateImport 未调用（D14）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = '{"version":"1.0"}'
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(mocks.validateImport).not.toHaveBeenCalled()
    expect(need(wrapper, 'imp-report-reason', '失败原因').text()).toContain('routes')
  })

  it('合法包 → validateImport 收到解析对象（deep equal）+ verdict=reportValid', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(mocks.validateImport).toHaveBeenCalledTimes(1)
    expect(mocks.validateImport).toHaveBeenCalledWith(PKG)
    expect(need(wrapper, 'imp-report', '预检报告').text()).toContain(t('v2.importExport.reportValid'))
    expect(one(wrapper, 'imp-report-reason').exists()).toBe(false)
  })

  it('validateImport reject → report = is_valid:false + reason=e.message（旧 error.test 随迁：后端失败也走报告区）', async () => {
    mocks.validateImport.mockRejectedValue(new Error('backend down'))
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-report', '预检报告').text()).toContain(t('v2.importExport.reportInvalid'))
    expect(need(wrapper, 'imp-report-reason', '失败原因').text()).toContain('backend down')
  })
})

// ── 导入 Tab：预检报告四类问题行 + diff 表 ────────────────────────────────
describe('P4c-1 — 预检报告与 diff 表（diff-view 随迁：四类问题行 + 策略翻转）', () => {
  it('干净报告（is_valid true 无四类）→ 无问题行、无 diff 表；imp-precheck-hint 退场', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'imp-precheck-hint').exists()).toBe(false)
    expect(one(wrapper, 'imp-report').exists()).toBe(true)
    expect(one(wrapper, 'imp-report-reason').exists()).toBe(false)
    expect(one(wrapper, 'imp-report-conflicts').exists()).toBe(false)
    expect(one(wrapper, 'imp-report-missing-plugins').exists()).toBe(false)
    expect(one(wrapper, 'imp-report-missing-targets').exists()).toBe(false)
    expect(one(wrapper, 'imp-report-cycle-warnings').exists()).toBe(false)
    expect(one(wrapper, 'imp-diff-table').exists()).toBe(false)
  })

  it('四类齐发 → 四问题行各渲染（标签 + 名单 join），reason 行不渲染（无 reason）', async () => {
    mocks.validateImport.mockResolvedValue(FULL_REPORT)
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-report-conflicts', '冲突行').text()).toContain(t('v2.importExport.reportConflicts'))
    expect(need(wrapper, 'imp-report-conflicts', '冲突行').text()).toContain('pkg-alpha')
    expect(need(wrapper, 'imp-report-missing-plugins', '缺插件行').text()).toContain('plg-x')
    expect(need(wrapper, 'imp-report-missing-targets', '缺目标行').text()).toContain('target-t')
    expect(need(wrapper, 'imp-report-cycle-warnings', '循环行').text()).toContain('pkg-alpha → pkg-beta → pkg-alpha')
    expect(one(wrapper, 'imp-report-reason').exists()).toBe(false)
  })

  it('报告 environment/package_environment 下发 → 两行渲染（旧包 = default）；不带 → 两行退场', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG_TEXT
    mocks.validateImport.mockResolvedValue(FULL_REPORT)
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-report-environment', '目标环境行').text()).toContain('staging')
    expect(need(wrapper, 'imp-report-package-environment', '包来源环境行').text()).toContain('default')
    mocks.validateImport.mockResolvedValue(CLEAN_REPORT)
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'imp-report-environment').exists()).toBe(false)
    expect(one(wrapper, 'imp-report-package-environment').exists()).toBe(false)
  })

  it('diff 表聚合 6 行：包内 3 名（冲突行 action=skip 文案 + 2 新增行 actionCreate）+ 缺插件/缺目标/循环 3 问题行', async () => {
    mocks.validateImport.mockResolvedValue(FULL_REPORT)
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    const rows = diffRows(wrapper)
    expect(rows.length, '3 包内行 + 3 问题行').toBe(6)
    expect(rows[0]).toContain('pkg-alpha')
    expect(rows[0]).toContain(t('v2.importExport.skip'))
    expect(rows[1]).toContain('pkg-beta')
    expect(rows[1]).toContain(t('v2.importExport.actionCreate'))
    expect(rows[2]).toContain('pkg-beta-child')
    expect(rows[3]).toContain('plg-x')
    expect(rows[3]).toContain(t('v2.importExport.reportMissingPlugins'))
    expect(rows[3]).toContain(t('v2.importExport.diffMissingPluginDetail'))
    expect(rows[4]).toContain('target-t')
    expect(rows[4]).toContain(t('v2.importExport.reportMissingTargets'))
    expect(rows[5]).toContain('—')
    expect(rows[5]).toContain(t('v2.importExport.reportCycleWarnings'))
    expect(rows[5]).toContain('pkg-alpha → pkg-beta → pkg-alpha')
    expect(one(wrapper, 'imp-diff-table').exists()).toBe(true)
  })

  it('策略翻转冲突行 action：OVERWRITE→overwrite 文案、ERROR→actionConflict 文案、新增行恒 actionCreate', async () => {
    mocks.validateImport.mockResolvedValue(FULL_REPORT)
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-precheck-btn', '预检钮').trigger('click')
    await flushPromises()
    await needSeg(wrapper, 'imp-strategy', t('v2.importExport.overwrite')).trigger('click')
    let rows = diffRows(wrapper)
    expect(rows[0]).toContain(t('v2.importExport.overwrite'))
    expect(rows[1]).toContain(t('v2.importExport.actionCreate'))
    await needSeg(wrapper, 'imp-strategy', t('v2.importExport.error')).trigger('click')
    rows = diffRows(wrapper)
    expect(rows[0]).toContain(t('v2.importExport.actionConflict'))
  })
})

// ── 导入 Tab：正式导入流程（快照探测 + importRoutes + 结果表）──────────────
describe('P4c-1 — 正式导入流程（快照 404 静默 / 先快照后导入 / 参数 / 结果表）', () => {
  it('空文本点导入 → 不发 createImportSnapshot 也不发 importRoutes', async () => {
    const wrapper = await factory()
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(mocks.createImportSnapshot).not.toHaveBeenCalled()
    expect(mocks.importRoutes).not.toHaveBeenCalled()
  })

  it('非法 JSON → imp-action-error = jsonParseError 文案；快照与导入都不发（旧 json-parse 随迁）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = 'not json at all'
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-action-error', '动作错误条').text()).toContain(t('v2.importExport.jsonParseError'))
    expect(mocks.createImportSnapshot).not.toHaveBeenCalled()
    expect(mocks.importRoutes).not.toHaveBeenCalled()
  })

  it('快照 404 静默：createImportSnapshot reject → importRoutes 照发 + importSuccess toast、无 snapshotCreated 回执（裁决⑦）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(mocks.createImportSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.importRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.importExport.importSuccess'))
    expect(mocks.toast.success).toHaveBeenCalledTimes(1)
    expect(one(wrapper, 'imp-action-error').exists()).toBe(false)
  })

  it('快照成功 snapshot_id=991 → 先快照后导入（invocationCallOrder）+ snapshotCreated toast 含 id', async () => {
    mocks.createImportSnapshot.mockResolvedValue({ snapshot_id: '991' })
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    const [snapOrder] = mocks.createImportSnapshot.mock.invocationCallOrder
    const [importOrder] = mocks.importRoutes.mock.invocationCallOrder
    expect(snapOrder, '快照必须先于导入').toBeLessThan(importOrder)
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('991'))
    expect(mocks.toast.success).toHaveBeenCalledWith(
      expect.stringContaining(t('v2.importExport.snapshotCreated').split('{id}')[0]))
  })

  it('importRoutes 参数：降级两参 (pkg, strategy)；环境可用三参 + targetEnv 切 staging → (pkg, strategy, staging)', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('Not Found'))
    const degraded = await factory()
    ;(degraded.vm as any).jsonText = PKG_TEXT
    await need(degraded, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(mocks.importRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.importRoutes.mock.calls[0].length, '降级两参').toBe(2)
    expect(mocks.importRoutes).toHaveBeenCalledWith(PKG, 'SKIP')

    mocks.importRoutes.mockClear()
    // envful 半段还原环境可用（头注约定 resolve=可用 / reject=404 降级）：上个半段显式 reject，
    // 而 factory() 每 mount 新 pinia → 新 environment store → ensureLoaded 重新探测，
    // reject 残留会让 envReady 恒 false、imp-target-env 不渲染（装配段还原，断言不动）
    mocks.listEnvironments.mockReset().mockResolvedValue({ environments: ['default', 'staging'] })
    const envful = await factory()
    ;(envful.vm as any).jsonText = PKG_TEXT
    ;(envful.vm as any).targetEnv = 'staging'
    expect(need(envful, 'imp-target-env', '目标环境选择器（环境可用时在）').exists()).toBe(true)
    await need(envful, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(mocks.importRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.importRoutes).toHaveBeenCalledWith(PKG, 'SKIP', 'staging')
  })

  it('策略 Segmented 点 OVERWRITE → importRoutes 第二参 OVERWRITE（i18n-strategy 随迁）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await needSeg(wrapper, 'imp-strategy', t('v2.importExport.overwrite')).trigger('click')
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(mocks.importRoutes).toHaveBeenCalledWith(PKG, 'OVERWRITE', 'default')
  })

  it('结果 errors 逐条表：2 条 → imp-result-table 两行（route_name+message）；errors 空 → 表不渲染（裁决⑤）', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG_TEXT
    mocks.importRoutes.mockResolvedValue({
      total: 3, created: 2, updated: 0, skipped: 0,
      errors: [{ route_name: 'pkg-alpha', message: '同名冲突' }, { route_name: 'pkg-beta', message: '上游不可达' }]
    })
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="imp-result-row"]')
    expect(rows.length, '两条错误逐条').toBe(2)
    expect(rows[0].text()).toContain('pkg-alpha')
    expect(rows[0].text()).toContain('同名冲突')
    expect(rows[1].text()).toContain('pkg-beta')
    expect(rows[1].text()).toContain('上游不可达')

    mocks.importRoutes.mockResolvedValue({ total: 3, created: 3, updated: 0, skipped: 0, errors: [] })
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'imp-result-table').exists()).toBe(false)
  })

  it('importRoutes reject → imp-action-error 含 e.message 兜底 importFailed + 结果表不渲染（快照失败不阻塞）', async () => {
    mocks.importRoutes.mockRejectedValue(new Error('import boom'))
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-action-error', '动作错误条').text()).toContain('import boom')
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(one(wrapper, 'imp-result-table').exists()).toBe(false)
  })

  it('导入成功清空既有 actionError（旧 action-feedback 生命周期随迁）', async () => {
    mocks.importRoutes.mockRejectedValueOnce(new Error('first fails'))
    const wrapper = await factory()
    ;(wrapper.vm as any).jsonText = PKG_TEXT
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'imp-action-error').exists()).toBe(true)
    await need(wrapper, 'imp-import-btn', '导入钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'imp-action-error').exists()).toBe(false)
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.importExport.importSuccess'))
  })
})

// ── 环境对比 Tab ──────────────────────────────────────────────────────────
describe('P4c-1 — 环境对比 Tab（environment 契约 6 + T3 随迁）', () => {
  it('环境功能降级 → imp-diff-unavailable 空态；选择器与对比钮不渲染', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('Not Found'))
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    expect(need(wrapper, 'imp-diff-unavailable', '降级空态').text()).toContain(t('v2.importExport.diffUnavailable'))
    expect(one(wrapper, 'imp-diff-from').exists()).toBe(false)
    expect(one(wrapper, 'imp-diff-to').exists()).toBe(false)
    expect(one(wrapper, 'imp-diff-run').exists()).toBe(false)
  })

  it('环境可用 → 默认 default→staging（default 恒首取第二个为 to）；点对比 → getEnvironmentDiff(default, staging)', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    expect(one(wrapper, 'imp-diff-unavailable').exists()).toBe(false)
    await need(wrapper, 'imp-diff-run', '对比钮').trigger('click')
    await flushPromises()
    expect(mocks.getEnvironmentDiff).toHaveBeenCalledTimes(1)
    expect(mocks.getEnvironmentDiff).toHaveBeenCalledWith('default', 'staging')
  })

  it('三区渲染：仅 A 有 2 项（字符串 + route_name 对象归一）、仅 B 有 1 项（name 对象归一）、字段变更 1 项', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    await need(wrapper, 'imp-diff-run', '对比钮').trigger('click')
    await flushPromises()
    const fromLis = need(wrapper, 'imp-diff-only-from', '仅 A 有区').findAll('li')
    expect(fromLis.map((li) => li.text())).toEqual(['only-a', 'only-obj'])
    const toLis = need(wrapper, 'imp-diff-only-to', '仅 B 有区').findAll('li')
    expect(toLis.map((li) => li.text())).toEqual(['to-obj'])
    expect(need(wrapper, 'imp-diff-changed', '字段变更区').exists()).toBe(true)
    expect(one(wrapper, 'imp-diff-no-changes').exists()).toBe(false)
  })

  it('changed 折叠项 title=「chg-a（2）」；展开后字段行 path(/a→/b) 与 upstream_url(null→—)', async () => {
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    await need(wrapper, 'imp-diff-run', '对比钮').trigger('click')
    await flushPromises()
    const changed = need(wrapper, 'imp-diff-changed', '字段变更区')
    const header = changed.find('.el-collapse-item__header')
    expect(header.exists(), '折叠项头').toBe(true)
    expect(header.text()).toContain('chg-a')
    expect(header.text()).toContain('2')
    expect(changed.findAll('[data-testid="imp-diff-field-row"]').length, '未展开无内容行').toBe(0)
    await header.trigger('click')
    await flushPromises()
    const fieldRows = changed.findAll('[data-testid="imp-diff-field-row"]')
    expect(fieldRows.length).toBe(2)
    expect(fieldRows[0].text()).toContain('path')
    expect(fieldRows[0].text()).toContain('/a')
    expect(fieldRows[0].text()).toContain('/b')
    expect(fieldRows[1].text()).toContain('upstream_url')
    expect(fieldRows[1].text()).toContain('—')
    expect(fieldRows[1].text()).toContain('http://x')
  })

  it('两环境一致（changed 空）→ imp-diff-no-changes 文案；仅 A/仅 B 区空列表兜底 empty 文案', async () => {
    mocks.getEnvironmentDiff.mockResolvedValue({ from: 'default', to: 'staging', only_in_from: [], only_in_to: [], changed: [] })
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    await need(wrapper, 'imp-diff-run', '对比钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-diff-no-changes', '无变更空态').text()).toContain(t('v2.importExport.diffNoChanges'))
    expect(need(wrapper, 'imp-diff-only-from', '仅 A 有区').text()).toContain(t('v2.importExport.empty'))
    expect(need(wrapper, 'imp-diff-only-to', '仅 B 有区').text()).toContain(t('v2.importExport.empty'))
  })

  it('getEnvironmentDiff reject（404/失败）→ imp-diff-unavailable 空态 + 三区退场（旧 diffState 随迁）', async () => {
    mocks.getEnvironmentDiff.mockRejectedValue(new Error('Not Found'))
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    await need(wrapper, 'imp-diff-run', '对比钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'imp-diff-unavailable', '失败空态').text()).toContain(t('v2.importExport.diffUnavailable'))
    expect(one(wrapper, 'imp-diff-only-from').exists()).toBe(false)
    expect(one(wrapper, 'imp-diff-changed').exists()).toBe(false)
  })

  it('from === to → 对比钮 disabled 且点击不发请求（diffInputsOk 随迁）', async () => {
    const wrapper = await factory()
    ;(wrapper.vm as any).diffTo = 'default'
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    const run = need(wrapper, 'imp-diff-run', '对比钮')
    expect(run.attributes('disabled')).toBeDefined()
    await run.trigger('click')
    await flushPromises()
    expect(mocks.getEnvironmentDiff).not.toHaveBeenCalled()
  })
})

// ── 横切：竞态 / 双错误条 / 权限降级 / SDK-only 源码契约 ──────────────────
describe('P4c-1 — loadEpoch 竞态与加载/动作双错误条（load-epoch + P4a-2 裁决③）', () => {
  it('loadEpoch 竞态：首载挂起期间手动重载先行生效；陈旧响应后到不覆盖（旧 load-epoch 随迁）', async () => {
    let resolveStale!: (v: unknown) => void
    mocks.listRoutes.mockImplementationOnce(() => new Promise((r) => { resolveStale = r }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    mocks.listRoutes.mockImplementationOnce(() => Promise.resolve([
      makeNode({ id: '9100', route_name: 'fresh-route' })
    ]))
    await vm.loadRoutes()
    await flushPromises()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-row-9100').exists(), '新加载应生效').toBe(true)
    resolveStale(defaultTree())
    await flushPromises()
    expect(one(wrapper, 'imp-row-9100').exists(), '陈旧响应后到不得覆盖').toBe(true)
    expect(one(wrapper, 'imp-row-9001').exists(), '陈旧树不得回流').toBe(false)
  })

  it('listRoutes reject → imp-load-error（loadFailed + e.message）；表区/skeleton/empty 都不渲染；import Tab 不受影响；重载成功后错误退场（裁决③）', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('list boom'))
    const wrapper = await factory()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    const err = need(wrapper, 'imp-load-error', '加载错误条')
    expect(err.text()).toContain(t('v2.importExport.loadFailed'))
    expect(err.text()).toContain('list boom')
    expect(one(wrapper, 'imp-export-table').exists()).toBe(false)
    expect(one(wrapper, 'imp-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'imp-export-empty').exists()).toBe(false)
    // import Tab 不受影响：textarea / 预检钮照常
    await openTab(wrapper, t('v2.importExport.tabImport'))
    expect(one(wrapper, 'imp-json-textarea').exists()).toBe(true)
    expect(one(wrapper, 'imp-precheck-btn').exists()).toBe(true)
    // 重载成功 → 错误退场、表区回归
    mocks.listRoutes.mockResolvedValue(defaultTree())
    await (wrapper.vm as any).loadRoutes()
    await flushPromises()
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-load-error').exists()).toBe(false)
    expect(one(wrapper, 'imp-export-table').exists()).toBe(true)
  })

  it('双错误条共存：load-error 在 + 导出动作失败 → imp-action-error 独立出现、load-error 仍在', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('list boom'))
    mocks.exportRoutes.mockRejectedValue(new Error('export boom'))
    const wrapper = await factory()
    await (wrapper.vm as any).onExport()
    await flushPromises()
    expect(need(wrapper, 'imp-load-error', '加载错误条').text()).toContain('list boom')
    expect(need(wrapper, 'imp-action-error', '动作错误条').text()).toContain('export boom')
  })

  it("canEdit('route')=false → imp-readonly-hint 渲染；导出/预检/导入钮全退场；textarea/表格/对比 Tab 保留（裁决④）", async () => {
    mocks.canEdit.mockReturnValue(false)
    const wrapper = await factory()
    expect(need(wrapper, 'imp-readonly-hint', '只读提示条').text()).toContain(t('v2.importExport.readonlyHint'))
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-export-btn').exists()).toBe(false)
    expect(one(wrapper, 'imp-row-9001').exists()).toBe(true)
    await openTab(wrapper, t('v2.importExport.tabImport'))
    expect(one(wrapper, 'imp-precheck-btn').exists()).toBe(false)
    expect(one(wrapper, 'imp-import-btn').exists()).toBe(false)
    expect(one(wrapper, 'imp-json-textarea').exists()).toBe(true)
    await openTab(wrapper, t('v2.importExport.tabEnvDiff'))
    expect(one(wrapper, 'imp-diff-run').exists()).toBe(true)
  })

  it("canEdit('route')=true → 提示条不渲染、三钮全在", async () => {
    const wrapper = await factory()
    expect(one(wrapper, 'imp-readonly-hint').exists()).toBe(false)
    await openTab(wrapper, t('v2.importExport.tabExport'))
    expect(one(wrapper, 'imp-export-btn').exists()).toBe(true)
    await openTab(wrapper, t('v2.importExport.tabImport'))
    expect(one(wrapper, 'imp-precheck-btn').exists()).toBe(true)
    expect(one(wrapper, 'imp-import-btn').exists()).toBe(true)
  })
})

describe('P4c-1 — SDK-only 源码契约（S9a/P4a-2 先例）', () => {
  it('无 <el- 直用、无 FcTable（语义化 <table> + Fc 原子）；template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source).not.toMatch(/FcTable/)
    expect(source).toMatch(/<table[\s>]/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/routes 仅 5 成员 + @/api/environment 仅 getEnvironmentDiff（路由 CRUD 全家族越界即红）", () => {
    const source = readSource()
    const routesBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/routes'/)?.[0] ?? ''
    expect(routesBlock, '页面需从 @/api/routes 具名导入').toBeTruthy()
    for (const allowed of ['exportRoutes', 'validateImport', 'importRoutes', 'listRoutes', 'createImportSnapshot']) {
      expect(routesBlock).toContain(allowed)
    }
    for (const banned of [
      'createRoute', 'getRoute', 'updateRoute', 'deleteRoute', 'duplicateRoute',
      'publishRoute', 'offlineRoute', 'listRouteVersions', 'getRouteVersionDiff'
    ]) {
      expect(routesBlock, `禁用成员 ${banned} 出现在 import 面（页面职责越界）`).not.toContain(banned)
    }
    const envBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/environment'/)?.[0] ?? ''
    expect(envBlock, '页面需从 @/api/environment 具名导入').toBeTruthy()
    expect(envBlock).toContain('getEnvironmentDiff')
    expect(envBlock, 'listEnvironments 由 store 负责探测，页面不得直连').not.toContain('listEnvironments')
  })
})
