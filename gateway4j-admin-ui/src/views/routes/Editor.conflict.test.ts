import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes
}))

// P1-3: sync-status 轮询挂起（不 resolve），保证 publish 后 phase 停留在 polling
vi.mock('@/api/misc', () => ({
  getSyncStatus: vi.fn(() => new Promise(() => {}))
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))

import Editor from '@/views/routes/Editor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', publish: '发布', refresh: '刷新' },
      route: {
        editorTabBasic: '基础信息', editorTabConditions: '分发条件',
        editorTabBindings: '插件绑定', editorTabChain: '插件链预览',
        saveSuccess: '保存成功',
        conflictModified: '路由已被他人修改，请刷新后重试',
        publishSuccess: '路由已发布',
        statusDraft: '草稿', statusPublished: '已发布', statusOffline: '已下线', statusChanging: '变更中'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/routes/:id', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/routes/r1')
  await router.isReady()
  return mount(Editor, { global: { plugins: [i18n, router] } })
}

const ROUTE = {
  id: 'r1', route_name: 'old_route', route_type: 'BACKEND', path: '/old',
  upstream_url: 'http://b:1', status: 'DRAFT', sort_order: 1, config_version: '4242'
}

async function fillValidForm(vm: any) {
  vm.form.route_name = 'valid_route'
  vm.form.sort_order = 1
  vm.form.path = '/api/valid'
  vm.form.upstream_url = 'http://backend:8080'
  await nextTick()
  if (vm.basicFormRef) vm.basicFormRef.validate = async () => true
}

beforeEach(() => {
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset().mockResolvedValue({ ...ROUTE })
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new-1' })
  mocks.updateRoute.mockReset().mockResolvedValue({ ...ROUTE, config_version: '4243' })
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('Editor.vue — P1-5 编辑冲突（code=10402）', () => {
  it('保存时携带 expected_version=打开编辑器时的 config_version（Long→String）', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.expectedVersion).toBe('4242')
    await fillValidForm(vm)
    await vm.save()
    await flushPromises()
    expect(mocks.updateRoute).toHaveBeenCalledTimes(1)
    const payload = mocks.updateRoute.mock.calls[0][1]
    expect(payload.expected_version).toBe('4242')
    expect(typeof payload.expected_version).toBe('string')
  })

  it('信封 code=10402 → warning toast + 冲突条，不落通用错误分支', async () => {
    mocks.updateRoute.mockRejectedValue(Object.assign(new Error('路由已被他人修改，请刷新后重试'), { code: 10402 }))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await fillValidForm(vm)
    await vm.save()
    await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.objectContaining({ message: '路由已被他人修改，请刷新后重试' }))
    // 冲突条可见（含「刷新」按钮），且不走 saveError 通用文案
    expect(vm.conflict).toBe(true)
    expect(vm.saveError).toBe('')
    expect(wrapper.find('[data-testid="conflict-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="conflict-refresh"]').exists()).toBe(true)
  })

  it('冲突不自动覆盖表单；点「刷新」才重拉服务端数据', async () => {
    mocks.updateRoute.mockRejectedValue(Object.assign(new Error('路由已被他人修改，请刷新后重试'), { code: 10402 }))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await fillValidForm(vm)
    const nameAfterUserInput = vm.form.route_name
    await vm.save()
    await flushPromises()
    // 冲突后表单未被自动重载（getRoute 调用次数不因冲突增加）
    const callsBeforeConflict = mocks.getRoute.mock.calls.length
    expect(callsBeforeConflict).toBeGreaterThan(0)
    expect(vm.form.route_name).toBe(nameAfterUserInput)
    // 点击「刷新」→ 重拉数据（load() 会重新拉 route 详情）
    mocks.getRoute.mockResolvedValue({ ...ROUTE, route_name: 'server_route', config_version: '4243' })
    await wrapper.find('[data-testid="conflict-refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.getRoute.mock.calls.length).toBeGreaterThan(callsBeforeConflict)
    expect(vm.form.route_name).toBe('server_route')
    expect(vm.expectedVersion).toBe('4243')
    expect(vm.conflict).toBe(false)
  })

  it('非 10402 错误不受影响，仍走通用错误分支（saveError）', async () => {
    mocks.updateRoute.mockRejectedValue(Object.assign(new Error('boom'), { code: 10100 }))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await fillValidForm(vm)
    await vm.save()
    await flushPromises()
    expect(vm.conflict).toBe(false)
    expect(vm.saveError).toBe('boom')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})

describe('Editor.vue — P1-3 发布后轮询生效状态', () => {
  it('publish 成功后启动一次 sync-status 轮询', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.routeData.status = 'DRAFT'
    // H7b T2：publish 先开变更说明弹窗，确认后携带 change_description 提交
    vm.publish()
    expect(vm.publishDialogOpen).toBe(true)
    await vm.onPublishConfirm('发布说明')
    await flushPromises()
    expect(mocks.publishRoute).toHaveBeenCalledWith('r1', '发布说明')
    expect(vm.syncStatusRef).toBeTruthy()
    expect(vm.syncStatusRef.phase).toBe('polling')
  })
})
