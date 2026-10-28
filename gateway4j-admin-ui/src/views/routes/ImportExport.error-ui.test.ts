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
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
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

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL — onExport uses them
// to trigger a download. Polyfill so the success path doesn't throw.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as any
  URL.revokeObjectURL = vi.fn() as any
}

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1.0', routes: [] })
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({ ok: 5, errors: [] })
})

describe('ImportExport.vue — onExport() error UX', () => {
  it('starts with empty actionError', async () => {
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    expect((wrapper.vm as any).actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('exportRoutes failure sets actionError with server message', async () => {
    mocks.exportRoutes.mockRejectedValue(new Error('权限不足'))
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    await vm.onExport()
    expect(vm.actionError).toBe('权限不足')
  })

  it('exportRoutes failure renders error in UI', async () => {
    mocks.exportRoutes.mockRejectedValue(new Error('权限不足'))
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    await vm.onExport()
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('权限不足')
  })

  it('export success leaves actionError empty', async () => {
    mocks.exportRoutes.mockResolvedValue({ version: '1.0', routes: [] })
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    await vm.onExport()
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('export failure still flips exporting flag back to false', async () => {
    mocks.exportRoutes.mockRejectedValue(new Error('500'))
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    await vm.onExport()
    expect(vm.exporting).toBe(false)
  })
})

describe('ImportExport.vue — onImport() error UX', () => {
  it('importRoutes failure sets actionError with server message', async () => {
    mocks.importRoutes.mockRejectedValue(new Error('JSON 格式错误'))
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0"}'
    await vm.onImport()
    expect(vm.actionError).toBe('JSON 格式错误')
  })

  it('importRoutes failure renders error in UI', async () => {
    mocks.importRoutes.mockRejectedValue(new Error('JSON 格式错误'))
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0"}'
    await vm.onImport()
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('JSON 格式错误')
  })

  it('import success clears actionError', async () => {
    mocks.importRoutes.mockResolvedValue({ ok: 5, errors: [] })
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0"}'
    await vm.onImport()
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('JSON parse error (SyntaxError) sets actionError', async () => {
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    vm.jsonText = '{ invalid json'
    await vm.onImport()
    expect(vm.actionError).toBeTruthy()
  })

  it('actionError is cleared before each new action', async () => {
    mocks.exportRoutes.mockRejectedValueOnce(new Error('first'))
    mocks.exportRoutes.mockResolvedValueOnce({ version: '1.0', routes: [] })
    const wrapper = mount(ImportExport, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    await vm.onExport()
    expect(vm.actionError).toBe('first')
    await vm.onExport()
    await flushPromises()
    expect(vm.actionError).toBe('')
  })
})
