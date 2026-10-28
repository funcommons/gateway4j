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

async function factory(opts: { path: string } = { path: '/routes/new' }) {
  const router = makeRouter()
  await router.push(opts.path)
  await router.isReady()
  return mount(Editor, { global: { plugins: [i18n, router] } })
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

describe('Editor.vue save() — error resilience', () => {
  it('handles createRoute rejection (saving flag flipped back, no crash, no nav)', async () => {
    mocks.createRoute.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    await fillValidForm(vm)
    await vm.save()  // internal catch swallows the error
    expect(vm.saving).toBe(false)
    // route did not change
    expect(wrapper.vm.$route.path).toBe('/routes/new')
  })

  it('handles updateRoute rejection (saving flag flipped back, no crash)', async () => {
    mocks.getRoute.mockResolvedValue({ id: 'r1', route_name: 'r', route_type: 'BACKEND' })
    mocks.updateRoute.mockRejectedValue(new Error('500'))
    const wrapper = await factory({ path: '/routes/r1' })
    const vm = wrapper.vm as any
    await fillValidForm(vm)
    await vm.save()
    expect(vm.saving).toBe(false)
  })

  it('save() is re-entrant after a previous failure', async () => {
    mocks.createRoute.mockRejectedValueOnce(new Error('first 500'))
    mocks.createRoute.mockResolvedValueOnce({ id: 'new-1' })
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    // First attempt fails
    await fillValidForm(vm)
    await vm.save()
    expect(vm.saving).toBe(false)
    expect(wrapper.vm.$route.path).toBe('/routes/new')
    // Second attempt succeeds → navigates
    await fillValidForm(vm)
    await vm.save()
    await flushPromises()
    expect(wrapper.vm.$route.path).toBe('/routes/new-1')
  })
})