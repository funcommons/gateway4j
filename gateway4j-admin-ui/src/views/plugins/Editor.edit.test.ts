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
        jarSizeExceeded: 'JAR 文件不可超过 50MB'
      },
      route: { groovyValid: '语法正确', groovyInvalid: '错误' }
    }
  }
})

function makeRouter(initialRoute = '/') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/plugins', component: { template: '<div />' } },
      { path: '/plugins/:id/edit', component: Editor }
    ]
  })
}

async function factory(route = '/') {
  const router = makeRouter(route)
  await router.push(route)
  await router.isReady()
  return mount(Editor, {
    global: { plugins: [i18n, router] }
  })
}

const SAMPLE_PLUGIN = {
  id: 'p1',
  plugin_name: 'my-plugin',
  plugin_id: 'my-plugin-id',
  plugin_type: 'GROOVY',
  plugin_phase: 'PRE',
  scope: 'ROUTE',
  status: 'ENABLED',
  sort_order: 1,
  config: '{"key":"val"}',
  remark: 'test plugin'
}

beforeEach(() => {
  mocks.createPlugin.mockReset().mockResolvedValue({ id: 'p1' })
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.getPlugin.mockReset().mockResolvedValue(SAMPLE_PLUGIN)
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
})

describe('plugins/Editor.vue — edit mode', () => {
  it('detects edit mode when route has :id param', async () => {
    const router = makeRouter()
    await router.push('/plugins/p1/edit')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.isEdit).toBe(true)
  })

  it('detects create mode when route has no :id param', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.isEdit).toBe(false)
  })

  it('loads plugin data in edit mode', async () => {
    const router = makeRouter()
    await router.push('/plugins/p1/edit')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    expect(mocks.getPlugin).toHaveBeenCalledWith('p1')
    const vm = wrapper.vm as any
    expect(vm.form.plugin_name).toBe('my-plugin')
    expect(vm.form.plugin_id).toBe('my-plugin-id')
    expect(vm.form.plugin_type).toBe('GROOVY')
    expect(vm.form.plugin_phase).toBe('PRE')
    expect(vm.form.scope).toBe('ROUTE')
    expect(vm.form.config).toBe('{"key":"val"}')
  })

  it('calls updatePlugin instead of createPlugin in edit mode', async () => {
    const router = makeRouter()
    await router.push('/plugins/p1/edit')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledWith('p1', expect.objectContaining({
      plugin_name: 'my-plugin',
      plugin_phase: 'PRE',
      scope: 'ROUTE',
      config: '{"key":"val"}'
    }))
    expect(mocks.createPlugin).not.toHaveBeenCalled()
  })

  it('shows load error when getPlugin fails', async () => {
    mocks.getPlugin.mockRejectedValue(new Error('加载失败'))
    const router = makeRouter()
    await router.push('/plugins/p1/edit')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.loadError).toBe('加载失败')
  })

  it('shows save error when updatePlugin fails', async () => {
    mocks.updatePlugin.mockRejectedValue(new Error('更新失败'))
    const router = makeRouter()
    await router.push('/plugins/p1/edit')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('更新失败')
  })
})
