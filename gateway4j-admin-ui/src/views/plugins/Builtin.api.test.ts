import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  validateConfig: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  validateConfig: mocks.validateConfig
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
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
      common: { cancel: '取消', save: '保存', enable: '启用', disable: '禁用', search: '搜索', empty: '暂无数据' },
      plugin: { configForm: '插件配置' }
    }
  }
})

function makeType(over: Partial<any> = {}) {
  return {
    plugin_id: 'rate-limit', plugin_name: '限流', plugin_phase: 'PRE',
    description: '限流插件', config_schema: {}, instance_id: 'p1', status: 'ENABLED', ...over
  }
}

function factory() {
  return mount(Builtin, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.validateConfig.mockReset().mockResolvedValue({ is_valid: true })
})

describe('Builtin.vue — saveConfig with real API', () => {
  it('calls updatePlugin with plugin id and config on save', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType()])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = makeType({ instance_id: 'p1' })
    vm.config = { limit: 100, window: 60 }
    await vm.saveConfig()
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledWith('p1', { config: JSON.stringify({ limit: 100, window: 60 }) })
  })

  it('closes dialog on successful save', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType()])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = makeType({ instance_id: 'p1' })
    vm.dialog = true
    await vm.saveConfig()
    await flushPromises()
    expect(vm.dialog).toBe(false)
  })

  it('shows save error on updatePlugin failure', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType()])
    mocks.updatePlugin.mockRejectedValue(new Error('保存失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = makeType({ instance_id: 'p1' })
    vm.dialog = true
    await vm.saveConfig()
    await flushPromises()
    expect(vm.saveError).toBe('保存失败')
    expect(vm.dialog).toBe(true)
  })

  it('no-op when selected has no instance_id', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = { plugin_id: 'test', plugin_name: 'Test', plugin_phase: 'PRE', description: '', config_schema: {} }
    await vm.saveConfig()
    expect(mocks.updatePlugin).not.toHaveBeenCalled()
  })
})

describe('Builtin.vue — enable/disable', () => {
  it('calls enablePlugin for a disabled plugin', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ instance_id: 'p1', status: 'DISABLED' })])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus(makeType({ instance_id: 'p1', status: 'DISABLED' }))
    await flushPromises()
    expect(mocks.enablePlugin).toHaveBeenCalledWith('p1')
  })

  it('calls disablePlugin for an enabled plugin', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ instance_id: 'p1', status: 'ENABLED' })])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus(makeType({ instance_id: 'p1', status: 'ENABLED' }))
    await flushPromises()
    expect(mocks.disablePlugin).toHaveBeenCalledWith('p1')
  })

  it('reloads list after toggle', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ instance_id: 'p1', status: 'ENABLED' })])
    const wrapper = factory()
    await flushPromises()
    const callCount = mocks.listBuiltinTypes.mock.calls.length
    const vm = wrapper.vm as any
    await vm.toggleStatus(makeType({ instance_id: 'p1', status: 'ENABLED' }))
    await flushPromises()
    expect(mocks.listBuiltinTypes.mock.calls.length).toBeGreaterThan(callCount)
  })

  it('shows action error on toggle failure', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ instance_id: 'p1', status: 'ENABLED' })])
    mocks.disablePlugin.mockRejectedValue(new Error('操作失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleStatus(makeType({ instance_id: 'p1', status: 'ENABLED' }))
    await flushPromises()
    expect(vm.actionError).toBe('操作失败')
  })
})
