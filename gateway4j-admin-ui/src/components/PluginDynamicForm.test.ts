import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: {
    name: 'FcEmpty',
    props: ['title', 'type', 'description'],
    template: '<div class="fc-empty-stub" />'
  }
}))

vi.mock('@/api/plugins', () => ({
  getBuiltinSchema: vi.fn()
}))

import { mount, flushPromises } from '@vue/test-utils'
import PluginDynamicForm from '@/components/PluginDynamicForm.vue'
import { getBuiltinSchema } from '@/api/plugins'

const mocked = vi.mocked(getBuiltinSchema)

const STUBS: Record<string, any> = {
  'el-form-item': { template: '<div class="fi-stub"><slot /></div>' },
  'ElInputNumber': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input-stub type="number" />' },
  'el-switch': { props: ['modelValue'], emits: ['update:modelValue'], template: '<switch-stub />' },
  'el-select': { props: ['modelValue'], emits: ['update:modelValue'], template: '<select-stub><slot /></select-stub>' },
  'el-option': { props: ['value', 'label'], template: '<option-stub />' }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: { schemaLoading: '载入中...', noSchema: '暂无 schema' }
    }
  }
})

beforeEach(() => {
  mocked.mockReset()
})

function factory(props: Record<string, any>) {
  return mount(PluginDynamicForm, {
    props,
    global: { components: STUBS, plugins: [i18n] }
  })
}

describe('PluginDynamicForm', () => {
  it('calls getBuiltinSchema(pluginId) on mount', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'rate-limit',
      config_schema: { properties: {} }
    })
    const wrapper = factory({ pluginId: 'rate-limit' })
    await flushPromises()
    expect(mocked).toHaveBeenCalledWith('rate-limit')
  })

  it('does not call API when pluginId is empty', async () => {
    factory({ pluginId: '' })
    await flushPromises()
    expect(mocked).not.toHaveBeenCalled()
  })

  it('initializes model with default values from schema.properties', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          limit: { type: 'integer', default: 100 },
          enabled: { type: 'boolean', default: true },
          mode: { type: 'string', default: 'fast' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.limit).toBe(100)
    expect(vm.model.enabled).toBe(true)
    expect(vm.model.mode).toBe('fast')
  })

  it('preserves existing model values (only fills undefined)', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          limit: { type: 'integer', default: 100 },
          mode: { type: 'string', default: 'fast' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1', modelValue: { limit: 999, mode: 'slow' } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.limit).toBe(999)
    expect(vm.model.mode).toBe('slow')
  })

  it('falls back to empty string when schema property has no default', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          name: { type: 'string' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.name).toBe('')
  })

  it('sets loading=true during fetch, then false after', async () => {
    let resolveFetch: (v: any) => void = () => {}
    mocked.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve })
    )
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(true)
    resolveFetch({ plugin_id: 'p1', config_schema: { properties: {} } })
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('emits update:modelValue when model changes', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: { properties: {} }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.model = { foo: 'bar' }
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted!.at(-1)![0] as any
    expect(last.foo).toBe('bar')
  })

  it('handles API errors without crashing (loading still flips to false)', async () => {
    mocked.mockRejectedValue(new Error('boom'))
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('handles schema with no config_schema field gracefully', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1'
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.schema).toBeTruthy()
    expect(vm.model).toEqual({})
  })
})
