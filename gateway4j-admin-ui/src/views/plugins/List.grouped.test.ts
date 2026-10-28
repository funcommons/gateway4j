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
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/plugins/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        more: '更多', enable: '启用', disable: '禁用', delete: '删除'
      },
      plugin: {
        name: '插件名', id: '插件 ID', type: '类型',
        phase: '阶段', scope: '范围', status: '状态',
        groupedView: '分组视图', tableView: '列表视图'
      }
    }
  }
})

function factory() {
  return mount(List, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.listPlugins.mockReset().mockResolvedValue({
    records: [], total: 0, size: 20, current: 1, pages: 0
  })
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.deletePlugin.mockReset().mockResolvedValue(undefined)
})

describe('plugins/List.vue — grouped view', () => {
  it('starts in table view mode', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).viewMode).toBe('table')
  })

  it('can switch to grouped view mode', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.viewMode = 'grouped'
    await flushPromises()
    expect(vm.viewMode).toBe('grouped')
  })

  it('grouped view computes groups by plugin_type', async () => {
    mocks.listPlugins.mockResolvedValue({
      records: [
        { id: '1', plugin_name: 'RateLimit', plugin_type: 'BUILTIN', status: 'ENABLED' },
        { id: '2', plugin_name: 'Auth', plugin_type: 'BUILTIN', status: 'ENABLED' },
        { id: '3', plugin_name: 'Custom', plugin_type: 'JAR', status: 'DISABLED' },
        { id: '4', plugin_name: 'Script', plugin_type: 'GROOVY', status: 'ENABLED' }
      ],
      total: 4, size: 20, current: 1, pages: 1
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.viewMode = 'grouped'
    await flushPromises()
    const groups = vm.groupedPlugins
    expect(groups.length).toBe(3)
    expect(groups[0].type).toBe('BUILTIN')
    expect(groups[0].items.length).toBe(2)
    expect(groups[1].type).toBe('JAR')
    expect(groups[1].items.length).toBe(1)
    expect(groups[2].type).toBe('GROOVY')
    expect(groups[2].items.length).toBe(1)
  })

  it('grouped view renders group sections in grouped mode', async () => {
    mocks.listPlugins.mockResolvedValue({
      records: [
        { id: '1', plugin_name: 'RateLimit', plugin_type: 'BUILTIN', status: 'ENABLED' },
        { id: '2', plugin_name: 'Custom', plugin_type: 'JAR', status: 'DISABLED' }
      ],
      total: 2, size: 20, current: 1, pages: 1
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.viewMode = 'grouped'
    await flushPromises()
    expect(wrapper.find('[data-testid="grouped-view"]').exists()).toBe(true)
    const groups = wrapper.findAll('[data-testid="plugin-group"]')
    expect(groups.length).toBe(2)
  })

  it('table view renders table in table mode', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="table-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="grouped-view"]').exists()).toBe(false)
  })

  it('view mode toggle button exists', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="view-toggle"]').exists()).toBe(true)
  })
})
