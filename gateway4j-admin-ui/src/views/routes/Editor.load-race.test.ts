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

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset()
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new-1' })
  mocks.updateRoute.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('Editor.vue load() — race condition protection', () => {
  it('when user navigates from /routes/1 to /routes/2, slow /routes/1 load does not overwrite /routes/2 data', async () => {
    // /routes/1 takes a long time, /routes/2 resolves quickly
    let resolveRoute1: (v: any) => void = () => {}
    mocks.getRoute.mockImplementation((id: string) => {
      if (id === '1') {
        return new Promise<any>((resolve) => { resolveRoute1 = resolve })
      }
      if (id === '2') {
        return Promise.resolve({ id: '2', route_name: 'route-2', route_type: 'BACKEND', path: '/p2', upstream_url: 'http://b2', sort_order: 0, remark: '' })
      }
      return Promise.resolve(null)
    })

    const router = makeRouter()
    await router.push('/routes/1')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })

    // First load() started for /routes/1 but is waiting on getRoute
    await flushPromises()

    // User navigates to /routes/2
    await router.push('/routes/2')
    await flushPromises()

    // /routes/2 load() should complete and populate form
    let vm = wrapper.vm as any
    expect(vm.form.route_name).toBe('route-2')

    // Now resolve /routes/1 (simulates late server response)
    resolveRoute1({ id: '1', route_name: 'route-1', route_type: 'BACKEND', path: '/p1', upstream_url: 'http://b1', sort_order: 0, remark: '' })
    await flushPromises()
    await flushPromises()
    await flushPromises()

    // form should STILL show route-2, not route-1
    vm = wrapper.vm as any
    expect(vm.form.route_name).toBe('route-2')
  })

  it('when load() is called for stale routeId, it does not touch form', async () => {
    let resolveRoute1: (v: any) => void = () => {}
    mocks.getRoute.mockImplementation((id: string) => {
      if (id === '1') return new Promise<any>((r) => { resolveRoute1 = r })
      if (id === '2') return Promise.resolve({ id: '2', route_name: 'route-2', route_type: 'BACKEND', path: '/p2', upstream_url: 'http://b2', sort_order: 0, remark: '' })
      return Promise.resolve(null)
    })

    const router = makeRouter()
    await router.push('/routes/1')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()

    // Navigate away to /routes/2
    await router.push('/routes/2')
    await flushPromises()
    expect((wrapper.vm as any).form.route_name).toBe('route-2')

    // Now late resolve /routes/1 — should not change form
    resolveRoute1({ id: '1', route_name: 'route-1-STALE', route_type: 'BACKEND', path: '/p1', upstream_url: 'http://b1', sort_order: 0, remark: '' })
    await flushPromises()
    await flushPromises()

    expect((wrapper.vm as any).form.route_name).toBe('route-2')
  })

  it('rapid navigation between new/edit preserves correct final state', async () => {
    // Simulate: user goes /routes/new → /routes/3 → /routes/new
    // Final state should be "new mode" form (empty)
    mocks.getRoute.mockImplementation((id: string) => {
      if (id === '3') return Promise.resolve({ id: '3', route_name: 'route-3', route_type: 'BACKEND', path: '/p3', upstream_url: 'http://b3', sort_order: 0, remark: '' })
      return Promise.resolve(null)
    })

    const router = makeRouter()
    await router.push('/routes/new')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()

    // Go to /routes/3
    await router.push('/routes/3')
    await flushPromises()
    expect((wrapper.vm as any).form.route_name).toBe('route-3')

    // Back to /routes/new — form should reset to empty
    await router.push('/routes/new')
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.form.route_name).toBe('')
    expect(vm.routeId).toBeUndefined()
  })
})
