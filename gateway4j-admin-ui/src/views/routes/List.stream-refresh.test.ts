import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  duplicateRoute: vi.fn(),
  bulkPublishRoutes: vi.fn(),
  bulkOfflineRoutes: vi.fn(),
  bulkDeleteRoutes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute,
  duplicateRoute: mocks.duplicateRoute,
  bulkPublishRoutes: mocks.bulkPublishRoutes,
  bulkOfflineRoutes: mocks.bulkOfflineRoutes,
  bulkDeleteRoutes: mocks.bulkDeleteRoutes
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) })
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
vi.mock('@/components/data/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub">{{ label }}</span>' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))

import List from '@/views/routes/List.vue'

/** P2-7 SSE 假实现 */
class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Array<(e: { data?: string }) => void>>()
  closed = false
  constructor(url: string) { FakeEventSource.instances.push(this); this.url = url }
  addEventListener(t: string, cb: (e: { data?: string }) => void) {
    const l = this.listeners.get(t) ?? []
    l.push(cb)
    this.listeners.set(t, l)
  }
  close() { this.closed = true; this.readyState = 2 }
  fireOpen() { this.readyState = 1; this.onopen?.() }
  fireMessage(t: string, d: string) { for (const cb of this.listeners.get(t) ?? []) cb({ data: d }) }
  fireError(rs: number) { this.readyState = rs; this.onerror?.() }
  static instances: FakeEventSource[] = []
  static reset() { FakeEventSource.instances = [] }
  static latest() { return FakeEventSource.instances[FakeEventSource.instances.length - 1] }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', edit: '编辑', delete: '删除', publish: '发布',
        offline: '下线', import: '导入', empty: '暂无数据', more: '更多', refresh: '刷新'
      },
      route: {
        name: '路由名', type: '类型', path: '路径', status: '状态',
        statusAll: '全部', statusDraft: '草稿', statusPublished: '已发布',
        statusChanging: '变更中', statusOffline: '已下线', tags: '标签',
        canvas: '画布', duplicate: '复制', expandAll: '全部展开', collapseAll: '全部收起',
        searchPlaceholder: '搜索', tagFilterPlaceholder: '标签'
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

async function factory() {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  return mount(List, { global: { plugins: [i18n, router] } })
}

beforeEach(() => {
  FakeEventSource.reset()
  ;(globalThis as any).EventSource = FakeEventSource
  const mem = new Map<string, string>()
  const storageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear()
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storageStub })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storageStub })
  mocks.listRoutes.mockReset().mockResolvedValue([])
})

afterEach(() => {
  delete (globalThis as any).EventSource
})

describe('List.vue — P2-7 config_changed 定向刷新（T4）', () => {
  it('挂载即订阅 SSE（?token= 查询参数）', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(FakeEventSource.instances.length).toBe(1)
    expect(FakeEventSource.latest().url).toContain('/v1/monitor/stream?token=')
    wrapper.unmount()
  })

  it('config_changed → 去抖 2s 后重拉路由列表', async () => {
    vi.useFakeTimers()
    const wrapper = await factory()
    await flushPromises()
    const callsBefore = mocks.listRoutes.mock.calls.length
    FakeEventSource.latest().fireOpen()
    FakeEventSource.latest().fireMessage('config_changed', JSON.stringify({ type: 'route' }))
    vi.advanceTimersByTime(1999)
    await flushPromises()
    expect(mocks.listRoutes.mock.calls.length).toBe(callsBefore)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(mocks.listRoutes.mock.calls.length).toBeGreaterThan(callsBefore)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('SSE 不可用（旧 jar 404）→ 静默降级，页面保持可用且无报错', async () => {
    const wrapper = await factory()
    await flushPromises()
    FakeEventSource.latest().fireError(FakeEventSource.CLOSED)
    await flushPromises()
    // 无 SSE 后行为与旧版一致：列表仍在，无错误横幅
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('卸载后 config_changed 不再触发刷新', async () => {
    const wrapper = await factory()
    await flushPromises()
    const es = FakeEventSource.latest()
    es.fireOpen()
    wrapper.unmount()
    expect(es.closed).toBe(true)
    const callsBefore = mocks.listRoutes.mock.calls.length
    es.fireMessage('config_changed', JSON.stringify({ type: 'route' }))
    vi.useFakeTimers()
    vi.advanceTimersByTime(5000)
    await flushPromises()
    vi.useRealTimers()
    expect(mocks.listRoutes.mock.calls.length).toBe(callsBefore)
  })
})
