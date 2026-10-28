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
  updateRolePermissions: vi.fn()
}))

vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles,
  listPermissions: mocks.listPermissions,
  createRole: mocks.createRole,
  updateRole: mocks.updateRole,
  deleteRole: mocks.deleteRole,
  getRolePermissions: mocks.getRolePermissions,
  updateRolePermissions: mocks.updateRolePermissions
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => false, hasAnyPermission: () => false, canEdit: () => false })
}))

// Stub i18n-dependent SDK components at module level.
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
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

function factory() {
  return mount(Roles, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.createRole.mockReset().mockResolvedValue({ id: 'r9' })
  mocks.updateRole.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.deleteRole.mockReset().mockResolvedValue(undefined)
  mocks.getRolePermissions.mockReset().mockResolvedValue([])
  mocks.updateRolePermissions.mockReset().mockResolvedValue(undefined)
  mocks.listRoles.mockReset().mockResolvedValue([])
  mocks.listPermissions.mockReset().mockResolvedValue([])
})

describe('Roles.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts on roles tab', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.tab).toBe('roles')
  })

  it('exposes two tabs (roles, permissions)', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(2)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['roles', 'permissions'])
  })

  it('starts with empty roles + permissions', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.roles).toEqual([])
    expect(vm.permissions).toEqual([])
  })
})

describe('Roles.vue — onMounted loading', () => {
  it('calls listRoles and listPermissions on mount', async () => {
    factory()
    await flushPromises()
    expect(mocks.listRoles).toHaveBeenCalledTimes(1)
    expect(mocks.listPermissions).toHaveBeenCalledTimes(1)
  })

  it('populates roles from listRoles response', async () => {
    mocks.listRoles.mockResolvedValue([
      { id: '1', role_code: 'ADMIN', role_name: '管理员' },
      { id: '2', role_code: 'GUEST', role_name: '访客' }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.roles.length).toBe(2)
    expect(vm.roles[0].role_code).toBe('ADMIN')
  })

  it('populates permissions from listPermissions response', async () => {
    mocks.listPermissions.mockResolvedValue([
      { permission_code: 'route:read', permission_name: '查看路由', resource_type: 'ROUTE' },
      { permission_code: 'route:write', permission_name: '编辑路由', resource_type: 'ROUTE' }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.permissions.length).toBe(2)
    expect(vm.permissions[0].permission_code).toBe('route:read')
  })
})

describe('Roles.vue — tab switching', () => {
  it('changes tab to permissions', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.tab = 'permissions'
    expect(vm.tab).toBe('permissions')
  })
})

describe('Roles.vue — error resilience', () => {
  it('handles listRoles rejection without crashing (roles stays [])', async () => {
    mocks.listRoles.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).roles).toEqual([])
  })

  it('handles listPermissions rejection without crashing (permissions stays [])', async () => {
    mocks.listPermissions.mockRejectedValue(new Error('403'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).permissions).toEqual([])
  })
})