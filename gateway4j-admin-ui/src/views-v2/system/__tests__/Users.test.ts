/**
 * P4d-1-T：v2 用户管理页测试 —— 契约 docs/ui-v2/实施契约.md §4.5 P4d（L78）。
 * （/v2/users，name V2Users，permission system:user；旧 src/views/users/List.vue 等价迁移；
 * 2026-11-09）。先红是预期：页面由 P4d-1-C 实现（当前 src/views-v2/system/Users.vue 不存在，
 * RED 形态 = Failed to resolve import，vitest 与 vue-tsc(TS2307) 同理，合规先红）。
 *
 * ── 旧页语义权威（src/views/users/List.vue，逐字随迁点）────────────────────────
 * 默认 page=1/pageSize=20；keyword useDebounce 300ms；keyword 变 → page=1 + reload；
 * listUsers({page,pageSize,status?,keyword: debounced || undefined}) → r.records/r.total；
 * loadEpoch 竞态：++loadEpoch，旧响应 rows 与 loadError 都不写入、loading 不复位；
 * form 默认 { username:'', password:'', real_name:'', phone:'', role_codes:['ROLE_OPS'] }；
 * username 校验 required + /^[a-zA-Z0-9_]{2,30}$/；phone /^[1][3-9]\d{9}$/ 可空；
 * password 创建必填，编辑留空=不改（updateUser payload 不含 password 键）；
 * 角色选项 = listRoles() → {value: role_code, label: role_name}，失败降级空数组；
 * toggle 仅「禁用」方向 confirm(danger)；updateUser(id,{status}) 翻转 ENABLED↔DISABLED；
 * delete confirm → deleteUser(id)；reset 仅 newPwd 非空才 resetPassword(id,newPwd)；
 * toasts：saveSuccess/statusUpdateSuccess/deleteSuccess/resetSuccess；失败 actionError；
 * canEdit('user') 门禁：新建/行动作/提交；无权限显 readonly-hint；空态 usr-empty。
 *
 * ── v2 语义差异裁决（相对旧页，C 按此实现）───────────────────────────────────
 * ① 密码 maxlength=64（契约 §4.5 P4d 覆盖旧页的 100！其余 username=30（P3E 对齐
 *    pattern ^[a-zA-Z0-9_]{2,30}$，原 50 计数器误导）/real_name=50/phone=20）。
 * ② 新增 status 筛选（旧页只有 keyword；listUsers 已支持 status 透传 = v2 增量能力），
 *    筛选控件 = FcSegmented（plugins/List.vue P4a-2 先例）：全部(statusAll，'ALL' 哨兵 →
 *    参数 undefined 不透传)/启用/停用，切换重置 page=1。
 * ③ 表格 = 语义化 <table> + Fc 原子（P4a-2 先例；禁 el-table/FcTable —— 行级 testid 需挂载点）；
 *    行动作 = 行内平铺 FcButton（旧为 FcDropdown 下拉：语义表格无挂载点 + 可测性裁决）；
 *    四动作恒在（edit/toggle/reset-pw/delete，不再分状态显隐 —— 用户页旧语义即恒在）。
 * ④ 弹窗 = FcDialog（append-to-body=false 默认，测试可直接 find；两弹窗共用 usr-dialog testid）；
 *    校验错误与 mapFieldErrors 服务端字段错误共用 usr-field-error-{field} 通道。
 * ⑤ 动作失败错误条 usr-action-error（plg-action-error P4a-2 先例，T 裁决扩展 testid；
 *    role=alert，与列表并存，动作失败不清列表，下次动作成功清空）。
 * ⑥ i18n 全部进 v2.users.* 新树（不引用 user.* / common.* 旧树）+ v2.page.users / v2.nav.users
 *    两个非 users 树 key（在 src/router/v2.routing.test.ts P4d-1 追加段与 LayoutV2.test.ts 断言）。
 *
 * ── testid 契约表（任务书全表 + ⑤ 标注的 T 裁决扩展）──────────────────────────
 * 页面骨架: usr-page / usr-skeleton / usr-error / usr-retry / usr-empty
 * 搜索: usr-search / usr-status-filter
 * 表格: usr-table / usr-row-{id} / usr-cell-{field}-{id}（field=username/realname/phone/roles/status）
 * 分页: usr-pagination
 * 新建: usr-action-create + 弹窗 usr-dialog / usr-input-username / usr-input-realname /
 *       usr-input-phone / usr-input-password / usr-input-roles / usr-submit
 *       （重置弹窗复用 usr-dialog + usr-submit，密码输入 = usr-input-newpwd〔T 裁决扩展〕）
 * 行动作: usr-action-edit-{id} / usr-action-toggle-{id} / usr-action-reset-pw-{id} / usr-action-delete-{id}
 * 字段错误: usr-field-error-{field}（客户端校验与服务端 mapFieldErrors 共用通道）
 * 动作错误: usr-action-error（⑤）
 * 反馈: usr-toast-success / usr-toast-error（DOM testid 契约由源码抽查钉住；行为断言走 toast mock）
 * 只读: usr-readonly-hint
 *
 * ── API mock 面（页面允许的 import 面 = @/api/misc 5 成员 + @/api/auth listRoles）──
 * misc.ts 为聚合模块（dict/topology/audit/config 等同文件），vi.mock 整模块替换时只声明
 * 页面允许的 5 成员；禁用名单由 SDK-only 源码断言拦截 import 面（见文末源码契约段）。
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission（canEdit）、
 *   '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，P4a-2 先例）、
 *   '@/api/http' 仅替换 mapFieldErrors（importOriginal 保真 http 实例，字段错误确定性注入）。
 *   useDebounce 走真实实现（@/composables），防抖由 fake timers 行为化验证，不 mock。
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
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
  listRoles: vi.fn(),
  mapFieldErrors: vi.fn(() => ({}) as Record<string, string>),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/misc', () => ({
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
  updateUser: mocks.updateUser,
  deleteUser: mocks.deleteUser,
  resetPassword: mocks.resetPassword
}))
vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles
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

import Users from '@/views-v2/system/Users.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（P4a-2 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Users.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

type UserOver = {
  id?: string
  username?: string
  real_name?: string
  phone?: string
  role_codes?: string[]
  status?: 'ENABLED' | 'DISABLED'
}

/** listUsers 行：行主键 8001 ≠ username 'ops_alice'（错位防错参，P4a-2 同款） */
function makeUser(over: UserOver = {}) {
  return {
    id: over.id ?? '8001',
    username: over.username ?? 'ops_alice',
    real_name: over.real_name ?? '爱丽丝',
    phone: over.phone ?? '13800138000',
    role_codes: over.role_codes ?? ['ROLE_OPS'],
    status: over.status ?? ('ENABLED' as const)
  }
}

/** 默认三行：8001 ENABLED · 8002 DISABLED(viewer_bob) · 8003 ENABLED(双角色,无手机号) */
function defaultRows() {
  return [
    makeUser(),
    makeUser({ id: '8002', username: 'viewer_bob', real_name: '鲍勃', status: 'DISABLED' as const }),
    makeUser({ id: '8003', username: 'audit_carol', real_name: '卡罗尔', phone: '', role_codes: ['ROLE_OPS', 'ROLE_ADMIN'] })
  ]
}

/** Page<T> 形状（src/api/misc.ts listUsers 信封）；total 缺省 42 供分页透传断言 */
function pageOf(rows: ReturnType<typeof makeUser>[], total = 42) {
  return { records: rows, total, size: 20, current: 1, pages: 3 }
}

/** listRoles 选项源（旧语义：{value: role_code, label: role_name}） */
function defaultRoles() {
  return [
    { id: '1', role_code: 'ROLE_OPS', role_name: '运维' },
    { id: '2', role_code: 'ROLE_ADMIN', role_name: '管理员' }
  ]
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/v2/users', name: 'V2Users', component: Users as any }]
  })
  await router.push('/v2/users')
  await router.isReady()
  const wrapper = mount(Users, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
/** FcSegmented 选项：按 label 文案定位容器内按钮（P4a-2 先例） */
const segOption = (w: VueWrapper<any>, tid: string, label: string) =>
  one(w, tid).findAll('button').find((b) => b.text().includes(label))
const needSeg = (w: VueWrapper<any>, tid: string, label: string) => {
  const opt = segOption(w, tid, label)
  expect(opt, `「${tid}」内缺少选项「${label}」`).toBeDefined()
  return opt!
}
/** 最近一次 listUsers 调用的参数对象 */
const lastCall = () => {
  const calls = mocks.listUsers.mock.calls
  expect(calls.length, 'listUsers 应至少被调用一次').toBeGreaterThan(0)
  return calls[calls.length - 1][0] as Record<string, unknown>
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listUsers.mockReset().mockImplementation(() => Promise.resolve(pageOf(defaultRows())))
  mocks.createUser.mockReset().mockResolvedValue({})
  mocks.updateUser.mockReset().mockResolvedValue({})
  mocks.deleteUser.mockReset().mockResolvedValue({})
  mocks.resetPassword.mockReset().mockResolvedValue({})
  mocks.listRoles.mockReset().mockResolvedValue(defaultRoles())
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'searchPlaceholder', 'statusAll', 'statusEnabled', 'statusDisabled',
  'colUsername', 'colRealName', 'colPhone', 'colRoles', 'colStatus', 'colActions',
  'create', 'edit', 'resetPassword', 'delete', 'createTitle', 'editTitle', 'resetTitle',
  'fUsername', 'fPassword', 'fNewPassword', 'fRealName', 'fPhone', 'fRoles', 'submit', 'cancel',
  'ruleUsernameRequired', 'ruleUsernamePattern', 'rulePasswordRequired', 'rulePhonePattern', 'ruleNewPwdRequired',
  'confirmDisable', 'confirmDeleteTitle', 'confirmDelete',
  'saveSuccess', 'statusUpdateSuccess', 'deleteSuccess', 'resetSuccess',
  'loadFailed', 'actionFailed', 'empty', 'readonlyHint'
].map((k) => `v2.users.${k}`)

describe('P4d-1 — i18n key 全表双语存在（铁律 6，v2.users.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 初始加载 ──────────────────────────────────────────────────────────────
describe('P4d-1 — 初始加载（默认参数 / 骨架 / 行渲染 / 分页）', () => {
  it('挂载即拉一次：listUsers({ page:1, pageSize:20 })，无筛选参数透传（旧默认语义随迁）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'usr-page').exists()).toBe(true)
    expect(mocks.listUsers).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual({ page: 1, pageSize: 20 })
  })

  it('加载挂起 → usr-skeleton 渲染且表格/空态/错误条不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.listUsers.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const { wrapper } = await factory()
    expect(need(wrapper, 'usr-skeleton', '加载骨架').exists()).toBe(true)
    expect(one(wrapper, 'usr-table').exists()).toBe(false)
    expect(one(wrapper, 'usr-empty').exists()).toBe(false)
    expect(one(wrapper, 'usr-error').exists()).toBe(false)
    resolveLoad(pageOf(defaultRows()))
    await flushPromises()
    expect(one(wrapper, 'usr-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'usr-table').exists()).toBe(true)
  })

  it('行渲染：三行 → usr-row-<行主键> + username/realname 单元格（行 key = id 非 username）', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'usr-row-8001', '第一行').exists()).toBe(true)
    expect(one(wrapper, 'usr-row-8002').exists()).toBe(true)
    expect(one(wrapper, 'usr-row-8003').exists()).toBe(true)
    expect(need(wrapper, 'usr-cell-username-8002', '用户名单元格').text()).toBe('viewer_bob')
    expect(need(wrapper, 'usr-cell-realname-8001', '姓名单元格').text()).toBe('爱丽丝')
  })

  it('total 透传 usr-pagination（:total=42）', async () => {
    const { wrapper } = await factory()
    const pagination = wrapper.findComponent({ name: 'FcPagination' })
    expect(pagination.exists(), '缺少 FcPagination').toBe(true)
    expect(pagination.props('total')).toBe(42)
    expect(pagination.props('pageSize')).toBe(20)
  })
})

// ── keyword 防抖 + 筛选 + 分页 ────────────────────────────────────────────
describe('P4d-1 — keyword 300ms 防抖 / status 筛选 / 翻页透传', () => {
  it('输入后 299ms 内不发请求，满 300ms 才发一次且携带 keyword（旧防抖语义随迁）', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      const before = mocks.listUsers.mock.calls.length
      await inputOf(wrapper, 'usr-search').setValue('alice')
      await vi.advanceTimersByTimeAsync(299)
      expect(mocks.listUsers.mock.calls.length, '防抖窗口内不得发请求').toBe(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.listUsers.mock.calls.length).toBe(before + 1)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'alice' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('防抖窗口内连续输入只发一次、以末值发送；空值回落 undefined 不透传', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      const before = mocks.listUsers.mock.calls.length
      await inputOf(wrapper, 'usr-search').setValue('a')
      await vi.advanceTimersByTimeAsync(200)
      await inputOf(wrapper, 'usr-search').setValue('ab')
      await vi.advanceTimersByTimeAsync(300)
      expect(mocks.listUsers.mock.calls.length, '连续输入只应发一次').toBe(before + 1)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'ab' }))
      await inputOf(wrapper, 'usr-search').setValue('')
      await vi.advanceTimersByTimeAsync(300)
      expect(lastCall().keyword, '空 keyword 透传 undefined（旧 debounced || undefined 语义）').toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keyword 触发搜索时页码重置 1（旧 List.search 语义随迁）', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await factory()
      ;(wrapper.vm as any).page = 2
      await vi.advanceTimersByTimeAsync(0)
      await inputOf(wrapper, 'usr-search').setValue('kw')
      await vi.advanceTimersByTimeAsync(300)
      expect(lastCall()).toEqual(expect.objectContaining({ keyword: 'kw', page: 1 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('status 筛选：点停用 → status=DISABLED 且页码重置 1；点全部 → 回落 undefined（v2 增量，哨兵语义）', async () => {
    const { wrapper } = await factory()
    ;(wrapper.vm as any).page = 3
    await flushPromises()
    await needSeg(wrapper, 'usr-status-filter', t('v2.users.statusDisabled')).trigger('click')
    await flushPromises()
    expect(lastCall()).toEqual(expect.objectContaining({ status: 'DISABLED', page: 1 }))
    await needSeg(wrapper, 'usr-status-filter', t('v2.users.statusAll')).trigger('click')
    await flushPromises()
    expect(lastCall().status).toBeUndefined()
  })

  it('翻页与改每页条数 → listUsers({ page:3, pageSize:50 }) 透传，不触碰 keyword/status', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.page = 3
    await flushPromises()
    vm.pageSize = 50
    await flushPromises()
    expect(lastCall()).toEqual(expect.objectContaining({ page: 3, pageSize: 50 }))
    expect(lastCall().keyword).toBeUndefined()
    expect(lastCall().status).toBeUndefined()
  })
})

// ── loadEpoch 竞态 + 加载失败/重试 + 空态 ─────────────────────────────────
describe('P4d-1 — loadEpoch 竞态 / 加载失败 / 重试 / 空态', () => {
  it('loadEpoch 竞态：慢 keyword 响应后到不覆盖新加载结果（旧 load-epoch 语义随迁）', async () => {
    const { wrapper } = await factory()
    const fastPage = pageOf([makeUser({ id: '8901', username: 'fresh_user', real_name: '新行' })])
    let resolveSlow!: (v: unknown) => void
    mocks.listUsers.mockImplementation((params: any) => {
      if (params?.keyword === 'slow') return new Promise((r) => { resolveSlow = r })
      return Promise.resolve(fastPage)
    })
    vi.useFakeTimers()
    try {
      await inputOf(wrapper, 'usr-search').setValue('slow')
      await vi.advanceTimersByTimeAsync(300)
      ;(wrapper.vm as any).page = 3
      await vi.advanceTimersByTimeAsync(0)
      expect(need(wrapper, 'usr-cell-username-8901', '新加载应生效').text()).toBe('fresh_user')
      resolveSlow(pageOf([makeUser({ id: '8900', username: 'stale_user' })]))
      await vi.advanceTimersByTimeAsync(0)
      expect(need(wrapper, 'usr-cell-username-8901', '陈旧响应后到不得覆盖').text()).toBe('fresh_user')
      expect(one(wrapper, 'usr-row-8900').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('listUsers reject → usr-error（loadFailed + e.message）+ usr-retry；表格与空态都不渲染（错误态不是空态）', async () => {
    mocks.listUsers.mockRejectedValue(new Error('boom'))
    const { wrapper } = await factory()
    const err = need(wrapper, 'usr-error', '加载错误条')
    expect(err.text()).toContain(t('v2.users.loadFailed'))
    expect(err.text()).toContain('boom')
    expect(one(wrapper, 'usr-table').exists()).toBe(false)
    expect(one(wrapper, 'usr-empty').exists()).toBe(false)
    expect(one(wrapper, 'usr-page').exists()).toBe(true)
  })

  it('失败清陈旧行：先有数据，翻页失败 → 错误态整体替换表区（不残留旧行）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'usr-row-8001').exists()).toBe(true)
    mocks.listUsers.mockRejectedValue(new Error('later fails'))
    ;(wrapper.vm as any).page = 2
    await flushPromises()
    expect(need(wrapper, 'usr-error', '加载错误条').exists()).toBe(true)
    expect(one(wrapper, 'usr-row-8001').exists()).toBe(false)
    expect(one(wrapper, 'usr-empty').exists()).toBe(false)
  })

  it('usr-retry 点击 → 重新拉取；成功后错误退场、表格回归', async () => {
    mocks.listUsers.mockRejectedValueOnce(new Error('first fails'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'usr-error').exists()).toBe(true)
    await need(wrapper, 'usr-retry', '重试钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'usr-error').exists()).toBe(false)
    expect(one(wrapper, 'usr-row-8001').exists()).toBe(true)
    expect(mocks.listUsers.mock.calls.length).toBe(2)
  })

  it('无错误且 0 行 → usr-empty 空态（FcEmpty）', async () => {
    mocks.listUsers.mockResolvedValue(pageOf([], 0))
    const { wrapper } = await factory()
    expect(need(wrapper, 'usr-empty', '空态').exists()).toBe(true)
    expect(one(wrapper, 'usr-table').exists()).toBe(false)
    expect(one(wrapper, 'usr-error').exists()).toBe(false)
  })
})

// ── 新建弹窗 ──────────────────────────────────────────────────────────────
describe('P4d-1 — 新建弹窗（开弹窗 / maxlength / 校验）', () => {
  it('usr-action-create 开弹窗 usr-dialog：五输入 + 提交钮齐备', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'usr-dialog').exists()).toBe(false)
    await need(wrapper, 'usr-action-create', '新建钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-dialog', '新建弹窗').isVisible()).toBe(true)
    for (const tid of ['usr-input-username', 'usr-input-password', 'usr-input-realname', 'usr-input-phone', 'usr-input-roles']) {
      expect(one(wrapper, tid).exists(), `弹窗缺少 ${tid}`).toBe(true)
    }
    expect(one(wrapper, 'usr-submit').exists()).toBe(true)
  })

  it.each([
    ['usr-input-username', '30', 'username（P3E 对齐 pattern {2,30}，测试契约变更：对齐真约束消误导）'],
    ['usr-input-password', '64', 'password（契约 §4.5 覆盖旧页 100！）'],
    ['usr-input-realname', '50', 'real_name'],
    ['usr-input-phone', '20', 'phone']
  ])('%s maxlength=%s（%s）', async (tid, max, why) => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create', '新建钮').trigger('click')
    await flushPromises()
    expect(inputOf(wrapper, tid).attributes('maxlength'), `maxlength 契约（${why}）`).toBe(max)
  })

  it('username required：空值提交 → usr-field-error-username（ruleUsernameRequired）且不调 createUser', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await need(wrapper, 'usr-submit', '提交钮').trigger('click')
    await flushPromises()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(need(wrapper, 'usr-field-error-username', '客户端校验错误通道').text())
      .toContain(t('v2.users.ruleUsernameRequired'))
  })

  it('username pattern ^[a-zA-Z0-9_]{2,30}$：含连字符与超长都拦截（旧校验随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('bad-name!')
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(need(wrapper, 'usr-field-error-username', 'pattern 错误').text())
      .toContain(t('v2.users.ruleUsernamePattern'))
  })

  it('password 创建必填：留空提交 → usr-field-error-password（rulePasswordRequired）且不调 createUser', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('new_admin')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(need(wrapper, 'usr-field-error-password', '密码必填错误').text())
      .toContain(t('v2.users.rulePasswordRequired'))
  })

  it('phone 可空可合法：合法手机号 + 空值都放行；^1[3-9]\\d{9}$ 非法值拦截（rulePhonePattern）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('new_admin')
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await inputOf(wrapper, 'usr-input-phone').setValue('12345')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(need(wrapper, 'usr-field-error-phone', '手机号 pattern 错误').text())
      .toContain(t('v2.users.rulePhonePattern'))
  })
})

// ── 新建提交 + 角色源 + 字段错误 ──────────────────────────────────────────
describe('P4d-1 — 新建提交（createUser / 角色降级 / mapFieldErrors）', () => {
  it('合法表单提交 → createUser 全量 payload（role_codes 默认 ROLE_OPS）+ toast saveSuccess + 重拉 + 关弹窗', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('new_admin')
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await inputOf(wrapper, 'usr-input-realname').setValue('新管理员')
    await inputOf(wrapper, 'usr-input-phone').setValue('13900139000')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.createUser).toHaveBeenCalledTimes(1)
    expect(mocks.createUser).toHaveBeenCalledWith({
      username: 'new_admin', password: 'Secret#1', real_name: '新管理员', phone: '13900139000', role_codes: ['ROLE_OPS']
    })
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.users.saveSuccess'))
    expect(mocks.listUsers.mock.calls.length, '提交成功后重拉列表').toBeGreaterThanOrEqual(2)
    expect(one(wrapper, 'usr-dialog').isVisible(), '成功后关弹窗').toBe(false)
  })

  it('角色选项源 = listRoles() 映射 {value: role_code, label: role_name}；挂载即取一次', async () => {
    const { wrapper } = await factory()
    expect(mocks.listRoles, '挂载即取角色选项').toHaveBeenCalledTimes(1)
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    const select = wrapper.findComponent({ name: 'FcSelect' })
    expect(select.exists(), '角色多选 = FcSelect').toBe(true)
    const options = select.props('options') as Array<{ value: string; label: string }>
    expect(options).toEqual([
      { value: 'ROLE_OPS', label: '运维' },
      { value: 'ROLE_ADMIN', label: '管理员' }
    ])
  })

  it('listRoles reject → 降级空数组：弹窗照常可开可提交（旧降级语义随迁）', async () => {
    mocks.listRoles.mockRejectedValue(new Error('roles down'))
    const { wrapper } = await factory()
    await flushPromises()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('new_admin')
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ role_codes: expect.any(Array) }))
  })

  it('提交失败 mapFieldErrors → 逐 prop 注入 usr-field-error-{field}；弹窗不关、无成功 toast', async () => {
    mocks.createUser.mockRejectedValue(new Error('conflict'))
    mocks.mapFieldErrors.mockReturnValue({ username: '用户名已存在' })
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-username').setValue('dup_user')
    await inputOf(wrapper, 'usr-input-password').setValue('Secret#1')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-field-error-username', '服务端字段错误通道').text()).toContain('用户名已存在')
    expect(one(wrapper, 'usr-dialog').isVisible(), '字段错误时弹窗不关').toBe(true)
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 编辑 ──────────────────────────────────────────────────────────────────
describe('P4d-1 — 编辑（回填 / username disabled / password 留空=不改）', () => {
  it('usr-action-edit 开弹窗回填行数据且 username disabled（旧语义：用户名不可改）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-edit-8002', '8002 编辑钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-dialog', '编辑弹窗').isVisible()).toBe(true)
    const username = inputOf(wrapper, 'usr-input-username')
    expect((username.element as HTMLInputElement).value).toBe('viewer_bob')
    expect(username.attributes('disabled'), '编辑态 username 必须禁用').toBeDefined()
  })

  it('编辑留空密码提交 → updateUser(id, payload) 不含 password 键（旧「留空=不改」语义随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-edit-8002').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-realname').setValue('鲍勃二号')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.updateUser).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.updateUser.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual({ real_name: '鲍勃二号', phone: '', role_codes: ['ROLE_OPS'] })
    expect('password' in payload, '留空密码不得出现在 payload').toBe(false)
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.users.saveSuccess'))
  })

  it('编辑填新密码 → updateUser payload 含 password（改密通道）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-edit-8001').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-password').setValue('NewPass#9')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    const [, payload] = mocks.updateUser.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.password).toBe('NewPass#9')
  })

  it('编辑提交成功 → 重拉列表 + 关弹窗', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-edit-8001').trigger('click')
    await flushPromises()
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.updateUser).toHaveBeenCalledWith('8001', expect.any(Object))
    expect(mocks.listUsers.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(one(wrapper, 'usr-dialog').isVisible()).toBe(false)
  })
})

// ── 重置密码 ──────────────────────────────────────────────────────────────
describe('P4d-1 — 重置密码（newPwd 非空才提交 / 成功关弹窗）', () => {
  it('usr-action-reset-pw 开重置弹窗（usr-dialog + usr-input-newpwd）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-reset-pw-8001', '重置密码钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-dialog', '重置弹窗').isVisible()).toBe(true)
    expect(one(wrapper, 'usr-input-newpwd').exists()).toBe(true)
  })

  it('newPwd 为空提交 → 不调 resetPassword（旧「非空才提交」语义随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-reset-pw-8001').trigger('click')
    await flushPromises()
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })

  it('newPwd 非空 → resetPassword(id, newPwd) + toast resetSuccess + 关弹窗', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-reset-pw-8001').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'usr-input-newpwd').setValue('BrandNew#1')
    await need(wrapper, 'usr-submit').trigger('click')
    await flushPromises()
    expect(mocks.resetPassword).toHaveBeenCalledTimes(1)
    expect(mocks.resetPassword).toHaveBeenCalledWith('8001', 'BrandNew#1')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.users.resetSuccess'))
    expect(one(wrapper, 'usr-dialog').isVisible()).toBe(false)
  })
})

// ── 启停 ──────────────────────────────────────────────────────────────────
describe('P4d-1 — 启停（仅禁用方向 confirm / 状态翻转）', () => {
  it('ENABLED → 停用：先 confirm({ variant:danger, title:confirmDisable })；确认后 updateUser(id,{status:DISABLED})', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-toggle-8001', '8001 停用钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: t('v2.users.confirmDisable'), variant: 'danger'
    }))
    expect(mocks.updateUser).toHaveBeenCalledWith('8001', { status: 'DISABLED' })
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.users.statusUpdateSuccess'))
    expect(mocks.listUsers.mock.calls.length, '启停成功后重拉').toBeGreaterThanOrEqual(2)
  })

  it('DISABLED → 启用：不 confirm（仅禁用方向才确认）；updateUser(id,{status:ENABLED})', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-toggle-8002', '8002 启用钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).not.toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith('8002', { status: 'ENABLED' })
  })

  it('禁用方向 confirm=false → 不发 updateUser 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-toggle-8001').trigger('click')
    await flushPromises()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.listUsers.mock.calls.length).toBe(1)
  })

  it('启停失败 → usr-action-error（actionFailed 兜底 e.message）；无成功 toast；列表行保留', async () => {
    mocks.updateUser.mockRejectedValue(new Error('row locked'))
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-toggle-8002').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-action-error', '动作错误条').text()).toContain('row locked')
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(one(wrapper, 'usr-row-8001').exists()).toBe(true)
    expect(one(wrapper, 'usr-error').exists()).toBe(false)
  })
})

// ── 删除 ──────────────────────────────────────────────────────────────────
describe('P4d-1 — 删除（confirm → deleteUser / 失败 actionError）', () => {
  it('删除：confirm({ variant:danger, title:confirmDeleteTitle, content:confirmDelete }) → deleteUser(id) + toast + 重拉', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-delete-8003', '8003 删除钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: t('v2.users.confirmDeleteTitle'),
      content: t('v2.users.confirmDelete'),
      variant: 'danger'
    }))
    expect(mocks.deleteUser).toHaveBeenCalledWith('8003')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.users.deleteSuccess'))
    expect(mocks.listUsers.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('confirm=false → 不发 deleteUser 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-delete-8003').trigger('click')
    await flushPromises()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.listUsers.mock.calls.length).toBe(1)
  })

  it('删除失败 → usr-action-error；无成功 toast', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('still referenced'))
    const { wrapper } = await factory()
    await need(wrapper, 'usr-action-delete-8003').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'usr-action-error', '动作错误条').text()).toContain('still referenced')
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 权限降级 ──────────────────────────────────────────────────────────────
describe("P4d-1 — 只读权限降级（canEdit('user')）", () => {
  it("canEdit=false → usr-readonly-hint 渲染；新建/行动作/提交全退场；只读可看列表", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(need(wrapper, 'usr-readonly-hint', '只读提示条').text()).toContain(t('v2.users.readonlyHint'))
    expect(one(wrapper, 'usr-action-create').exists()).toBe(false)
    expect(one(wrapper, 'usr-action-edit-8001').exists()).toBe(false)
    expect(one(wrapper, 'usr-action-toggle-8002').exists()).toBe(false)
    expect(one(wrapper, 'usr-action-reset-pw-8001').exists()).toBe(false)
    expect(one(wrapper, 'usr-action-delete-8003').exists()).toBe(false)
    expect(one(wrapper, 'usr-row-8001').exists()).toBe(true)
  })

  it("canEdit=true → 提示条不渲染、新建钮在（门禁反转）", async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'usr-readonly-hint').exists()).toBe(false)
    expect(one(wrapper, 'usr-action-create').exists()).toBe(true)
  })

  it('门禁作用域源码契约：canEdit 仅以 user 为参（照旧页 canEdit(\'user\')，不得放宽）', () => {
    expect(readSource()).toMatch(/canEdit\(\s*['"]user['"]\s*\)/)
  })
})

// ── SDK-only 源码契约 ─────────────────────────────────────────────────────
describe('P4d-1 — SDK-only 源码契约（P4a-2 先例）', () => {
  it('无 <el- 直用、无 FcTable（语义化 <table> + Fc 原子）；template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source).not.toMatch(/FcTable/)
    expect(source).toMatch(/<table[\s>]/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/misc 仅 5 用户成员 + @/api/auth 仅 listRoles；不 import element-plus / 旧树 @/views", () => {
    const source = readSource()
    const miscBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/misc'/)?.[0] ?? ''
    expect(miscBlock, '页面需从 @/api/misc 具名导入').toBeTruthy()
    for (const allowed of ['listUsers', 'createUser', 'updateUser', 'deleteUser', 'resetPassword']) {
      expect(miscBlock).toContain(allowed)
    }
    for (const banned of [
      'getDict', 'listRouteStatus', 'getRouteMetrics', 'getTopology', 'getRouteTimeseries',
      'getSyncStatus', 'listChanges', 'listAuditLogs', 'getConfig', 'saveConfig'
    ]) {
      expect(miscBlock, `禁用成员 ${banned} 出现在 @/api/misc import 面（页面职责越界）`).not.toContain(banned)
    }
    const authBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/auth'/)?.[0] ?? ''
    expect(authBlock, '页面需从 @/api/auth 具名导入 listRoles').toBeTruthy()
    expect(authBlock).toContain('listRoles')
    for (const banned of [
      'login', 'refreshToken', 'listPermissions', 'createRole', 'updateRole',
      'deleteRole', 'getRolePermissions', 'updateRolePermissions', 'listRoleUsers', 'updateRoleUsers'
    ]) {
      expect(authBlock, `禁用成员 ${banned} 出现在 @/api/auth import 面`).not.toContain(banned)
    }
    expect(source, 'SDK-only：页面不得直引 element-plus（Fc 原子封装）').not.toMatch(/from\s+'element-plus'/)
    expect(source, '禁止 import 旧树 @/views（新旧树隔离铁律）').not.toMatch(/from\s+'@\/views\//)
  })

  it('关键 testid 全数在源码落位（契约表抽查：骨架/错误/空态/搜索/表格/分页/弹窗/行动作/反馈）', () => {
    const source = readSource()
    for (const tid of [
      'usr-page', 'usr-skeleton', 'usr-error', 'usr-retry', 'usr-empty',
      'usr-search', 'usr-status-filter', 'usr-table', 'usr-pagination',
      'usr-action-create', 'usr-dialog', 'usr-input-username', 'usr-input-password',
      'usr-input-realname', 'usr-input-phone', 'usr-input-roles', 'usr-input-newpwd', 'usr-submit',
      'usr-action-edit', 'usr-action-toggle', 'usr-action-reset-pw', 'usr-action-delete',
      'usr-field-error-', 'usr-action-error', 'usr-toast-success', 'usr-toast-error', 'usr-readonly-hint'
    ]) {
      expect(source).toContain(tid)
    }
    expect(source).toMatch(/useDebounce\(/)
  })
})
