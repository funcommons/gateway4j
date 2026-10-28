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

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<div class="table-stub"><slot /></div>' }
}))
vi.mock('@/components/data/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub" />' }
}))
vi.mock('@/components/data/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub" />' }
}))
vi.mock('@/components/data/FcPagination.vue', () => ({
  default: { name: 'FcPagination', props: ['total', 'currentPage', 'pageSize'], template: '<div class="pagination-stub" />' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: { name: 'FcDialog', props: ['open', 'title', 'width'], template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' }
}))

import List from '@/views/users/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', empty: '暂无数据' },
      user: { searchPlaceholder: '搜索用户' }
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
        'el-table-column': { template: '<div class="col-stub" />' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' }
      }
    }
  })
}

describe('users/List.vue — search page reset', () => {
  it('resets page to 1 when keyword changes (after debounce)', async () => {
    mocks.listUsers.mockResolvedValue({ records: [{ id: '1' }], total: 20 })
    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.page = 2
    await flushPromises()
    expect(vm.page).toBe(2)

    vm.keyword = 'admin'
    await flushPromises()
    // keyword is debounced (300ms), so page reset hasn't happened yet
    // Wait for debounce timer to fire
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    expect(vm.page).toBe(1)
  })
})
