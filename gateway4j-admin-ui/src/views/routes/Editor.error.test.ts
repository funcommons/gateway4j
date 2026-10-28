import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute,
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
    'zh-CN': {
      common: { cancel: '取消', save: '保存', create: '新建' }
    }
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

async function factory(opts: { path: string; id?: string } = { path: '/routes/new' }) {
  const router = makeRouter()
  await router.push(opts.path)
  await router.isReady()
  return mount(Editor, { global: { plugins: [i18n, router] } })
}

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset()
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('Editor.vue — error resilience in load()', () => {
  it('handles listRoutes rejection on mount without unhandled rejection', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/new' })
    await flushPromises()
    // /routes/new sets routeData to { id: null }; the new-route path still
    // works (routeData is set), but routeSelectOptions stays [] from the
    // catch handler. Component should mount cleanly.
    expect((wrapper.vm as any).routeSelectOptions).toEqual([])
  })

  it('handles getRoute rejection when editing without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.getRoute.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/abc' })
    await flushPromises()
    // routeData stays null because getRoute failed
    expect((wrapper.vm as any).routeData).toBeNull()
  })

  it('handles listBindings rejection without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.getRoute.mockResolvedValue({ id: 'r1', route_name: 'r', route_type: 'BACKEND' })
    mocks.listBindings.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/r1' })
    await flushPromises()
    // bindings stays empty
    expect((wrapper.vm as any).form.bindings).toEqual([])
  })

  it('handles getPluginChain rejection without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.getRoute.mockResolvedValue({ id: 'r1', route_name: 'r', route_type: 'BACKEND' })
    mocks.getPluginChain.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/r1' })
    await flushPromises()
    expect((wrapper.vm as any).chain).toEqual([])
  })
})