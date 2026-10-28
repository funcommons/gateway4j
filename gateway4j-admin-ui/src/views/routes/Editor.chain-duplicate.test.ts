import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  listRoutes: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  listRoutes: mocks.listRoutes,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: vi.fn().mockResolvedValue([])
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Editor from '@/views/routes/Editor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', failed: '失败', loadFailed: '加载失败' },
      route: {
        editorTabBasic: '基本', editorTabConditions: '条件', editorTabBindings: '绑定', editorTabChain: '链',
        editorLoadError: '加载失败', editorRouteListError: '路由列表加载失败',
        editorDispatchHint: '分发路由提示', editorSecondaryError: '次要错误',
        editorDataIntegrityHint: '数据完整性提示', routeListLoadFailed: '路由列表加载失败',
        conditionsLoadFailed: '条件加载失败', bindingsLoadFailed: '绑定加载失败',
        chainLoadFailed: '链加载失败', dispatchNeedsConditions: '分发路由需要条件'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/new', name: 'RouteNew', component: Editor },
      { path: '/routes/:id', name: 'RouteEdit', component: Editor }
    ]
  })
}

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset().mockResolvedValue({
    id: 'r1', route_name: 'Test', route_type: 'BACKEND', path: '/test',
    upstream_url: 'http://test', sort_order: 0, remark: ''
  })
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new' })
  mocks.updateRoute.mockReset().mockResolvedValue({})
})

async function factory() {
  const router = makeRouter()
  await router.push('/routes/r1')
  await router.isReady()
  const wrapper = mount(Editor, {
    global: {
      plugins: [i18n, router],
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' }
      }
    }
  })
  await flushPromises()
  return wrapper
}

describe('routes/Editor.vue — loadChain call efficiency', () => {
  it('calls getPluginChain only once during initial load', async () => {
    await factory()
    // loadBindings() calls loadChain(), and the watch on bindings.length
    // should NOT trigger another loadChain() call
    const chainCalls = mocks.getPluginChain.mock.calls.length
    expect(chainCalls).toBe(1)
  })
})
