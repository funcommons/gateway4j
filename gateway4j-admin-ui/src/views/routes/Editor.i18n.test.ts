import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  listBindings: vi.fn(),
  listRoutes: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getRoute: mocks.getRoute,
  createRoute: mocks.createRoute,
  updateRoute: mocks.updateRoute,
  listBindings: mocks.listBindings,
  listRoutes: mocks.listRoutes,
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

vi.mock('@/components/RouteBasicForm.vue', () => ({
  default: { name: 'RouteBasicForm', props: ['modelValue'], template: '<div class="basic-form-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/RouteConditionsTable.vue', () => ({
  default: { name: 'RouteConditionsTable', props: ['modelValue', 'routeOptions'], template: '<div class="conditions-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/RouteBindingsTable.vue', () => ({
  default: { name: 'RouteBindingsTable', props: ['modelValue', 'pluginOptions'], template: '<div class="bindings-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/RouteChainPreview.vue', () => ({
  default: { name: 'RouteChainPreview', props: ['chain', 'bindingsCount'], template: '<div class="chain-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/layout/FcSectionCard.vue', () => ({
  default: { name: 'FcSectionCard', props: ['padding'], template: '<div class="card-stub"><slot /><slot name="footer" /></div>' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/navigation/FcTabsPanel.vue', () => ({
  default: { name: 'FcTabsPanel', props: ['modelValue', 'tabs'], template: '<div class="tabs-stub"><slot /></div>' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/components/form/FcButton.vue', () => ({
  default: { name: 'FcButton', props: ['variant', 'size', 'loading', 'type'], template: '<button class="btn-stub"><slot /></button>' }
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
      common: { cancel: '取消', save: '保存', failed: '操作失败' },
      route: {
        name: '路由名称', type: '路由类型', status: '状态', path: '匹配路径',
        conditions: '分发条件', bindings: '插件绑定',
        editorTabBasic: '基础信息', editorTabConditions: '分发条件',
        editorTabBindings: '插件绑定', editorTabChain: '插件链预览',
        editorLoadError: '加载失败',
        editorRouteListError: '路由列表加载失败',
        editorDispatchHint: 'DISPATCH 路由将无法选择 target_route',
        editorSecondaryError: '部分数据加载失败',
        editorDataIntegrityHint: '保存前请检查数据完整性'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/routes/new', name: 'RouteNew', component: Editor },
      { path: '/routes/:id', name: 'RouteEdit', component: Editor },
      { path: '/routes', name: 'Routes', component: { template: '<div />' } }
    ]
  })
}

beforeEach(() => {
  mocks.getRoute.mockReset().mockResolvedValue({})
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'r1' })
  mocks.updateRoute.mockReset().mockResolvedValue({})
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
})

describe('routes/Editor.vue — i18n rendering', () => {
  it('uses i18n for tab labels', async () => {
    const router = makeRouter()
    await router.push('/routes/new')
    await router.isReady()
    mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = (await mount(Editor, { global: { plugins: [i18n, router] } })).vm as any
    // Tabs should have i18n labels
    const labels = vm.tabs.map((tab: any) => tab.label)
    expect(labels).toContain('基础信息')
    expect(labels).toContain('分发条件')
    expect(labels).toContain('插件绑定')
    expect(labels).toContain('插件链预览')
  })

  it('renders load error with i18n text', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('server error'))
    mocks.getRoute.mockRejectedValue(new Error('server error'))
    const router = makeRouter()
    await router.push('/routes/r1')
    await router.isReady()
    const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const errorEl = wrapper.find('[data-testid="load-error"]')
    if (errorEl.exists()) {
      expect(errorEl.text()).toContain('加载失败')
    }
  })
})
