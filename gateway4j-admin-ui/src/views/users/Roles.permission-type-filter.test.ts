import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  listUsers: vi.fn()
}))

vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles,
  listPermissions: mocks.listPermissions,
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getRolePermissions: vi.fn(),
  updateRolePermissions: vi.fn(),
  listRoleUsers: vi.fn(),
  updateRoleUsers: vi.fn()
}))

vi.mock('@/api/misc', () => ({ listUsers: mocks.listUsers }))

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
      common: { empty: '暂无数据' },
      role: {
        tabRoles: '角色', tabMyPermissions: '我的权限', code: '编码', name: '名称',
        permission: '权限', type: '类型', noPermissions: '当前用户没有权限',
        typeMenu: '菜单', typeButton: '按钮', typeApi: '接口', typeAll: '全部', typeFilter: '权限类型'
      }
    }
  }
})

beforeEach(() => {
  mocks.listRoles.mockReset().mockResolvedValue([])
  mocks.listUsers.mockReset().mockResolvedValue({ records: [] })
  mocks.listPermissions.mockReset().mockResolvedValue([
    { permission_code: 'route:read', permission_name: '查看路由', resource_type: 'API' },
    { permission_code: 'menu:route', permission_name: '路由菜单', resource_type: 'MENU' }
  ])
})

describe('Roles — 权限类型筛选（FcRadioGroup）', () => {
  it('渲染 4 个单选项并按 resource_type 过滤', async () => {
    const wrapper = mount(Roles, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tab = 'permissions'
    await nextTick()

    const radios = wrapper.findAll('.fc-radio-button')
    expect(radios.length).toBe(4)
    expect(radios.map(r => r.text())).toEqual(['全部', '菜单', '按钮', '接口'])
    expect(vm.filteredPermissions.length).toBe(2)

    await radios[1].trigger('click')
    await nextTick()
    expect(vm.permissionType).toBe('MENU')
    expect(vm.filteredPermissions.map((p: any) => p.permission_code)).toEqual(['menu:route'])

    await radios[0].trigger('click')
    await nextTick()
    expect(vm.filteredPermissions.length).toBe(2)
  })
})
