import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
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

// Stub i18n-dependent SDK components at module level so their imports resolve
// to test stubs instead of the real i18n-using ones.
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

function makeRouteNode(over: Partial<any> = {}) {
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
  // Set up the mock BEFORE mount so the on-mount reload() picks it up.
  mocks.listRoutes.mockResolvedValue(opts.initial ?? [])
  const wrapper = mount(List, {
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('List.vue — initial state', () => {
  it('mounts and calls listRoutes on setup', async () => {
    const wrapper = await factory()
    expect(mocks.listRoutes).toHaveBeenCalled()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts with filter=ALL and empty keyword', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.filter).toBe('ALL')
    expect(vm.keyword).toBe('')
  })

  it('exposes five filter tabs (ALL/DRAFT/PUBLISHED/CHANGING/OFFLINE)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(5)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['ALL', 'DRAFT', 'PUBLISHED', 'CHANGING', 'OFFLINE'])
  })
})

describe('List.vue — flatRows computation', () => {
  it('returns empty when no rows', async () => {
    const wrapper = await factory({ initial: [] })
    expect((wrapper.vm as any).flatRows.length).toBe(0)
  })

  it('returns flat list of all routes when filter=ALL', async () => {
    const initial = [
      makeRouteNode({ id: 'a', route_name: 'a' }),
      makeRouteNode({ id: 'b', route_name: 'b' })
    ]
    const wrapper = await factory({ initial })
    expect((wrapper.vm as any).flatRows.length).toBe(2)
  })

  it('flattens nested children with depth tracking', async () => {
    const initial = [
      makeRouteNode({
        id: 'p', route_name: 'parent',
        children: [
          makeRouteNode({ id: 'c1', route_name: 'child1' }),
          makeRouteNode({ id: 'c2', route_name: 'child2', children: [
            makeRouteNode({ id: 'gc', route_name: 'grandchild' })
          ] })
        ]
      })
    ]
    const wrapper = await factory({ initial })
    const flat = (wrapper.vm as any).flatRows
    expect(flat.length).toBe(4)
    expect(flat[0].id).toBe('p')
    expect(flat[0]._depth).toBe(0)
    expect(flat[1].id).toBe('c1')
    expect(flat[1]._depth).toBe(1)
    expect(flat[2].id).toBe('c2')
    expect(flat[2]._depth).toBe(1)
    expect(flat[3].id).toBe('gc')
    expect(flat[3]._depth).toBe(2)
  })

  it('filters rows by status when filter is not ALL', async () => {
    const initial = [
      makeRouteNode({ id: 'a', status: 'DRAFT' }),
      makeRouteNode({ id: 'b', status: 'PUBLISHED' }),
      makeRouteNode({ id: 'c', status: 'OFFLINE' })
    ]
    const wrapper = await factory({ initial })
    ;(wrapper.vm as any).filter = 'PUBLISHED'
    const flat = (wrapper.vm as any).flatRows
    expect(flat.length).toBe(1)
    expect(flat[0].id).toBe('b')
  })

  it('filters rows by keyword (route_name includes)', async () => {
    const initial = [
      makeRouteNode({ id: 'a', route_name: 'alpha-route' }),
      makeRouteNode({ id: 'b', route_name: 'beta-route' }),
      makeRouteNode({ id: 'c', route_name: 'alpha-other' })
    ]
    const wrapper = await factory({ initial })
    ;(wrapper.vm as any).keyword = 'alpha'
    const flat = (wrapper.vm as any).flatRows
    expect(flat.length).toBe(2)
    expect(flat.map((r: any) => r.id).sort()).toEqual(['a', 'c'])
  })

  it('applies both filter and keyword together (AND)', async () => {
    const initial = [
      makeRouteNode({ id: 'a', route_name: 'alpha', status: 'DRAFT' }),
      makeRouteNode({ id: 'b', route_name: 'alpha', status: 'PUBLISHED' }),
      makeRouteNode({ id: 'c', route_name: 'beta', status: 'DRAFT' })
    ]
    const wrapper = await factory({ initial })
    ;(wrapper.vm as any).filter = 'DRAFT'
    ;(wrapper.vm as any).keyword = 'alpha'
    const flat = (wrapper.vm as any).flatRows
    expect(flat.length).toBe(1)
    expect(flat[0].id).toBe('a')
  })
})

describe('List.vue — actions', () => {
  it('publish(row) opens the change-description dialog, confirm sends body and reloads', async () => {
    const initial = [makeRouteNode({ id: 'pub-target', status: 'DRAFT' })]
    const wrapper = await factory({ initial })
    mocks.listRoutes.mockClear()
    // H7b T2：publish 先开变更说明弹窗，确认后携带 change_description 提交
    ;(wrapper.vm as any).publish({ id: 'pub-target' })
    expect(mocks.publishRoute).not.toHaveBeenCalled()
    expect((wrapper.vm as any).publishDialogOpen).toBe(true)
    await (wrapper.vm as any).onPublishConfirm('首次发布')
    expect(mocks.publishRoute).toHaveBeenCalledWith('pub-target', '首次发布')
    expect(mocks.listRoutes).toHaveBeenCalled()
  })

  it('offline(row) calls offlineRoute(row.id) and reloads', async () => {
    const wrapper = await factory()
    mocks.listRoutes.mockClear()
    await (wrapper.vm as any).offline({ id: 'off-target' })
    expect(mocks.offlineRoute).toHaveBeenCalledWith('off-target')
    expect(mocks.listRoutes).toHaveBeenCalled()
  })

  it('del(row) calls deleteRoute(row.id) and reloads', async () => {
    const wrapper = await factory()
    mocks.listRoutes.mockClear()
    await (wrapper.vm as any).del({ id: 'del-target' })
    expect(mocks.deleteRoute).toHaveBeenCalledWith('del-target')
    expect(mocks.listRoutes).toHaveBeenCalled()
  })
})

describe('List.vue — loading state', () => {
  it('flips loading during reload and back to false after', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listRoutes.mockReset()
    mocks.listRoutes.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const p = vm.reload()
    expect(vm.loading).toBe(true)
    resolveList([])
    await p
    expect(vm.loading).toBe(false)
  })
})