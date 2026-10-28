import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Editor from '@/views/routes/Editor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': { common: { cancel: '取消', save: '保存', create: '新建' } }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/new', name: 'RouteNew', component: { template: '<div />' } },
      { path: '/routes/:id', name: 'RouteEdit', component: { template: '<div />' } }
    ]
  })
}

async function factory(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset().mockResolvedValue({
    id: 'r1', route_name: 'r', route_type: 'BACKEND',
    path: '/p', upstream_url: 'http://b', sort_order: 0, remark: ''
  })
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new-1' })
  mocks.updateRoute.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('Editor.vue — listRoutes() failure shows error, not silent empty dropdown', () => {
  it('shows routeListError when listRoutes fails (instead of silently empty dropdown)', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('路由列表加载失败'))
    const wrapper = await factory('/routes/new')
    expect((wrapper.vm as any).routeListError).toBe('路由列表加载失败')
  })

  it('routeListError is rendered in UI with data-testid', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('路由列表不可用'))
    const wrapper = await factory('/routes/new')
    await flushPromises()
    const el = wrapper.find('[data-testid="route-list-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('路由列表不可用')
  })

  it('successful listRoutes has empty routeListError', async () => {
    mocks.listRoutes.mockResolvedValue([
      { id: 'r1', route_name: 'route-A', children: [] }
    ])
    const wrapper = await factory('/routes/new')
    expect((wrapper.vm as any).routeListError).toBe('')
    expect(wrapper.find('[data-testid="route-list-error"]').exists()).toBe(false)
  })

  it('listRoutes failure does NOT block getRoute load (basic fields still load)', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('list failed'))
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'DISPATCH',
      path: '', upstream_url: '', sort_order: 0, remark: ''
    })
    const wrapper = await factory('/routes/r1')
    // Despite listRoutes failing, the route data should still load
    expect((wrapper.vm as any).routeData).not.toBeNull()
  })

  it('routeSelectOptions is empty (failed load), but user sees the error', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('list failed'))
    const wrapper = await factory('/routes/new')
    expect((wrapper.vm as any).routeSelectOptions).toEqual([])
    // BUT the user is informed via routeListError
    expect((wrapper.vm as any).routeListError).toBe('list failed')
  })
})
