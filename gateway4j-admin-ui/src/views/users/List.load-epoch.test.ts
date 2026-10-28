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

describe('users/List.vue — reload race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite rows if a stale reload resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listUsers.mockReset()
    mocks.listUsers
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    // Trigger a second reload (e.g. user changed page)
    const secondLoad = vm.reload()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond({ records: [{ id: '2', username: 'new-user' }], total: 1 })
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst({ records: [{ id: '1', username: 'old-user' }], total: 1 })
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Rows should reflect the second (newer) load
    expect(vm.rows[0].username).toBe('new-user')
  })

  it('does not set loadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listUsers.mockReset()
    mocks.listUsers
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.reload()
    await flushPromises()

    // Resolve second load successfully
    resolveSecond({ records: [], total: 0 })
    await flushPromises()

    // Reject the first (stale) load
    rejectFirst(new Error('stale error'))
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Error from stale load should NOT appear
    expect(vm.loadError).toBe('')
  })
})
