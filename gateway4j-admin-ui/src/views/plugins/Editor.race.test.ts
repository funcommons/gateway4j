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
      common: { cancel: '取消', save: '保存', failed: '失败', saveFailed: '保存失败', loadFailed: '加载失败' },
      plugin: {
        name: '插件名', id: '插件 ID', type: '类型', phase: '阶段', scope: '作用域',
        editorTabBasic: '基本', editorTabGroovy: 'Groovy', editorTabJar: 'JAR',
        nameRequired: '必填', idRequired: '必填', phaseRequired: '必填',
        editorLoadError: '加载失败'
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

describe('plugins/Editor.vue — race condition', () => {
  it('discards stale loadPlugin() result when pluginId changes mid-flight', async () => {
    // Simulate slow API for p1, fast API for p2
    let resolveP1: (v: any) => void = () => {}
    mocks.getPlugin.mockImplementation((id: string) => {
      if (id === 'p1') return new Promise((resolve) => { resolveP1 = resolve })
      return Promise.resolve({
        plugin_id: 'p2', plugin_name: 'Plugin2', plugin_type: 'GROOVY',
        plugin_phase: 'POST', scope: 'GLOBAL', config: '{}', script_content: '', sort_order: 0, remark: ''
      })
    })

    const router = makeRouter()
    await router.push('/plugins/p1/edit')
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

    // p1 is still loading. Navigate to p2.
    await router.push('/plugins/p2/edit')
    await flushPromises()

    // p2 should have loaded
    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('Plugin2')

    // Now resolve p1 (stale). The form should NOT be overwritten with p1's data.
    resolveP1({
      plugin_id: 'p1', plugin_name: 'StalePlugin1', plugin_type: 'JAR',
      plugin_phase: 'PRE', scope: 'ROUTE', config: '{}', script_content: '', sort_order: 0, remark: ''
    })
    await flushPromises()

    // Form should still show p2's data, not p1's stale data
    expect(vm.form.plugin_name).toBe('Plugin2')
    expect(vm.form.plugin_id).toBe('p2')
  })
})
