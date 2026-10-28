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
      plugin: {
        name: '插件名称', id: '插件标识', type: '类型', phase: '阶段', scope: '作用域',
        config: '配置参数', configForm: '插件配置', validate: '校验脚本',
        editorScriptRequired: '请先输入脚本', editorLoadError: '无法加载插件',
        editorValidateFailed: '校验失败：服务端异常', editorConfigJson: '配置 (JSON)',
        editorJarSelected: '已选择', editorTabBasic: '基础', editorTabGroovy: 'Groovy 脚本',
        editorTabJar: 'JAR 文件',
        nameRequired: '请输入插件名称', namePattern: '插件名称需 2-50 位字母数字下划线',
        idRequired: '请输入插件标识', phaseRequired: '请选择插件阶段',
        sortOrderRange: '排序值范围 1-9999', configJsonInvalid: '配置参数格式错误',
        jarSizeExceeded: 'JAR 文件不可超过 50MB'
      },
      route: { groovyValid: '语法正确', groovyInvalid: '错误' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/plugins', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(Editor, {
    global: { plugins: [i18n, router] }
  })
}

beforeEach(() => {
  mocks.createPlugin.mockReset().mockResolvedValue({ id: 'p1' })
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getPlugin.mockReset().mockResolvedValue(null)
  mocks.updatePlugin.mockReset().mockResolvedValue({})
})

describe('plugins/Editor.vue — save error UX', () => {
  it('starts with empty saveError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).saveError).toBe('')
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(false)
  })

  it('createPlugin rejection sets saveError with error message', async () => {
    mocks.createPlugin.mockRejectedValue(new Error('plugin_id 重复'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p1'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.saveError).toBe('plugin_id 重复')
  })

  it('createPlugin rejection renders error in UI (footer slot)', async () => {
    mocks.createPlugin.mockRejectedValue(new Error('plugin_id 重复'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p1'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    const errEl = wrapper.find('[data-testid="save-error"]')
    expect(errEl.exists()).toBe(true)
    expect(errEl.text()).toBe('plugin_id 重复')
  })

  it('saveError is cleared before each save attempt', async () => {
    mocks.createPlugin.mockRejectedValueOnce(new Error('first'))
    mocks.createPlugin.mockResolvedValueOnce({ id: 'p2' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p2'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.saveError).toBe('first')
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
  })

  it('successful save leaves saveError empty', async () => {
    mocks.createPlugin.mockResolvedValue({ id: 'p3' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p3'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(false)
  })

  it('failure in createPlugin does not navigate away', async () => {
    mocks.createPlugin.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p1'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(wrapper.vm.$route.path).not.toBe('/plugins')
    expect(vm.saveError).toBe('500')
  })

  it('Cancel button is rendered (footer slot works now)', async () => {
    const wrapper = await factory()
    const cancelText = '取消'
    expect(wrapper.text()).toContain(cancelText)
  })

  it('Save button is rendered (footer slot works now)', async () => {
    const wrapper = await factory()
    expect(wrapper.text()).toContain('保存')
  })
})
