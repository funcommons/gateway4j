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
      common: { search: '搜索' },
      importExport: {
        tabExport: '导出', tabImport: '导入', status: '状态', routePackage: '路由包',
        downloadPackage: '下载路由包', preCheck: '预检', doImport: '导入',
        strategy: '冲突策略', error: '报错', preCheckHint: '导入前请先预检',
        reportValid: '可导入：是', reportInvalid: '可导入：否',
        reportConflicts: '同名冲突', reportMissingPlugins: '缺失插件',
        reportMissingTargets: '缺失目标路由', reportCycleWarnings: '循环警告'
      },
      route: { name: '路由名称' }
    }
  }
})

function factory() {
  return mount(ImportExport, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1', routes: [] })
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({ success: true, errors: [] })
})

describe('ImportExport.vue — error resilience', () => {
  it('handles exportRoutes rejection without unhandled rejection', async () => {
    mocks.exportRoutes.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    const vm = wrapper.vm as any
    await vm.onExport()
    // exporting flag still flipped back to false
    expect(vm.exporting).toBe(false)
  })

  it('handles validateImport rejection (JSON.parse of invalid JSON)', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{ not valid json'
    await vm.onValidate()
    // sets an error report (existing catch handler)
    expect(vm.report.is_valid).toBe(false)
  })

  it('handles validateImport API rejection as error report', async () => {
    mocks.validateImport.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    await vm.onValidate()
    expect(vm.report.is_valid).toBe(false)
    expect(vm.report.reason).toBe('500')
  })

  it('handles importRoutes rejection without unhandled rejection', async () => {
    mocks.importRoutes.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"valid":true}'
    await vm.onImport()
    // importing flag still flipped back to false
    expect(vm.importing).toBe(false)
    // result NOT set (no success)
    expect(vm.result).toBeNull()
  })
})