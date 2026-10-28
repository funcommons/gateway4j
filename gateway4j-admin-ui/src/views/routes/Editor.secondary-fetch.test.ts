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

describe('Editor.vue — secondary fetch failures show error, not silent empty data', () => {
  it('loadConditions failure sets conditionsError (so save is blocked or warned)', async () => {
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'DISPATCH',
      path: '', upstream_url: '', sort_order: 0, remark: '',
      conditions: [{ condition_type: 'HEADER', operator: 'EXISTS', condition_key: 'X', target_route_id: 'r2', priority: 0 }]
    })
    mocks.listBindings.mockRejectedValue(new Error('bindings load failed'))
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).secondaryError).toContain('bindings')
  })

  it('loadBindings failure does NOT silently wipe existing bindings to empty', async () => {
    // Set up: server has existing bindings
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'BACKEND',
      path: '/p', upstream_url: 'http://b', sort_order: 0, remark: ''
    })
    // listBindings fails
    mocks.listBindings.mockRejectedValue(new Error('500'))
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    // User should NOT be allowed to save (because we'd overwrite real bindings with [])
    // OR the UI should show an error so the user knows data is missing
    expect((wrapper.vm as any).secondaryError).toBeTruthy()
  })

  it('successful secondary fetches have empty secondaryError', async () => {
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).secondaryError).toBe('')
  })

  it('loadChain failure sets secondaryError mentioning chain', async () => {
    mocks.getPluginChain.mockRejectedValue(new Error('chain load failed'))
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).secondaryError).toContain('chain')
  })

  it('secondaryError is rendered in UI as a warning banner', async () => {
    mocks.listBindings.mockRejectedValue(new Error('bindings 网络错误'))
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    const el = wrapper.find('[data-testid="secondary-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('bindings')
  })
})
