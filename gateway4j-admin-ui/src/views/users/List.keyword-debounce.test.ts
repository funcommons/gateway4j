import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

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
      common: { search: '搜索', empty: '暂无数据', loadFailed: '加载失败' },
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

describe('users/List.vue — keyword debounce in reload', () => {
  it('uses debouncedKeyword (not keyword) in the reload API call', async () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, 'List.vue'), 'utf-8')
    // The reload function should use debouncedKeyword.value, not keyword.value
    // when passing the keyword to the API
    const reloadBlock = src.match(/async function reload\(\)[\s\S]*?^\}/m)
    expect(reloadBlock).toBeTruthy()
    expect(reloadBlock![0]).toContain('debouncedKeyword')
    expect(reloadBlock![0]).not.toMatch(/keyword\.value[^s]/)
  })

  it('passes debounced keyword value to listUsers API', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    // Set keyword and wait for debounce
    vm.keyword = 'admin'
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()

    // The last API call should have keyword: 'admin'
    const lastCall = mocks.listUsers.mock.calls[mocks.listUsers.mock.calls.length - 1]
    expect(lastCall[0].keyword).toBe('admin')
  })
})
