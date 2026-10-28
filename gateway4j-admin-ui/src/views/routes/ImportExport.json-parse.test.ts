import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe'], template: '<table class="table-stub" />' }
}))

import ImportExport from '@/views/routes/ImportExport.vue'

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', importFailed: '导入失败' },
      importExport: {
        tabExport: '导出', tabImport: '导入', status: '状态', routePackage: '路由包',
        downloadPackage: '下载路由包', preCheck: '预检', doImport: '导入',
        strategy: '冲突策略', error: '报错', preCheckHint: '导入前请先预检',
        reportValid: '可导入：是', reportInvalid: '可导入：否',
        reportConflicts: '同名冲突', reportMissingPlugins: '缺失插件',
        reportMissingTargets: '缺失目标路由', reportCycleWarnings: '循环警告',
        jsonParseError: 'JSON 格式错误，请检查输入'
      },
      route: { name: '路由名称' }
    }
  }
})

function factory() {
  return mount(ImportExport, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea-stub />' }
      }
    }
  })
}

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1', routes: [] })
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({ success: true, errors: [] })
})

describe('ImportExport.vue — JSON parse error handling', () => {
  it('onValidate shows user-friendly reason for invalid JSON (D14)', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{invalid json!!!'
    await vm.onValidate()
    // Must carry the raw parse error as the reason (D14), without calling the backend
    expect(vm.report.is_valid).toBe(false)
    expect(vm.report.reason).toContain('JSON 解析失败：')
    expect(mocks.validateImport).not.toHaveBeenCalled()
  })

  it('onValidate reports missing routes array without calling the backend (D14)', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0"}'
    await vm.onValidate()
    expect(vm.report.is_valid).toBe(false)
    expect(vm.report.reason).toBe('路由包结构无效：缺少 routes 数组')
    expect(mocks.validateImport).not.toHaveBeenCalled()
  })

  it('onValidate still shows API error when JSON is valid but API rejects', async () => {
    mocks.validateImport.mockRejectedValue(new Error('Server error'))
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    await vm.onValidate()
    expect(vm.report.is_valid).toBe(false)
    expect(vm.report.reason).toBe('Server error')
  })

  it('onImport shows user-friendly message for invalid JSON', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{broken json'
    await vm.onImport()
    // Should show a user-friendly message, not a raw SyntaxError
    expect(vm.actionError).toContain('JSON 格式错误，请检查输入')
    expect(mocks.importRoutes).not.toHaveBeenCalled()
  })

  it('onImport still shows API error when JSON is valid but API rejects', async () => {
    mocks.importRoutes.mockRejectedValue(new Error('Import conflict'))
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0"}'
    await vm.onImport()
    expect(vm.actionError).toBe('Import conflict')
  })
})
