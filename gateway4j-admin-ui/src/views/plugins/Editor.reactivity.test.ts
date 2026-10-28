import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  createPlugin: vi.fn(),
  validateGroovy: vi.fn(),
  getPlugin: vi.fn(),
  updatePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  createPlugin: mocks.createPlugin,
  validateGroovy: mocks.validateGroovy,
  getPlugin: mocks.getPlugin,
  updatePlugin: mocks.updatePlugin
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
      common: { cancel: '取消', save: '保存', failed: '操作失败', loadFailed: '加载失败', saveFailed: '保存失败' },
      plugin: { name: '插件名称', id: '插件标识', type: '类型', phase: '阶段', scope: '作用域', config: '配置参数', configForm: '插件配置', validate: '校验脚本', editorScriptRequired: '请先输入脚本', editorLoadError: '无法加载插件', editorValidateFailed: '校验失败：服务端异常', editorConfigJson: '配置 (JSON)', editorJarSelected: '已选择', editorTabBasic: '基础', editorTabGroovy: 'Groovy 脚本', editorTabJar: 'JAR 文件', nameRequired: '请输入插件名称', namePattern: '插件名称需 2-50 位字母数字下划线', idRequired: '请输入插件标识', phaseRequired: '请选择插件阶段', sortOrderRange: '排序值范围 1-9999', configJsonInvalid: '配置参数格式错误', jarSizeExceeded: 'JAR 文件不可超过 50MB' },
      route: { groovyValid: '语法正确', groovyInvalid: '错误' }
    }
  }
})

function makeRouter(initialPath = '/plugins/p1/edit') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/plugins', component: { template: '<div />' } },
      { path: '/plugins/:id/edit', name: 'PluginEdit', component: Editor }
    ]
  })
}

async function factoryWithRoute(pluginId: string) {
  const router = makeRouter(`/plugins/${pluginId}/edit`)
  await router.push('/')
  await router.isReady()
  await router.push(`/plugins/${pluginId}/edit`)
  await flushPromises()
  const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  mocks.createPlugin.mockReset().mockResolvedValue({ id: 'p1' })
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getPlugin.mockReset().mockResolvedValue(null)
  mocks.updatePlugin.mockReset().mockResolvedValue({})
})

describe('plugins/Editor.vue — pluginId reactivity', () => {
  it('loads plugin data on mount when pluginId is present', async () => {
    mocks.getPlugin.mockResolvedValue({ id: 'p1', plugin_name: 'Plugin A', plugin_id: 'pa', plugin_type: 'GROOVY', plugin_phase: 'PRE', scope: 'ROUTE', sort_order: 1, config: '{}' })
    const { wrapper } = await factoryWithRoute('p1')
    await flushPromises()
    expect(mocks.getPlugin).toHaveBeenCalledWith('p1')
    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('Plugin A')
  })

  it('reloads plugin data when route params change', async () => {
    mocks.getPlugin.mockResolvedValueOnce({ id: 'p1', plugin_name: 'Plugin A', plugin_id: 'pa', plugin_type: 'GROOVY', plugin_phase: 'PRE', scope: 'ROUTE', sort_order: 1, config: '{}' })
    mocks.getPlugin.mockResolvedValueOnce({ id: 'p2', plugin_name: 'Plugin B', plugin_id: 'pb', plugin_type: 'JAR', plugin_phase: 'POST', scope: 'GLOBAL', sort_order: 2, config: '{}' })

    const { wrapper, router } = await factoryWithRoute('p1')
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('Plugin A')

    // Navigate to a different plugin
    await router.push('/plugins/p2/edit')
    await flushPromises()

    expect(mocks.getPlugin).toHaveBeenCalledWith('p2')
    expect(vm.form.plugin_name).toBe('Plugin B')
  })

  it('resets form when navigating from edit to create (no id)', async () => {
    mocks.getPlugin.mockResolvedValue({ id: 'p1', plugin_name: 'Plugin A', plugin_id: 'pa', plugin_type: 'GROOVY', plugin_phase: 'PRE', scope: 'ROUTE', sort_order: 1, config: '{}' })

    const router = makeRouter('/plugins/p1/edit')
    await router.push('/')
    await router.isReady()
    await router.push('/plugins/p1/edit')
    await flushPromises()

    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('Plugin A')

    // Navigate to create (no id)
    await router.push('/plugins')
    await flushPromises()

    // pluginId becomes undefined, form should reset to defaults
    expect(vm.form.plugin_name).toBe('')
    expect(vm.form.plugin_type).toBe('GROOVY')
  })
})
