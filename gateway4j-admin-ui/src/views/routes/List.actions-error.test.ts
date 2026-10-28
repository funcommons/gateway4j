import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/routes/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', edit: '编辑', delete: '删除', publish: '发布',
        offline: '下线', import: '导入', empty: '暂无数据', more: '更多'
      },
      route: {
        name: '路由名', type: '类型', path: '路径', status: '状态'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/routes/:id', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', component: { template: '<div />' } },
      { path: '/import-export', component: { template: '<div />' } }
    ]
  })
}

const fakeRoute = (overrides: any = {}) => ({
  id: 'r1',
  route_name: 'route-1',
  route_type: 'BACKEND',
  path: '/api/test',
  status: 'DRAFT',
  children: [],
  ...overrides
})

async function factory(initialRoutes: any[] = []) {
  mocks.listRoutes.mockResolvedValue(initialRoutes)
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  const wrapper = mount(List, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('routes/List.vue — publish() error UX', () => {
  it('publish failure sets actionError with server message', async () => {
    mocks.publishRoute.mockRejectedValue(new Error('路由存在循环引用'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.publish({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    expect(vm.actionError).toBe('路由存在循环引用')
  })

  it('publish failure renders the error in the UI', async () => {
    mocks.publishRoute.mockRejectedValue(new Error('路由存在循环引用'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.publish({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('路由存在循环引用')
  })

  it('publish success leaves actionError empty', async () => {
    mocks.publishRoute.mockResolvedValue(undefined)
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.publish({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('publish failure does not reload list', async () => {
    mocks.publishRoute.mockRejectedValue(new Error('500'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.publish({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    await flushPromises()
    // reload() should NOT be called on failure
    expect(mocks.listRoutes.mock.calls.length).toBe(1)
  })
})

describe('routes/List.vue — offline() error UX', () => {
  it('offline failure sets actionError', async () => {
    mocks.offlineRoute.mockRejectedValue(new Error('下线失败: 有流量'))
    const wrapper = await factory([fakeRoute({ status: 'PUBLISHED' })])
    const vm = wrapper.vm as any
    await vm.offline({ id: 'r1', route_name: 'r', status: 'PUBLISHED', children: [] })
    expect(vm.actionError).toBe('下线失败: 有流量')
  })

  it('offline success leaves actionError empty', async () => {
    mocks.offlineRoute.mockResolvedValue(undefined)
    const wrapper = await factory([fakeRoute({ status: 'PUBLISHED' })])
    const vm = wrapper.vm as any
    await vm.offline({ id: 'r1', route_name: 'r', status: 'PUBLISHED', children: [] })
    await flushPromises()
    expect(vm.actionError).toBe('')
  })
})

describe('routes/List.vue — del() error UX', () => {
  it('delete failure sets actionError with server message', async () => {
    mocks.deleteRoute.mockRejectedValue(new Error('存在子路由, 无法删除'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.del({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    expect(vm.actionError).toBe('存在子路由, 无法删除')
  })

  it('delete failure renders error in UI', async () => {
    mocks.deleteRoute.mockRejectedValue(new Error('存在子路由, 无法删除'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.del({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('存在子路由, 无法删除')
  })

  it('delete success leaves actionError empty and does not show error UI', async () => {
    mocks.deleteRoute.mockResolvedValue(undefined)
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    await vm.del({ id: 'r1', route_name: 'r', status: 'DRAFT', children: [] })
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })
})

describe('routes/List.vue — actionError lifecycle', () => {
  it('starts with empty actionError', async () => {
    const wrapper = await factory([])
    expect((wrapper.vm as any).actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('actionError is cleared before each new action', async () => {
    mocks.publishRoute.mockRejectedValueOnce(new Error('first'))
    mocks.publishRoute.mockResolvedValueOnce(undefined)
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    const r = { id: 'r1', route_name: 'r', status: 'DRAFT', children: [] }
    await vm.publish(r)
    expect(vm.actionError).toBe('first')
    await vm.publish(r)
    await flushPromises()
    expect(vm.actionError).toBe('')
  })

  it('actionError survives across multiple action types (publish then delete failure)', async () => {
    mocks.publishRoute.mockRejectedValueOnce(new Error('pub fail'))
    mocks.deleteRoute.mockRejectedValueOnce(new Error('del fail'))
    const wrapper = await factory([fakeRoute({ status: 'DRAFT' })])
    const vm = wrapper.vm as any
    const r = { id: 'r1', route_name: 'r', status: 'DRAFT', children: [] }
    await vm.publish(r)
    expect(vm.actionError).toBe('pub fail')
    await vm.del(r)
    expect(vm.actionError).toBe('del fail')
  })
})
