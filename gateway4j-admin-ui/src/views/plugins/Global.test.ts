import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listGlobalPlugins: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/plugins', () => ({
  listGlobalPlugins: mocks.listGlobalPlugins,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import GlobalPlugins from '@/views/plugins/Global.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      plugin: { name: '插件名称', phase: '阶段', scope: '作用域', status: '状态', order: '排序', global: '全局插件' },
      common: { enable: '启用', disable: '禁用', save: '保存', empty: '暂无数据' }
    }
  }
})

function factory() {
  return mount(GlobalPlugins, {
    global: { plugins: [i18n] }
  })
}

const SAMPLE_PRE = [
  { id: '1', plugin_name: '安全插件', plugin_id: 'security', plugin_type: 'BUILTIN', plugin_phase: 'PRE', scope: 'GLOBAL', status: 'ENABLED', sort_order: 1, config: '{}' },
  { id: '2', plugin_name: '限流插件', plugin_id: 'rate-limiter', plugin_type: 'BUILTIN', plugin_phase: 'PRE', scope: 'GLOBAL', status: 'DISABLED', sort_order: 2, config: '{}' }
]
const SAMPLE_POST = [
  { id: '3', plugin_name: '日志插件', plugin_id: 'logging', plugin_type: 'BUILTIN', plugin_phase: 'POST', scope: 'GLOBAL', status: 'ENABLED', sort_order: 1, config: '{}' }
]

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listGlobalPlugins.mockReset().mockResolvedValue([...SAMPLE_PRE, ...SAMPLE_POST])
  mocks.sortGlobalPlugins.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

describe('Global.vue — initial load', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('loads global plugins on mount', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(mocks.listGlobalPlugins).toHaveBeenCalled()
  })

  it('splits plugins into PRE and POST groups', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.prePlugins.length).toBe(2)
    expect(vm.postPlugins.length).toBe(1)
  })

  it('handles load error gracefully', async () => {
    mocks.listGlobalPlugins.mockRejectedValue(new Error('加载失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.loadError).toBe('加载失败')
    expect(vm.prePlugins).toEqual([])
    expect(vm.postPlugins).toEqual([])
  })
})

describe('Global.vue — enable/disable', () => {
  it('calls enablePlugin when toggling a disabled plugin', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.togglePlugin(SAMPLE_PRE[1])
    await flushPromises()
    expect(mocks.enablePlugin).toHaveBeenCalledWith('2')
  })

  it('calls disablePlugin when toggling an enabled plugin', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.togglePlugin(SAMPLE_PRE[0])
    await flushPromises()
    expect(mocks.disablePlugin).toHaveBeenCalledWith('1')
  })

  it('reloads after toggle', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.togglePlugin(SAMPLE_PRE[0])
    await flushPromises()
    expect(mocks.listGlobalPlugins).toHaveBeenCalledTimes(2)
  })

  it('shows action error on toggle failure', async () => {
    mocks.disablePlugin.mockRejectedValue(new Error('操作失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.togglePlugin(SAMPLE_PRE[0])
    await flushPromises()
    expect(vm.actionError).toBe('操作失败')
  })
})

describe('Global.vue — sort/reorder', () => {
  it('saves PRE sort order via sortGlobalPlugins', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const newOrder = [SAMPLE_PRE[1], SAMPLE_PRE[0]]
    await vm.saveSort('PRE', newOrder)
    await flushPromises()
    expect(mocks.sortGlobalPlugins).toHaveBeenCalledWith('PRE', ['2', '1'])
  })

  it('saves POST sort order via sortGlobalPlugins', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.saveSort('POST', SAMPLE_POST)
    await flushPromises()
    expect(mocks.sortGlobalPlugins).toHaveBeenCalledWith('POST', ['3'])
  })

  it('shows error on sort failure', async () => {
    mocks.sortGlobalPlugins.mockRejectedValue(new Error('排序失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.saveSort('PRE', SAMPLE_PRE)
    await flushPromises()
    expect(vm.actionError).toBe('排序失败')
  })

  it('reloads after successful sort', async () => {
    const wrapper = factory()
    await flushPromises()
    const callCount = mocks.listGlobalPlugins.mock.calls.length
    const vm = wrapper.vm as any
    await vm.saveSort('PRE', SAMPLE_PRE)
    await flushPromises()
    expect(mocks.listGlobalPlugins.mock.calls.length).toBe(callCount + 1)
  })
})

describe('Global.vue — tab switching', () => {
  it('defaults to PRE tab', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).tab).toBe('PRE')
  })

  it('exposes PRE and POST tabs', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['PRE', 'POST'])
  })
})
