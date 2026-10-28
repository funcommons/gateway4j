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
  listBuiltinTypes: vi.fn(),
  validateRoute: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain,
  validateRoute: mocks.validateRoute
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
  mocks.validateRoute.mockReset().mockResolvedValue({})
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

describe('Editor.vue save() — includes conditions in payload', () => {
  it('createRoute payload includes conditions when form has them', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    const conditions = [
      { condition_type: 'HEADER', operator: 'EQ', condition_key: 'X-Token', condition_value: 'abc', target_route_id: 'r2', priority: 0 },
      { condition_type: 'PATH', operator: 'CONTAINS', condition_value: '/api', target_route_id: 'r3', priority: 1 }
    ]
    vm.form.conditions = conditions
    vm.form.route_name = 'test-route'
    vm.form.route_type = 'DISPATCH'
    await fillValidForm(vm)
    await vm.save()
    expect(mocks.createRoute).toHaveBeenCalledTimes(1)
    const payload = mocks.createRoute.mock.calls[0][0]
    expect(payload.conditions).toBeDefined()
    expect(payload.conditions.length).toBe(2)
    expect(payload.conditions[0].condition_type).toBe('HEADER')
    expect(payload.conditions[1].target_route_id).toBe('r3')
  })

  it('createRoute payload includes empty conditions array when form has none', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    vm.form.conditions = []
    vm.form.route_name = 'no-conds'
    await fillValidForm(vm)
    await vm.save()
    const payload = mocks.createRoute.mock.calls[0][0]
    expect(payload.conditions).toEqual([])
  })

  it('updateRoute payload includes conditions when form has them', async () => {
    mocks.getRoute.mockResolvedValue({
      id: 'r1', route_name: 'r', route_type: 'DISPATCH',
      path: '', upstream_url: '', sort_order: 0, remark: ''
    })
    const wrapper = await factory({ path: '/routes/r1' })
    const vm = wrapper.vm as any
    vm.form.conditions = [
      { condition_type: 'QUERY', operator: 'EXISTS', condition_key: 'debug', target_route_id: 'r4', priority: 0 }
    ]
    await fillValidForm(vm)
    await vm.save()
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
    const payload = mocks.updateRoute.mock.calls[0][1]
    expect(payload.conditions).toBeDefined()
    expect(payload.conditions.length).toBe(1)
    expect(payload.conditions[0].condition_type).toBe('QUERY')
  })

  it('conditions array preserves all fields (condition_type, operator, key, value, target, priority)', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    vm.form.conditions = [
      {
        condition_type: 'HEADER',
        operator: 'REGEX',
        condition_key: 'Authorization',
        condition_value: 'Bearer .+',
        target_route_id: 'r-protected',
        priority: 5
      }
    ]
    vm.form.route_name = 'protected'
    await fillValidForm(vm)
    await vm.save()
    const payload = mocks.createRoute.mock.calls[0][0]
    const c = payload.conditions[0]
    expect(c.condition_type).toBe('HEADER')
    expect(c.operator).toBe('REGEX')
    expect(c.condition_key).toBe('Authorization')
    expect(c.condition_value).toBe('Bearer .+')
    expect(c.target_route_id).toBe('r-protected')
    expect(c.priority).toBe(5)
  })

  it('conditions and bindings are both included in payload (not mutually exclusive)', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    vm.form.conditions = [{ condition_type: 'HEADER', operator: 'EXISTS', condition_key: 'X', target_route_id: 'r2', priority: 0 }]
    vm.form.bindings = [{ plugin_id: 'p1', binding_config: '{}', sort_order: 0 }]
    vm.form.route_name = 'both'
    await fillValidForm(vm)
    await vm.save()
    const payload = mocks.createRoute.mock.calls[0][0]
    expect(payload.conditions.length).toBe(1)
    expect(payload.bindings.length).toBe(1)
  })
})
