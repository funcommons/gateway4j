import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
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


// D12 contract: RouteBasicForm.validate() returns boolean and save() now honors
// it. Tests that drive save() directly must fill a valid form (and let the
// child form sync via nextTick) so the API path is actually exercised.
async function fillValidForm(vm: any) {
  vm.form.route_name = 'valid_route'
  vm.form.sort_order = 1
  if (vm.form.route_type === 'BACKEND') {
    vm.form.path = '/api/valid'
    vm.form.upstream_url = 'http://backend:8080'
  }
  await nextTick()
  // These tests exercise save() payload/error paths, not el-form validation
  // (Element Plus is not registered in this file, so the real el-form validate
  // always fails in jsdom). save() honors the boolean validate() contract, so
  // make the mounted basic form report valid here.
  if (vm.basicFormRef) vm.basicFormRef.validate = async () => true
}

describe('Editor.vue — save() should wait for load() to complete', () => {
  it('loading state is true initially and false after load completes', async () => {
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('save() while loading=true does NOT proceed (saves no data)', async () => {
    let resolveGetRoute: (v: any) => void = () => {}
    mocks.getRoute.mockImplementation(() => new Promise((r) => { resolveGetRoute = r }))
    mocks.listRoutes.mockResolvedValue([])
    mocks.listBindings.mockResolvedValue([])
    mocks.getPluginChain.mockResolvedValue({ pre_chain: [], post_chain: [] })

    const router = makeRouter()
    await router.push('/routes/r1')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    // Don't flush — load is pending

    const vm = wrapper.vm as any
    expect(vm.loading).toBe(true)

    // Attempt save while loading
    await fillValidForm(vm)
    await vm.save()
    // No createRoute/updateRoute should have been called
    expect(mocks.createRoute).not.toHaveBeenCalled()
    expect(mocks.updateRoute).not.toHaveBeenCalled()

    // Resolve to clean up
    resolveGetRoute({ id: 'r1', route_name: 'r', route_type: 'BACKEND', path: '/p', upstream_url: 'http://b', sort_order: 0, remark: '' })
    await flushPromises()
  })

  it('save() after load completes works normally', async () => {
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'BACKEND',
      path: '/p', upstream_url: 'http://b', sort_order: 0, remark: ''
    })
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(false)

    const vm = wrapper.vm as any
    await fillValidForm(vm)
    await vm.save()
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
  })

  it('initial loading=true (before onMounted load resolves)', async () => {
    // Block all load calls
    let resolveListRoutes: (v: any) => void = () => {}
    mocks.listRoutes.mockImplementation(() => new Promise((r) => { resolveListRoutes = r }))

    const router = makeRouter()
    await router.push('/routes/new')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    // load is pending

    expect((wrapper.vm as any).loading).toBe(true)

    resolveListRoutes([])
    await flushPromises()
  })
})
