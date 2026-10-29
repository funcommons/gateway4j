import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  getSyncStatus: vi.fn()
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

vi.mock('@/api/misc', () => ({
  getSyncStatus: mocks.getSyncStatus
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: async () => true })
}))

vi.mock('@/components/data/FcTable.vue', () => ({
  default: {
    name: 'FcTable',
    props: ['data', 'stripe'],
    emits: ['selection-change'],
    template: '<table class="table-stub"><tr v-for="(r, i) in data" :key="i"><td>{{ r.route_name }}</td></tr></table>'
  }
}))

import List from '@/views/routes/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { create: '新建', import: '导入', edit: '编辑', more: '更多', publish: '发布', republish: '重新发布', offline: '下线', delete: '删除', empty: '暂无数据', confirmPublish: '确定发布此路由？', confirmOffline: '确定下线此路由？', refresh: '刷新' },
      route: {
        list: '路由列表', name: '路由名称', type: '路由类型', status: '状态', path: '匹配路径', tags: '标签',
        typeDispatch: '分发', typeBackend: '后置',
        statusDraft: '草稿', statusPublished: '已发布', statusOffline: '已下线', statusChanging: '变更中', statusAll: '全部',
        searchPlaceholder: '搜索路由名', tagFilterPlaceholder: '按标签过滤', canvas: '画布', duplicate: '复制',
        confirmDelete: '确定删除?', expandAll: '全部展开', collapseAll: '全部折叠',
        publishSuccess: '路由已发布', offlineSuccess: '路由已下线', deleteSuccess: '路由已删除',
        duplicateSuccess: '已复制为新路由 {name}',
        bulkPublish: '批量发布', bulkOffline: '批量下线', bulkDelete: '批量删除',
        bulkConfirmContent: '将对 {n} 条路由执行该操作，是否继续？', bulkSelected: '已选 {n} 条',
        bulkResultAll: '批量操作成功 {n} 条', bulkResultPartial: '成功 {ok} 条，失败 {fail} 条：{reasons}',
        publishSyncPending: '发布中…', publishSynced: '已生效', publishSyncDelayed: '同步延迟'
      }
    }
  }
})

const TREE = [
  { id: 'r1', route_name: 'alpha', route_type: 'BACKEND', status: 'DRAFT', sort_order: 1, config_version: '1', created_at: 1, updated_at: 1, plugins: [], children: [] }
]

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/import-export', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(List, { global: { plugins: [i18n, router] } })
}

beforeEach(() => {
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({})) as any)
  mocks.listRoutes.mockReset().mockResolvedValue(TREE as any)
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'copy', route_name: 'copy' })
  mocks.bulkPublishRoutes.mockReset().mockResolvedValue({ succeeded: [{ id: 'r1' }], failed: [] })
  mocks.bulkOfflineRoutes.mockReset().mockResolvedValue({ succeeded: [], failed: [] })
  mocks.bulkDeleteRoutes.mockReset().mockResolvedValue({ succeeded: [], failed: [] })
  // 挂起：让轮询停留在 polling，便于断言调用次数
  mocks.getSyncStatus.mockReset().mockImplementation(() => new Promise(() => {}))
})

describe('routes/List.vue — P1-3 发布生效确认', () => {
  it('单条发布成功后启动 sync-status 轮询（每 1s 一次的 composable 行为见独立用例）', async () => {
    const wrapper = await factory()
    await flushPromises()
    // H7b T2：publish 走变更说明弹窗，确认后携带 change_description 提交
    ;(wrapper.vm as any).publish({ id: 'r1' })
    await (wrapper.vm as any).onPublishConfirm('发布说明')
    await flushPromises()
    expect(mocks.publishRoute).toHaveBeenCalledWith('r1', '发布说明')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="publish-sync-polling"]').exists()).toBe(true)
  })

  it('批量发布只做一次轮询（不每行一个）', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedRows = [{ id: 'r1' }, { id: 'r2' }]
    // H7b T2：批量发布先弹变更说明弹窗，确认后调批量接口
    await vm.runBulk('publish')
    await vm.onPublishConfirm('批量发布说明')
    await flushPromises()
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledWith(['r1', 'r2'], '批量发布说明')
    // 无论成功几行，轮询只启动一次
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('批量发布全部失败（ok=0）→ 不启动轮询', async () => {
    mocks.bulkPublishRoutes.mockResolvedValue({ succeeded: [], failed: [{ id: 'r1', reason: 'x' }] })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedRows = [{ id: 'r1' }]
    await vm.runBulk('publish')
    await vm.onPublishConfirm('批量发布说明')
    await flushPromises()
    expect(mocks.getSyncStatus).not.toHaveBeenCalled()
  })

  it('下线/删除/复制不触发生效轮询', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.offline({ id: 'r1' })
    await vm.del({ id: 'r1' })
    await vm.duplicate({ id: 'r1' })
    await flushPromises()
    expect(mocks.getSyncStatus).not.toHaveBeenCalled()
  })
})
