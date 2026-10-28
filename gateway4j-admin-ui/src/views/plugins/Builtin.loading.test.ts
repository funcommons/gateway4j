import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/display/FcSkeleton.vue', () => ({
  default: { name: 'FcSkeleton', props: ['variant', 'rows'], template: '<div class="skeleton-stub" role="status" aria-busy="true" />' }
}))
vi.mock('@/components/PluginDynamicForm.vue', () => ({
  default: {
    name: 'PluginDynamicForm',
    props: ['pluginId', 'modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="pdf-stub" />'
  }
}))

import Builtin from '@/views/plugins/Builtin.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', search: '搜索', empty: '暂无数据' },
      emptyState: { processing: '处理中' },
      plugin: { configForm: '插件配置' }
    }
  }
})

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

describe('Builtin.vue — loading indicator', () => {
  it('shows a loading indicator while data is being fetched', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listBuiltinTypes.mockReset()
    mocks.listBuiltinTypes.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))

    const wrapper = mount(Builtin, { global: { plugins: [i18n] } })

    // While loading, FcSkeleton should be rendered
    const vm = wrapper.vm as any
    expect(vm.loading).toBe(true)

    const skeletonStub = wrapper.find('.skeleton-stub')
    expect(skeletonStub.exists()).toBe(true)

    resolveList([])
    await flushPromises()
    expect(vm.loading).toBe(false)
  })

  it('shows empty state (not processing) after loading completes with no data', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([])
    const wrapper = mount(Builtin, { global: { plugins: [i18n] } })
    await flushPromises()

    const emptyStub = wrapper.find('.empty-stub')
    expect(emptyStub.exists()).toBe(true)
    expect(emptyStub.text()).toContain('暂无数据')
  })

  it('does not show empty/loading when data is present', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      { plugin_id: 'rate-limit', plugin_name: '限流', plugin_phase: 'PRE', description: '限流插件' }
    ])
    const wrapper = mount(Builtin, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('.empty-stub').exists()).toBe(false)
  })
})
