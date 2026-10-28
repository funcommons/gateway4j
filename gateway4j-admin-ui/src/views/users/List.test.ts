import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
  listRoles: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
  deleteUser: mocks.deleteUser,
  resetPassword: mocks.resetPassword
}))

vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

// Stub i18n-dependent SDK components at module level.
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/users/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', more: '更多', delete: '删除', save: '保存',
        cancel: '取消', submit: '提交', actionFailed: '操作失败',
        loadFailed: '加载失败', saveFailed: '保存失败', confirmDelete: '确定删除？',
        edit: '编辑', enable: '启用', disable: '禁用', search: '搜索',
        confirm: '确认', back: '返回', yes: '是', no: '否',
        refresh: '刷新', export: '导出', import: '导入', publish: '发布',
        offline: '下线', loading: '加载中', empty: '暂无数据',
        enabled: '已启用', disabled: '已禁用', success: '操作成功',
        failed: '操作失败', sortFailed: '排序失败', loginFailed: '登录失败',
        exportFailed: '导出失败', importFailed: '导入失败'
      },
      user: {
        name: '用户名', realName: '真实姓名', phone: '电话',
        roles: '角色', status: '状态', resetPassword: '重置密码',
        createTitle: '新建用户', editTitle: '编辑用户',
        searchPlaceholder: '搜索用户', newPassword: '新密码',
        password: '密码', newPasswordHint: '留空则不修改',
        nameRequired: '请输入用户名', namePattern: '用户名需 2-30 位字母数字下划线',
        passwordRequired: '请输入密码', phonePattern: '请输入合法手机号'
      }
    }
  }
})

function factory() {
  return mount(List, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.createUser.mockReset().mockResolvedValue(undefined)
  mocks.deleteUser.mockReset().mockResolvedValue(undefined)
  mocks.resetPassword.mockReset().mockResolvedValue(undefined)
  mocks.listRoles.mockReset().mockResolvedValue([])
})

describe('users/List.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts with page=1, pageSize=20', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.page).toBe(1)
    expect(vm.pageSize).toBe(20)
  })

  it('starts with empty rows + total=0', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.rows).toEqual([])
    expect(vm.total).toBe(0)
  })

  it('starts with both dialogs closed', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.open).toBe(false)
    expect(vm.resetOpen).toBe(false)
  })

  it('initial form has default role ROLE_OPS', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.form.role_codes).toEqual(['ROLE_OPS'])
    expect(vm.form.username).toBe('')
    expect(vm.form.password).toBe('')
  })

  it('calls listUsers + listRoles on mount', async () => {
    factory()
    await flushPromises()
    expect(mocks.listUsers).toHaveBeenCalled()
    expect(mocks.listRoles).toHaveBeenCalled()
  })

  it('populates roleOptions from listRoles response', async () => {
    mocks.listRoles.mockResolvedValue([
      { id: '1', role_code: 'ADMIN', role_name: '管理员' },
      { id: '2', role_code: 'OPS', role_name: '运维' }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.roleOptions.length).toBe(2)
    expect(vm.roleOptions[0]).toEqual({ value: 'ADMIN', label: '管理员' })
  })
})

describe('users/List.vue — reload', () => {
  it('passes keyword filter to API (after debounce)', async () => {
    const wrapper = factory()
    await flushPromises()
    mocks.listUsers.mockClear()
    ;(wrapper.vm as any).keyword = 'al'
    await flushPromises()
    // keyword is debounced (300ms)
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    const calls = mocks.listUsers.mock.calls
    const last = calls[calls.length - 1][0]
    expect(last.keyword).toBe('al')
  })

  it('populates rows + total from response', async () => {
    mocks.listUsers.mockResolvedValue({
      records: [
        { id: '1', username: 'alice', real_name: 'Alice', phone: '111', status: 'ENABLED', role_codes: ['OPS'] },
        { id: '2', username: 'bob', real_name: 'Bob', phone: '222', status: 'DISABLED', role_codes: ['ADMIN'] }
      ],
      total: 25
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.rows.length).toBe(2)
    expect(vm.total).toBe(25)
  })
})

describe('users/List.vue — save (create user)', () => {
  it('calls createUser with form payload + closes dialog + reloads', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.form.username = 'alice'
    vm.form.password = 'pw'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    mocks.listUsers.mockClear()
    await vm.save()
    expect(mocks.createUser).toHaveBeenCalledTimes(1)
    const arg = mocks.createUser.mock.calls[0][0]
    expect(arg.username).toBe('alice')
    expect(arg.password).toBe('pw')
    expect(arg.role_codes).toEqual(['ROLE_OPS'])
    expect(vm.open).toBe(false)
    expect(vm.form.username).toBe('') // reset
    expect(mocks.listUsers).toHaveBeenCalled()
  })

  it('flips saving flag during request', async () => {
    let resolveCreate: (v: any) => void = () => {}
    mocks.createUser.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    const p = vm.save()
    await flushPromises()
    expect(vm.saving).toBe(true)
    resolveCreate(undefined)
    await p
    expect(vm.saving).toBe(false)
  })
})

describe('users/List.vue — del', () => {
  it('calls deleteUser(row.id) and reloads', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    mocks.listUsers.mockClear()
    await vm.del({ id: 'u1' })
    expect(mocks.deleteUser).toHaveBeenCalledWith('u1')
    expect(mocks.listUsers).toHaveBeenCalled()
  })
})

describe('users/List.vue — reset password', () => {
  it('openReset sets target + clears newPwd + opens dialog', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openReset({ id: 'u9' })
    expect(vm.targetUser?.id).toBe('u9')
    expect(vm.newPwd).toBe('')
    expect(vm.resetOpen).toBe(true)
  })

  it('doReset no-op when no target', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.targetUser = null
    vm.newPwd = 'whatever'
    await vm.doReset()
    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })

  it('doReset no-op when newPwd is empty', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.targetUser = { id: 'u1' }
    vm.newPwd = ''
    await vm.doReset()
    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })

  it('doReset calls resetPassword + closes dialog on success', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.targetUser = { id: 'u1' }
    vm.newPwd = 'newpw'
    await vm.doReset()
    expect(mocks.resetPassword).toHaveBeenCalledWith('u1', 'newpw')
    expect(vm.resetOpen).toBe(false)
  })

  it('doReset flips resetting flag during request', async () => {
    let resolveReset: (v: any) => void = () => {}
    mocks.resetPassword.mockImplementation(() => new Promise((resolve) => { resolveReset = resolve }))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.targetUser = { id: 'u1' }
    vm.newPwd = 'pw'
    const p = vm.doReset()
    expect(vm.resetting).toBe(true)
    resolveReset(undefined)
    await p
    expect(vm.resetting).toBe(false)
  })
})

describe('users/List.vue — error resilience', () => {
  it('handles listUsers rejection without crashing', async () => {
    mocks.listUsers.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).rows).toEqual([])
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('handles createUser rejection without leaving saving stuck', async () => {
    mocks.createUser.mockRejectedValue(new Error('400'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'a'
    vm.form.password = 'b'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.saving).toBe(false)
    expect(vm.open).toBe(true) // dialog stays open so user can retry
  })

  it('handles deleteUser rejection without crashing', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('403'))
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).del({ id: 'u1' })
    expect((wrapper.vm as any).rows).toBeDefined()
  })

  it('handles resetPassword rejection without leaving resetting stuck', async () => {
    mocks.resetPassword.mockRejectedValue(new Error('400'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.resetOpen = true
    vm.targetUser = { id: 'u1' }
    vm.newPwd = 'newpw'
    await vm.doReset()
    expect(vm.resetting).toBe(false)
    expect(vm.resetOpen).toBe(true)
  })

  it('handles listRoles rejection without crashing (roleOptions stays [])', async () => {
    mocks.listRoles.mockRejectedValue(new Error('403'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).roleOptions).toEqual([])
  })
})