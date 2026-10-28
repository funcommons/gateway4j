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

const TREE_DATA = [
  makeNode({
    id: 'dispatch-1', route_name: '分发路由A', route_type: 'DISPATCH',
    children: [
      makeNode({ id: 'backend-1', route_name: '后置路由1', route_type: 'BACKEND' }),
      makeNode({ id: 'backend-2', route_name: '后置路由2', route_type: 'BACKEND' })
    ]
  }),
  makeNode({ id: 'standalone', route_name: '独立路由', route_type: 'BACKEND' })
]

describe('List.vue — tree expand/collapse', () => {
  it('starts with all nodes expanded', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    expect(vm.expandedKeys).toContain('dispatch-1')
  })

  it('toggling a node removes it from expandedKeys', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    vm.toggleExpand('dispatch-1')
    expect(vm.expandedKeys).not.toContain('dispatch-1')
  })

  it('toggling a collapsed node adds it to expandedKeys', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    vm.toggleExpand('dispatch-1')
    expect(vm.expandedKeys).not.toContain('dispatch-1')
    vm.toggleExpand('dispatch-1')
    expect(vm.expandedKeys).toContain('dispatch-1')
  })

  it('collapsed node hides its children from flatRows', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    // Initially expanded: 4 rows (dispatch-1, backend-1, backend-2, standalone)
    expect(vm.flatRows.length).toBe(4)
    // Collapse dispatch-1: children hidden, 2 rows (dispatch-1, standalone)
    vm.toggleExpand('dispatch-1')
    expect(vm.flatRows.length).toBe(2)
    expect(vm.flatRows[0].id).toBe('dispatch-1')
    expect(vm.flatRows[1].id).toBe('standalone')
  })

  it('re-expanding shows children again', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    vm.toggleExpand('dispatch-1')
    vm.toggleExpand('dispatch-1')
    expect(vm.flatRows.length).toBe(4)
  })

  it('dispatch routes with children have _hasChildren=true', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    const dispatchRow = vm.flatRows.find((r: any) => r.id === 'dispatch-1')
    expect(dispatchRow._hasChildren).toBe(true)
  })

  it('backend routes without children have _hasChildren=false', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    const backendRow = vm.flatRows.find((r: any) => r.id === 'backend-1')
    expect(backendRow._hasChildren).toBe(false)
  })

  it('deeply nested tree collapses correctly', async () => {
    const deepData = [
      makeNode({
        id: 'd1', route_type: 'DISPATCH', children: [
          makeNode({ id: 'd2', route_type: 'DISPATCH', children: [
            makeNode({ id: 'b1', route_type: 'BACKEND' })
          ] })
        ]
      })
    ]
    const wrapper = await factory({ initial: deepData })
    const vm = wrapper.vm as any
    expect(vm.flatRows.length).toBe(3)
    vm.toggleExpand('d1')
    expect(vm.flatRows.length).toBe(1)
    expect(vm.flatRows[0].id).toBe('d1')
  })
})

describe('List.vue — expand all / collapse all', () => {
  it('expandAll adds all dispatch node IDs to expandedKeys', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    vm.toggleExpand('dispatch-1') // collapse first
    vm.expandAll()
    expect(vm.expandedKeys).toContain('dispatch-1')
    expect(vm.flatRows.length).toBe(4)
  })

  it('collapseAll empties expandedKeys', async () => {
    const wrapper = await factory({ initial: TREE_DATA })
    const vm = wrapper.vm as any
    expect(vm.flatRows.length).toBe(4)
    vm.collapseAll()
    expect(vm.expandedKeys.length).toBe(0)
    expect(vm.flatRows.length).toBe(2) // only top-level
  })
})
