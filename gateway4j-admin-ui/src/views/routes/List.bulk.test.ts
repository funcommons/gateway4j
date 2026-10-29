import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  duplicateRoute: vi.fn(),
  bulkPublishRoutes: vi.fn(),
  bulkOfflineRoutes: vi.fn(),
  bulkDeleteRoutes: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute,
  duplicateRoute: mocks.duplicateRoute,
  bulkPublishRoutes: mocks.bulkPublishRoutes,
  bulkOfflineRoutes: mocks.bulkOfflineRoutes,
  bulkDeleteRoutes: mocks.bulkDeleteRoutes
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/routes/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', edit: '编辑', delete: '删除', publish: '发布', cancel: '取消',
        offline: '下线', import: '导入', empty: '暂无数据', more: '更多', actionFailed: '操作失败'
      },
      route: {
        name: '路由名', type: '类型', path: '路径', status: '状态',
        duplicate: '复制', duplicateSuccess: '已复制为新路由 {name}',
        bulkPublish: '批量发布', bulkOffline: '批量下线', bulkDelete: '批量删除',
        bulkConfirmContent: '将对 {n} 条路由执行该操作，是否继续？',
        bulkSelected: '已选 {n} 条',
        bulkResultAll: '批量操作成功 {n} 条',
        bulkResultPartial: '成功 {ok} 条，失败 {fail} 条：{reasons}'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/routes/:id', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', component: { template: '<div />' } },
      { path: '/import-export', component: { template: '<div />' } }
    ]
  })
}

function makeRouteNode(over: Partial<any> = {}) {
  return {
    id: 'r1', route_name: 'route-1', route_type: 'BACKEND',
    path: '/api/x', status: 'DRAFT', sort_order: 0,
    remark: '', config_version: '1', created_at: 0, updated_at: 0,
    plugins: [], children: [], ...over
  }
}

async function factory(opts: { initial?: any[] } = {}) {
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  mocks.listRoutes.mockResolvedValue(opts.initial ?? [])
  const wrapper = mount(List, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'new-1', route_name: 'route-1-copy' })
  mocks.bulkPublishRoutes.mockReset()
  mocks.bulkOfflineRoutes.mockReset()
  mocks.bulkDeleteRoutes.mockReset()
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({})) as any)
})

describe('List.vue — 批量结果聚合 summarizeBulk', () => {
  it('aggregates succeeded/failed counts and joins failed reasons', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const res = {
      succeeded: [{ id: 'a' }, { id: 'b' }],
      failed: [{ id: 'c', reason: '有子路由' }, { id: 'd', reason: '已发布' }]
    }
    expect(vm.summarizeBulk(res)).toEqual({ ok: 2, fail: 2, reasons: '有子路由；已发布' })
  })

  it('handles null/undefined and empty lists defensively', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.summarizeBulk(null)).toEqual({ ok: 0, fail: 0, reasons: '' })
    expect(vm.summarizeBulk({ succeeded: [], failed: [] })).toEqual({ ok: 0, fail: 0, reasons: '' })
  })
})

describe('List.vue — 批量操作 runBulk', () => {
  it('bulk buttons appear only when rows are selected', async () => {
    const initial = [makeRouteNode({ id: 'a' }), makeRouteNode({ id: 'b' })]
    const wrapper = await factory({ initial })
    expect(wrapper.find('[data-testid="bulk-delete"]').exists()).toBe(false)
    ;(wrapper.vm as any).selectedRows = initial
    await flushPromises()
    expect(wrapper.find('[data-testid="bulk-publish"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bulk-offline"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bulk-delete"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bulk-selected-count"]').text()).toBe('已选 2 条')
  })

  it('runBulk(delete) confirms, calls bulk API with ids and reloads', async () => {
    const initial = [makeRouteNode({ id: 'a' }), makeRouteNode({ id: 'b' })]
    const wrapper = await factory({ initial })
    const vm = wrapper.vm as any
    vm.selectedRows = initial
    mocks.bulkDeleteRoutes.mockResolvedValue({ succeeded: [{ id: 'a' }, { id: 'b' }], failed: [] })
    await vm.runBulk('delete')
    expect(mocks.fcConfirm).toHaveBeenCalled()
    expect(mocks.bulkDeleteRoutes).toHaveBeenCalledWith(['a', 'b'])
    expect(ElMessage.success).toHaveBeenCalledWith('批量操作成功 2 条')
    expect(vm.actionError).toBe('')
    expect(vm.selectedRows).toEqual([])
  })

  it('partial failure shows 成功 N 失败 M with joined reasons', async () => {
    const initial = [makeRouteNode({ id: 'a' }), makeRouteNode({ id: 'b' })]
    const wrapper = await factory({ initial })
    const vm = wrapper.vm as any
    vm.selectedRows = initial
    mocks.bulkDeleteRoutes.mockResolvedValue({
      succeeded: [{ id: 'a' }],
      failed: [{ id: 'b', reason: '存在子路由，不可删除' }]
    })
    await vm.runBulk('delete')
    expect(ElMessage.warning).toHaveBeenCalledWith('成功 1 条，失败 1 条：存在子路由，不可删除')
    expect(vm.actionError).toBe('成功 1 条，失败 1 条：存在子路由，不可删除')
  })

  it('bulk API rejection lands in actionError', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.selectedRows = [makeRouteNode({ id: 'a' })]
    mocks.bulkPublishRoutes.mockRejectedValue(new Error('网络错误'))
    // H7b T2：批量发布先过变更说明弹窗（必填），确认后调批量接口
    await vm.runBulk('publish')
    expect(mocks.bulkPublishRoutes).not.toHaveBeenCalled()
    await vm.onPublishConfirm('批量发布说明')
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledWith(['a'], '批量发布说明')
    expect(vm.actionError).toBe('网络错误')
  })

  it('runBulk aborts when confirm is dismissed', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.selectedRows = [makeRouteNode({ id: 'a' })]
    mocks.fcConfirm.mockResolvedValue(false)
    await vm.runBulk('offline')
    expect(mocks.bulkOfflineRoutes).not.toHaveBeenCalled()
  })
})

describe('List.vue — 复制 duplicate', () => {
  it('calls duplicateRoute and reloads with the new route name in the message', async () => {
    const initial = [makeRouteNode({ id: 'src-1', route_name: 'src' })]
    const wrapper = await factory({ initial })
    const vm = wrapper.vm as any
    mocks.listRoutes.mockClear()
    await vm.duplicate(makeRouteNode({ id: 'src-1', route_name: 'src' }))
    expect(mocks.duplicateRoute).toHaveBeenCalledWith('src-1')
    expect(ElMessage.success).toHaveBeenCalledWith('已复制为新路由 route-1-copy')
    expect(mocks.listRoutes).toHaveBeenCalled()
  })

  it('duplicate failure lands in actionError', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    mocks.duplicateRoute.mockRejectedValue(new Error('名称冲突'))
    await vm.duplicate(makeRouteNode({ id: 'src-1' }))
    expect(vm.actionError).toBe('名称冲突')
  })
})

describe('List.vue — 标签列与标签筛选', () => {
  it('splitTags splits comma-separated tags and trims empties', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.splitTags('prod, core,, gateway')).toEqual(['prod', 'core', 'gateway'])
    expect(vm.splitTags('')).toEqual([])
    expect(vm.splitTags(undefined)).toEqual([])
  })

  it('reload passes tag= param when tagFilter is set', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    mocks.listRoutes.mockClear()
    vm.tagFilter = 'prod'
    await vm.reload()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ tag: 'prod' })
    vm.tagFilter = '  '
    await vm.reload()
    expect(mocks.listRoutes).toHaveBeenLastCalledWith(undefined)
  })
})
