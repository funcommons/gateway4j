import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  deletePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  deletePlugin: mocks.deletePlugin
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

import List from '@/views/plugins/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', empty: '暂无数据' },
      plugin: { searchPlaceholder: '搜索插件' }
    }
  }
})

beforeEach(() => {
  mocks.listPlugins.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.deletePlugin.mockReset().mockResolvedValue({})
})

function factory() {
  return mount(List, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-table-column': { template: '<div class="col-stub" />' }
      }
    }
  })
}

describe('plugins/List.vue — search debounce and page reset', () => {
  it('resets page to 1 when keyword changes (after debounce)', async () => {
    mocks.listPlugins.mockResolvedValue({ records: [{ id: '1' }], total: 20 })
    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.page = 2
    await flushPromises()
    expect(vm.page).toBe(2)

    vm.keyword = 'rate'
    await flushPromises()
    // keyword is debounced (300ms), so page reset hasn't happened yet
    // Wait for debounce timer to fire
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    expect(vm.page).toBe(1)
  })

  it('resets page to 1 when type filter changes', async () => {
    mocks.listPlugins.mockResolvedValue({ records: [], total: 0 })
    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.page = 3
    await flushPromises()

    vm.type = 'GROOVY'
    await flushPromises()
    expect(vm.page).toBe(1)
  })

  it('resets page to 1 when status filter changes', async () => {
    mocks.listPlugins.mockResolvedValue({ records: [], total: 0 })
    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.page = 3
    await flushPromises()

    vm.status = 'ENABLED'
    await flushPromises()
    expect(vm.page).toBe(1)
  })

  it('does not reset page when only page or pageSize changes', async () => {
    mocks.listPlugins.mockResolvedValue({ records: [], total: 0 })
    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.page = 2
    await flushPromises()
    expect(vm.page).toBe(2)
  })
})
