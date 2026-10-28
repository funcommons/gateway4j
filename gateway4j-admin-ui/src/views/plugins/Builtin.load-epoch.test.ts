import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
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
      plugin: { configForm: '插件配置' }
    }
  }
})

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
})

function factory() {
  return mount(Builtin, { global: { plugins: [i18n] } })
}

describe('plugins/Builtin.vue — load race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite types if a stale load resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listBuiltinTypes.mockReset()
    mocks.listBuiltinTypes
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.load()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond([{ plugin_id: 'p2', plugin_name: 'New Plugin', plugin_phase: 'PRE', description: '', config_schema: {} }])
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst([{ plugin_id: 'p1', plugin_name: 'Old Plugin', plugin_phase: 'PRE', description: '', config_schema: {} }])
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Types should reflect the second (newer) load
    expect(vm.types[0].plugin_id).toBe('p2')
  })
})
