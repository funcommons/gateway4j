import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getDict: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  listChanges: vi.fn(),
  listAuditLogs: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getDict: mocks.getDict,
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  listChanges: mocks.listChanges,
  listAuditLogs: mocks.listAuditLogs
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title', 'type', 'spanFull'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/data/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub">{{ label }}</span>' }
}))
vi.mock('@/components/navigation/FcPagination.vue', () => ({
  default: {
    name: 'FcPagination',
    props: ['currentPage', 'pageSize', 'total'],
    emits: ['update:currentPage', 'update:pageSize', 'change'],
    template: '<div class="pagination-stub" />'
  }
}))

import Settings from '@/views/Settings.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存', refresh: '刷新', loadFailed: '加载失败', enabled: '已启用', disabled: '已禁用', submit: '提交', cancel: '取消' },
      route: {
        statusDraft: '草稿', statusPublished: '已发布',
        statusChanging: '变更中', statusOffline: '已下线', status: '状态'
      },
      settings: {
        tabChanges: '变更记录',
        changeTime: '时间', changeType: '类型', changeName: '名称', changeVersion: '版本',
        changeTypeRoute: '路由', changeTypePlugin: '插件',
        changesUnavailable: '变更记录接口暂不可用', changesEmpty: '暂无变更记录',
        auditAction: '动作', auditActor: '操作人', auditTarget: '对象', auditResult: '结果',
        auditTime: '时间', auditActionAll: '全部动作',
        auditRangeStart: '开始时间', auditRangeEnd: '结束时间',
        auditCompatMode: '兼容模式', auditEmpty: '暂无审计日志'
      }
    }
  }
})

const AUDIT_PAGE = {
  records: [
    { id: '1940000000000001', action: 'ROUTE_PUBLISH', target_type: 'ROUTE', target_id: 'r1', actor: 'admin', result: 'SUCCESS', created_at: '2026-10-29T10:00:00+08:00' },
    { id: '1940000000000002', action: 'PLUGIN_UPDATE', target_type: 'PLUGIN', target_id: 'p1', actor: 'op', result: 'FAILURE', created_at: '2026-10-29T10:05:00+08:00' },
    { id: '1940000000000003', action: 'ROUTE_PUBLISH', target_type: 'ROUTE', target_id: 'r2', actor: 'admin', result: 'SUCCESS', created_at: '2026-10-29T10:10:00+08:00' }
  ],
  total: '23',
  size: '20',
  current: '1',
  pages: '2'
}

function factory() {
  return mount(Settings, { global: { plugins: [i18n] } })
}

async function gotoChangesTab(wrapper: ReturnType<typeof mount>) {
  ;(wrapper.vm as any).tab = 'changes'
  await flushPromises()
}

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.listChanges.mockReset().mockResolvedValue([])
  mocks.listAuditLogs.mockReset().mockResolvedValue(AUDIT_PAGE)
})

describe('Settings.vue — P2-6 变更记录升级为审计日志（T1）', () => {
  it('mount 时按契约调 GET /v1/audit/logs（page + pageSize + 空筛选），信封分页归一', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect(mocks.listAuditLogs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      action: undefined,
      actor: undefined,
      from: undefined,
      to: undefined
    })
    const vm = wrapper.vm as any
    expect(vm.auditMode).toBe(true)
    // Long→String：id 保持字符串原样渲染；total "23" → number 23
    expect(vm.auditRecords.length).toBe(3)
    expect(vm.auditRecords[0].id).toBe('1940000000000001')
    expect(typeof vm.auditRecords[0].id).toBe('string')
    expect(vm.auditTotal).toBe(23)
  })

  it('动作下拉选项来自返回数据 distinct', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    expect(vm.auditActionOptions).toEqual([
      { value: 'ROUTE_PUBLISH', label: 'ROUTE_PUBLISH' },
      { value: 'PLUGIN_UPDATE', label: 'PLUGIN_UPDATE' }
    ])
  })

  it('分页 change → 以新 page/pageSize 重新拉取', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    mocks.listAuditLogs.mockClear()
    const vm = wrapper.vm as any
    vm.onAuditPageChange(2, 50)
    await flushPromises()
    expect(mocks.listAuditLogs).toHaveBeenLastCalledWith({
      page: 2, pageSize: 50, action: undefined, actor: undefined, from: undefined, to: undefined
    })
    expect(vm.auditPage).toBe(2)
    expect(vm.auditPageSize).toBe(50)
  })

  it('筛选（动作/操作人）→ 重置回第 1 页并携带筛选参数', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    vm.auditPage = 3
    vm.auditAction = 'ROUTE_PUBLISH'
    vm.auditActor = ' admin '
    mocks.listAuditLogs.mockClear()
    vm.onAuditFilterChange()
    await flushPromises()
    expect(vm.auditPage).toBe(1)
    expect(mocks.listAuditLogs).toHaveBeenLastCalledWith({
      page: 1, pageSize: 20, action: 'ROUTE_PUBLISH', actor: 'admin', from: undefined, to: undefined
    })
  })

  it('时间范围 → from/to 以 ISO-8601（后端 parseTimeBound 可解析）原样透传', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    vm.auditRange = ['2026-10-01T00:00:00', '2026-10-29T23:59:59']
    mocks.listAuditLogs.mockClear()
    vm.onAuditFilterChange()
    await flushPromises()
    expect(mocks.listAuditLogs).toHaveBeenLastCalledWith({
      page: 1, pageSize: 20, action: undefined, actor: undefined,
      from: '2026-10-01T00:00:00', to: '2026-10-29T23:59:59'
    })
  })

  it('对象列：后端 target_type+target_id 组合展示（兼容 target 草稿字段）', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    expect(vm.auditTargetText(AUDIT_PAGE.records[0])).toBe('ROUTE:r1')
    expect(vm.auditTargetText({ target: 'legacy-target' })).toBe('legacy-target')
    expect(vm.auditTargetText({})).toBe('-')
  })

  it('审计空页 → audit-empty 空态（非崩页）', async () => {
    mocks.listAuditLogs.mockResolvedValue({ records: [], total: '0', size: '20', current: '1', pages: '0' })
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect((wrapper.vm as any).auditMode).toBe(true)
    expect(wrapper.find('[data-testid="audit-empty"]').exists()).toBe(true)
  })

  it('审计 404 → 回退旧 /v1/changes（limit=50）+「兼容模式」徽标，旧表渲染', async () => {
    mocks.listAuditLogs.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { status: 404 }))
    mocks.listChanges.mockResolvedValue([
      { type: 'route', id: 'r1', name: 'web-gateway', status: 'PUBLISHED', config_version: 'v7', updated_at: 1730000000000 }
    ])
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    expect(vm.auditMode).toBe(false)
    expect(mocks.listChanges).toHaveBeenCalledWith(50)
    expect(wrapper.find('[data-testid="changes-compat-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-filters"]').exists()).toBe(false)
    // 旧表（变更记录三段式列）在兼容分支渲染
    const tables = wrapper.findAllComponents({ name: 'FcTable' })
    expect(tables.length).toBe(1)
    expect((tables[0].props('data') as any[])[0]).toMatchObject({ type: 'route', name: 'web-gateway' })
  })

  it('审计失败且旧接口也 404 → 不可用空态（不崩页）', async () => {
    mocks.listAuditLogs.mockRejectedValue(new Error('404'))
    mocks.listChanges.mockRejectedValue(new Error('404'))
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect((wrapper.vm as any).changesUnavailable).toBe(true)
    expect(wrapper.find('[data-testid="changes-unavailable"]').exists()).toBe(true)
  })

  it('兼容模式下刷新：审计仍失败但旧接口恢复 → 回到旧数据视图', async () => {
    mocks.listAuditLogs.mockRejectedValue(new Error('404'))
    mocks.listChanges.mockRejectedValueOnce(new Error('404'))
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect((wrapper.vm as any).changesUnavailable).toBe(true)
    mocks.listChanges.mockResolvedValue([
      { type: 'plugin', id: 'p1', name: 'JWT', status: 'ENABLED', config_version: 'v2', updated_at: 1730000000001 }
    ])
    await wrapper.find('[data-testid="changes-refresh"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).changesUnavailable).toBe(false)
    expect((wrapper.vm as any).auditMode).toBe(false)
  })

  it('审计恢复：兼容后审计接口可用（刷新）→ 切回审计模式，徽标消失', async () => {
    mocks.listAuditLogs.mockRejectedValueOnce(new Error('404'))
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect((wrapper.vm as any).auditMode).toBe(false)
    await wrapper.find('[data-testid="changes-refresh"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).auditMode).toBe(true)
    expect(wrapper.find('[data-testid="changes-compat-badge"]').exists()).toBe(false)
  })

  it('结果着色：SUCCESS→success / FAILURE→danger / 未知→gray', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const vm = wrapper.vm as any
    expect(vm.auditResultColor('SUCCESS')).toBe('success')
    expect(vm.auditResultColor('ok')).toBe('success')
    expect(vm.auditResultColor('FAILURE')).toBe('danger')
    expect(vm.auditResultColor('DENIED')).toBe('danger')
    expect(vm.auditResultColor('WEIRD')).toBe('gray')
    expect(vm.auditResultColor(undefined)).toBe('gray')
  })
})
