import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getPlugin: vi.fn(),
  createPlugin: vi.fn(),
  updatePlugin: vi.fn(),
  validateGroovy: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  getPlugin: mocks.getPlugin,
  createPlugin: mocks.createPlugin,
  updatePlugin: mocks.updatePlugin,
  validateGroovy: mocks.validateGroovy
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Editor from '@/views/plugins/Editor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', failed: '失败', saveFailed: '保存失败' },
      plugin: {
        name: '插件名', id: '插件 ID', type: '类型', phase: '阶段', scope: '作用域',
        editorTabBasic: '基本', editorTabGroovy: 'Groovy', editorTabJar: 'JAR',
        nameRequired: '必填', idRequired: '必填', phaseRequired: '必填'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/plugins/new', name: 'PluginNew', component: Editor },
      { path: '/plugins/:id/edit', name: 'PluginEdit', component: Editor }
    ]
  })
}

beforeEach(() => {
  mocks.getPlugin.mockReset()
  mocks.createPlugin.mockReset().mockResolvedValue({})
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
})

async function factoryWithPlugin(pluginData: any) {
  mocks.getPlugin.mockResolvedValue(pluginData)
  const router = makeRouter()
  await router.push(`/plugins/${pluginData.plugin_id}/edit`)
  await router.isReady()
  const wrapper = mount(Editor, {
    global: {
      plugins: [i18n, router],
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea-stub />' }
      }
    }
  })
  await flushPromises()
  return { wrapper, router }
}

describe('plugins/Editor.vue — data preservation on update', () => {
  it('preserves sort_order from API response in the form', async () => {
    const { wrapper } = await factoryWithPlugin({
      plugin_id: 'rate-limit',
      plugin_name: '限流',
      plugin_type: 'GROOVY',
      plugin_phase: 'PRE',
      scope: 'ROUTE',
      config: '{}',
      script_content: 'return true',
      sort_order: 5,
      remark: 'Important plugin'
    })
    const vm = wrapper.vm as any
    expect(vm.form.sort_order).toBe(5)
    expect(vm.form.remark).toBe('Important plugin')
  })

  it('preserves sort_order and remark with default values when API omits them', async () => {
    const { wrapper } = await factoryWithPlugin({
      plugin_id: 'rate-limit',
      plugin_name: '限流',
      plugin_type: 'GROOVY',
      plugin_phase: 'PRE',
      scope: 'ROUTE',
      config: '{}',
      script_content: 'return true'
    })
    const vm = wrapper.vm as any
    // Should have sensible defaults, not undefined
    expect(vm.form.sort_order).not.toBeUndefined()
    expect(vm.form.remark).not.toBeUndefined()
  })
})
