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
  default: {
    name: 'FcEmpty',
    props: ['title', 'type'],
    template: '<div class="empty-stub" :data-type="type" :data-title="title" />'
  }
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

describe('Roles.vue — load() error feedback (no more misleading "no permission" empty)', () => {
  it('starts with empty errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).rolesLoadError).toBe('')
    expect((wrapper.vm as any).permissionsLoadError).toBe('')
  })

  it('listRoles failure sets rolesLoadError with server message', async () => {
    mocks.listRoles.mockRejectedValue(new Error('角色查询失败'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).rolesLoadError).toBe('角色查询失败')
  })

  it('listPermissions failure sets permissionsLoadError', async () => {
    mocks.listPermissions.mockRejectedValue(new Error('权限查询失败'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).permissionsLoadError).toBe('权限查询失败')
  })

  it('successful load clears both errors', async () => {
    mocks.listRoles.mockResolvedValue([
      { id: '1', role_code: 'ADMIN', role_name: '管理员' }
    ])
    mocks.listPermissions.mockResolvedValue([
      { permission_code: 'p1', permission_name: 'P', resource_type: 'R' }
    ])
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).rolesLoadError).toBe('')
    expect((wrapper.vm as any).permissionsLoadError).toBe('')
  })

  it('API failure for permissions does NOT trigger misleading "no permission" empty', async () => {
    mocks.listPermissions.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    vm_to_permissions_tab(wrapper)
    await flushPromises()
    const emptyEl = wrapper.find('.empty-stub')
    // Either no empty element OR it shows error type, NOT "no-result"/"no-data"
    if (emptyEl.exists()) {
      const type = emptyEl.attributes('data-type')
      const title = emptyEl.attributes('data-title') ?? ''
      // The misleading "当前用户没有权限" should NOT be shown on API failure
      expect(title).not.toContain('当前用户没有权限')
      // The error message should be shown somewhere
      expect(type === 'error' || (wrapper.vm as any).permissionsLoadError).toBeTruthy()
    }
  })

  it('truly empty permissions (API succeeded, array empty) still shows original empty state', async () => {
    mocks.listPermissions.mockResolvedValue([])
    const wrapper = factory()
    await flushPromises()
    vm_to_permissions_tab(wrapper)
    await flushPromises()
    const emptyEl = wrapper.find('.empty-stub')
    expect(emptyEl.exists()).toBe(true)
    expect(emptyEl.attributes('data-title')).toContain('当前用户没有权限')
  })
})

function vm_to_permissions_tab(wrapper: any) {
  const vm = wrapper.vm as any
  vm.tab = 'permissions'
}
