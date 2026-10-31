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
  listBuiltinTypes: vi.fn(),
  confirm: vi.fn()
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
  validateRoute: vi.fn()
}))

vi.mock('@/api/plugins', () => ({ listBuiltinTypes: mocks.listBuiltinTypes }))
vi.mock('@/api/misc', () => ({ getSyncStatus: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.confirm })
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import Editor from '@/views/routes/Editor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', publish: '发布', refresh: '刷新', unsavedChanges: '有未保存的更改' },
      route: {
        editorTabBasic: '基础信息', editorTabConditions: '分发条件',
        editorTabBindings: '插件绑定', editorTabChain: '插件链预览',
        saveSuccess: '保存成功', conflictModified: '冲突', publishSuccess: '发布成功',
        statusDraft: '草稿', statusPublished: '已发布', statusOffline: '已下线', statusChanging: '变更中',
        discardChanges: '放弃当前未保存的修改？确定后将恢复为最近一次保存的内容。'
      },
      ux: {
        draft: {
          'banner-restore': '当前表单有未保存的修改，离开前请先保存，或放弃修改以恢复最近一次保存的内容。',
          'banner-discard': '放弃修改',
          'banner-restore-btn': '恢复已保存内容'
        }
      }
    }
  }
})

const ROUTE = {
  id: 'r1', route_name: 'old_route', route_type: 'BACKEND', path: '/old',
  upstream_url: 'http://b:1', status: 'DRAFT', sort_order: 1, config_version: '4242'
}

async function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/routes/:id', component: { template: '<div />' } }
    ]
  })
  await router.push('/routes/r1')
  await router.isReady()
  const wrapper = mount(Editor, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.getRoute.mockReset().mockResolvedValue({ ...ROUTE })
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.confirm.mockReset().mockResolvedValue(true)
})

describe('routes/Editor — FcFormDraftBanner 未保存修改横幅', () => {
  it('无修改时不显示；有修改时显示并可放弃修改', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.dirty).toBe(false)
    expect(wrapper.find('.fc-draft-banner').exists()).toBe(false)

    vm.form.route_name = 'changed_route'
    await nextTick()
    expect(vm.dirty).toBe(true)
    expect(wrapper.find('.fc-draft-banner').exists()).toBe(true)
    expect(wrapper.find('[data-testid="route-draft-banner"]').exists()).toBe(true)
    expect(wrapper.find('.fc-draft-banner').text()).toContain('未保存')
    expect(wrapper.find('.fc-draft-banner').text()).toContain('放弃修改')

    const callsBefore = mocks.getRoute.mock.calls.length
    await wrapper.find('.fc-draft-banner__btn--ghost').trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.getRoute.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(vm.dirty).toBe(false)
    expect(wrapper.find('.fc-draft-banner').exists()).toBe(false)
  })
})
