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
      plugin: { name: '插件名称', id: '插件标识', type: '类型', phase: '阶段', scope: '作用域', config: '配置参数', configForm: '插件配置', validate: '校验脚本', editorScriptRequired: '请先输入脚本', editorLoadError: '无法加载插件', editorValidateFailed: '校验失败：服务端异常', editorConfigJson: '配置 (JSON)', editorJarSelected: '已选择', editorTabBasic: '基础', editorTabGroovy: 'Groovy 脚本', editorTabJar: 'JAR 文件', nameRequired: '请输入插件名称', namePattern: '插件名称需 2-50 位字母数字下划线', idRequired: '请输入插件标识', phaseRequired: '请选择插件阶段', sortOrderRange: '排序值范围 1-9999', configJsonInvalid: '配置参数格式错误', jarSizeExceeded: 'JAR 文件不可超过 50MB', jarFileRequired: 'JAR 类型插件必须上传 JAR 文件' },
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

describe('plugins/Editor.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = await factory()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts on basic tab', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.tab).toBe('basic')
  })

  it('default form values', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('')
    expect(vm.form.plugin_id).toBe('')
    expect(vm.form.plugin_type).toBe('GROOVY')
    expect(vm.form.plugin_phase).toBe('PRE')
    expect(vm.form.scope).toBe('ROUTE')
    expect(vm.form.config).toBe('{}')
    expect(vm.form.script_content).toBe('')
    expect(vm.form.jar_file).toBeNull()
  })

  it('exposes 4 type options (BUILTIN, JAR, GROOVY, GROUP)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.typeOpts.map((o: any) => o.value)).toEqual(['BUILTIN', 'JAR', 'GROOVY', 'GROUP'])
  })
})

describe('plugins/Editor.vue — onJar', () => {
  it('sets form.jar_file from upload event', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const fakeFile = { name: 'plugin.jar', size: 1024 } as any
    vm.onJar([fakeFile])
    expect(vm.form.jar_file).toEqual(fakeFile)
  })

  it('does nothing when File[] is empty', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.onJar([])
    expect(vm.form.jar_file).toBeNull()
  })
})

describe('plugins/Editor.vue — validate', () => {
  it('shows hint and returns early when script_content is empty', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.validateGroovyScript()
    expect(vm.groovyResult).toBe('请先输入脚本')
    expect(mocks.validateGroovy).not.toHaveBeenCalled()
  })

  it('calls validateGroovy and shows 语法正确 on success', async () => {
    mocks.validateGroovy.mockResolvedValue({ is_valid: true })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.script_content = 'def x = 1; return true'
    await vm.validateGroovyScript()
    expect(mocks.validateGroovy).toHaveBeenCalledWith('def x = 1; return true')
    expect(vm.groovyResult).toBe('语法正确')
  })

  it('shows 错误: <msg> when validation reports error', async () => {
    mocks.validateGroovy.mockResolvedValue({ is_valid: false, error_message: 'Unexpected token' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.script_content = 'def x ='
    await vm.validateGroovyScript()
    expect(vm.groovyResult).toBe('错误: Unexpected token')
  })
})

describe('plugins/Editor.vue — save', () => {
  it('calls createPlugin with mapped payload + navigates to /plugins', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'my-plugin'
    vm.form.plugin_id = 'my-plugin-id'
    vm.form.plugin_type = 'GROOVY'
    vm.form.script_content = 'return true'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    const arg = mocks.createPlugin.mock.calls[0][0]
    expect(arg.plugin_name).toBe('my-plugin')
    expect(arg.plugin_id).toBe('my-plugin-id')
    expect(arg.plugin_type).toBe('GROOVY')
    expect(arg.script_content).toBe('return true')
    expect(wrapper.vm.$route.path).toBe('/plugins')
  })

  it('omits script_content for non-GROOVY plugin types (BUILTIN)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_type = 'BUILTIN'
    vm.form.script_content = 'should not be sent'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    const arg = mocks.createPlugin.mock.calls[0][0]
    expect(arg.script_content).toBeUndefined()
  })

  it('sends FormData with jar_file when creating JAR plugin with file', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'jar-plugin'
    vm.form.plugin_id = 'jar-plugin-id'
    vm.form.plugin_type = 'JAR'
    vm.form.jar_file = { name: 'plugin.jar', size: 1024 } as any
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    const arg = mocks.createPlugin.mock.calls[0][0]
    expect(arg instanceof FormData).toBe(true)
    expect(arg.get('plugin_name')).toBe('jar-plugin')
    expect(arg.get('plugin_type')).toBe('JAR')
    expect(arg.get('jar_file')).toBeTruthy()
  })

  it('rejects JAR type creation when no jar_file selected', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'jar-no-file'
    vm.form.plugin_id = 'jar-no-file-id'
    vm.form.plugin_type = 'JAR'
    vm.form.jar_file = null
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(mocks.createPlugin).not.toHaveBeenCalled()
    expect(vm.saveError).toBeTruthy()
  })

  it('flips saving flag during request', async () => {
    let resolveCreate: (v: any) => void = () => {}
    mocks.createPlugin.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    const p = vm.save()
    await flushPromises()
    expect(vm.saving).toBe(true)
    resolveCreate({ id: 'p1' })
    await p
    expect(vm.saving).toBe(false)
  })
})

describe('plugins/Editor.vue — error resilience', () => {
  it('handles createPlugin rejection without leaving saving stuck', async () => {
    mocks.createPlugin.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.plugin_name = 'p'
    vm.form.plugin_id = 'p1'
    vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.saving).toBe(false)
  })

  it('handles validateGroovy rejection without crashing', async () => {
    mocks.validateGroovy.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.script_content = 'return true'
    await vm.validateGroovyScript()
    // groovyResult keeps last known state; saving flag not relevant here
    expect((wrapper.vm as any).groovyResult).toBeDefined()
  })
})