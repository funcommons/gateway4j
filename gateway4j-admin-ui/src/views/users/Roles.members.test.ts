import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

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
  listUsers: vi.fn()
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

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: { name: 'FcDialog', props: ['open', 'title', 'width'], template: '<div class="dialog-stub" :data-open="open"><slot /><slot name="footer" /></div>' }
}))
vi.mock('@/components/display/FcSkeleton.vue', () => ({
  default: { name: 'FcSkeleton', props: ['variant', 'rows'], template: '<div class="skeleton-stub" />' }
}))

import Roles from '@/views/users/Roles.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      role: { tabRoles: '角色', tabMyPermissions: '我的权限', code: '编码', name: '名称', permission: '权限', type: '类型', noPermissions: '当前用户没有权限' }
    }
  }
})

const ROLES = [
  { id: 'r1', role_code: 'ROLE_OPS', role_name: '运维', remark: '' }
]

// 两页聚合：page1 返回 u1/u2（total=3），page2 返回 u3
function mockPagedUsers() {
  mocks.listUsers.mockImplementation(({ page }: { page: number }) => {
    if (page === 1) {
      return Promise.resolve({
        records: [
          { id: 'u1', username: 'alice', real_name: 'Alice', status: 'ENABLED' },
          { id: 'u2', username: 'bob', real_name: '', status: 'ENABLED' }
        ],
        total: 3
      })
    }
    return Promise.resolve({
      records: [{ id: 'u3', username: 'carol', real_name: 'Carol', status: 'ENABLED' }],
      total: 3
    })
  })
}

function factory() {
  return mount(Roles, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.listRoles.mockReset().mockResolvedValue(ROLES)
  mocks.listPermissions.mockReset().mockResolvedValue([])
  mocks.createRole.mockReset().mockResolvedValue({})
  mocks.updateRole.mockReset().mockResolvedValue({})
  mocks.deleteRole.mockReset().mockResolvedValue(undefined)
  mocks.getRolePermissions.mockReset().mockResolvedValue([])
  mocks.updateRolePermissions.mockReset().mockResolvedValue(undefined)
  mocks.listRoleUsers.mockReset().mockResolvedValue([{ id: 'u1', username: 'alice', real_name: 'Alice' }])
  mocks.updateRoleUsers.mockReset().mockResolvedValue(undefined)
  mocks.listUsers.mockReset()
  mockPagedUsers()
})

describe('Roles.vue — 角色成员管理 (T4)', () => {
  it('opens the member dialog, aggregates paged users and echoes already-assigned members', async () => {
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).openMembers(ROLES[0])
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.memberOpen).toBe(true)
    // /v1/users 全量分页聚合：2 + 1
    expect(mocks.listUsers).toHaveBeenCalledTimes(2)
    expect(vm.allUsers.map((u: any) => u.id)).toEqual(['u1', 'u2', 'u3'])
    // GET /v1/roles/{id}/users 回显已选
    expect(mocks.listRoleUsers).toHaveBeenCalledWith('r1')
    expect(vm.memberIds).toEqual(['u1'])
    expect(vm.memberLoading).toBe(false)
  })

  it('submits the full selection via PUT /v1/roles/{id}/users and closes on success', async () => {
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).openMembers(ROLES[0])
    await flushPromises()
    const vm = wrapper.vm as any
    vm.memberIds = ['u1', 'u3']
    await wrapper.find('[data-testid="save-members"]').trigger('click')
    await flushPromises()
    expect(mocks.updateRoleUsers).toHaveBeenCalledTimes(1)
    expect(mocks.updateRoleUsers).toHaveBeenCalledWith('r1', ['u1', 'u3'])
    expect(vm.memberOpen).toBe(false)
    expect(vm.memberError).toBe('')
  })

  it('keeps the dialog open and shows the error when the save fails', async () => {
    mocks.updateRoleUsers.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).openMembers(ROLES[0])
    await flushPromises()
    const vm = wrapper.vm as any
    vm.memberIds = ['u1']
    await wrapper.find('[data-testid="save-members"]').trigger('click')
    await flushPromises()
    expect(vm.memberOpen).toBe(true)
    expect(vm.memberError).toBe('500')
    expect(wrapper.find('[data-testid="member-error"]').exists()).toBe(true)
  })

  it('check-all / check-none toggle the full user list', async () => {
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).openMembers(ROLES[0])
    await flushPromises()
    const vm = wrapper.vm as any
    await wrapper.find('[data-testid="member-check-all"]').trigger('click')
    expect(vm.memberIds).toEqual(['u1', 'u2', 'u3'])
    await wrapper.find('[data-testid="member-check-none"]').trigger('click')
    expect(vm.memberIds).toEqual([])
  })

  it('shows the load error instead of crashing when echo fails', async () => {
    mocks.listRoleUsers.mockRejectedValue(new Error('404'))
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).openMembers(ROLES[0])
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.memberLoading).toBe(false)
    expect(vm.memberError).toBe('404')
  })
})
