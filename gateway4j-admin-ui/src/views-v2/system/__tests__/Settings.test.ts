/**
 * P4d-3-T：v2 设置页测试 —— 契约 docs/ui-v2/实施契约.md §4.5 P4d 行（P4d-3 段）。
 * （/v2/settings，name V2Settings，permission system:read；旧 src/views/Settings.vue 578 行
 * 22 测试文件等价迁移；2026-11-09）。先红是预期：页面由 P4d-3-C 实现（当前
 * src/views-v2/system/Settings.vue 不存在，RED 形态 = Failed to resolve import，vitest 与
 * vue-tsc(TS2307) 同理，合规先红）。
 *
 * ── 旧页语义权威（src/views/Settings.vue，逐字随迁点）────────────────────────
 * 四分区 = general 站点配置 / dict 字典 / changes 变更流 / audit 审计日志表（旧 5 Tab 中
 * theme 仅提示文案砍除；旧「changes Tab 内 audit 优先 + 404 回退 compat 徽标」的合并模式
 * 随 v2 拆独立分区而消亡 —— 两分区各自独立降级，互不回退）。
 * 门禁 canEdit('system')（旧页权限码字面侦察：readonly 提示 + 保存钮 + save 函数内三重
 * gate；settings 页查看权限=system:read，编辑门禁=canEdit('system')）。
 * 站点配置四字段：site_name（maxlength=50）/ language（zh-CN|en-US 下拉，选项文案字面
 * 「简体中文」「English」不入 i18n）/ token_expiry_hours（FcInputNumber min1 max8760，
 * 客户端校验 1-720）/ refresh_expiry_days（min1 max365，校验 1-365）。
 * loadConfig：getConfig('system')；字符串 truthy 注入、数字 `!= null` 注入（falsy-zero 坑：
 * 0 是合法值不得当空丢弃）；字段缺省回落默认 Gateway4j / zh-CN / 2 / 30；loadEpoch 竞态
 * 丢弃（陈旧成功不覆写表单、陈旧拒绝不复活错误条）。
 * save：saveConfig('system', payload)（configType 恒 'system'，snake_case 字段）；提交前
 * 三重 gate（canEdit → loading → saving 双击防重）；成功 toast + dirty=false + locale 切换
 * + localStorage['gw4j_lang']；失败 mapFieldErrors 逐字段注入 / 非字段错 e.message。
 * dirty：watch(form, deep) + dirtyTracking（载入完成后才开）；onBeforeRouteLeave async
 * confirm（variant danger）→ false 阻断。
 * dict：code 默认 'ROUTE_TYPE'，挂载即查；空 code 早退不调 API；失败清 entries 显错误；
 * 空数组空态。
 * changes：listChanges(50)（limit=50 随迁）；列 时间/类型(plugin|route tag)/名称/状态
 * （DRAFT/PUBLISHED/CHANGING/OFFLINE → i18n，未知裸枚举）/config_version；失败 → 不可用
 * 空态不崩页；刷新钮恢复。
 * audit：listAuditLogs({page,pageSize,action||undefined,actor.trim()||undefined,from,to})；
 * 信封 {records,total,...}，total Long→String 可能是字符串 → Number() 兜底；筛选变化重置
 * 回第 1 页；列 created_at/action/actor(||'-')/target_type+target_id 组合（兼容草稿 target
 * 字段；全空 '-'）/result 着色（SUCCESS|OK|0|ALLOWED→success，FAILURE|FAIL|ERROR|DENIED
 * →danger，其余 gray）。
 * 【+8h 债不订正（契约原文）】audit_log.created_at 时区 +8h 是后端 P3 债，显示原样：
 * 时间格 = formatChangeTime 同式直渲（ISO → Date.parse → formatDate，秒级数字 ×1000，
 * 空 → '-'，NaN → 原样字符串），页面源码禁出现 28800 / 8*3600 等订正常数。
 *
 * ── v2 落位裁决（相对旧页，C 按此实现）─────────────────────────────────────
 * ① 旧页 general/security 双 Tab 双表单 → v2 合一「站点配置」分区单表单（四字段同屏，
 *    set-submit 单保存钮）：payload 合并为一次 saveConfig('system', 四字段全量)。旧
 *    「saveGeneral 只发自己的字段」的拆分是双 Tab 产物，分区合并后 API 形态不变
 *    （configType 'system' + snake_case 字段）而 payload 合一。
 * ② 分区导航 = FcTabsPanel（P4c-1 ImportExport 同款）：testid 落各分区面板
 *    set-section-*，tab 根 = set-section-nav（.fc-tab 按文案定位，SDK tabs prop 无
 *    testid 通道，ImportExport 先例）。默认激活 general。
 * ③ 错误通道三条：set-error/set-retry（getConfig 页级失败 + 重试，P4d-1/2 先例；
 *    旧页只有 config-load-error 无重试钮，v2 补齐组内惯例）、set-save-error（保存非
 *    字段错）、set-field-error-{field}（客户端校验与服务端 mapFieldErrors 共用通道，
 *    P4d-1 先例；field=site_name/language/token_expiry_hours/refresh_expiry_days）。
 *    dict 分区降级 set-dict-error、changes 分区降级 set-changes-unavailable、audit 分区
 *    空态 set-audit-empty（分区独立降级，P4b 三源先例）。
 * ④ i18n 全部进 v2.settings.* 新树（不引用 settings.* 与 route.*、common.* 旧树）；
 *    v2.page.settings（routing 断言）/ v2.nav.settings（LayoutV2 断言）两 key 在
 *    v2.settings 树之外。
 * ⑤ vm 通道（jsdom 无法驱动 FcSelect/FcDatePicker/FcPagination 的交互面；旧页测试
 *    vm.* 同名随迁，ImportExport vm.statusOpts 先例）：页面 setup 需可经 wrapper.vm 访问
 *    form（四字段同一 reactive）/ auditPage / auditPageSize / auditAction / auditActor /
 *    auditRange / onAuditFilterChange / onAuditPageChange / auditTargetText /
 *    auditResultColor / formatChangeTime。
 *
 * ── testid 契约表（任务书全表 + ②③⑤ 标注的 T 裁决扩展）─────────────────────
 * 页面骨架: set-page / set-skeleton / set-error / set-retry
 * 分区导航: set-section-nav（.fc-tab × 4）；分区面板 set-section-general /
 *       set-section-dict / set-section-changes / set-section-audit
 * 站点表单: set-input-site_name / set-input-language / set-input-token_expiry_hours /
 *       set-input-refresh_expiry_days / set-submit / set-field-error-{field} /
 *       set-save-error
 * 脏离开: set-dirty-banner / set-leave-confirm（leave 弹确认走 useFcConfirm mock，
 *       testid 源码抽查）
 * 字典: set-dict-input / set-dict-submit / set-dict-table / set-dict-row-{n}（n=0 起
 *       index）/ set-dict-empty / set-dict-error
 * 变更流: set-changes-refresh / set-changes-list / set-change-{n}（n=0 起 index）/
 *       set-change-type-{type} / set-changes-empty / set-changes-unavailable
 * 审计: set-audit-filters / set-audit-filter-action / set-audit-filter-actor /
 *       set-audit-filter-range / set-audit-table / set-audit-row-{id} /
 *       set-audit-action-{action} / set-audit-result-{id} / set-audit-empty /
 *       set-audit-pagination（内为 FcPagination，分页交互经 findComponent emit change）
 * 反馈: set-toast-success / set-toast-error（DOM testid 由源码抽查钉住；行为断言走
 *       toast mock，P4d-2 先例）/ set-readonly-hint
 *
 * ── API mock 面（页面允许的 import 面 = @/api/misc 5 成员 + @/api/http 仅 mapFieldErrors）
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission（canEdit）、
 *   '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，P4a-2 先例）。
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
import { FcPagination } from '@/components'
import { formatDate } from '@/utils'

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
// 只替换 toast；Fc* 组件保留真实实现（P4a-2 先例）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import Settings from '@/views-v2/system/Settings.vue'


const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（P4a-2 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Settings.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

/** getConfig('system') 全字段响应（数字字段含 0 的变体见 falsy-zero 用例单独覆写） */
function systemConfig(over: Record<string, unknown> = {}) {
  return {
    site_name: 'My Gateway',
    language: 'zh-CN',
    token_expiry_hours: 6,
    refresh_expiry_days: 15,
    ...over
  }
}

/** dict 行：value/label 各一条防同文案混列 */
function defaultDict() {
  return [
    { value: 'MANUAL', label: '手动' },
    { value: 'AUTO', label: '自动' }
  ]
}

/** listChanges 行：route + plugin 各一（类型 tag 分叉），updated_at 覆盖 ISO 与秒级数字 */
function defaultChanges() {
  return [
    { name: 'route-a', type: 'route', status: 'PUBLISHED', config_version: '3', updated_at: '2026-01-15T02:00:00' },
    { name: 'plugin-x', type: 'plugin', status: 'CHANGING', config_version: '7', updated_at: 1768453200 }
  ]
}

type AuditOver = { id?: string; action?: string; target_type?: string; target_id?: string; target?: string; actor?: string; result?: string; created_at?: string | number }

/** audit 行：id 与 action 错位防错参；默认行 = 常规成功行（ISO 时间） */
function makeAudit(over: AuditOver = {}) {
  return {
    id: over.id ?? '9101',
    action: over.action ?? 'route.publish',
    target_type: over.target_type ?? 'ROUTE',
    target_id: over.target_id ?? '3001',
    target: over.target,
    actor: over.actor ?? 'admin',
    result: over.result ?? 'SUCCESS',
    created_at: over.created_at ?? '2026-01-15T02:30:00+00:00'
  }
}

/**
 * 默认审计页三行：
 *   9101 常规（target_type+target_id / SUCCESS / ISO 时间）
 *   9102 草稿 target 兼容字段 + result FAILURE + actor 空（'-' 回落）+ created_at 空（'-'）
 *   9103 未知 result 词表外（gray 分支）
 * total='11' 字符串（Long→String 契约，Number() 兜底用例）
 */
function defaultAuditPage() {
  return {
    records: [
      makeAudit(),
      makeAudit({ id: '9102', action: 'user.resetPassword', target_type: undefined, target_id: undefined, target: 'USER:8001', actor: '', result: 'FAIL', created_at: '' }),
      makeAudit({ id: '9103', action: 'role.update', target_type: 'ROLE', target_id: '7001', result: 'WEIRD_MODE' })
    ],
    total: '11', size: 20, current: 1, pages: 1
  }
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router; i18n: I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false> }> {
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
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"], textarea[data-testid="${tid}"]`)
/** 切分区：set-section-nav 内 .fc-tab 按文案定位（SDK tabs prop 无 testid 通道，ImportExport 先例） */
async function openSection(w: VueWrapper<any>, label: string) {
  const tab = one(w, 'set-section-nav').findAll('.fc-tab').find((b) => b.text().includes(label))
  expect(tab, `缺少分区 Tab「${label}」`).toBeDefined()
  await tab!.trigger('click')
  await flushPromises()
}
const vm = (w: VueWrapper<any>) => w.vm as any
// ═══ [block2 完，fixtures/beforeEach 续写于下方] ═══

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.removeItem('gw4j_lang')
  mocks.getConfig.mockReset().mockResolvedValue(systemConfig())
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.getDict.mockReset().mockResolvedValue(defaultDict())
  mocks.listChanges.mockReset().mockResolvedValue(defaultChanges())
  mocks.listAuditLogs.mockReset().mockResolvedValue(defaultAuditPage())
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'tabGeneral', 'tabDict', 'tabChanges', 'tabAudit',
  'fSiteName', 'fLanguage', 'fTokenExpiry', 'fRefreshExpiry',
  'save', 'saveSuccess', 'saveFailed', 'loadFailed',
  'ruleTokenExpiryRange', 'ruleRefreshExpiryRange',
  'dirtyBanner', 'unsavedChanges',
  'dictPlaceholder', 'dictQuery', 'dictValue', 'dictLabel',
  'changeTime', 'changeType', 'changeName', 'changeVersion',
  'changeTypePlugin', 'changeTypeRoute',
  'statusDraft', 'statusPublished', 'statusChanging', 'statusOffline',
  'colTime', 'colAction', 'colActor', 'colTarget', 'colResult',
  'auditActionAll', 'auditActor', 'auditRange',
  'auditEmpty', 'changesEmpty', 'changesUnavailable', 'readonlyHint'
].map((k) => `v2.settings.${k}`)

describe('P4d-3 — i18n key 全表双语存在（铁律 6，v2.settings.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 初始加载：四分区 + 四态 ────────────────────────────────────────────────
describe('P4d-3 — 初始加载（四接口各一次 / 分区导航 / 骨架 / 回填与默认值）', () => {
  it('挂载四接口各调一次：getConfig(\'system\') + getDict(\'ROUTE_TYPE\') + listChanges(50) + listAuditLogs({page:1,pageSize:20})（audit 默认空筛选不带 action/actor/from/to 实键）', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'set-page', '页面根').exists()).toBe(true)
    expect(mocks.getConfig).toHaveBeenCalledTimes(1)
    expect(mocks.getConfig).toHaveBeenCalledWith('system')
    expect(mocks.getDict).toHaveBeenCalledTimes(1)
    expect(mocks.getDict).toHaveBeenCalledWith('ROUTE_TYPE')
    expect(mocks.listChanges).toHaveBeenCalledTimes(1)
    expect(mocks.listChanges).toHaveBeenCalledWith(50)
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
  })

  it('getConfig 挂起 → set-skeleton 渲染且站点表单/页级错误条不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.getConfig.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const { wrapper } = await factory()
    expect(need(wrapper, 'set-skeleton', '加载骨架').exists()).toBe(true)
    expect(one(wrapper, 'set-input-site_name').exists()).toBe(false)
    expect(one(wrapper, 'set-error').exists()).toBe(false)
    resolveLoad(systemConfig())
    await flushPromises()
    expect(one(wrapper, 'set-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'set-input-site_name').exists()).toBe(true)
  })

  it('分区导航四处齐全且默认激活 general；分区面板 set-section-* 落位', async () => {
    const { wrapper } = await factory()
    const tabs = one(wrapper, 'set-section-nav').findAll('.fc-tab')
    expect(tabs.length, '四个分区 Tab（站点/字典/变更/审计）').toBe(4)
    expect(tabs[0].text()).toBe(t('v2.settings.tabGeneral'))
    expect(one(wrapper, 'set-section-general').exists()).toBe(true)
    for (const label of [t('v2.settings.tabDict'), t('v2.settings.tabChanges'), t('v2.settings.tabAudit')]) {
      await openSection(wrapper, label)
    }
    expect(one(wrapper, 'set-section-dict').exists()).toBe(true)
    expect(one(wrapper, 'set-section-changes').exists()).toBe(true)
    expect(one(wrapper, 'set-section-audit').exists()).toBe(true)
  })

  it('表单回填：getConfig 四字段逐一注入对应输入（site_name/language/token_expiry_hours/refresh_expiry_days）', async () => {
    const { wrapper } = await factory()
    expect(inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).toBeTruthy()
    expect((inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).value).toBe('My Gateway')
    expect((inputOf(wrapper, 'set-input-token_expiry_hours').element as HTMLInputElement).value).toBe('6')
    expect((inputOf(wrapper, 'set-input-refresh_expiry_days').element as HTMLInputElement).value).toBe('15')
    expect(vm(wrapper).form.language).toBe('zh-CN')
  })

  it('字段缺省回落旧页默认：site_name Gateway4j / language zh-CN / token_expiry_hours 2 / refresh_expiry_days 30（truthy/!=null 才注入）', async () => {
    mocks.getConfig.mockResolvedValue({})
    const { wrapper } = await factory()
    expect((inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).value).toBe('Gateway4j')
    expect(vm(wrapper).form.language).toBe('zh-CN')
    expect((inputOf(wrapper, 'set-input-token_expiry_hours').element as HTMLInputElement).value).toBe('2')
    expect((inputOf(wrapper, 'set-input-refresh_expiry_days').element as HTMLInputElement).value).toBe('30')
  })

  it('falsy-zero：数字字段 0 是合法值（!= null 注入，不得被 truthy 检查吞掉）', async () => {
    mocks.getConfig.mockResolvedValue(systemConfig({ token_expiry_hours: 0, refresh_expiry_days: 0 }))
    const { wrapper } = await factory()
    expect((inputOf(wrapper, 'set-input-token_expiry_hours').element as HTMLInputElement).value).toBe('0')
    expect((inputOf(wrapper, 'set-input-refresh_expiry_days').element as HTMLInputElement).value).toBe('0')
  })
})

// ── 竞态 + 页级失败重试 ──────────────────────────────────────────────────
describe('P4d-3 — loadEpoch 竞态 / getConfig 失败 / 重试', () => {
  it('loadEpoch 竞态守卫（旧页同款机制名）：重试重入后陈旧拒绝不复活错误条、陈旧成功响应不覆写新值', async () => {
    let rejectStale!: (e: unknown) => void
    let resolveStale!: (v: unknown) => void
    mocks.getConfig
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectStale = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveStale = r }))
      .mockResolvedValueOnce(systemConfig({ site_name: 'Fresh Gateway' }))
    const { wrapper } = await factory()
    expect(need(wrapper, 'set-error', '首轮失败错误条').exists()).toBe(true)
    await need(wrapper, 'set-retry', '第一次重试（慢挂起）').trigger('click')
    await flushPromises()
    await need(wrapper, 'set-retry', '第二次重试（新值立回）').trigger('click')
    await flushPromises()
    expect((inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).value).toBe('Fresh Gateway')
    resolveStale(systemConfig({ site_name: 'Stale Gateway' }))
    await flushPromises()
    expect((inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).value, '陈旧成功响应后到不得覆写').toBe('Fresh Gateway')
    rejectStale(new Error('stale-arrives-late'))
    await flushPromises()
    expect(one(wrapper, 'set-error').exists(), '陈旧拒绝后到不得复活错误条').toBe(false)
  })

  it("getConfig reject → set-error（loadFailed + e.message）+ set-retry；点击重试成功后错误条退场、表单回填", async () => {
    mocks.getConfig.mockRejectedValue(new Error('cfg down'))
    const { wrapper } = await factory()
    const err = need(wrapper, 'set-error', '页级错误条')
    expect(err.text()).toContain(t('v2.settings.loadFailed'))
    expect(err.text()).toContain('cfg down')
    expect(one(wrapper, 'set-input-site_name').exists()).toBe(false)
    mocks.getConfig.mockResolvedValue(systemConfig())
    await need(wrapper, 'set-retry', '重试钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'set-error').exists()).toBe(false)
    expect((inputOf(wrapper, 'set-input-site_name').element as HTMLInputElement).value).toBe('My Gateway')
  })
})
// ═══ [block3 完，保存/校验 describe 续写于下方] ═══

// ── 保存：payload / 防重 / 反馈 ──────────────────────────────────────────
describe('P4d-3 — 保存（payload 形态 / 双击防重 / 成功反馈与脏态清除）', () => {
  it('set-submit → saveConfig(\'system\', 四字段全量 snake_case payload)（分区合并后单次全字段，API 形态照旧）', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'set-input-site_name').setValue('Renamed Gateway')
    await inputOf(wrapper, 'set-input-token_expiry_hours').setValue('4')
    await need(wrapper, 'set-submit', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1)
    expect(mocks.saveConfig).toHaveBeenCalledWith('system', {
      site_name: 'Renamed Gateway',
      language: 'zh-CN',
      token_expiry_hours: 4,
      refresh_expiry_days: 15
    })
  })

  it('双击防重：saveConfig 挂起期间再点 set-submit 不重入（saving gate，旧页三重 gate 随迁）', async () => {
    let resolveSave!: (v: unknown) => void
    mocks.saveConfig.mockImplementation(() => new Promise((r) => { resolveSave = r }))
    const { wrapper } = await factory()
    await need(wrapper, 'set-submit', '第一次点击').trigger('click')
    await need(wrapper, 'set-submit', '第二次点击（仍在飞）').trigger('click')
    resolveSave({})
    await flushPromises()
    expect(mocks.saveConfig, '挂起期间的第二次点击不得发出第二次保存').toHaveBeenCalledTimes(1)
  })

  it('保存成功 → toast.success(saveSuccess) + set-dirty-banner 退场（dirty=false 随迁）+ 无错误条', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'set-input-site_name').setValue('Dirty Edit')
    expect(need(wrapper, 'set-dirty-banner', '脏态横幅').exists()).toBe(true)
    await need(wrapper, 'set-submit', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.settings.saveSuccess'))
    expect(one(wrapper, 'set-dirty-banner').exists(), '成功后脏态横幅必须退场').toBe(false)
    expect(one(wrapper, 'set-save-error').exists()).toBe(false)
  })

  it('保存失败（非字段错）→ set-save-error（saveFailed + e.message）+ toast.error + 无成功 toast', async () => {
    mocks.saveConfig.mockRejectedValue(new Error('locked'))
    const { wrapper } = await factory()
    await need(wrapper, 'set-submit', '保存钮').trigger('click')
    await flushPromises()
    const err = need(wrapper, 'set-save-error', '保存错误条')
    expect(err.text()).toContain(t('v2.settings.saveFailed'))
    expect(err.text()).toContain('locked')
    expect(mocks.toast.error).toHaveBeenCalled()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it('保存失败（字段错）→ mapFieldErrors 逐字段注入 set-field-error-{field}（客户端校验与服务端共用通道，P4d-1 先例）', async () => {
    mocks.mapFieldErrors.mockReturnValue({ site_name: '站点名过长' })
    mocks.saveConfig.mockRejectedValue(new Error('400'))
    const { wrapper } = await factory()
    await need(wrapper, 'set-submit', '保存钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'set-field-error-site_name', '字段错误位').text()).toContain('站点名过长')
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("语言切换随保存生效：form.language='en-US' → 保存成功后 i18n locale=en-US + localStorage['gw4j_lang']='en-US'（旧页 lang-switch 随迁）", async () => {
    const { wrapper, i18n } = await factory()
    vm(wrapper).form.language = 'en-US'
    await need(wrapper, 'set-submit', '保存钮').trigger('click')
    await flushPromises()
    expect((i18n.global.locale as { value: string }).value).toBe('en-US')
    expect(localStorage.getItem('gw4j_lang')).toBe('en-US')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.settings.saveSuccess'))
  })

  it('加载挂起期间无 set-submit 可点（loading gate：表单区未渲染即无保存入口）；只读态（canEdit=false）set-submit 退场 + set-readonly-hint 渲染 + 表单可看', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.getConfig.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const pending = await factory()
    expect(one(pending.wrapper, 'set-submit').exists(), '骨架期不得出现保存入口').toBe(false)
    expect(one(pending.wrapper, 'set-save-error').exists()).toBe(false)
    resolveLoad(systemConfig())
    await flushPromises()
    expect(one(pending.wrapper, 'set-submit').exists()).toBe(true)
    mocks.canEdit.mockReturnValue(false)
    const readonly = await factory()
    expect(need(readonly.wrapper, 'set-readonly-hint', '只读提示').text()).toContain(t('v2.settings.readonlyHint'))
    expect(one(readonly.wrapper, 'set-submit').exists(), '只读态保存钮退场').toBe(false)
    expect(one(readonly.wrapper, 'set-input-site_name').exists(), '只读可看表单').toBe(true)
  })
})

// ── 客户端校验 / maxlength / 数字输入 ─────────────────────────────────────
describe('P4d-3 — 客户端校验（1-720 / 1-365）与 maxlength', () => {
  it('token_expiry_hours 输 0 或 721 → blur 触发 set-field-error-token_expiry_hours（ruleTokenExpiryRange）；回落合法值 2 错误清除', async () => {
    const { wrapper } = await factory()
    const input = inputOf(wrapper, 'set-input-token_expiry_hours')
    await input.setValue('0')
    await input.trigger('blur')
    await flushPromises()
    expect(need(wrapper, 'set-field-error-token_expiry_hours', '0 值错误位').text())
      .toContain(t('v2.settings.ruleTokenExpiryRange'))
    await input.setValue('721')
    await input.trigger('blur')
    await flushPromises()
    expect(one(wrapper, 'set-field-error-token_expiry_hours').exists()).toBe(true)
    await input.setValue('2')
    await input.trigger('blur')
    await flushPromises()
    expect(one(wrapper, 'set-field-error-token_expiry_hours').exists(), '合法值错误清除').toBe(false)
  })

  it('refresh_expiry_days 输 0 → blur 触发 set-field-error-refresh_expiry_days（ruleRefreshExpiryRange）', async () => {
    const { wrapper } = await factory()
    const input = inputOf(wrapper, 'set-input-refresh_expiry_days')
    await input.setValue('0')
    await input.trigger('blur')
    await flushPromises()
    expect(need(wrapper, 'set-field-error-refresh_expiry_days', '0 值错误位').text())
      .toContain(t('v2.settings.ruleRefreshExpiryRange'))
  })

  it('源码契约：数字字段走 FcInputNumber（min1/max8760 与 min1/max365）+ site_name maxlength=50 + 数字注入 != null（falsy-zero 源头）', () => {
    const source = readSource()
    expect(source).toMatch(/FcInputNumber/)
    expect(source).toMatch(/min=\{?1[,\s]*max=\{?8760|:min="1"/)
    expect(source).toMatch(/8760/)
    expect(source).toMatch(/365/)
    expect(readTemplate()).toMatch(/maxlength/)
    expect(source).toMatch(/maxlength\s*=\s*["'{]*50/)
    expect(source).toMatch(/token_expiry_hours\s*!=\s*null/)
    expect(source).toMatch(/refresh_expiry_days\s*!=\s*null/)
  })
})
// ═══ [block4 完，脏离开/dict/changes 续写于下方] ═══

// ── 脏离开 ────────────────────────────────────────────────────────────────
describe('P4d-3 — 脏态与离开拦截（onBeforeRouteLeave + confirm danger）', () => {
  it('载入完成未编辑 → set-dirty-banner 不渲染（dirtyTracking 载入后才开，程序化回填不算脏）；编辑后横幅出现', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'set-dirty-banner').exists(), '干净态不得有脏横幅').toBe(false)
    await inputOf(wrapper, 'set-input-site_name').setValue('Edited')
    await flushPromises()
    expect(need(wrapper, 'set-dirty-banner', '编辑后脏横幅').exists()).toBe(true)
  })

  it('脏态离开 → confirm({variant:\'danger\'}) 拦截；取消（false）留在 /v2/settings，确认（true）放行离开', async () => {
    const { wrapper, router } = await factory()
    await inputOf(wrapper, 'set-input-site_name').setValue('Edited')
    mocks.fcConfirm.mockResolvedValueOnce(false)
    await router.push('/v2/nowhere')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger', title: t('v2.settings.unsavedChanges') }))
    expect(router.currentRoute.value.path, '取消离开须留在原页').toBe('/v2/settings')
    mocks.fcConfirm.mockResolvedValueOnce(true)
    await router.push('/v2/nowhere')
    await flushPromises()
    expect(router.currentRoute.value.path, '确认后放行离开').toBe('/v2/nowhere')
  })

  it('未编辑离开 → 不弹 confirm 直接放行（零脏零打扰）', async () => {
    const { wrapper, router } = await factory()
    await router.push('/v2/nowhere')
    await flushPromises()
    expect(mocks.fcConfirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/nowhere')
  })
})

// ── 字典分区 ─────────────────────────────────────────────────────────────
describe('P4d-3 — dict 分区（默认 ROUTE_TYPE / 空 code 早退 / 降级 / 空态 / loading）', () => {
  it('挂载查询渲染 set-dict-row-* 且 value/label 列头 i18n（dictValue/dictLabel）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabDict'))
    expect(need(wrapper, 'set-dict-table', '字典表').exists()).toBe(true)
    expect(one(wrapper, 'set-dict-table').text()).toContain(t('v2.settings.dictValue'))
    expect(one(wrapper, 'set-dict-table').text()).toContain(t('v2.settings.dictLabel'))
    expect(need(wrapper, 'set-dict-row-0', '第一行').text()).toContain('MANUAL')
    expect(need(wrapper, 'set-dict-row-1', '第二行').text()).toContain('自动')
    expect((inputOf(wrapper, 'set-dict-input').element as HTMLInputElement).value).toBe('ROUTE_TYPE')
  })

  it('空 code 点 set-dict-submit 早退不调 API（旧 loadDict 空值防护随迁）；改 code 再查按新 code 调 getDict', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabDict'))
    mocks.getDict.mockClear()
    await inputOf(wrapper, 'set-dict-input').setValue('')
    await need(wrapper, 'set-dict-submit', '查询钮').trigger('click')
    await flushPromises()
    expect(mocks.getDict, '空 code 不得发起请求').not.toHaveBeenCalled()
    await inputOf(wrapper, 'set-dict-input').setValue('STATUS')
    await need(wrapper, 'set-dict-submit', '查询钮').trigger('click')
    await flushPromises()
    expect(mocks.getDict).toHaveBeenCalledTimes(1)
    expect(mocks.getDict).toHaveBeenCalledWith('STATUS')
  })

  it('getDict 失败 → set-dict-error（loadFailed + e.message）+ 旧行清空不崩页；再查成功恢复并清 stale 错误', async () => {
    mocks.getDict.mockRejectedValueOnce(new Error('dict down'))
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabDict'))
    const err = need(wrapper, 'set-dict-error', '字典错误条')
    expect(err.text()).toContain(t('v2.settings.loadFailed'))
    expect(err.text()).toContain('dict down')
    expect(one(wrapper, 'set-dict-row-0').exists(), '失败后旧行清空').toBe(false)
    mocks.getDict.mockResolvedValueOnce(defaultDict())
    await need(wrapper, 'set-dict-submit', '重查钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'set-dict-error').exists()).toBe(false)
    expect(need(wrapper, 'set-dict-row-0', '恢复行').exists()).toBe(true)
  })

  it('真·空字典（成功 + 空数组）→ set-dict-empty 空态（非错误）', async () => {
    mocks.getDict.mockResolvedValue([])
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabDict'))
    expect(need(wrapper, 'set-dict-empty', '空态').exists()).toBe(true)
    expect(one(wrapper, 'set-dict-error').exists()).toBe(false)
  })

  it('dictLoading：getDict 挂起期间 set-dict-submit 进入 loading/disabled 态，resolve 后退出', async () => {
    let resolveDict!: (v: unknown) => void
    mocks.getDict.mockImplementation(() => new Promise((r) => { resolveDict = r }))
    const { wrapper } = await factory()
    const busy = need(wrapper, 'set-dict-submit', '查询钮')
    expect(busy.classes().some((c) => c.includes('loading')) || busy.attributes('disabled') !== undefined, '挂起期查询钮 loading/disabled').toBe(true)
    resolveDict(defaultDict())
    await flushPromises()
    const idle = need(wrapper, 'set-dict-submit', '查询钮')
    expect(idle.classes().some((c) => c.includes('loading')) || idle.attributes('disabled') !== undefined).toBe(false)
  })
})

// ── 变更流分区 ───────────────────────────────────────────────────────────
describe('P4d-3 — changes 分区（listChanges(50) 渲染 / 状态 i18n / 降级 / 刷新恢复 / 空态）', () => {
  it('两行渲染 set-change-{index}（0 起）+ 五列头 i18n（时间/类型/名称/版本）；版本格原文', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    const list = need(wrapper, 'set-changes-list', '变更列表')
    for (const key of ['changeTime', 'changeType', 'changeName', 'changeVersion']) {
      expect(list.text(), `列头 ${key}`).toContain(t(`v2.settings.${key}`))
    }
    expect(need(wrapper, 'set-change-0', '第一行').text()).toContain('route-a')
    expect(need(wrapper, 'set-change-1', '第二行').text()).toContain('plugin-x')
    expect(need(wrapper, 'set-change-0', '版本格').text()).toContain('3')
  })

  it('类型 tag：plugin → set-change-type-plugin + changeTypePlugin 文案；route → changeTypeRoute（不裸枚举）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    expect(need(wrapper, 'set-change-type-plugin', 'plugin tag').text()).toContain(t('v2.settings.changeTypePlugin'))
    expect(need(wrapper, 'set-change-type-route', 'route tag').text()).toContain(t('v2.settings.changeTypeRoute'))
  })

  it('状态列 i18n 映射：PUBLISHED → statusPublished / CHANGING → statusChanging 文案（未知值裸枚举回落）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    const list = need(wrapper, 'set-changes-list', '变更列表')
    expect(list.text()).toContain(t('v2.settings.statusPublished'))
    expect(list.text()).toContain(t('v2.settings.statusChanging'))
  })

  it('listChanges 失败 → set-changes-unavailable 不可用空态（不崩页，分区独立降级不回退 audit）', async () => {
    mocks.listChanges.mockRejectedValue(new Error('changes down'))
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    expect(need(wrapper, 'set-changes-unavailable', '不可用空态').exists()).toBe(true)
    expect(one(wrapper, 'set-changes-list').exists()).toBe(false)
    expect(mocks.listAuditLogs, 'changes 降级不得波及 audit 分区').toHaveBeenCalledTimes(1)
  })

  it('set-changes-refresh 重拉：从不可用态恢复渲染（旧刷新恢复语义随迁）', async () => {
    mocks.listChanges.mockRejectedValueOnce(new Error('changes down'))
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    expect(one(wrapper, 'set-changes-unavailable').exists()).toBe(true)
    await need(wrapper, 'set-changes-refresh', '刷新钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'set-changes-unavailable').exists()).toBe(false)
    expect(need(wrapper, 'set-change-0', '恢复行').exists()).toBe(true)
    expect(mocks.listChanges).toHaveBeenCalledTimes(2)
    expect(mocks.listChanges).toHaveBeenLastCalledWith(50)
  })

  it('空数组 → set-changes-empty 空态（非错误）', async () => {
    mocks.listChanges.mockResolvedValue([])
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabChanges'))
    expect(need(wrapper, 'set-changes-empty', '空态').exists()).toBe(true)
    expect(one(wrapper, 'set-changes-unavailable').exists()).toBe(false)
  })
})
// ═══ [block5 完，audit/权限/源码契约 续写于下方] ═══

// ── 审计分区 ─────────────────────────────────────────────────────────────
describe('P4d-3 — audit 分区（行渲染 / +8h 债不订正 / 分页 / 筛选 / 空态）', () => {
  it('三行渲染 set-audit-row-{id}：action testid、actor 空 → \'-\'、target 组合（target_type+target_id / 草稿 target 兼容 / 全空 \'-\'）、result tag', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    expect(need(wrapper, 'set-audit-table', '审计表').exists()).toBe(true)
    const row1 = need(wrapper, 'set-audit-row-9101', '常规行')
    expect(one(row1, 'set-audit-action-route.publish').exists()).toBe(true)
    expect(row1.text()).toContain('ROUTE:3001')
    expect(row1.text()).toContain('admin')
    expect(one(row1, 'set-audit-result-9101').exists()).toBe(true)
    const row2 = need(wrapper, 'set-audit-row-9102', '草稿 target 行')
    expect(row2.text()).toContain('USER:8001')
    expect(row2.text()).toContain('-')
    const row3 = need(wrapper, 'set-audit-row-9103', '词表外 result 行')
    expect(one(row3, 'set-audit-result-9103').text()).toContain('WEIRD_MODE')
  })

  it('时间列 +8h 债显示原样（契约：不得造订正逻辑）——created_at ISO 直解渲染，禁 28800/8*3600 常数', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    const iso = '2026-01-15T02:30:00+00:00'
    const expected = formatDate(new Date(Date.parse(iso)))
    expect(expected, '前置：期望值须为可读时间串').not.toBe('-')
    expect(need(wrapper, 'set-audit-row-9101', '时间格行').text(), '时间格必须直渲返回值（同式复算），+8h 订正会错位').toContain(expected)
    expect(one(wrapper, 'set-audit-row-9102').text(), 'created_at 空 → \'-\'').toContain('-')
    expect(readSource()).not.toMatch(/28800|8\s*\*\s*3600|8\s*\*\s*60\s*\*\s*60/)
  })

  it('时间辅助同式（旧 formatChangeTime 语义随迁）：秒级数字 ×1000、NaN 原样、空 \'-\'（vm 通道直证）', async () => {
    const { wrapper } = await factory()
    const v = vm(wrapper)
    expect(typeof v.formatChangeTime).toBe('function')
    expect(v.formatChangeTime('2026-01-15T02:30:00+00:00')).toBe(formatDate(new Date(Date.parse('2026-01-15T02:30:00+00:00'))))
    expect(v.formatChangeTime(1768453200)).toBe(formatDate(new Date(1768453200 * 1000)))
    expect(v.formatChangeTime('not-a-date')).toBe('not-a-date')
    expect(v.formatChangeTime('')).toBe('-')
    expect(v.formatChangeTime(undefined)).toBe('-')
  })

  it('对象列辅助（旧 auditTargetText 随迁）：组合 / 草稿 target / 全空 \'-\'；结果着色词表（vm 通道）', async () => {
    const { wrapper } = await factory()
    const v = vm(wrapper)
    expect(v.auditTargetText({ target_type: 'ROUTE', target_id: 'r1' })).toBe('ROUTE:r1')
    expect(v.auditTargetText({ target: 'legacy-target' })).toBe('legacy-target')
    expect(v.auditTargetText({})).toBe('-')
    expect(v.auditResultColor('SUCCESS')).toBe('success')
    expect(v.auditResultColor('ok')).toBe('success')
    expect(v.auditResultColor('FAILURE')).toBe('danger')
    expect(v.auditResultColor('DENIED')).toBe('danger')
    expect(v.auditResultColor('WEIRD')).toBe('gray')
    expect(v.auditResultColor(undefined)).toBe('gray')
  })

  it('total Long→String 兜底：total=\'11\'（字符串）→ set-audit-pagination 按 11 渲染（Number() 直转非字符串拼接）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    expect(need(wrapper, 'set-audit-pagination', '分页容器').text()).toContain('11')
    expect(vm(wrapper).auditTotal, 'auditTotal 须为数字 11').toBe(11)
  })

  it('翻页：FcPagination change(2,50) → listAuditLogs({page:2,pageSize:50}) 重拉（vm.onAuditPageChange 同参序随迁）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    mocks.listAuditLogs.mockClear()
    one(wrapper, 'set-audit-pagination').findComponent(FcPagination).vm.$emit('change', 2, 50)
    await flushPromises()
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 2, pageSize: 50 })
    expect(vm(wrapper).auditPage).toBe(2)
    expect(vm(wrapper).auditPageSize).toBe(50)
  })

  it('筛选：vm.auditAction/auditActor（含 trim）→ onAuditFilterChange 重置回第 1 页并透传参数；筛选容器与三筛选位落位', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    expect(need(wrapper, 'set-audit-filters', '筛选条').exists()).toBe(true)
    expect(one(wrapper, 'set-audit-filter-action').exists()).toBe(true)
    expect(one(wrapper, 'set-audit-filter-actor').exists()).toBe(true)
    expect(one(wrapper, 'set-audit-filter-range').exists()).toBe(true)
    mocks.listAuditLogs.mockClear()
    const v = vm(wrapper)
    v.auditPage = 3
    v.auditAction = 'route.publish'
    v.auditActor = ' admin '
    v.onAuditFilterChange()
    await flushPromises()
    expect(v.auditPage, '筛选变化重置回第 1 页').toBe(1)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20, action: 'route.publish', actor: 'admin' })
  })

  it('时间范围 from/to 原样透传（后端 parseTimeBound 可解析形态，不加工）', async () => {
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    mocks.listAuditLogs.mockClear()
    const v = vm(wrapper)
    v.auditRange = ['2026-10-01T00:00:00', '2026-10-29T23:59:59']
    v.onAuditFilterChange()
    await flushPromises()
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({
      page: 1, pageSize: 20,
      from: '2026-10-01T00:00:00', to: '2026-10-29T23:59:59'
    })
  })

  it('空页 → set-audit-empty 空态（auditEmpty 文案，非崩页）；表与分页在', async () => {
    mocks.listAuditLogs.mockResolvedValue({ records: [], total: 0, size: 20, current: 1, pages: 0 })
    const { wrapper } = await factory()
    await openSection(wrapper, t('v2.settings.tabAudit'))
    expect(need(wrapper, 'set-audit-empty', '空态').text()).toContain(t('v2.settings.auditEmpty'))
    expect(one(wrapper, 'set-audit-table').exists()).toBe(true)
  })
})

// ── 权限门禁 ─────────────────────────────────────────────────────────────
describe('P4d-3 — 权限门禁（canEdit(\'system\')，旧页权限码字面随迁）', () => {
  it('canEdit=false → set-readonly-hint 渲染 + set-submit 退场 + 各分区只读可看', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(need(wrapper, 'set-readonly-hint', '只读提示').text()).toContain(t('v2.settings.readonlyHint'))
    expect(one(wrapper, 'set-submit').exists()).toBe(false)
    await openSection(wrapper, t('v2.settings.tabAudit'))
    expect(need(wrapper, 'set-audit-table', '审计表只读可见').exists()).toBe(true)
  })

  it('门禁作用域源码契约：canEdit 仅以 system 为参（等价旧 hasPermission，不得放宽/收窄）', () => {
    expect(readSource()).toMatch(/canEdit\(\s*['"]system['"]\s*\)/)
    expect(readSource()).toMatch(/saving/)
  })
})

// ── SDK-only 源码契约 ────────────────────────────────────────────────────
describe('P4d-3 — SDK-only 源码契约（P4d-1/2 先例）', () => {
  it('无 <el- 直用（Fc 原子封装）；template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/misc 仅 5 分区成员；@/api/http 仅 mapFieldErrors；不 import element-plus / 旧树 @/views / @/api/auth", () => {
    const source = readSource()
    const miscBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/misc'/)?.[0] ?? ''
    expect(miscBlock, '页面需从 @/api/misc 具名导入').toBeTruthy()
    for (const allowed of ['getDict', 'getConfig', 'saveConfig', 'listChanges', 'listAuditLogs']) {
      expect(miscBlock, `缺少分区成员 ${allowed}`).toContain(allowed)
    }
    for (const banned of ['listUsers', 'createUser', 'updateUser', 'deleteUser', 'resetPassword', 'listRouteStatus', 'getRouteMetrics', 'getTopology']) {
      expect(miscBlock, `禁用成员 ${banned} 出现在 @/api/misc import 面`).not.toContain(banned)
    }
    const httpBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/http'/)?.[0] ?? ''
    expect(httpBlock, '页面需从 @/api/http 具名导入 mapFieldErrors').toContain('mapFieldErrors')
    expect(source, 'SDK-only：页面不得直引 element-plus').not.toMatch(/from\s+'element-plus'/)
    expect(source, '禁止 import 旧树 @/views（新旧树隔离铁律）').not.toMatch(/from\s+'@\/views\//)
    expect(source, '系统三件套分工：设置页不得 import @/api/auth（用户/角色归 Users/Roles 页）').not.toMatch(/from\s+'@\/api\/auth'/)
  })

  it('脏离开机制源码：onBeforeRouteLeave 从 vue-router 导入（旧页钉过「非 vue」）+ loadEpoch 竞态守卫在源 + dirtyTracking 载入后开', () => {
    const source = readSource()
    expect(source).toMatch(/import\s*\{[^}]*onBeforeRouteLeave[^}]*\}\s*from\s*'vue-router'/)
    expect(source).toMatch(/loadEpoch/)
    expect(source).toMatch(/dirtyTracking/)
    expect(source).toMatch(/dirty\.value\s*=\s*false/)
  })

  it('关键 testid 全数在源码落位（契约表抽查：骨架/错误/重试/分区/表单/脏/字典/变更/审计/反馈/只读）', () => {
    const source = readSource()
    for (const tid of [
      'set-page', 'set-skeleton', 'set-error', 'set-retry',
      'set-section-nav', 'set-section-general', 'set-section-dict', 'set-section-changes', 'set-section-audit',
      'set-input-site_name', 'set-input-language', 'set-input-token_expiry_hours', 'set-input-refresh_expiry_days',
      'set-submit', 'set-field-error-', 'set-save-error',
      'set-dirty-banner', 'set-leave-confirm',
      'set-dict-input', 'set-dict-submit', 'set-dict-table', 'set-dict-row-', 'set-dict-empty', 'set-dict-error',
      'set-changes-refresh', 'set-changes-list', 'set-change-', 'set-change-type-', 'set-changes-empty', 'set-changes-unavailable',
      'set-audit-filters', 'set-audit-filter-action', 'set-audit-filter-actor', 'set-audit-filter-range',
      'set-audit-table', 'set-audit-row-', 'set-audit-action-', 'set-audit-result-', 'set-audit-empty', 'set-audit-pagination',
      'set-toast-success', 'set-toast-error', 'set-readonly-hint'
    ]) {
      expect(source).toContain(tid)
    }
  })

  it('375 防溢出源码契约：宽表（audit/changes）外层横滚容器 .set-table-scroll + overflow-x:auto（Hallmark 375 无页面级横向溢出，V 轮 P1 回归钉；样式 token-only 沿 rol/usr-table-scroll 先例）', () => {
    const source = readSource()
    expect(source, '横滚容器样式（min-width:0 + overflow-x:auto）须在源').toMatch(/\.set-table-scroll\s*\{[^}]*overflow-x:\s*auto/)
    const template = readTemplate()
    for (const tid of ['set-audit-table', 'set-changes-list']) {
      const at = template.indexOf(`data-testid="${tid}"`)
      expect(at, `未找到 ${tid}`).toBeGreaterThan(-1)
      const before = template.slice(Math.max(0, at - 240), at)
      expect(before, `${tid} 外层须包 .set-table-scroll 横滚容器（表格不得裸奔在分区面板）`).toContain('set-table-scroll')
    }
    // 日期范围控件窄视口可收缩（EP daterange 固有宽 370px 会顶破 375：definite flex-basis
    // 破除内容固有宽链 + width:100% 覆盖 var(--el-date-editor-daterange-width)，V 轮收口钉）
    expect(source, 'range 筛选位须带 set-field--range 收缩类').toMatch(/set-field--range/)
    expect(source, 'label definite flex-basis（脱离固有宽链）').toMatch(/\.set-field--range\s*\{[^}]*flex:\s*1 1 240px/)
    expect(source, 'picker width:100% 覆盖 EP 固有宽').toMatch(/\.set-field--range :deep\(\.el-date-editor--daterange\)\s*\{[^}]*width:\s*100%/)
    expect(template, 'range label class 与 testid 同元素落位').toMatch(/set-field--range[^>]*data-testid="set-audit-filter-range"/)
  })
})
