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
      role: { tabRoles: '角色', tabMyPermissions: '我的权限', code: '编码', name: '名称', permission: '权限', type: '类型', rolesLoadFailed: '角色加载失败', permissionsLoadFailed: '权限加载失败', noPermissions: '没有权限' }
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

describe('users/Roles.vue — load race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite roles if a stale load resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listRoles.mockReset()
    mocks.listRoles
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    // Need to also mock listPermissions for the second load
    mocks.listPermissions.mockResolvedValue([])

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.loadAll()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond([{ role_code: 'R2', role_name: 'New Role' }])
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst([{ role_code: 'R1', role_name: 'Old Role' }])
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Roles should reflect the second (newer) load
    expect(vm.roles[0].role_name).toBe('New Role')
  })

  it('does not set rolesLoadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listRoles.mockReset()
    mocks.listRoles
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    mocks.listPermissions.mockResolvedValue([])

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.loadAll()
    await flushPromises()

    // Resolve second load successfully
    resolveSecond([])
    await flushPromises()

    // Reject the first (stale) load
    rejectFirst(new Error('stale error'))
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Error from stale load should NOT appear
    expect(vm.rolesLoadError).toBe('')
  })
})
