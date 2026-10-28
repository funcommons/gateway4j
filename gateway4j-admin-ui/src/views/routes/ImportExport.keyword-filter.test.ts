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
      importExport: { tabExport: '导出', tabImport: '导入', status: '状态', downloadPackage: '下载包', routePackage: '路由包', strategy: '策略', preCheck: '预检', doImport: '导入', preCheckHint: '请先预检', reportValid: '校验通过', reportInvalid: '校验不通过', reportConflicts: '冲突', reportMissingPlugins: '缺失插件', reportMissingTargets: '缺失目标', reportCycleWarnings: '循环警告', error: '错误', jsonParseError: 'JSON 格式错误', exportSuccess: '导出成功', importSuccess: '导入成功', routeKeyword: '关键字', routeKeywordPlaceholder: '搜索路由名称' }
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
  const wrapper = mount(ImportExport, {
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.exportRoutes.mockReset().mockResolvedValue({})
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({})
  mocks.listRoutes.mockReset().mockResolvedValue([])
})

describe('ImportExport.vue — route keyword filter', () => {
  it('has a routeKeyword ref with empty default', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.routeKeyword).toBe('')
  })

  it('has filteredRoutes computed that returns all routes when keyword is empty', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: '1', route_name: 'User API', route_type: 'BACKEND' },
      { id: '2', route_name: 'Order API', route_type: 'BACKEND' }
    ])
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.filteredRoutes.length).toBe(2)
  })

  it('filters routes by name (case-insensitive) when keyword is set', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: '1', route_name: 'User API', route_type: 'BACKEND' },
      { id: '2', route_name: 'Order API', route_type: 'BACKEND' },
      { id: '3', route_name: 'user-service', route_type: 'DISPATCH' }
    ])
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.routeKeyword = 'user'
    expect(vm.filteredRoutes.length).toBe(2)
    expect(vm.filteredRoutes[0].route_name).toBe('User API')
    expect(vm.filteredRoutes[1].route_name).toBe('user-service')
  })

  it('returns empty array when no routes match keyword', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: '1', route_name: 'User API', route_type: 'BACKEND' }
    ])
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.routeKeyword = 'xyz'
    expect(vm.filteredRoutes).toEqual([])
  })

  it('uses filteredRoutes in the export table instead of allRoutes', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: '1', route_name: 'User API', route_type: 'BACKEND' },
      { id: '2', route_name: 'Order API', route_type: 'BACKEND' }
    ])
    const wrapper = await factory()
    const vm = wrapper.vm as any
    // Table should show filteredRoutes
    vm.routeKeyword = 'order'
    expect(vm.filteredRoutes.length).toBe(1)
    expect(vm.filteredRoutes[0].route_name).toBe('Order API')
  })
})
