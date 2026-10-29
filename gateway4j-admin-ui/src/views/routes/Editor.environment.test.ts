import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

// H7b 契约用例：编辑器环境维度 ——
//   契约 2：创建可选 environment（预选顶栏当前环境）；PATCH 携带则迁移、缺省保持
//   契约 5 + T2：发布变更说明必填弹窗，提交随 body
const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  validateRoute: vi.fn(),
  listBuiltinTypes: vi.fn(),
  listEnvironments: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain,
  validateRoute: mocks.validateRoute
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import Editor from '@/views/routes/Editor.vue'
import { useEnvironmentStore } from '@/store/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', publish: '发布', republish: '重新发布', create: '新建' },
      route: { saveSuccess: '保存成功', publishSuccess: '路由已发布' },
      env: { switcherLabel: '环境', envCreateHint: '新建路由将归属所选环境', envMigrateHint: '保存并携带变更即迁移到所选环境', publishDialogTitle: '发布路由' }
    }
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
  const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

function makeEnvAvailable(envs: string[] = ['default', 'staging'], current = 'default') {
  const s = useEnvironmentStore()
  s.$patch({ available: true, loaded: true, environments: envs, current })
  return s
}

function validForm() {
  return { route_name: 'alpha', route_type: 'BACKEND', path: '/a', upstream_url: 'http://u', sort_order: 1 }
}

/** jsdom 下 el-form 未注册，RouteBasicForm.validate 会走 catch 分支 —— 桩掉基础表单校验 */
function stubBasicFormValidate(vm: any) {
  vm.basicFormRef = { validate: vi.fn().mockResolvedValue(true), setFieldErrors: vi.fn() }
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset()
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new-1', route_name: 'alpha' })
  mocks.updateRoute.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.validateRoute.mockReset().mockResolvedValue(undefined)
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.listEnvironments.mockReset().mockRejectedValue(new Error('404'))
})

describe('Editor — 契约 2：创建可选 environment', () => {
  it('环境可用 → 创建表单预选顶栏当前环境；createRoute 携带 environment', async () => {
    makeEnvAvailable(['default', 'staging'], 'staging')
    const wrapper = await factory('/routes/new')
    const vm = wrapper.vm as any
    expect(vm.formEnv).toBe('staging')
    expect(wrapper.find('[data-testid="route-env-field"]').exists()).toBe(true)
    stubBasicFormValidate(vm)
    Object.assign(vm.form, validForm())
    await vm.save()
    const payload = mocks.createRoute.mock.calls[0][0]
    expect(payload.environment).toBe('staging')
    expect(payload.route_name).toBe('alpha')
  })

  it('降级（404）→ 环境字段不渲染；createRoute 不携带 environment 键', async () => {
    const wrapper = await factory('/routes/new')
    const vm = wrapper.vm as any
    expect(vm.envReady).toBe(false)
    expect(wrapper.find('[data-testid="route-env-field"]').exists()).toBe(false)
    stubBasicFormValidate(vm)
    Object.assign(vm.form, validForm())
    await vm.save()
    const payload = mocks.createRoute.mock.calls[0][0]
    expect('environment' in payload).toBe(false)
  })
})

describe('Editor — 契约 2：PATCH 携带则迁移、缺省保持', () => {
  async function editFactory() {
    makeEnvAvailable(['default', 'staging'], 'default')
    mocks.getRoute.mockResolvedValue({ id: 'r1', route_name: 'r', route_type: 'BACKEND', path: '/a', upstream_url: 'http://u', environment: 'default', config_version: '5' })
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    return wrapper
  }

  it('加载后环境选择显示路由当前环境', async () => {
    const wrapper = await editFactory()
    expect((wrapper.vm as any).formEnv).toBe('default')
    expect((wrapper.vm as any).initialEnv).toBe('default')
  })

  it('用户改选环境后保存 → PATCH 携带 environment（迁移）+ expected_version', async () => {
    const wrapper = await editFactory()
    const vm = wrapper.vm as any
    stubBasicFormValidate(vm)
    vm.formEnv = 'staging'
    vm.envTouched = true
    await vm.save()
    const body = mocks.updateRoute.mock.calls[0][1]
    expect(body.environment).toBe('staging')
    expect(body.expected_version).toBe('5')
  })

  it('未改环境 → PATCH 不携带 environment 键（缺省保持）', async () => {
    const wrapper = await editFactory()
    const vm = wrapper.vm as any
    stubBasicFormValidate(vm)
    await vm.save()
    const body = mocks.updateRoute.mock.calls[0][1]
    expect('environment' in body).toBe(false)
  })
})

describe('Editor — 契约 5 + T2：发布变更说明', () => {
  it('publish() 开弹窗，确认后 publishRoute(id, 说明) 并关闭弹窗', async () => {
    makeEnvAvailable(['default', 'staging'], 'default')
    mocks.getRoute.mockResolvedValue({ id: 'r1', route_name: 'r', route_type: 'BACKEND', status: 'DRAFT', config_version: '5' })
    const wrapper = await factory('/routes/r1')
    await flushPromises()
    const vm = wrapper.vm as any
    vm.routeData.status = 'DRAFT'
    vm.publish()
    expect(vm.publishDialogOpen).toBe(true)
    expect(mocks.publishRoute).not.toHaveBeenCalled()
    await vm.onPublishConfirm('发布说明')
    expect(mocks.publishRoute).toHaveBeenCalledWith('r1', '发布说明')
    expect(vm.publishDialogOpen).toBe(false)
  })
})
