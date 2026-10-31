import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

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

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

// FcTable stub renders rows so diff-view rendering can be asserted.
vi.mock('@/components/data/FcTable.vue', () => ({
  default: {
    name: 'FcTable',
    props: ['data', 'loading', 'stripe'],
    template: `<table class="table-stub"><tbody><tr v-for="(r, i) in data" :key="i" class="diff-row"><td class="cell-name">{{ r.name }}</td><td class="cell-action">{{ r.action }}</td><td class="cell-detail">{{ r.detail }}</td></tr></tbody></table>`
  }
}))
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))

import ImportExport from '@/views/routes/ImportExport.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', importFailed: '导入失败' },
      importExport: {
        tabExport: '导出', tabImport: '导入', status: '状态', routePackage: '路由包',
        downloadPackage: '下载路由包', preCheck: '预检', doImport: '导入',
        strategy: '冲突策略', skip: '跳过', overwrite: '覆盖', error: '报错',
        preCheckHint: '导入前请先预检',
        reportValid: '可导入：是', reportInvalid: '可导入：否',
        reportConflicts: '同名冲突', reportMissingPlugins: '缺失插件',
        reportMissingTargets: '缺失目标路由', reportCycleWarnings: '循环警告',
        conflicts: '同名冲突', missingPlugins: '缺失插件',
        missingTargets: '缺失目标路由', cycleWarnings: '循环警告',
        diffColName: '路由名', diffColAction: '操作', diffColDetail: '说明',
        actionCreate: '新增', actionConflict: '冲突',
        diffCreateDetail: '目标环境不存在同名路由，将创建',
        diffConflictDetail: '目标环境已存在同名路由，将按冲突策略处理',
        diffMissingPluginDetail: '目标环境未安装该插件',
        diffMissingTargetDetail: '条件指向的目标路由在目标环境不存在',
        diffCycleDetail: '导入后可能形成循环分发链',
        snapshotCreated: '已自动快照 snapshot_id={id}，可在需要时回滚'
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

const PKG = JSON.stringify({
  version: '1.0',
  routes: [
    { route_name: 'alpha', route_type: 'BACKEND', children: [] },
    { route_name: 'beta', route_type: 'BACKEND', children: [
      { route_name: 'gamma', route_type: 'BACKEND', children: [] }
    ] }
  ]
})

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1', routes: [] })
  mocks.validateImport.mockReset()
  mocks.importRoutes.mockReset()
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.createImportSnapshot.mockReset()
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
})
afterEach(() => vi.restoreAllMocks())

describe('ImportExport.vue — 预检 Diff 视图', () => {
  it('aggregates conflicts/missing_plugins/missing_targets/cycle_warnings into diff rows', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.validateImport.mockResolvedValue({
      is_valid: false,
      conflicts: ['alpha'],
      missing_plugins: ['ratelimit-builtin'],
      missing_targets: ['gone-route'],
      cycle_warnings: ['a -> b -> a']
    })
    await vm.onValidate()
    await flushPromises()
    expect(vm.importDiffRows).toEqual([
      { name: 'alpha', action: '跳过', detail: '目标环境已存在同名路由，将按冲突策略处理', tone: 'gray' },
      { name: 'beta', action: '新增', detail: '目标环境不存在同名路由，将创建', tone: 'success' },
      { name: 'gamma', action: '新增', detail: '目标环境不存在同名路由，将创建', tone: 'success' },
      { name: 'ratelimit-builtin', action: '缺失插件', detail: '目标环境未安装该插件', tone: 'danger' },
      { name: 'gone-route', action: '缺失目标路由', detail: '条件指向的目标路由在目标环境不存在', tone: 'danger' },
      { name: '—', action: '循环警告', detail: 'a -> b -> a', tone: 'warning' }
    ])
  })

  it('strategy=OVERWRITE flips conflicting rows to 覆盖 while new rows stay 新增', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.strategy = 'OVERWRITE'
    vm.jsonText = PKG
    mocks.validateImport.mockResolvedValue({ is_valid: false, conflicts: ['alpha'] })
    await vm.onValidate()
    await flushPromises()
    const conflictRow = vm.importDiffRows.find((r: any) => r.name === 'alpha')
    const newRow = vm.importDiffRows.find((r: any) => r.name === 'beta')
    expect(conflictRow.action).toBe('覆盖')
    expect(conflictRow.tone).toBe('warning')
    expect(newRow.action).toBe('新增')
  })

  it('renders diff table rows in the DOM and keeps the text report lines above', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.validateImport.mockResolvedValue({ is_valid: false, conflicts: ['alpha'] })
    await vm.onValidate()
    await flushPromises()
    const table = wrapper.find('[data-testid="import-diff-table"]')
    expect(table.exists()).toBe(true)
    const rows = table.findAll('tr.diff-row')
    expect(rows.length).toBe(3)
    expect(rows[0].text()).toContain('alpha')
    expect(rows[0].text()).toContain('跳过')
    expect(rows[1].text()).toContain('新增')
    // 原文案行保留：reportValid + reportConflicts 仍在表格上方
    const report = wrapper.find('.report')
    expect(report.text()).toContain('可导入：否')
    expect(report.text()).toContain('同名冲突：alpha')
  })

  it('no diff table when report is clean', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.validateImport.mockResolvedValue({ is_valid: true })
    await vm.onValidate()
    await flushPromises()
    // 包内三条都是新增，仍渲染
    expect(vm.importDiffRows.length).toBe(3)
  })

  it('empty report shows no table at all', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(wrapper.find('[data-testid="import-diff-table"]').exists()).toBe(false)
    expect(vm.importDiffRows).toEqual([])
  })
})

describe('ImportExport.vue — 导入前自动快照', () => {
  it('skips silently when the snapshot endpoint is 404 (unsupported)', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.createImportSnapshot.mockRejectedValue(new Error('Not Found'))
    mocks.importRoutes.mockResolvedValue({ total: 3, created: 3, updated: 0, skipped: 0, errors: [] })
    await vm.onImport()
    expect(mocks.createImportSnapshot).toHaveBeenCalled()
    expect(mocks.importRoutes).toHaveBeenCalled()
    // 导入不受快照探测影响，且不出现快照提示
    expect(vm.result).toEqual({ total: 3, created: 3, updated: 0, skipped: 0, errors: [] })
    expect(ElMessage.success).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('snapshot_id') }))
  })

  it('snapshots before import and reports snapshot_id on success', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.createImportSnapshot.mockResolvedValue({ snapshot_id: 'snap-42' })
    mocks.importRoutes.mockResolvedValue({ total: 3, created: 3, updated: 0, skipped: 0, errors: [] })
    await vm.onImport()
    // 快照在导入之前发生
    const [snapshotOrder] = mocks.createImportSnapshot.mock.invocationCallOrder
    const [importOrder] = mocks.importRoutes.mock.invocationCallOrder
    expect(snapshotOrder).toBeLessThan(importOrder)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.objectContaining({ message: '已自动快照 snapshot_id=snap-42，可在需要时回滚' }))
  })

  it('import failure does not surface snapshot errors', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.jsonText = PKG
    mocks.createImportSnapshot.mockRejectedValue(new Error('Not Found'))
    mocks.importRoutes.mockRejectedValue(new Error('后端错误'))
    await vm.onImport()
    expect(vm.actionError).toBe('后端错误')
    expect(vm.result).toBeNull()
  })
})
