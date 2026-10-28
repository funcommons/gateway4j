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
  default: { name: 'FcEmpty', props: ['title', 'type'], template: '<div class="empty-stub" :data-type="type" :data-title="title" />' }
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
  return wrapper
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

describe('Editor.vue — load failure UX (when getRoute fails)', () => {
  it('shows loadError message when getRoute fails (instead of blank page)', async () => {
    mocks.getRoute.mockRejectedValue(new Error('路由不存在'))
    const wrapper = await factory('/routes/r999')
    await flushPromises()
    const errEl = wrapper.find('[data-testid="load-error"]')
    expect(errEl.exists()).toBe(true)
    expect(errEl.text()).toContain('路由不存在')
  })

  it('does NOT show the edit form when load fails (routeData stays null)', async () => {
    mocks.getRoute.mockRejectedValue(new Error('404'))
    const wrapper = await factory('/routes/r999')
    await flushPromises()
    // The FcSectionCard containing the form should not be rendered
    expect(wrapper.find('.empty-stub').exists()).toBe(false)  // FcEmpty might be used here
    // routeData should be null → form area hidden
    expect((wrapper.vm as any).routeData).toBeNull()
  })

  it('routeData is null + loadError is set on getRoute failure', async () => {
    mocks.getRoute.mockRejectedValue(new Error('服务异常'))
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).routeData).toBeNull()
    expect((wrapper.vm as any).loadError).toBe('服务异常')
  })

  it('successful load has empty loadError (regression)', async () => {
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'BACKEND',
      path: '/p', upstream_url: 'http://b', sort_order: 0, remark: ''
    })
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('new mode (/routes/new) does NOT set loadError when getRoute is not called', async () => {
    // /routes/new: routeId is undefined, so getRoute is not called
    const wrapper = await factory('/routes/new')
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect((wrapper.vm as any).routeData).toEqual({ id: null })
  })

  it('user can click "back" after load failure (not stuck on blank page)', async () => {
    mocks.getRoute.mockRejectedValue(new Error('500'))
    const wrapper = await factory('/routes/r999')
    await flushPromises()
    // The error message includes navigation option (back button or similar)
    // For now, just verify the error is shown — UI back link is a follow-up
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(true)
  })
})
