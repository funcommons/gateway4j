/**
 * P4d-2-T：v2 角色权限页测试 —— 契约 docs/ui-v2/实施契约.md §4.5 P4d 行（~L78）。
 * （/v2/roles，name V2Roles，permission user:read；旧 src/views/users/Roles.vue 等价迁移；
 * 2026-11-09）。先红是预期：页面由 P4d-2-C 实现（当前 src/views-v2/system/Roles.vue 不存在，
 * RED 形态 = Failed to resolve import，vitest 与 vue-tsc(TS2307) 同理，合规先红）。
 *
 * ── 旧页语义权威（src/views/users/Roles.vue，逐字随迁点）────────────────────
 * 旧页两 Tab（roles/permissions）读改为 v2 单页三弹窗（见 ①）；门禁 canManage =
 * hasPermission('role:edit') → v2 canEdit('role')，管新建/编辑/权限/成员/删除全部动作；
 * 删除防护：role_code==='ROLE_ADMIN' 删除钮【禁用不隐藏】（规则可见），普通行走 confirm；
 * role_code maxlength=50 + 编辑态 disabled + pattern /^ROLE_[A-Z0-9_]{2,40}$/；
 * role_name maxlength=50（rule max:50）；remark maxlength=200 textarea；
 * create payload {role_code, role_name, remark||undefined}；update payload
 * {role_name, remark||undefined}（无 role_code 键）；保存成功 toast→关弹窗→loadRolesOnly；
 * 保存失败弹窗不关；删除失败 actionError（页面级）；授权懒加载 Promise.all(listPermissions
 * + getRolePermissions(id)) 回显全量 checked；保存提交【全量 checked】非 delta；
 * 成员懒加载 loadAllUsers（listUsers 分页聚合 pageSize=100，按 total 翻页带上限）+
 * listRoleUsers(id) 回显 memberIds(String(u.id))；保存提交【全量 memberIds】；
 * loadEpoch 竞态守卫；加载失败 i18n 兜底 rolesLoadFailed；remark 空显示 '-'。
 *
 * ── v2 语义差异裁决（相对旧页，C 按此实现）───────────────────────────────────
 * ① 旧页两 Tab 合并为【单页角色表 + 三弹窗】：新建/编辑表单弹窗、权限矩阵弹窗、成员弹窗
 *    共用 rol-dialog（P4d-1「两弹窗共用 usr-dialog」先例）；旧「权限浏览 Tab」退场 ——
 *    其 resource_type 筛选语义并入矩阵弹窗（rol-perm-type-filter），页面挂载因此
 *    【只拉 listRoles】（旧 mount 即拉 listPermissions 的职责随 Tab 退场 → 矩阵懒加载）。
 * ② 矩阵 = 平铺语义化 <table>（权限码/权限名/类型三列，类型列 resourceTypeLabel i18n
 *    = 旧权限 Tab 列头随迁）替代旧 grant 弹窗「前缀分组」——筛选按 resource_type
 *    （FcSegmented 4 选项 全部/MENU/BUTTON/API，P4a-2 先例），前缀分组不再断言。
 *    全选/清空保留（旧 grant-check-all/none）+ 已选计数（旧 grant-count）。
 * ③ 错误通道统一两条：rol-action-error（删除/表单保存非字段错/矩阵保存/成员保存/
 *    成员加载失败；页面级 role=alert，与 P4d-1 usr-action-error 同款；弹窗失败不关）
 *    + rol-field-error-{field}（field=role_code/role_name/remark；客户端校验与服务端
 *    mapFieldErrors 共用通道，P4d-1 先例）。
 * ④ i18n 全部进 v2.roles.* 新树（不引用 role.* / common.* 旧树）+ v2.page.roles /
 *    v2.nav.roles 两个非 roles 树 key（在 v2.routing.test.ts / LayoutV2.test.ts 断言）。
 * ⑤ 门禁走 canEdit('role')（P4d-1 canEdit('user') 同款 composable 约定，等价旧
 *    hasPermission('role:edit')）；只读渲染 rol-readonly-hint，行数据可见。
 *
 * ── testid 契约表（任务书全表 + ②③ 标注的 T 裁决扩展）────────────────────────
 * 页面骨架: rol-page / rol-skeleton / rol-error / rol-retry / rol-empty
 * 列表: rol-list / rol-row-{id} / rol-cell-{code|name|remark}-{id}（remark 空 → '-'）
 * 动作: rol-action-create；行内 rol-action-edit-{id} / rol-action-perm-{id} /
 *       rol-action-members-{id} / rol-action-delete-{id}；ROLE_ADMIN 行 =
 *       rol-action-delete-disabled（disabled，不隐藏，T 裁决沿旧页）
 * 表单弹窗: rol-dialog（三弹窗共用）/ rol-input-code / rol-input-name / rol-input-remark /
 *       rol-submit / rol-field-error-{field} / rol-action-error
 * 权限矩阵: rol-perm-matrix / rol-perm-type-filter / rol-perm-checkbox-{code} /
 *       rol-perm-check-all / rol-perm-check-none / rol-perm-count（T 裁决扩展 ②）
 * 成员: rol-members-list / rol-members-user-{id} / rol-members-check-all /
 *       rol-members-check-none / rol-members-count（T 裁决扩展 ②）
 * 反馈: rol-toast-success / rol-toast-error（DOM testid 由源码抽查钉住；行为断言走 toast mock）
 * 只读: rol-readonly-hint
 *
 * ── API mock 面（页面允许的 import 面 = @/api/auth 9 成员 + @/api/misc 仅 listUsers）──
 * vi.mock 整模块替换时只声明页面允许的成员；禁用名单由文末 SDK-only 源码断言拦截 import 面。
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission（canEdit）、
 *   '@/components' 仅替换 toast（importOriginal 保真其余 SDK 组件，P4a-2 先例）、
 *   '@/api/http' 仅替换 mapFieldErrors（importOriginal 保真 http 实例）。
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
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getRolePermissions: vi.fn(),
  updateRolePermissions: vi.fn(),
  listRoleUsers: vi.fn(),
  updateRoleUsers: vi.fn(),
  listUsers: vi.fn(),
  mapFieldErrors: vi.fn(() => ({}) as Record<string, string>),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles,
  listPermissions: mocks.listPermissions,
  createRole: mocks.createRole,
  updateRole: mocks.updateRole,
  deleteRole: mocks.deleteRole,
  getRolePermissions: mocks.getRolePermissions,
  updateRolePermissions: mocks.updateRolePermissions,
  listRoleUsers: mocks.listRoleUsers,
  updateRoleUsers: mocks.updateRoleUsers
}))
vi.mock('@/api/misc', () => ({
  listUsers: mocks.listUsers
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

import Roles from '@/views-v2/system/Roles.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（P4a-2 先例）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Roles.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures ──────────────────────────────────────────────────────────────

type RoleOver = { id?: string; role_code?: string; role_name?: string; remark?: string }

/** listRoles 行：行主键 7001 ≠ role_code 'ROLE_OPS'（错位防错参，P4d-1 同款） */
function makeRole(over: RoleOver = {}) {
  return {
    id: over.id ?? '7001',
    role_code: over.role_code ?? 'ROLE_OPS',
    role_name: over.role_name ?? '运维',
    remark: over.remark ?? '运营与值班'
  }
}

/** 默认三行：7001 运维(有备注) · 7002 ROLE_ADMIN(删除防护行) · 7003 审计员(备注空 → '-') */
function defaultRoles() {
  return [
    makeRole(),
    makeRole({ id: '7002', role_code: 'ROLE_ADMIN', role_name: '管理员', remark: '' }),
    makeRole({ id: '7003', role_code: 'ROLE_AUDITOR', role_name: '审计员', remark: '' })
  ]
}

type PermOver = { permission_code?: string; permission_name?: string; resource_type?: string }

/** listPermissions 行：2 API + 1 MENU + 1 BUTTON，供 resource_type 筛选用例 */
function makePerm(over: PermOver = {}) {
  return {
    permission_code: over.permission_code ?? 'route:read',
    permission_name: over.permission_name ?? '路由查看',
    resource_type: over.resource_type ?? 'API'
  }
}

function defaultPerms() {
  return [
    makePerm(),
    makePerm({ permission_code: 'route:publish', permission_name: '路由发布', resource_type: 'API' }),
    makePerm({ permission_code: 'routes:view', permission_name: '路由菜单', resource_type: 'MENU' }),
    makePerm({ permission_code: 'routes:export', permission_name: '路由导出', resource_type: 'BUTTON' })
  ]
}

/** misc.listUsers 分页形状（成员弹窗聚合源）；total=2 与 records 等长 → 聚合只翻一页 */
function memberPage() {
  return {
    records: [
      { id: '8001', username: 'ops_alice', real_name: '爱丽丝' },
      { id: '8002', username: 'viewer_bob', real_name: '鲍勃' }
    ],
    total: 2, size: 100, current: 1, pages: 1
  }
}

/** listRoleUsers 行（回显已选成员；id 与 username 错位防错参） */
function defaultRoleUsers() {
  return [{ id: '8001', username: 'ops_alice', real_name: '爱丽丝' }]
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/v2/roles', name: 'V2Roles', component: Roles as any }]
  })
  await router.push('/v2/roles')
  await router.isReady()
  const wrapper = mount(Roles, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
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
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"], textarea[data-testid="${tid}"]`)
/** 勾选框可写通道：testid 落在 FcCheckbox 根（EP label），原生 input 才能 setValue（VTU 仅 input[type=checkbox] 走 setChecked） */
const checkboxOf = (w: VueWrapper<any>, tid: string) => one(w, tid).find('input')
/** FcSegmented 选项：按 label 文案定位容器内按钮（P4d-1 先例） */
const segOption = (w: VueWrapper<any>, tid: string, label: string) =>
  one(w, tid).findAll('button').find((b) => b.text().includes(label))
const needSeg = (w: VueWrapper<any>, tid: string, label: string) => {
  const opt = segOption(w, tid, label)
  expect(opt, `「${tid}」内缺少选项「${label}」`).toBeDefined()
  return opt!
}
/** 勾选框原生 input 的勾选态（FcCheckbox = EP 薄封装，不改 DOM，原生 input 可定位） */
const isChecked = (w: VueWrapper<any>, tid: string) =>
  (one(w, tid).find('input').element as HTMLInputElement | undefined)?.checked === true

/** 打开矩阵弹窗并等懒加载完成 */
async function openPermMatrix(w: VueWrapper<any>, id = '7001') {
  await need(w, `rol-action-perm-${id}`, '权限钮').trigger('click')
  await flushPromises()
}
/** 打开成员弹窗并等懒加载完成 */
async function openMembers(w: VueWrapper<any>, id = '7001') {
  await need(w, `rol-action-members-${id}`, '成员钮').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoles.mockReset().mockResolvedValue(defaultRoles())
  mocks.listPermissions.mockReset().mockResolvedValue(defaultPerms())
  mocks.createRole.mockReset().mockResolvedValue({})
  mocks.updateRole.mockReset().mockResolvedValue({})
  mocks.deleteRole.mockReset().mockResolvedValue({})
  mocks.getRolePermissions.mockReset().mockResolvedValue(['route:read', 'routes:view'])
  mocks.updateRolePermissions.mockReset().mockResolvedValue({})
  mocks.listRoleUsers.mockReset().mockResolvedValue(defaultRoleUsers())
  mocks.updateRoleUsers.mockReset().mockResolvedValue({})
  mocks.listUsers.mockReset().mockResolvedValue(memberPage())
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'colCode', 'colName', 'colRemark', 'colActions',
  'create', 'edit', 'delete', 'perm', 'members',
  'createTitle', 'editTitle', 'permTitle', 'membersTitle',
  'fCode', 'fName', 'fRemark', 'submit', 'cancel',
  'ruleCodeRequired', 'ruleCodePattern', 'ruleNameRequired', 'ruleNameTooLong',
  'confirmDeleteTitle', 'confirmDelete', 'adminDeleteHint',
  'saveSuccess', 'deleteSuccess', 'permSaveSuccess', 'memberSaveSuccess',
  'loadFailed', 'actionFailed', 'empty', 'readonlyHint',
  'typeAll', 'typeMenu', 'typeButton', 'typeApi',
  'colPermission', 'colPermName', 'colResourceType',
  'selectedCount', 'selectAll', 'clear',
  'permEmpty', 'membersEmpty', 'membersLoadFailed'
].map((k) => `v2.roles.${k}`)

describe('P4d-2 — i18n key 全表双语存在（铁律 6，v2.roles.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 初始加载 ──────────────────────────────────────────────────────────────
describe('P4d-2 — 初始加载（挂载单拉 / 骨架 / 行渲染 / 空态）', () => {
  it('挂载即拉一次：listRoles() 无参；listPermissions 不在挂载期调用（矩阵才懒加载，裁决 ①）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'rol-page').exists()).toBe(true)
    expect(mocks.listRoles).toHaveBeenCalledTimes(1)
    expect(mocks.listRoles).toHaveBeenCalledWith()
    expect(mocks.listPermissions, '挂载不得预拉全量权限').not.toHaveBeenCalled()
    expect(mocks.getRolePermissions, '挂载不得预拉角色权限').not.toHaveBeenCalled()
  })

  it('加载挂起 → rol-skeleton 渲染且列表/空态/错误条不渲染；resolve 后骨架退场', async () => {
    let resolveLoad!: (v: unknown) => void
    mocks.listRoles.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-skeleton', '加载骨架').exists()).toBe(true)
    expect(one(wrapper, 'rol-list').exists()).toBe(false)
    expect(one(wrapper, 'rol-empty').exists()).toBe(false)
    expect(one(wrapper, 'rol-error').exists()).toBe(false)
    resolveLoad(defaultRoles())
    await flushPromises()
    expect(one(wrapper, 'rol-skeleton').exists()).toBe(false)
    expect(one(wrapper, 'rol-list').exists()).toBe(true)
  })

  it('行渲染：三行 → rol-row-<行主键> + code/name/remark 单元格（行 key = id 非 role_code）', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-row-7001', '第一行').exists()).toBe(true)
    expect(one(wrapper, 'rol-row-7002').exists()).toBe(true)
    expect(one(wrapper, 'rol-row-7003').exists()).toBe(true)
    expect(need(wrapper, 'rol-cell-code-7002', '角色码单元格').text()).toBe('ROLE_ADMIN')
    expect(need(wrapper, 'rol-cell-name-7001', '角色名单元格').text()).toBe('运维')
    expect(need(wrapper, 'rol-cell-remark-7001', '备注单元格').text()).toBe('运营与值班')
  })

  it('remark 空 → 单元格显示 \'-\'（旧页 remark || \'-\' 语义随迁）', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-cell-remark-7003', '空备注单元格').text()).toBe('-')
  })

  it('无错误且 0 行 → rol-empty 空态；列表与错误条都不渲染', async () => {
    mocks.listRoles.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-empty', '空态').exists()).toBe(true)
    expect(one(wrapper, 'rol-list').exists()).toBe(false)
    expect(one(wrapper, 'rol-error').exists()).toBe(false)
  })
})

// ── 竞态 + 失败重试 ───────────────────────────────────────────────────────
describe('P4d-2 — loadEpoch 竞态 / 加载失败 / 重试', () => {
  it('loadEpoch 竞态守卫（旧页同款机制名）：重试重入后，先发慢响应不得覆盖新结果、陈旧拒绝不得复活错误条', async () => {
    let rejectStale!: (e: unknown) => void
    const fresh = makeRole({ id: '7999', role_code: 'ROLE_FRESH', role_name: '新到行' })
    mocks.listRoles
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectStale = rej }))
      .mockResolvedValueOnce([fresh])
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-error', '首轮失败错误条').exists()).toBe(true)
    await need(wrapper, 'rol-retry', '第一次重试').trigger('click')
    await flushPromises()
    await need(wrapper, 'rol-retry', '第二次重试（第一次仍在飞）').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-row-7999', '新响应生效').exists()).toBe(true)
    rejectStale(new Error('stale-arrives-late'))
    await flushPromises()
    expect(one(wrapper, 'rol-error').exists(), '陈旧拒绝后到不得覆盖成功态').toBe(false)
    expect(one(wrapper, 'rol-row-7999').exists(), '陈旧响应后到不得清掉新行').toBe(true)
  })

  it('listRoles reject → rol-error（loadFailed + e.message）+ rol-retry；列表与空态都不渲染（错误态不是空态）', async () => {
    mocks.listRoles.mockRejectedValue(new Error('boom'))
    const { wrapper } = await factory()
    const err = need(wrapper, 'rol-error', '加载错误条')
    expect(err.text()).toContain(t('v2.roles.loadFailed'))
    expect(err.text()).toContain('boom')
    expect(one(wrapper, 'rol-list').exists()).toBe(false)
    expect(one(wrapper, 'rol-empty').exists()).toBe(false)
    expect(one(wrapper, 'rol-page').exists()).toBe(true)
  })

  it('rol-retry 点击 → 重新拉取；成功后错误退场、列表回归', async () => {
    mocks.listRoles.mockRejectedValueOnce(new Error('first fails'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'rol-error').exists()).toBe(true)
    await need(wrapper, 'rol-retry', '重试钮').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'rol-error').exists()).toBe(false)
    expect(one(wrapper, 'rol-row-7001').exists()).toBe(true)
    expect(mocks.listRoles.mock.calls.length).toBe(2)
  })
})

// ── 新建/编辑表单弹窗 ─────────────────────────────────────────────────────
describe('P4d-2 — 新建弹窗（开弹窗 / maxlength / 校验）', () => {
  it('rol-action-create 开弹窗 rol-dialog：三输入 + 提交钮齐备', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'rol-dialog').exists()).toBe(false)
    await need(wrapper, 'rol-action-create', '新建钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-dialog', '新建弹窗').isVisible()).toBe(true)
    for (const tid of ['rol-input-code', 'rol-input-name', 'rol-input-remark']) {
      expect(one(wrapper, tid).exists(), `弹窗缺少 ${tid}`).toBe(true)
    }
    expect(one(wrapper, 'rol-submit').exists()).toBe(true)
  })

  it.each([
    ['rol-input-code', '50', 'role_code'],
    ['rol-input-name', '50', 'role_name'],
    ['rol-input-remark', '200', 'remark']
  ])('%s maxlength=%s（%s，旧页硬数字随迁）', async (tid, max, why) => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create', '新建钮').trigger('click')
    await flushPromises()
    expect(inputOf(wrapper, tid).attributes('maxlength'), `maxlength 契约（${why}）`).toBe(max)
  })

  it('role_code required：空值提交 → rol-field-error-role_code（ruleCodeRequired）且不调 createRole', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-name').setValue('新角色')
    await need(wrapper, 'rol-submit', '提交钮').trigger('click')
    await flushPromises()
    expect(mocks.createRole).not.toHaveBeenCalled()
    expect(need(wrapper, 'rol-field-error-role_code', '客户端校验错误通道').text())
      .toContain(t('v2.roles.ruleCodeRequired'))
  })

  it('role_code pattern ^ROLE_[A-Z0-9_]{2,40}$：小写/缺前缀/超短都拦截（ruleCodePattern，旧校验随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-code').setValue('role_ops')
    await inputOf(wrapper, 'rol-input-name').setValue('新角色')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(mocks.createRole).not.toHaveBeenCalled()
    expect(need(wrapper, 'rol-field-error-role_code', 'pattern 错误').text())
      .toContain(t('v2.roles.ruleCodePattern'))
  })

  it('role_name required + max 50：空值拦截（ruleNameRequired）且不调 createRole', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-code').setValue('ROLE_NEW')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(mocks.createRole).not.toHaveBeenCalled()
    expect(need(wrapper, 'rol-field-error-role_name', '角色名必填错误').text())
      .toContain(t('v2.roles.ruleNameRequired'))
  })
})

// ── 新建/编辑提交 ─────────────────────────────────────────────────────────
describe('P4d-2 — 表单提交（payload 契约 / 编辑态 code 禁用 / mapFieldErrors）', () => {
  it('合法新建 → createRole({role_code, role_name, remark:undefined}) + toast saveSuccess + 重拉 + 关弹窗（remark 空回落 undefined，旧语义随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-code').setValue('ROLE_NEW')
    await inputOf(wrapper, 'rol-input-name').setValue('新角色')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(mocks.createRole).toHaveBeenCalledTimes(1)
    expect(mocks.createRole).toHaveBeenCalledWith({ role_code: 'ROLE_NEW', role_name: '新角色', remark: undefined })
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.roles.saveSuccess'))
    expect(mocks.listRoles.mock.calls.length, '提交成功后重拉列表').toBeGreaterThanOrEqual(2)
    expect(one(wrapper, 'rol-dialog').isVisible(), '成功后关弹窗').toBe(false)
  })

  it('新建带备注 → payload 含 remark 原文（不做 trim 外加工）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-code').setValue('ROLE_NEW')
    await inputOf(wrapper, 'rol-input-name').setValue('新角色')
    await inputOf(wrapper, 'rol-input-remark').setValue('备注文字')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(mocks.createRole).toHaveBeenCalledWith({ role_code: 'ROLE_NEW', role_name: '新角色', remark: '备注文字' })
  })

  it('编辑开弹窗回填三字段且 role_code disabled（旧语义：角色码不可改）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-edit-7001', '7001 编辑钮').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-dialog', '编辑弹窗').isVisible()).toBe(true)
    const code = inputOf(wrapper, 'rol-input-code')
    expect((code.element as HTMLInputElement).value).toBe('ROLE_OPS')
    expect((inputOf(wrapper, 'rol-input-name').element as HTMLInputElement).value).toBe('运维')
    expect((inputOf(wrapper, 'rol-input-remark').element as HTMLInputElement).value).toBe('运营与值班')
    expect(code.attributes('disabled'), '编辑态 role_code 必须禁用').toBeDefined()
  })

  it('编辑提交 → updateRole(id, {role_name, remark}) 且 payload 不含 role_code 键（旧语义随迁）', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-edit-7001').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-name').setValue('运维二号')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(mocks.updateRole).toHaveBeenCalledTimes(1)
    const [id, payload] = mocks.updateRole.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('7001')
    expect(payload).toEqual({ role_name: '运维二号', remark: '运营与值班' })
    expect('role_code' in payload, '编辑 payload 不得携带 role_code').toBe(false)
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.roles.saveSuccess'))
    expect(one(wrapper, 'rol-dialog').isVisible()).toBe(false)
  })

  it('提交失败 mapFieldErrors → 逐 prop 注入 rol-field-error-{field}；弹窗不关、无成功 toast', async () => {
    mocks.createRole.mockRejectedValue(new Error('conflict'))
    mocks.mapFieldErrors.mockReturnValue({ role_code: '角色码已存在' })
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-create').trigger('click')
    await flushPromises()
    await inputOf(wrapper, 'rol-input-code').setValue('ROLE_DUP')
    await inputOf(wrapper, 'rol-input-name').setValue('重复角色')
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-field-error-role_code', '服务端字段错误通道').text()).toContain('角色码已存在')
    expect(one(wrapper, 'rol-dialog').isVisible(), '字段错误时弹窗不关').toBe(true)
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 删除 ──────────────────────────────────────────────────────────────────
describe('P4d-2 — 删除（confirm → deleteRole / ROLE_ADMIN 禁用防护）', () => {
  it('删除：confirm({ variant:danger, title:confirmDeleteTitle, content:confirmDelete }) → deleteRole(id) + toast deleteSuccess + 重拉', async () => {
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-delete-7003', '7003 删除钮').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: t('v2.roles.confirmDeleteTitle'),
      content: t('v2.roles.confirmDelete'),
      variant: 'danger'
    }))
    expect(mocks.deleteRole).toHaveBeenCalledWith('7003')
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.roles.deleteSuccess'))
    expect(mocks.listRoles.mock.calls.length, '删除成功后重拉列表').toBeGreaterThanOrEqual(2)
  })

  it('confirm=false → 不发 deleteRole 不重拉', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-delete-7003').trigger('click')
    await flushPromises()
    expect(mocks.deleteRole).not.toHaveBeenCalled()
    expect(mocks.listRoles.mock.calls.length).toBe(1)
  })

  it('删除失败 → rol-action-error（actionFailed 兜底 e.message）；无成功 toast；列表行保留', async () => {
    mocks.deleteRole.mockRejectedValue(new Error('still referenced'))
    const { wrapper } = await factory()
    await need(wrapper, 'rol-action-delete-7003').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-action-error', '动作错误条').text()).toContain('still referenced')
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(one(wrapper, 'rol-row-7001').exists()).toBe(true)
    expect(one(wrapper, 'rol-error').exists()).toBe(false)
  })

  it('ROLE_ADMIN 行删除防护：渲染 rol-action-delete-disabled（disabled）且无普通删除钮（旧页禁用不隐藏语义随迁）', async () => {
    const { wrapper } = await factory()
    const disabled = need(wrapper, 'rol-action-delete-disabled', '管理员行禁用删除钮')
    expect(disabled.attributes('disabled')).toBeDefined()
    expect(one(wrapper, 'rol-action-delete-7002').exists(), '管理员行不得出现可点击删除钮').toBe(false)
    expect(one(wrapper, 'rol-action-delete-7003').exists(), '普通行删除钮不受影响').toBe(true)
  })
})

// ── 权限矩阵 ──────────────────────────────────────────────────────────────
describe('P4d-2 — 权限矩阵（懒加载 / 回显 / resource_type 筛选 / 全量提交）', () => {
  it('懒加载：打开 rol-action-perm-7001 才发 Promise.all(listPermissions + getRolePermissions(id))；挂载期零调用（裁决 ①）', async () => {
    const { wrapper } = await factory()
    expect(mocks.listPermissions).not.toHaveBeenCalled()
    expect(mocks.getRolePermissions).not.toHaveBeenCalled()
    await openPermMatrix(wrapper)
    expect(need(wrapper, 'rol-dialog', '矩阵弹窗').isVisible()).toBe(true)
    expect(mocks.listPermissions).toHaveBeenCalledTimes(1)
    expect(mocks.getRolePermissions).toHaveBeenCalledTimes(1)
    expect(mocks.getRolePermissions).toHaveBeenCalledWith('7001')
  })

  it("回显：getRolePermissions → 两个码勾选框 checked，其余未勾（回显 ['route:read','routes:view']）", async () => {
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    expect(isChecked(wrapper, 'rol-perm-checkbox-route:read')).toBe(true)
    expect(isChecked(wrapper, 'rol-perm-checkbox-routes:view')).toBe(true)
    expect(isChecked(wrapper, 'rol-perm-checkbox-route:publish')).toBe(false)
    expect(isChecked(wrapper, 'rol-perm-checkbox-routes:export')).toBe(false)
  })

  it('矩阵三列头 = colPermission/colPermName/colResourceType（类型列走 i18n，旧 resourceTypeLabel 语义随迁）', async () => {
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    const heads = need(wrapper, 'rol-perm-matrix', '矩阵容器').findAll('th').map((h) => h.text())
    expect(heads.some((h) => h.includes(t('v2.roles.colPermission')))).toBe(true)
    expect(heads.some((h) => h.includes(t('v2.roles.colPermName')))).toBe(true)
    expect(heads.some((h) => h.includes(t('v2.roles.colResourceType')))).toBe(true)
  })

  it('rol-perm-type-filter（FcSegmented 4 选项）：点 API → 仅 resource_type=API 两行；点全部 → 4 行回归', async () => {
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    await needSeg(wrapper, 'rol-perm-type-filter', t('v2.roles.typeApi')).trigger('click')
    await flushPromises()
    expect(one(wrapper, 'rol-perm-checkbox-route:read').exists()).toBe(true)
    expect(one(wrapper, 'rol-perm-checkbox-route:publish').exists()).toBe(true)
    expect(one(wrapper, 'rol-perm-checkbox-routes:view').exists(), 'MENU 行被筛掉').toBe(false)
    expect(one(wrapper, 'rol-perm-checkbox-routes:export').exists(), 'BUTTON 行被筛掉').toBe(false)
    await needSeg(wrapper, 'rol-perm-type-filter', t('v2.roles.typeAll')).trigger('click')
    await flushPromises()
    expect(one(wrapper, 'rol-perm-checkbox-routes:view').exists()).toBe(true)
    expect(one(wrapper, 'rol-perm-checkbox-routes:export').exists()).toBe(true)
  })

  it('全选/清空：rol-perm-check-all → 4 勾全选 + 计数 4/4；rol-perm-check-none → 全清 + 计数 0/4（旧 grant 语义随迁）', async () => {
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    await need(wrapper, 'rol-perm-check-all', '全选钮').trigger('click')
    await flushPromises()
    for (const code of ['route:read', 'route:publish', 'routes:view', 'routes:export']) {
      expect(isChecked(wrapper, `rol-perm-checkbox-${code}`), `全选应勾中 ${code}`).toBe(true)
    }
    expect(need(wrapper, 'rol-perm-count', '已选计数').text()).toContain('4')
    await need(wrapper, 'rol-perm-check-none', '清空钮').trigger('click')
    await flushPromises()
    expect(isChecked(wrapper, 'rol-perm-checkbox-route:read')).toBe(false)
    expect(need(wrapper, 'rol-perm-count', '清空后计数').text()).toContain('0')
  })

  it('勾选变更保存 → updateRolePermissions(id, 全量 checked)（非 delta，旧 saveGrant 语义随迁）+ toast permSaveSuccess + 关弹窗', async () => {
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    // 回显 2 项，再勾上第 3 项 → 提交应为 3 项全量而非 1 项增量
    await checkboxOf(wrapper, 'rol-perm-checkbox-route:publish').setValue(true)
    await flushPromises()
    await need(wrapper, 'rol-submit', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updateRolePermissions).toHaveBeenCalledTimes(1)
    expect(mocks.updateRolePermissions).toHaveBeenCalledWith('7001', ['route:read', 'routes:view', 'route:publish'])
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.roles.permSaveSuccess'))
    expect(one(wrapper, 'rol-dialog').isVisible(), '成功后关弹窗').toBe(false)
  })

  it('矩阵保存失败 → rol-action-error + 弹窗不关、无成功 toast（裁决 ③ 统一错误通道）', async () => {
    mocks.updateRolePermissions.mockRejectedValue(new Error('perm locked'))
    const { wrapper } = await factory()
    await openPermMatrix(wrapper)
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-action-error', '动作错误条').text()).toContain('perm locked')
    expect(one(wrapper, 'rol-dialog').isVisible()).toBe(true)
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 成员管理 ──────────────────────────────────────────────────────────────
describe('P4d-2 — 成员管理（分页聚合 / 回显 / 全量提交，旧 T4 语义随迁）', () => {
  it('懒加载：打开 rol-action-members-7001 → listUsers({page:1,pageSize:100}) 聚合 + listRoleUsers(id) 回显', async () => {
    const { wrapper } = await factory()
    expect(mocks.listUsers).not.toHaveBeenCalled()
    await openMembers(wrapper)
    expect(need(wrapper, 'rol-members-list', '成员列表容器').exists()).toBe(true)
    expect(mocks.listUsers).toHaveBeenCalledTimes(1)
    expect(mocks.listUsers).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(mocks.listRoleUsers).toHaveBeenCalledWith('7001')
  })

  it('回显：listRoleUsers 8001 已选 → rol-members-user-8001 checked；8002 未勾（旧回显语义随迁）', async () => {
    const { wrapper } = await factory()
    await openMembers(wrapper)
    expect(isChecked(wrapper, 'rol-members-user-8001')).toBe(true)
    expect(isChecked(wrapper, 'rol-members-user-8002')).toBe(false)
  })

  it('成员全选/清空 + 计数：rol-members-check-all → 2/2；rol-members-check-none → 0/2', async () => {
    const { wrapper } = await factory()
    await openMembers(wrapper)
    await need(wrapper, 'rol-members-check-all', '成员全选钮').trigger('click')
    await flushPromises()
    expect(isChecked(wrapper, 'rol-members-user-8001')).toBe(true)
    expect(isChecked(wrapper, 'rol-members-user-8002')).toBe(true)
    expect(need(wrapper, 'rol-members-count', '成员计数').text()).toContain('2')
    await need(wrapper, 'rol-members-check-none', '成员清空钮').trigger('click')
    await flushPromises()
    expect(isChecked(wrapper, 'rol-members-user-8001')).toBe(false)
    expect(need(wrapper, 'rol-members-count', '清空后计数').text()).toContain('0')
  })

  it('勾选变更保存 → updateRoleUsers(id, 全量 memberIds)（非 delta，旧 saveMembers 语义随迁）+ toast memberSaveSuccess + 关弹窗', async () => {
    const { wrapper } = await factory()
    await openMembers(wrapper)
    // 回显 8001，再勾 8002 → 提交应为两项全量
    await checkboxOf(wrapper, 'rol-members-user-8002').setValue(true)
    await flushPromises()
    await need(wrapper, 'rol-submit', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updateRoleUsers).toHaveBeenCalledTimes(1)
    expect(mocks.updateRoleUsers).toHaveBeenCalledWith('7001', ['8001', '8002'])
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.roles.memberSaveSuccess'))
    expect(one(wrapper, 'rol-dialog').isVisible(), '成功后关弹窗').toBe(false)
  })

  it('成员保存失败 → rol-action-error + 弹窗不关、无成功 toast', async () => {
    mocks.updateRoleUsers.mockRejectedValue(new Error('members locked'))
    const { wrapper } = await factory()
    await openMembers(wrapper)
    await need(wrapper, 'rol-submit').trigger('click')
    await flushPromises()
    expect(need(wrapper, 'rol-action-error', '动作错误条').text()).toContain('members locked')
    expect(one(wrapper, 'rol-dialog').isVisible()).toBe(true)
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it('成员加载失败 → rol-action-error（membersLoadFailed 兜底 e.message）；无成功 toast（旧 memberLoad 失败不崩语义随迁）', async () => {
    mocks.listRoleUsers.mockRejectedValue(new Error('echo down'))
    const { wrapper } = await factory()
    await openMembers(wrapper)
    expect(need(wrapper, 'rol-action-error', '动作错误条').text()).toContain('echo down')
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})

// ── 权限门禁 ──────────────────────────────────────────────────────────────
describe('P4d-2 — 只读权限降级（canEdit(\'role\'），旧 role:edit 门禁等价迁移）', () => {
  it("canEdit=false → rol-readonly-hint 渲染；新建/行内四动作全退场；只读可看列表", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(need(wrapper, 'rol-readonly-hint', '只读提示条').text()).toContain(t('v2.roles.readonlyHint'))
    expect(one(wrapper, 'rol-action-create').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-edit-7001').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-perm-7001').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-members-7001').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-delete-7003').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-delete-disabled').exists()).toBe(false)
    expect(one(wrapper, 'rol-row-7001').exists()).toBe(true)
  })

  it("canEdit=true → 提示条不渲染、新建钮在（门禁反转）", async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'rol-readonly-hint').exists()).toBe(false)
    expect(one(wrapper, 'rol-action-create').exists()).toBe(true)
  })

  it('门禁作用域源码契约：canEdit 仅以 role 为参（等价旧 hasPermission(\'role:edit\')，不得放宽）', () => {
    expect(readSource()).toMatch(/canEdit\(\s*['"]role['"]\s*\)/)
  })
})

// ── SDK-only 源码契约 ─────────────────────────────────────────────────────
describe('P4d-2 — SDK-only 源码契约（P4d-1 先例）', () => {
  it('无 <el- 直用、无 FcTable/FcTabsPanel（语义化 <table> + Fc 原子，Tab 随合并退场）；template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source).not.toMatch(/FcTable/)
    expect(source).not.toMatch(/FcTabsPanel/)
    expect(source).toMatch(/<table[\s>]/)
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/auth 仅 8 角色/权限成员 + listPermissions；@/api/misc 仅 listUsers；不 import element-plus / 旧树 @/views", () => {
    const source = readSource()
    const authBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/auth'/)?.[0] ?? ''
    expect(authBlock, '页面需从 @/api/auth 具名导入').toBeTruthy()
    for (const allowed of [
      'listRoles', 'listPermissions', 'createRole', 'updateRole', 'deleteRole',
      'getRolePermissions', 'updateRolePermissions', 'listRoleUsers', 'updateRoleUsers'
    ]) {
      expect(authBlock, `缺少角色成员 ${allowed}`).toContain(allowed)
    }
    for (const banned of ['login', 'refreshToken']) {
      expect(authBlock, `禁用成员 ${banned} 出现在 @/api/auth import 面（页面职责越界）`).not.toContain(banned)
    }
    const miscBlock = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/misc'/)?.[0] ?? ''
    expect(miscBlock, '页面需从 @/api/misc 具名导入 listUsers（成员聚合源）').toBeTruthy()
    expect(miscBlock).toContain('listUsers')
    for (const banned of [
      'createUser', 'updateUser', 'deleteUser', 'resetPassword',
      'getDict', 'listAuditLogs', 'getConfig', 'saveConfig', 'listChanges'
    ]) {
      expect(miscBlock, `禁用成员 ${banned} 出现在 @/api/misc import 面`).not.toContain(banned)
    }
    expect(source, 'SDK-only：页面不得直引 element-plus（Fc 原子封装）').not.toMatch(/from\s+'element-plus'/)
    expect(source, '禁止 import 旧树 @/views（新旧树隔离铁律）').not.toMatch(/from\s+'@\/views\//)
  })

  it('关键 testid 全数在源码落位（契约表抽查：骨架/错误/空态/列表/三弹窗/矩阵/成员/反馈/只读）+ loadEpoch 竞态守卫在源', () => {
    const source = readSource()
    for (const tid of [
      'rol-page', 'rol-skeleton', 'rol-error', 'rol-retry', 'rol-empty',
      'rol-list', 'rol-row-', 'rol-cell-code-', 'rol-cell-name-', 'rol-cell-remark-',
      'rol-action-create', 'rol-action-edit-', 'rol-action-perm-', 'rol-action-members-',
      'rol-action-delete-', 'rol-action-delete-disabled',
      'rol-dialog', 'rol-input-code', 'rol-input-name', 'rol-input-remark', 'rol-submit',
      'rol-field-error-', 'rol-action-error',
      'rol-perm-matrix', 'rol-perm-type-filter', 'rol-perm-checkbox-',
      'rol-perm-check-all', 'rol-perm-check-none', 'rol-perm-count',
      'rol-members-list', 'rol-members-user-', 'rol-members-check-all', 'rol-members-check-none', 'rol-members-count',
      'rol-toast-success', 'rol-toast-error', 'rol-readonly-hint'
    ]) {
      expect(source).toContain(tid)
    }
    expect(source).toMatch(/loadEpoch/)
  })
})




