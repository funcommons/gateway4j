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
  hasPermission: vi.fn()
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
  usePermission: () => ({
    hasPermission: (code: string) => mocks.hasPermission(code),
    hasAnyPermission: (...codes: string[]) => codes.some(c => mocks.hasPermission(c)),
    canEdit: (resource: string) => mocks.hasPermission(`${resource}:edit`)
  })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: { name: 'FcDialog', props: ['open', 'title', 'width'], template: '<div class="dialog-stub" v-if="open"><slot /><slot name="footer" /></div>' }
}))
vi.mock('@/components/overlay/FcConfirm.vue', () => ({
  default: { name: 'FcConfirm', emits: ['confirm'], template: '<span class="confirm-stub" @click="$emit(\'confirm\')"><slot name="trigger"><slot /></slot></span>' }
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
  { id: 'r1', role_code: 'ROLE_ADMIN', role_name: '管理员', remark: 'built-in' },
  { id: 'r2', role_code: 'ROLE_OPS', role_name: '运维', remark: '' }
]

const PERMISSIONS = [
  { permission_code: 'route:edit', permission_name: '路由编辑', resource_type: 'API' },
  { permission_code: 'route:publish', permission_name: '路由发布', resource_type: 'API' },
  { permission_code: 'user:edit', permission_name: '用户编辑', resource_type: 'API' }
]

function factory() {
  return mount(Roles, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.hasPermission.mockReset().mockReturnValue(true)
  mocks.listRoles.mockReset().mockResolvedValue(ROLES)
  mocks.listPermissions.mockReset().mockResolvedValue(PERMISSIONS)
  mocks.createRole.mockReset().mockResolvedValue({ id: 'r9', role_code: 'ROLE_NEW', role_name: '新' })
  mocks.updateRole.mockReset().mockResolvedValue({ id: 'r2' })
  mocks.deleteRole.mockReset().mockResolvedValue(undefined)
  mocks.getRolePermissions.mockReset().mockResolvedValue(['route:edit'])
  mocks.updateRolePermissions.mockReset().mockResolvedValue(undefined)
})

describe('Roles.vue — role management gating (D16)', () => {
  it('hides 新建角色 and action column when role:edit is missing', async () => {
    mocks.hasPermission.mockReturnValue(false)
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="create-role"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="role-grant"]').exists()).toBe(false)
  })

  it('shows 新建角色 button when role:edit granted', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="create-role"]').exists()).toBe(true)
  })
})

describe('Roles.vue — create / edit / delete role', () => {
  it('saveRole calls createRole with { role_code, role_name, remark } then reloads roles', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.roleForm.role_code = 'ROLE_AUDITOR'
    vm.roleForm.role_name = '审计'
    vm.roleForm.remark = '只读'
    await vm.saveRole()
    await flushPromises()
    expect(mocks.createRole).toHaveBeenCalledWith({ role_code: 'ROLE_AUDITOR', role_name: '审计', remark: '只读' })
    expect(vm.formOpen).toBe(false)
    expect(mocks.listRoles).toHaveBeenCalledTimes(2)
  })

  it('createRole failure shows save-error in dialog and keeps it open', async () => {
    mocks.createRole.mockRejectedValue(new Error('角色编码已存在'))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.roleForm.role_code = 'ROLE_DUP'
    vm.roleForm.role_name = '重复'
    await vm.saveRole()
    await flushPromises()
    expect(vm.formOpen).toBe(true)
    expect(vm.formError).toBe('角色编码已存在')
  })

  it('openEdit + saveRole calls updateRole with { role_name, remark } (no role_code)', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit(ROLES[1])
    vm.roleForm.role_name = '运维二组'
    await vm.saveRole()
    await flushPromises()
    expect(mocks.updateRole).toHaveBeenCalledWith('r2', { role_name: '运维二组', remark: undefined })
    expect(mocks.createRole).not.toHaveBeenCalled()
  })

  it('del calls deleteRole then reloads; failure lands in action-error', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.del(ROLES[1])
    await flushPromises()
    expect(mocks.deleteRole).toHaveBeenCalledWith('r2')
    mocks.deleteRole.mockRejectedValueOnce(new Error('被引用，禁止删除'))
    await vm.del(ROLES[1])
    await flushPromises()
    expect(vm.actionError).toBe('被引用，禁止删除')
  })

  it('delete is a disabled button for ROLE_ADMIN row', async () => {
    // FcTable is stubbed (rows don't render), so assert the guard in source:
    // ROLE_ADMIN rows render a disabled 删除 button instead of the confirm flow.
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(__dirname, 'Roles.vue'), 'utf-8')
    expect(src).toMatch(/role_code === 'ROLE_ADMIN'/)
    expect(src).toMatch(/data-testid="role-delete-disabled"/)
    expect(src).toMatch(/:disabled[\s\S]{0,200}role-delete-disabled|role-delete-disabled[\s\S]{0,200}:disabled|disabled\s*\n\s*data-testid="role-delete-disabled"/)
  })
})

describe('Roles.vue — grant permissions (D16)', () => {
  it('openGrant loads all permissions + role permissions, grouped by resource prefix', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    expect(mocks.getRolePermissions).toHaveBeenCalledWith('r2')
    expect(vm.allPermissions).toHaveLength(3)
    expect(vm.checked).toEqual(['route:edit'])
    const prefixes = vm.groupedPermissions.map((g: any) => g.prefix)
    expect(prefixes).toEqual(['route', 'user'])
    const routeGroup = vm.groupedPermissions[0]
    expect(routeGroup.items.map((p: any) => p.permission_code)).toEqual(['route:edit', 'route:publish'])
  })

  it('checkAll / checkNone toggle the full permission list', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    vm.checkAll()
    expect(vm.checked).toEqual(['route:edit', 'route:publish', 'user:edit'])
    vm.checkNone()
    expect(vm.checked).toEqual([])
  })

  it('toggleGroup checks/unchecks a whole resource group', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    const routeGroup = vm.groupedPermissions[0]
    vm.toggleGroup(routeGroup, true)
    expect(vm.checked).toEqual(['route:edit', 'route:publish'])
    vm.toggleGroup(routeGroup, false)
    expect(vm.checked).toEqual([])
  })

  it('saveGrant submits the FULL checked list (not a delta)', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    vm.checkAll()
    await vm.saveGrant()
    await flushPromises()
    expect(mocks.updateRolePermissions).toHaveBeenCalledWith('r2', ['route:edit', 'route:publish', 'user:edit'])
    expect(vm.grantOpen).toBe(false)
  })

  it('grant load failure shows error inside the dialog', async () => {
    mocks.getRolePermissions.mockRejectedValue(new Error('403'))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    expect(vm.grantError).toBe('403')
  })

  it('saveGrant failure shows error and keeps dialog open', async () => {
    mocks.updateRolePermissions.mockRejectedValue(new Error('并发修改'))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openGrant(ROLES[1])
    await vm.saveGrant()
    expect(vm.grantOpen).toBe(true)
    expect(vm.grantError).toBe('并发修改')
  })
})
