import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
  listRoles: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
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

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

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
        edit: '编辑', enable: '启用', disable: '禁用', cancel: '取消',
        actionFailed: '操作失败', loadFailed: '加载失败', saveFailed: '保存失败',
        submit: '提交', confirm: '确认', search: '搜索', confirmDelete: '确定删除？'
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
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listUsers.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.createUser.mockReset().mockResolvedValue(undefined)
  mocks.updateUser.mockReset().mockResolvedValue(undefined)
  mocks.deleteUser.mockReset().mockResolvedValue(undefined)
  mocks.resetPassword.mockReset().mockResolvedValue(undefined)
  mocks.listRoles.mockReset().mockResolvedValue([])
})

describe('users/List.vue — edit user', () => {
  it('openEdit sets form from row + opens dialog in edit mode', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'Alice', phone: '111', role_codes: ['ADMIN'] })
    expect(vm.form.id).toBe('u1')
    expect(vm.form.username).toBe('alice')
    expect(vm.form.real_name).toBe('Alice')
    expect(vm.form.phone).toBe('111')
    expect(vm.form.role_codes).toEqual(['ADMIN'])
    expect(vm.isEdit).toBe(true)
    expect(vm.open).toBe(true)
  })

  it('save in edit mode calls updateUser instead of createUser', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'Alice', phone: '111', role_codes: ['ADMIN'] })
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(mocks.updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({
      real_name: 'Alice', phone: '111', role_codes: ['ADMIN']
    }))
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('save in edit mode does not send password field if unchanged', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'Alice', phone: '', role_codes: ['ADMIN'] })
    vm.form.password = ''
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    const payload = mocks.updateUser.mock.calls[0][1]
    expect(payload).not.toHaveProperty('password')
  })

  it('save in edit mode sends password if user filled it', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'Alice', phone: '', role_codes: ['ADMIN'] })
    vm.form.password = 'newpw123'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    const payload = mocks.updateUser.mock.calls[0][1]
    expect(payload.password).toBe('newpw123')
  })

  it('save in edit mode closes dialog + reloads on success', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    mocks.listUsers.mockClear()
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'Alice', phone: '', role_codes: ['ADMIN'] })
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.open).toBe(false)
    expect(vm.isEdit).toBe(false)
    expect(mocks.listUsers).toHaveBeenCalled()
  })

  it('save in edit mode shows error on failure and keeps dialog open', async () => {
    mocks.updateUser.mockRejectedValue(new Error('用户名已存在'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'A', phone: '', role_codes: [] })
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.actionError).toBe('用户名已存在')
    expect(vm.open).toBe(true)
    expect(vm.isEdit).toBe(true)
  })

  it('create mode (default) resets isEdit to false when opening create dialog', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // First open edit
    vm.openEdit({ id: 'u1', username: 'alice', real_name: 'A', phone: '', role_codes: [] })
    expect(vm.isEdit).toBe(true)
    vm.open = false
    // Now open create dialog via openCreate
    vm.openCreate()
    expect(vm.isEdit).toBe(false)
    expect(vm.form.id).toBeUndefined()
    expect(vm.form.username).toBe('')
  })
})

describe('users/List.vue — toggle status', () => {
  it('toggleStatus calls updateUser with ENABLED when user is DISABLED', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus({ id: 'u1', status: 'DISABLED' })
    expect(mocks.updateUser).toHaveBeenCalledWith('u1', { status: 'ENABLED' })
  })

  it('toggleStatus calls updateUser with DISABLED when user is ENABLED', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus({ id: 'u1', status: 'ENABLED' })
    expect(mocks.updateUser).toHaveBeenCalledWith('u1', { status: 'DISABLED' })
  })

  it('toggleStatus reloads list after success', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    mocks.listUsers.mockClear()
    await vm.toggleStatus({ id: 'u1', status: 'ENABLED' })
    expect(mocks.listUsers).toHaveBeenCalled()
  })

  it('toggleStatus shows error on failure', async () => {
    mocks.updateUser.mockRejectedValue(new Error('403'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus({ id: 'u1', status: 'ENABLED' })
    expect(vm.actionError).toBe('403')
  })
})
