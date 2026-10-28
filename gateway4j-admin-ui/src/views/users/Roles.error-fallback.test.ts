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

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
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

import Roles from '@/views/users/Roles.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      role: { tabRoles: '角色', tabMyPermissions: '我的权限', code: '编码', name: '名称', permission: '权限', type: '类型', noPermissions: '当前用户没有权限', rolesLoadFailed: '角色加载失败', permissionsLoadFailed: '权限加载失败' }
    }
  }
})

beforeEach(() => {
  mocks.createRole.mockReset().mockResolvedValue({ id: 'r9' })
  mocks.updateRole.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.deleteRole.mockReset().mockResolvedValue(undefined)
  mocks.getRolePermissions.mockReset().mockResolvedValue([])
  mocks.updateRolePermissions.mockReset().mockResolvedValue(undefined)
  mocks.listRoles.mockReset().mockResolvedValue([])
  mocks.listPermissions.mockReset().mockResolvedValue([])
})

function factory() {
  return mount(Roles, { global: { plugins: [i18n] } })
}

describe('users/Roles.vue — i18n error fallbacks', () => {
  it('uses i18n rolesLoadFailed fallback when listRoles rejects without message', async () => {
    mocks.listRoles.mockRejectedValue(new Error())
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).rolesLoadError).toBe('角色加载失败')
  })

  it('uses i18n permissionsLoadFailed fallback when listPermissions rejects without message', async () => {
    mocks.listPermissions.mockRejectedValue(new Error())
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).permissionsLoadError).toBe('权限加载失败')
  })
})
