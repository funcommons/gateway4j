import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn(),
  validateConfig: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin,
  validateConfig: mocks.validateConfig
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

// Stub i18n-dependent SDK components at module level.
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

function makeType(over: Partial<any> = {}) {
  return {
    plugin_id: 'rate-limit', plugin_name: '限流', plugin_phase: 'PRE',
    description: '限流插件', config_schema: {}, ...over
  }
}

function factory() {
  return mount(Builtin, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('Builtin.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('calls listBuiltinTypes on mount', async () => {
    factory()
    await flushPromises()
    expect(mocks.listBuiltinTypes).toHaveBeenCalled()
  })

  it('starts with empty keyword, no dialog, no selection', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.keyword).toBe('')
    expect(vm.dialog).toBe(false)
    expect(vm.selected).toBeNull()
    expect(vm.config).toEqual({})
  })

  it('starts with empty types list and not loading after initial load', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType(), makeType({ plugin_id: 'cache' })])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.types.length).toBe(2)
    expect(vm.loading).toBe(false)
  })
})

describe('Builtin.vue — filtered computed', () => {
  it('returns all types when keyword is empty', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'rate-limit' }),
      makeType({ plugin_id: 'cache' }),
      makeType({ plugin_id: 'security' })
    ])
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).filtered.length).toBe(3)
  })

  it('matches types by plugin_id containing keyword', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'rate-limit' }),
      makeType({ plugin_id: 'cache' }),
      makeType({ plugin_id: 'ratelimit-v2' })
    ])
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).keyword = 'rate'
    const filtered = (wrapper.vm as any).filtered
    expect(filtered.length).toBe(2)
    expect(filtered.map((t: any) => t.plugin_id).sort()).toEqual(['rate-limit', 'ratelimit-v2'])
  })

  it('matches types by plugin_name containing keyword', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'a', plugin_name: '限流' }),
      makeType({ plugin_id: 'b', plugin_name: '缓存' }),
      makeType({ plugin_id: 'c', plugin_name: '限流 v2' })
    ])
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).keyword = '限流'
    const filtered = (wrapper.vm as any).filtered
    expect(filtered.length).toBe(2)
  })

  it('returns empty array when no match', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'a' }),
      makeType({ plugin_id: 'b' })
    ])
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).keyword = 'nonexistent'
    expect((wrapper.vm as any).filtered.length).toBe(0)
  })

  it('is case-insensitive on plugin_id', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'RateLimit' }),
      makeType({ plugin_id: 'rate-limit' })
    ])
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).keyword = 'Rate'
    const filtered = (wrapper.vm as any).filtered
    expect(filtered.length).toBe(2)
  })
})

describe('Builtin.vue — openConfig', () => {
  it('sets selected, resets config, opens dialog', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType()])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openConfig(makeType({ plugin_id: 'security', plugin_name: '安全' }))
    expect(vm.selected?.plugin_id).toBe('security')
    expect(vm.dialog).toBe(true)
    expect(vm.config).toEqual({})
  })
})

describe('Builtin.vue — saveConfig', () => {
  it('no-op when no plugin selected', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = null
    await vm.saveConfig()
    expect(vm.saving).toBe(false)
  })

  it('flips saving flag during save and closes dialog on success', async () => {
    mocks.updatePlugin.mockResolvedValue({})
    mocks.validateConfig.mockResolvedValue({ is_valid: true })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selected = makeType({ instance_id: 'p1' })
    vm.dialog = true
    const p = vm.saveConfig()
    expect(vm.saving).toBe(true)
    await p
    expect(vm.saving).toBe(false)
    expect(vm.dialog).toBe(false)
  })
})

describe('Builtin.vue — loading state', () => {
  it('flips loading during load and back to false after', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listBuiltinTypes.mockReset()
    mocks.listBuiltinTypes.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const p = vm.load()
    expect(vm.loading).toBe(true)
    resolveList([])
    await p
    expect(vm.loading).toBe(false)
  })
})

describe('Builtin.vue — error resilience', () => {
  it('handles listBuiltinTypes rejection without crashing', async () => {
    mocks.listBuiltinTypes.mockRejectedValue(new Error('503'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).types).toEqual([])
    expect((wrapper.vm as any).loading).toBe(false)
  })
})