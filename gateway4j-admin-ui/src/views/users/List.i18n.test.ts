import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
  listRoles: vi.fn()
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

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<div class="table-stub"><slot /></div>' }
}))
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/form/FcButton.vue', () => ({
  default: { name: 'FcButton', props: ['variant', 'size', 'loading', 'type'], template: '<button class="btn-stub"><slot /></button>' }
}))
vi.mock('@/components/form/FcInput.vue', () => ({
  default: { name: 'FcInput', props: ['modelValue', 'placeholder', 'clearable', 'type', 'disabled'], template: '<input class="input-stub" />' }
}))
vi.mock('@/components/form/FcSelect.vue', () => ({
  default: { name: 'FcSelect', props: ['modelValue', 'options', 'multiple', 'placeholder'], template: '<select class="select-stub" />' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/display/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub" />' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: { name: 'FcDialog', props: ['open', 'title', 'width'], template: '<div class="dialog-stub" v-if="open"><slot /><slot name="footer" /></div>' }
}))
vi.mock('@/components/overlay/FcConfirm.vue', () => ({
  default: { name: 'FcConfirm', props: ['content'], template: '<span class="confirm-stub"><slot /></span>' }
}))
vi.mock('@/components/layout/FcSection.vue', () => ({
  default: { name: 'FcSection', template: '<div class="section-stub"><slot /></div>' }
}))
vi.mock('@/components/data/FcPagination.vue', () => ({
  default: { name: 'FcPagination', props: ['total'], template: '<div class="pagination-stub" />' }
}))
vi.mock('@/components/layout/FcFilterBar.vue', () => ({
  default: { name: 'FcFilterBar', template: '<div class="filter-bar-stub"><slot /><slot name="actions" /></div>' }
}))

import List from '@/views/users/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { create: '新建', edit: '编辑', delete: '删除', save: '保存', cancel: '取消', enable: '启用', disable: '禁用', more: '更多', empty: '暂无数据', search: '搜索', confirmDelete: '确定删除？', submit: '提交' },
      user: {
        list: '用户列表', name: '用户名', realName: '真实姓名', phone: '手机号',
        roles: '角色', status: '状态', password: '密码', newPassword: '新密码',
        createTitle: '新建用户', editTitle: '编辑用户', resetPassword: '重置密码',
        searchPlaceholder: '搜索用户', newPasswordHint: '留空则不修改'
      }
    }
  }
})

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.listRoles.mockReset().mockResolvedValue([])
})

function factory() {
  return mount(List, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-form': { template: '<form class="el-form"><slot /></form>' },
        'el-form-item': { props: ['label'], template: '<div class="el-form-item">{{ label }}<slot /></div>' },
        'el-table-column': { props: ['prop', 'label', 'width', 'fixed'], template: '<div class="col-stub" />' }
      }
    }
  })
}

describe('users/List.vue — i18n rendering', () => {
  it('mounts without errors with i18n', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('dialog form uses i18n labels when create dialog is open', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('用户名')
    expect(html).toContain('密码')
    expect(html).toContain('真实姓名')
    expect(html).toContain('手机号')
    expect(html).toContain('角色')
  })

  it('dialog cancel button uses i18n', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('取消')
  })

  it('reset password dialog uses i18n for newPassword and submit', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openReset({ id: '1', username: 'admin' })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('新密码')
    expect(html).toContain('提交')
  })

  it('edit dialog shows newPassword label with hint', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ id: '1', username: 'admin', status: 'ENABLED', role_codes: ['ROLE_ADMIN'], real_name: 'Admin', phone: '' })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('新密码')
  })
})
