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
    'zh-CN': {
      common: { cancel: '取消', save: '保存', create: '新建', failed: '操作失败', loadFailed: '加载失败', saveFailed: '保存失败' },
      route: {
        name: '路由名称', type: '路由类型', status: '状态', path: '匹配路径', upstream: '后端地址',
        sort: '排序', remark: '描述', typeBackend: '后置路由', typeDispatch: '分发路由',
        nameRequired: '请输入路由名称', namePattern: '路由名称需 2-50 位字母数字下划线',
        pathRequired: '请输入匹配路径', pathPattern: '请输入合法路径',
        upstreamRequired: '请输入后端地址', upstreamPattern: '请输入合法后端地址',
        remarkMaxLength: '描述不超过 200 字',
        editorTabBasic: '基础信息', editorTabConditions: '分发条件',
        editorTabBindings: '插件绑定', editorTabChain: '插件链预览',
        editorLoadError: '加载失败', editorRouteListError: '路由列表加载失败',
        editorDispatchHint: 'DISPATCH 路由将无法选择 target_route',
        editorSecondaryError: '部分数据加载失败', editorDataIntegrityHint: '保存前请检查数据完整性',
        conditionsLoadFailed: '条件加载失败', bindingsLoadFailed: '插件绑定加载失败',
        chainLoadFailed: '插件链加载失败', routeListLoadFailed: '路由列表加载失败',
        groovyValid: '语法正确', groovyInvalid: '错误'
      }
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
})

describe('routes/Editor.vue — form validation on save', () => {
  it('aborts save when basicFormRef.validate() rejects', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    // Mock the basicFormRef's validate to reject
    if (vm.basicFormRef) {
      vm.basicFormRef.validate = vi.fn().mockRejectedValue(new Error('validation failed'))
    }
    vm.form.route_name = 'bad'
    await vm.save()
    expect(mocks.createRoute).not.toHaveBeenCalled()
    expect(vm.saving).toBe(false)
  })

  it('aborts save when basicFormRef.validate() resolves false (real RouteBasicForm contract)', async () => {
    // RouteBasicForm.validate() swallows el-form rejection and returns boolean false.
    // save() must treat false as "validation failed" and NOT submit.
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    if (vm.basicFormRef) {
      vm.basicFormRef.validate = vi.fn().mockResolvedValue(false)
    }
    vm.form.route_name = 'bad name!'
    vm.form.route_type = 'BACKEND'
    vm.form.path = '/api/test'
    vm.form.upstream_url = 'http://localhost:8080'
    await vm.save()
    await flushPromises()
    expect(mocks.createRoute).not.toHaveBeenCalled()
    expect(vm.saving).toBe(false)
  })

  it('proceeds with save when basicFormRef.validate() resolves', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    if (vm.basicFormRef) {
      vm.basicFormRef.validate = vi.fn().mockResolvedValue(true)
    }
    vm.form.route_name = 'my_route'
    vm.form.route_type = 'BACKEND'
    vm.form.path = '/api/test'
    vm.form.upstream_url = 'http://localhost:8080'
    await vm.save()
    await flushPromises()
    expect(mocks.createRoute).toHaveBeenCalledTimes(1)
  })

  it('skips validation when basicFormRef is null and still saves', async () => {
    const wrapper = await factory({ path: '/routes/new' })
    const vm = wrapper.vm as any
    // If basicFormRef.value is null (component not mounted), save should still work.
    // (Note: with the real RouteBasicForm mounted, save() MUST respect its boolean
    // validate() result — covered by the "resolves false" test above.)
    vm.basicFormRef = null
    vm.form.route_name = 'my_route'
    vm.form.route_type = 'BACKEND'
    vm.form.path = '/api/test'
    vm.form.upstream_url = 'http://localhost:8080'
    await vm.save()
    await flushPromises()
    expect(mocks.createRoute).toHaveBeenCalledTimes(1)
  })
})
