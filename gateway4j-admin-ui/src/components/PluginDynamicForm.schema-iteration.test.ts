import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

vi.mock('@/api/plugins', () => ({
  getBuiltinSchema: vi.fn()
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: {
    name: 'FcEmpty',
    props: ['title', 'type', 'description'],
    template: '<div class="fc-empty-stub" />'
  }
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

describe('PluginDynamicForm — template renders config_schema.properties, not top-level schema', () => {
  it('renders form fields for schema properties, not for top-level schema keys', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'rate-limit',
      plugin_name: 'Rate Limit',
      plugin_phase: 'PRE',
      description: 'Rate limiter',
      config_schema: {
        properties: {
          limit: { type: 'integer', title: 'Limit', default: 100 },
          mode: { type: 'string', title: 'Mode', default: 'fixed' }
        }
      }
    })
    const wrapper = factory({ pluginId: 'rate-limit' })
    await flushPromises()

    // The template should iterate over config_schema.properties (limit, mode)
    // NOT over the top-level schema keys (plugin_id, plugin_name, config_schema, etc.)
    const html = wrapper.html()
    // Should contain the property titles/labels
    expect(html).toContain('Limit')
    expect(html).toContain('Mode')
    // Should NOT render top-level keys like plugin_id, plugin_name as form fields
    expect(html).not.toContain('plugin_id')
    expect(html).not.toContain('plugin_name')
  })

  it('renders no form fields when config_schema has no properties', async () => {
    mocked.mockResolvedValue({
      plugin_id: 'noop',
      plugin_name: 'No-op',
      config_schema: { properties: {} }
    })
    const wrapper = factory({ pluginId: 'noop' })
    await flushPromises()

    // Should show FcEmpty when no properties
    expect(wrapper.find('.fc-empty-stub').exists() || wrapper.html().includes('暂无')).toBe(true)
  })
})
