import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listGlobalPlugins: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listGlobalPlugins: mocks.listGlobalPlugins,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))

import Global from '@/views/plugins/Global.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { empty: '暂无数据', loadFailed: '加载失败', actionFailed: '操作失败', sortFailed: '排序失败' },
      plugin: { globalPrePhase: '前置', globalPostPhase: '后置' }
    }
  }
})

beforeEach(() => {
  mocks.listGlobalPlugins.mockReset().mockResolvedValue([])
  mocks.sortGlobalPlugins.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

function factory() {
  return mount(Global, { global: { plugins: [i18n] } })
}

describe('Global.vue — drag sort rollback on failure', () => {
  it('reverts to server state when sortGlobalPlugins fails', async () => {
    // Initial server state: 3 plugins in PRE phase
    const serverOrder = [
      { id: '1', plugin_name: 'A', plugin_phase: 'PRE', status: 'ENABLED' },
      { id: '2', plugin_name: 'B', plugin_phase: 'PRE', status: 'ENABLED' },
      { id: '3', plugin_name: 'C', plugin_phase: 'PRE', status: 'ENABLED' }
    ]
    mocks.listGlobalPlugins.mockResolvedValue(serverOrder)
    mocks.sortGlobalPlugins.mockRejectedValue(new Error('Network error'))

    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    // Verify initial order
    expect(vm.prePlugins.map((p: any) => p.id)).toEqual(['1', '2', '3'])

    // Simulate drag-and-drop reorder (move item from index 0 to index 2)
    // Manually set drag state since dragFrom/dragPhase are module-level vars
    // not exposed via the component instance
    // Call onDragStart with a mock event to set dragFrom and dragPhase
    const mockEvent = { dataTransfer: { effectAllowed: '', setData: vi.fn() } } as any
    vm.onDragStart(mockEvent, 0, 'PRE')
    vm.onDrop(2, 'PRE')
    await flushPromises()

    // After sort failure, the list should revert to server state
    expect(mocks.sortGlobalPlugins).toHaveBeenCalled()
    // The list should be back to original order (or at least reloaded from server)
    expect(vm.prePlugins.map((p: any) => p.id)).toEqual(['1', '2', '3'])
  })

  it('updates list from server after successful sort', async () => {
    const serverOrder = [
      { id: '1', plugin_name: 'A', plugin_phase: 'PRE', status: 'ENABLED' },
      { id: '2', plugin_name: 'B', plugin_phase: 'PRE', status: 'ENABLED' }
    ]
    mocks.listGlobalPlugins.mockResolvedValue(serverOrder)
    mocks.sortGlobalPlugins.mockResolvedValue({})

    const wrapper = factory()
    await flushPromises()

    const vm = wrapper.vm as any
    const mockEvent = { dataTransfer: { effectAllowed: '', setData: vi.fn() } } as any
    vm.onDragStart(mockEvent, 0, 'PRE')
    vm.onDrop(1, 'PRE')
    await flushPromises()

    // After sort success, list should be reloaded from server
    expect(mocks.sortGlobalPlugins).toHaveBeenCalled()
    expect(mocks.listGlobalPlugins).toHaveBeenCalledTimes(2) // initial + reload
  })
})
