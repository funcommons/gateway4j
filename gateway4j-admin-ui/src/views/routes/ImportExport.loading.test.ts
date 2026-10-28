import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn(),
  listRoutes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes,
  listRoutes: mocks.listRoutes
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading', 'maxHeight'], template: '<table class="table-stub" />' }
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
      common: { save: '保存', search: '搜索', empty: '暂无数据', exportFailed: '导出失败', importFailed: '导入失败' },
      route: { name: '路由名称', type: '类型', statusDraft: '草稿', statusPublished: '已发布', statusOffline: '已下线', statusAll: '全部', searchPlaceholder: '搜索' },
      importExport: { tabExport: '导出', tabImport: '导入', status: '状态', downloadPackage: '下载包', routePackage: '路由包', strategy: '策略', preCheck: '预检', doImport: '导入', preCheckHint: '请先预检', reportValid: '校验通过', reportInvalid: '校验不通过', reportConflicts: '冲突', reportMissingPlugins: '缺失插件', reportMissingTargets: '缺失目标', reportCycleWarnings: '循环警告', error: '错误', jsonParseError: 'JSON 格式错误', exportSuccess: '导出成功', importSuccess: '导入成功' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/import-export', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/import-export')
  await router.isReady()
  return mount(ImportExport, {
    global: { plugins: [i18n, router] }
  })
}

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({})
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({})
  mocks.listRoutes.mockReset().mockResolvedValue([])
})

describe('ImportExport.vue — route list loading state', () => {
  it('starts with routesLoading = true', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listRoutes.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.routesLoading).toBe(true)
    resolveList([])
    await flushPromises()
  })

  it('sets routesLoading = false after listRoutes resolves', async () => {
    mocks.listRoutes.mockResolvedValue([{ id: '1', route_name: 'Test', route_type: 'BACKEND' }])
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.routesLoading).toBe(false)
  })

  it('sets routesLoading = false even when listRoutes rejects', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.routesLoading).toBe(false)
  })

  it('populates allRoutes from listRoutes response', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: '1', route_name: 'Route A', route_type: 'BACKEND', children: [
        { id: '2', route_name: 'Route B', route_type: 'BACKEND' }
      ]}
    ])
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.allRoutes.length).toBe(2)
    expect(vm.allRoutes[0].route_name).toBe('Route A')
    expect(vm.allRoutes[1].route_name).toBe('Route B')
  })
})
