import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/plugins', () => ({
  getBuiltinSchema: vi.fn()
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title', 'type', 'description'], template: '<div class="fc-empty-stub" />' }
}))

import { mount, flushPromises } from '@vue/test-utils'
import PluginDynamicForm from '@/components/PluginDynamicForm.vue'
import { getBuiltinSchema } from '@/api/plugins'

const mocked = vi.mocked(getBuiltinSchema)

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
    global: { plugins: [i18n] }
  })
}

describe('PluginDynamicForm — type-aware default values', () => {
  it('defaults integer fields to 0, not empty string', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          limit: { type: 'integer', title: 'Limit' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.limit).toBe(0)
  })

  it('defaults boolean fields to false, not empty string', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          enabled: { type: 'boolean', title: 'Enabled' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.enabled).toBe(false)
  })

  it('defaults array fields to [], not empty string', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          tags: { type: 'array', title: 'Tags', items: { enum: ['a', 'b'] } }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(Array.isArray(vm.model.tags)).toBe(true)
    expect(vm.model.tags).toEqual([])
  })

  it('defaults object fields to empty JSON string, not empty string', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          extra: { type: 'object', title: 'Extra' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.extra).toBe('{}')
  })

  it('respects explicit default values from schema', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'p1',
      config_schema: {
        properties: {
          limit: { type: 'integer', default: 100 },
          mode: { type: 'string', default: 'fast' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'p1' })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.model.limit).toBe(100)
    expect(vm.model.mode).toBe('fast')
  })
})
