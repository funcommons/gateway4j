import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn(),
  listRoutes: vi.fn(),
  createImportSnapshot: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes,
  listRoutes: mocks.listRoutes,
  createImportSnapshot: mocks.createImportSnapshot
}))

// Stub i18n-dependent SDK components at module level.
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

// Helper: spy on document.createElement to capture <a> for download tests.
let createdAnchors: Array<{ href: string; download: string; clicked: boolean }> = []
const realCreateElement = document.createElement.bind(document)
function installCreateElementSpy() {
  createdAnchors = []
  document.createElement = ((tag: string) => {
    const el = realCreateElement(tag)
    if (tag === 'a') {
      const a = el as HTMLAnchorElement
      const state = { href: '', download: '', clicked: false }
      Object.defineProperty(a, 'href', { get: () => state.href, set: (v) => { state.href = v } })
      Object.defineProperty(a, 'download', { get: () => state.download, set: (v) => { state.download = v } })
      a.click = () => { state.clicked = true }
      createdAnchors.push(state)
    }
    return el
  }) as typeof document.createElement
  // jsdom may or may not implement URL.createObjectURL; force a polyfill
  // that always returns a string so we never trigger native code paths.
  ;(URL as any).createObjectURL = function() { return 'blob:mock-url' }
  ;(URL as any).revokeObjectURL = function() {}
}
function restoreCreateElement() {
  document.createElement = realCreateElement
}

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
  mocks.listRoutes.mockReset().mockResolvedValue([])
  // 快照能力探测默认 404（不支持），静默跳过
  mocks.createImportSnapshot.mockReset().mockRejectedValue(new Error('Not Found'))
  installCreateElementSpy()
})
afterEach(() => restoreCreateElement())

describe('ImportExport.vue — initial state', () => {
  it('mounts without errors', () => {
    const wrapper = factory()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts on import tab', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.tab).toBe('import')
  })

  it('default strategy is SKIP', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.strategy).toBe('SKIP')
  })

  it('exposes three strategies (SKIP, OVERWRITE, ERROR)', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.strategies.map((s: any) => s.value)).toEqual(['SKIP', 'OVERWRITE', 'ERROR'])
  })

  it('starts with no report and no result', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.report).toBeNull()
    expect(vm.result).toBeNull()
  })

  it('exposes three status options for export filter', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.statusOpts.length).toBe(3)
    expect(vm.statusOpts.map((s: any) => s.value)).toEqual(['DRAFT', 'PUBLISHED', 'OFFLINE'])
  })
})

describe('ImportExport.vue — onExport', () => {
  it('calls exportRoutes with undefined status when status is empty', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    await vm.onExport()
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, undefined)
  })

  it('calls exportRoutes with selected status when status is set', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.status = 'PUBLISHED'
    await vm.onExport()
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, 'PUBLISHED')
  })

  it('flips exporting flag during the request', async () => {
    let resolveExport: (v: any) => void = () => {}
    mocks.exportRoutes.mockReset()
    mocks.exportRoutes.mockImplementation(() => new Promise((resolve) => { resolveExport = resolve }))
    const wrapper = factory()
    const vm = wrapper.vm as any
    const p = vm.onExport()
    expect(vm.exporting).toBe(true)
    resolveExport({ version: '1', routes: [] })
    await p
    expect(vm.exporting).toBe(false)
  })

  it('triggers a download anchor with timestamped filename', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    await vm.onExport()
    expect(createdAnchors.length).toBeGreaterThanOrEqual(1)
    const anchor = createdAnchors[createdAnchors.length - 1]
    expect(anchor.clicked).toBe(true)
    expect(anchor.download).toMatch(/^routes-\d+\.json$/)
  })
})

describe('ImportExport.vue — onValidate', () => {
  it('no-op when jsonText is empty', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    await vm.onValidate()
    expect(mocks.validateImport).not.toHaveBeenCalled()
    expect(vm.report).toBeNull()
  })

  it('parses JSON and calls validateImport with parsed object', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    await vm.onValidate()
    expect(mocks.validateImport).toHaveBeenCalledWith({ version: '1.0', routes: [] })
    expect(vm.report).toEqual({ is_valid: true })
  })

  it('stores error report when JSON is invalid', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = 'not valid json'
    await vm.onValidate()
    expect(vm.report.is_valid).toBe(false)
    expect(vm.report.reason).toBeTruthy()
  })

  it('flips validating flag during request', async () => {
    let resolveVal: (v: any) => void = () => {}
    mocks.validateImport.mockReset()
    mocks.validateImport.mockImplementation(() => new Promise((resolve) => { resolveVal = resolve }))
    const wrapper = factory()
    const vm = wrapper.vm as any
    // Must pass local precheck (routes array present) so the backend request
    // (and its pending flag) is actually exercised
    vm.jsonText = '{"version":"1.0","routes":[]}'
    const p = vm.onValidate()
    expect(vm.validating).toBe(true)
    resolveVal({ is_valid: true })
    await p
    expect(vm.validating).toBe(false)
  })
})

describe('ImportExport.vue — onImport', () => {
  it('no-op when jsonText is empty', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    await vm.onImport()
    expect(mocks.importRoutes).not.toHaveBeenCalled()
  })

  it('calls importRoutes with parsed package + strategy', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    vm.strategy = 'OVERWRITE'
    await vm.onImport()
    expect(mocks.importRoutes).toHaveBeenCalledWith(
      { version: '1.0', routes: [] },
      'OVERWRITE'
    )
    expect(vm.result).toEqual({ success: true, errors: [] })
  })

  it('flips importing flag during request', async () => {
    let resolveImp: (v: any) => void = () => {}
    mocks.importRoutes.mockReset()
    mocks.importRoutes.mockImplementation(() => new Promise((resolve) => { resolveImp = resolve }))
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = '{}'
    const p = vm.onImport()
    // 快照探测先于导入：先 flush 微任务让 importRoutes 真正被调用，
    // resolveImp 才绑定到真实 promise
    await flushPromises()
    expect(vm.importing).toBe(true)
    resolveImp({ success: true })
    await p
    expect(vm.importing).toBe(false)
  })
})