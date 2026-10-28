import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute
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
      common: { create: '新建', edit: '编辑', delete: '删除', publish: '发布', offline: '下线', import: '导入', empty: '暂无数据', more: '更多' },
      route: { name: '路由名', type: '类型', path: '路径', status: '状态' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  const wrapper = mount(List, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('routes/List.vue — reload() error feedback', () => {
  it('starts with empty loadError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('listRoutes failure sets loadError with server message', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('路由列表加载失败'))
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('路由列表加载失败')
  })

  it('listRoutes failure renders error in UI', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('网络异常'))
    const wrapper = await factory()
    await flushPromises()
    const el = wrapper.find('[data-testid="load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('网络异常')
  })

  it('successful load clears loadError', async () => {
    mocks.listRoutes.mockResolvedValue([])
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('failure clears stale rows', async () => {
    mocks.listRoutes.mockResolvedValueOnce([
      { id: 'r1', route_name: 'old-route', children: [] }
    ])
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).rows.length).toBe(1)

    mocks.listRoutes.mockRejectedValue(new Error('500'))
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).rows).toEqual([])
    expect((wrapper.vm as any).loadError).toBe('500')
  })

  it('subsequent successful reload clears previous error', async () => {
    mocks.listRoutes.mockRejectedValueOnce(new Error('first'))
    mocks.listRoutes.mockResolvedValueOnce([])
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('first')
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
  })
})
