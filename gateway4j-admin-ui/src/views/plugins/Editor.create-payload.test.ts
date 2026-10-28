import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  createPlugin: vi.fn(),
  updatePlugin: vi.fn(),
  getPlugin: vi.fn(),
  validateGroovy: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  createPlugin: mocks.createPlugin,
  updatePlugin: mocks.updatePlugin,
  getPlugin: mocks.getPlugin,
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
        jarSizeExceeded: 'JAR 文件不可超过 50MB', scriptSizeExceeded: 'Groovy 脚本不可超过 64KB',
        jarFileRequired: 'JAR 类型插件必须上传 JAR 文件'
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
      { path: '/plugins/new', component: Editor }
    ]
  })
}

beforeEach(() => {
  mocks.createPlugin.mockReset().mockResolvedValue({ id: 'p1' })
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.getPlugin.mockReset().mockResolvedValue({})
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
})

describe('plugins/Editor.vue — create payload includes sort_order and remark', () => {
  it('includes sort_order and remark in GROOVY create payload', async () => {
    const router = makeRouter()
    await router.push('/plugins/new')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any

    vm.form.plugin_name = 'my-plugin'
    vm.form.plugin_id = 'my-plugin-id'
    vm.form.plugin_type = 'GROOVY'
    vm.form.plugin_phase = 'PRE'
    vm.form.scope = 'ROUTE'
    vm.form.sort_order = 10
    vm.form.remark = 'test remark'
    vm.form.script_content = 'return true'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()

    const call = mocks.createPlugin.mock.calls[0]
    const payload = call[0]
    expect(payload.sort_order).toBe(10)
    expect(payload.remark).toBe('test remark')
  })

  it('includes sort_order and remark in JAR FormData create payload', async () => {
    const router = makeRouter()
    await router.push('/plugins/new')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any

    vm.form.plugin_name = 'my-jar'
    vm.form.plugin_id = 'my-jar-id'
    vm.form.plugin_type = 'JAR'
    vm.form.plugin_phase = 'PRE'
    vm.form.scope = 'ROUTE'
    vm.form.sort_order = 5
    vm.form.remark = 'jar remark'
    vm.form.jar_file = new File(['x'], 'plugin.jar', { type: 'application/java-archive' })
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()

    const call = mocks.createPlugin.mock.calls[0]
    const payload = call[0]
    expect(payload instanceof FormData).toBe(true)
    expect((payload as FormData).get('sort_order')).toBe('5')
    expect((payload as FormData).get('remark')).toBe('jar remark')
  })
})
