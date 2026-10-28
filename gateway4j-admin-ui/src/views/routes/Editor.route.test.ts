import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
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
      { path: '/routes/new', name: 'RouteNew', component: Editor },
      { path: '/routes/:id', name: 'RouteEdit', component: Editor }
    ]
  })
}

async function factory(initialPath: string) {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()
  return mount(Editor, { global: { plugins: [i18n, router] } })
}

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset()
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('Editor.vue — route param change', () => {
  it('reloads form when navigating from /routes/1 to /routes/2 (same component instance)', async () => {
    // First load route 1
    mocks.getRoute.mockResolvedValueOnce({ id: '1', route_name: 'route-1', route_type: 'BACKEND' })
    const wrapper = await factory('/routes/1')
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.form.route_name).toBe('route-1')

    // Now navigate to /routes/2 — getRoute should be called again with '2'
    mocks.getRoute.mockResolvedValueOnce({ id: '2', route_name: 'route-2', route_type: 'BACKEND' })
    // simulate route push (without unmounting the component)
    // Note: in a real app, vue-router reuses the same component instance when only
    // the param changes (same RouteRecord), so onMounted won't re-fire
    // We need to use the router's internal navigation
    const router = (wrapper.vm as any).$router
    await router.push('/routes/2')
    await flushPromises()

    // If Editor.vue has the bug, form still shows 'route-1' even after navigation
    expect(vm.form.route_name).toBe('route-2')
  })
})