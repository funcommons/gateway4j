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
      plugin: { name: '插件名称', id: '插件标识', type: '类型', phase: '阶段', scope: '作用域', config: '配置参数', configForm: '插件配置', validate: '校验脚本', editorScriptRequired: '请先输入脚本', editorLoadError: '无法加载插件', editorValidateFailed: '校验失败：服务端异常', editorConfigJson: '配置 (JSON)', editorJarSelected: '已选择', editorTabBasic: '基础', editorTabGroovy: 'Groovy 脚本', editorTabJar: 'JAR 文件', nameRequired: '请输入插件名称', namePattern: '插件名称需 2-50 位字母数字下划线', idRequired: '请输入插件标识', phaseRequired: '请选择插件阶段', sortOrderRange: '排序值范围 1-9999', configJsonInvalid: '配置参数格式错误', jarSizeExceeded: 'JAR 文件不可超过 50MB', jarFileRequired: 'JAR 类型插件必须上传 JAR 文件', scriptSizeExceeded: 'Groovy 脚本不可超过 64KB' },
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

describe('plugins/Editor.vue — Groovy script size validation', () => {
  it('rejects save when script_content exceeds 64KB (65536 bytes)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'big-script'
    vm.form.plugin_id = 'big-script-id'
    vm.form.plugin_type = 'GROOVY'
    // Create a string that's just over 64KB
    vm.form.script_content = 'x'.repeat(65537)
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(mocks.createPlugin).not.toHaveBeenCalled()
    expect(vm.saveError).toBeTruthy()
    expect(vm.saveError).toContain('64KB')
  })

  it('allows save when script_content is exactly 64KB (65536 bytes)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'exact-limit'
    vm.form.plugin_id = 'exact-limit-id'
    vm.form.plugin_type = 'GROOVY'
    vm.form.script_content = 'x'.repeat(65536)
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
  })

  it('allows save when script_content is well under 64KB', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'small-script'
    vm.form.plugin_id = 'small-script-id'
    vm.form.plugin_type = 'GROOVY'
    vm.form.script_content = 'return true'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
  })

  it('does not check script size for non-GROOVY types', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'builtin-big'
    vm.form.plugin_id = 'builtin-big-id'
    vm.form.plugin_type = 'BUILTIN'
    // Even if script_content is huge, BUILTIN type should not check it
    vm.form.script_content = 'x'.repeat(100000)
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
  })
})
