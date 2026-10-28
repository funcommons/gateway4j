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

beforeEach(() => {
  mocks.createPlugin.mockReset().mockResolvedValue({ id: 'p1' })
  mocks.validateGroovy.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getPlugin.mockReset().mockResolvedValue(null)
  mocks.updatePlugin.mockReset().mockResolvedValue({})
})

async function factory() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(Editor, { global: { plugins: [i18n, router] } })
}

describe('plugins/Editor.vue — form validation', () => {
  it('exposes validation rules with i18n messages', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    expect(rules.plugin_name).toBeDefined()
    const nameRequired = rules.plugin_name.find((r: any) => r.required)
    expect(nameRequired).toBeDefined()
    const namePattern = rules.plugin_name.find((r: any) => r.pattern)
    expect(namePattern).toBeDefined()
  })

  it('plugin_name pattern rejects single char', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const patternRule = vm.formRules.plugin_name.find((r: any) => r.pattern)
    const re = new RegExp(patternRule.pattern)
    expect(re.test('a')).toBe(false)
    expect(re.test('my_plugin_1')).toBe(true)
    expect(re.test('my-plugin')).toBe(false)
  })

  it('sort_order validation rejects 0 and 10000', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules.sort_order
    expect(rules).toBeDefined()
    const validator = rules.find((r: any) => r.validator)?.validator
    expect(validator).toBeDefined()
    // el-form validators use callback style: cb(new Error(msg)) on failure, cb() on success
    let err: Error | undefined
    const cb = (e?: Error) => { err = e }
    validator({}, 0, cb)
    expect(err).toBeDefined()
    expect(err!.message).toBeTruthy()
    err = undefined
    validator({}, 10000, cb)
    expect(err).toBeDefined()
    err = undefined
    validator({}, 1, cb)
    expect(err).toBeUndefined()
    validator({}, 9999, cb)
    expect(err).toBeUndefined()
  })

  it('config JSON validation rejects invalid JSON', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules.config
    expect(rules).toBeDefined()
    const validator = rules.find((r: any) => r.validator)?.validator
    expect(validator).toBeDefined()
    let err: Error | undefined
    const cb = (e?: Error) => { err = e }
    validator({}, 'not json', cb)
    expect(err).toBeDefined()
    expect(err!.message).toBeTruthy()
    err = undefined
    validator({}, '{}', cb)
    expect(err).toBeUndefined()
    validator({}, '{"key":"val"}', cb)
    expect(err).toBeUndefined()
  })

  it('JAR file size check rejects files > 50MB', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const bigFile = { name: 'big.jar', size: 51 * 1024 * 1024 } as File
    const ok = vm.validateJarFile(bigFile)
    expect(ok).toBe(false)
    expect(vm.saveError).toBe('JAR 文件不可超过 50MB')
  })

  it('JAR file size check accepts files <= 50MB', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const okFile = { name: 'ok.jar', size: 50 * 1024 * 1024 } as File
    const ok = vm.validateJarFile(okFile)
    expect(ok).toBe(true)
    expect(vm.saveError).toBe('')
  })
})
