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
      role: {
        tabRoles: '角色',
        tabMyPermissions: '我的权限',
        code: '编码',
        name: '名称',
        permission: '权限',
        type: '类型',
        noPermissions: '当前用户没有权限',
        rolesLoadFailed: '角色加载失败',
        permissionsLoadFailed: '权限加载失败'
      }
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

describe('Roles.vue — loading state', () => {
  it('shows loading on roles table during API call', async () => {
    let resolveRoles: (v: any) => void
    mocks.listRoles.mockReturnValue(new Promise(r => { resolveRoles = r }))
    mocks.listPermissions.mockResolvedValue([])

    const wrapper = factory()
    const vm = wrapper.vm as any

    // While loading, loading should be true
    expect(vm.rolesLoading).toBe(true)

    // Resolve the promise
    resolveRoles!([])
    await flushPromises()
    expect(vm.rolesLoading).toBe(false)
  })

  it('shows loading on permissions table during API call', async () => {
    let resolvePerms: (v: any) => void
    mocks.listRoles.mockResolvedValue([])
    mocks.listPermissions.mockReturnValue(new Promise(r => { resolvePerms = r }))

    const wrapper = factory()
    const vm = wrapper.vm as any

    expect(vm.permissionsLoading).toBe(true)

    resolvePerms!([])
    await flushPromises()
    expect(vm.permissionsLoading).toBe(false)
  })

  it('clears loading after error', async () => {
    mocks.listRoles.mockRejectedValue(new Error('500'))
    mocks.listPermissions.mockRejectedValue(new Error('403'))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    expect(vm.rolesLoading).toBe(false)
    expect(vm.permissionsLoading).toBe(false)
  })

  it('passes :loading to FcTable components', async () => {
    let resolveRoles: (v: any) => void
    mocks.listRoles.mockReturnValue(new Promise(r => { resolveRoles = r }))
    mocks.listPermissions.mockResolvedValue([])

    const wrapper = factory()

    // While roles are loading, the first table should have loading=true
    const tables = wrapper.findAllComponents({ name: 'FcTable' })
    const rolesTable = tables[0]
    expect(rolesTable.props('loading')).toBe(true)

    resolveRoles!([])
    await flushPromises()

    // After loading, loading should be false
    expect(rolesTable.props('loading')).toBe(false)
  })
})
