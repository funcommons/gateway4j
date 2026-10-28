import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
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
      common: { create: '新建', edit: '编辑', delete: '删除', publish: '发布', offline: '下线', empty: '暂无数据' },
      route: { name: '路由名', type: '类型', path: '路径', status: '状态', statusAll: '全部', statusDraft: '草稿', statusPublished: '已发布', statusChanging: '变更中', statusOffline: '已下线' }
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

function makeNode(over: Partial<any> = {}) {
  return {
    id: 'r1', route_name: 'route-1', route_type: 'BACKEND',
    path: '/api/x', status: 'DRAFT', sort_order: 0,
    remark: '', config_version: '1', created_at: 0, updated_at: 0,
    plugins: [], children: [], ...over
  }
}

async function factory(opts: { initial?: any[] } = {}) {
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  mocks.listRoutes.mockResolvedValue(opts.initial ?? [])
  const wrapper = mount(List, {
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('List.vue — tree status filter shows parent when child matches', () => {
  it('shows parent dispatch route when child backend matches the status filter', async () => {
    const data = [
      makeNode({
        id: 'dispatch-1', route_name: '分发路由', route_type: 'DISPATCH', status: 'DRAFT',
        children: [
          makeNode({ id: 'backend-1', route_name: '后置路由1', route_type: 'BACKEND', status: 'PUBLISHED' }),
          makeNode({ id: 'backend-2', route_name: '后置路由2', route_type: 'BACKEND', status: 'DRAFT' })
        ]
      })
    ]
    const wrapper = await factory({ initial: data })
    const vm = wrapper.vm as any

    // Filter by PUBLISHED status
    vm.filter = 'PUBLISHED'
    await flushPromises()

    // Both the parent dispatch and the matching child should be visible
    const ids = vm.flatRows.map((r: any) => r.id)
    expect(ids).toContain('dispatch-1')
    expect(ids).toContain('backend-1')
    // The non-matching child should be hidden
    expect(ids).not.toContain('backend-2')
  })

  it('hides parent dispatch route when no child matches the status filter', async () => {
    const data = [
      makeNode({
        id: 'dispatch-1', route_name: '分发路由', route_type: 'DISPATCH', status: 'DRAFT',
        children: [
          makeNode({ id: 'backend-1', route_name: '后置路由1', route_type: 'BACKEND', status: 'DRAFT' })
        ]
      })
    ]
    const wrapper = await factory({ initial: data })
    const vm = wrapper.vm as any

    // Filter by PUBLISHED status — nothing matches
    vm.filter = 'PUBLISHED'
    await flushPromises()

    expect(vm.flatRows.length).toBe(0)
  })

  it('shows dispatch route itself when it matches the status filter', async () => {
    const data = [
      makeNode({
        id: 'dispatch-1', route_name: '分发路由', route_type: 'DISPATCH', status: 'PUBLISHED',
        children: [
          makeNode({ id: 'backend-1', route_name: '后置路由1', route_type: 'BACKEND', status: 'DRAFT' })
        ]
      })
    ]
    const wrapper = await factory({ initial: data })
    const vm = wrapper.vm as any

    // Filter by PUBLISHED status
    vm.filter = 'PUBLISHED'
    await flushPromises()

    const ids = vm.flatRows.map((r: any) => r.id)
    expect(ids).toContain('dispatch-1')
    // Child doesn't match, should not appear
    expect(ids).not.toContain('backend-1')
  })

  it('handles deeply nested tree with mixed status filters', async () => {
    const data = [
      makeNode({
        id: 'd1', route_type: 'DISPATCH', status: 'DRAFT',
        children: [
          makeNode({
            id: 'd2', route_type: 'DISPATCH', status: 'DRAFT',
            children: [
              makeNode({ id: 'b1', route_type: 'BACKEND', status: 'PUBLISHED' })
            ]
          })
        ]
      })
    ]
    const wrapper = await factory({ initial: data })
    const vm = wrapper.vm as any

    // Filter by PUBLISHED — leaf matches, so ancestors should be visible
    vm.filter = 'PUBLISHED'
    await flushPromises()

    const ids = vm.flatRows.map((r: any) => r.id)
    expect(ids).toContain('d1')
    expect(ids).toContain('d2')
    expect(ids).toContain('b1')
  })
})
