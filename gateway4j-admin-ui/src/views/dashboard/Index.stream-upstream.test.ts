import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRouteStatus: vi.fn(),
  getTopology: vi.fn(),
  getRouteMetrics: vi.fn(),
  getRouteTimeseries: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus,
  getTopology: mocks.getTopology,
  getRouteMetrics: mocks.getRouteMetrics,
  getRouteTimeseries: mocks.getRouteTimeseries
}))

vi.mock('@vue-flow/core', () => ({
  VueFlow: { name: 'VueFlow', template: '<div class="vf-stub" />' }
}))
vi.mock('@vue-flow/background', () => ({
  Background: { name: 'Background', template: '<div class="bg-stub" />' }
}))
vi.mock('@vue-flow/controls', () => ({
  Controls: { name: 'Controls', template: '<div class="ctrl-stub" />' }
}))
vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { name: 'MiniMap', template: '<div class="mm-stub" />' }
}))
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub"><slot /></table>' }
}))
vi.mock('@/components/data/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub">{{ label }}</span>' }
}))
vi.mock('echarts', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  getInstanceByDom: vi.fn()
}))

import Index from '@/views/dashboard/Index.vue'

// 让 el-table-column 的作用域插槽以指定行渲染（行级 DOM 断言用）
let ctxRow: any = null
const colStub = {
  name: 'ElTableColumn',
  props: ['label', 'prop', 'width'],
  setup(_: unknown, { slots }: { slots: any }) {
    return () => (ctxRow ? slots.default?.({ row: ctxRow, $index: 0 }) : null)
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      monitor: {
        routeTotal: '路由总数', healthy: '健康路由', errorRoute: '异常路由',
        totalRequests: '总请求数', errorRate: '错误率', status: '监控状态',
        healthy_: '健康', upstream: '上游', upstreamOk: '正常', upstreamUnreachable: '不可达',
        tabStatus: '路由状态', tabMetrics: '指标趋势', tabTopology: '路由拓扑',
        selectRoute: '选择路由', autoRefresh: '自动刷新', chartNoData: '暂无数据',
        chartRequests: '请求量', chartErrorRate: '错误率%', latency: '延迟',
        qps: 'QPS', p50: 'P50', p95: 'P95', p99: 'P99', lastRefresh: '最近刷新',
        healthyLabel: '健康'
      },
      route: { searchPlaceholder: '搜索', statusAll: '全部' },
      common: { loadFailed: '加载失败' }
    }
  }
})

/** P2-7 SSE 假实现（与 composable 测试同款协议） */
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

const ROWS_BASE = [
  { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 10, error_count: 0, error_rate: 0 },
  { route_id: 'r2', route_name: 'B', status: 'ERROR', total_requests: 10, error_count: 5, error_rate: 0.5 }
]

function factory() {
  return mount(Index, {
    global: { plugins: [i18n], stubs: { 'el-table-column': colStub } }
  })
}

beforeEach(() => {
  FakeEventSource.reset()
  ;(globalThis as any).EventSource = FakeEventSource
  // jsdom opaque origin 无 localStorage（getToken 链路），以内存实现兜底
  const mem = new Map<string, string>()
  const storageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear()
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storageStub })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storageStub })
  mocks.listRouteStatus.mockReset().mockResolvedValue(ROWS_BASE)
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset().mockResolvedValue({ route_id: 'r1', data_points: [] })
  mocks.getRouteTimeseries.mockReset().mockRejectedValue(new Error('404 no timeseries'))
  vi.useFakeTimers()
})

afterEach(() => {
  delete (globalThis as any).EventSource
  vi.useRealTimers()
})

describe('Index.vue — T5 上游健康徽标三态', () => {
  async function onStatusTab(row: any) {
    ctxRow = row
    const wrapper = factory()
    await flushPromises()
    ;(wrapper.vm as any).tab = 'status'
    await flushPromises()
    return wrapper
  }

  it('reachable=true → 绿「正常」徽标', async () => {
    const wrapper = await onStatusTab({ ...ROWS_BASE[0], upstream: { reachable: true, latency_ms: '12' } })
    const badge = wrapper.find('[data-testid="upstream-r1"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('正常')
  })

  it('reachable=false → 红「不可达」徽标', async () => {
    const wrapper = await onStatusTab({ ...ROWS_BASE[1], upstream: { reachable: false, latency_ms: null } })
    const badge = wrapper.find('[data-testid="upstream-r2"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('不可达')
  })

  it('upstream 缺省 / reachable 非布尔 → 不渲染徽标', async () => {
    const wrapper = await onStatusTab({ ...ROWS_BASE[0] })
    expect(wrapper.find('[data-testid="upstream-r1"]').exists()).toBe(false)
    // vm 级三态函数直测
    const vm = wrapper.vm as any
    expect(vm.upstreamState({ upstream: { reachable: true } })).toBe(true)
    expect(vm.upstreamState({ upstream: { reachable: false } })).toBe(false)
    expect(vm.upstreamState({ upstream: null })).toBeNull()
    expect(vm.upstreamState({})).toBeNull()
    expect(vm.upstreamState({ upstream: { reachable: 'yes' } })).toBeNull()
  })
})

describe('Index.vue — P2-7 SSE 实时化（T4）', () => {
  it('挂载即订阅 /v1/monitor/stream?token=…，open 后进入 sse 模式', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(FakeEventSource.instances.length).toBe(1)
    expect(FakeEventSource.latest().url).toContain('/v1/monitor/stream?token=')
    FakeEventSource.latest().fireOpen()
    await flushPromises()
    expect(vm.streamMode).toBe('sse')
    wrapper.unmount()
  })

  it('metrics 事件 → 大盘摘要切换为推送值（总路由/异常/请求数）', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    FakeEventSource.latest().fireOpen()
    FakeEventSource.latest().fireMessage('metrics', JSON.stringify({ total: '7', error: '2', total_requests: '1234' }))
    await flushPromises()
    const stats = vm.stats
    expect(stats.find((s: any) => s.label === '路由总数').value).toBe('7')
    expect(stats.find((s: any) => s.label === '异常路由').value).toBe('2')
    expect(stats.find((s: any) => s.label === '总请求数').value).toBe('1234')
    wrapper.unmount()
  })

  it('降级（onerror CLOSED，404/401 形态）→ 摘要回退 statuses 聚合，5s 轮询仍在', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    FakeEventSource.latest().fireOpen()
    FakeEventSource.latest().fireError(FakeEventSource.CLOSED)
    await flushPromises()
    expect(vm.streamMode).toBe('polling')
    // 摘要回退：statuses 聚合（total_requests 10+10=20）
    expect(vm.stats.find((s: any) => s.label === '总请求数').value).toBe('20')
    expect(vm.refreshTimer).toBeTruthy()
    wrapper.unmount()
  })

  it('无 EventSource（旧环境）→ 静默降级轮询，不刷错误', async () => {
    delete (globalThis as any).EventSource
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.streamMode).toBe('polling')
    expect(vm.loadError).toBe('')
    wrapper.unmount()
  })

  it('config_changed 事件 → 去抖 2s 后定向刷新（listRouteStatus 重拉）', async () => {
    const wrapper = factory()
    await flushPromises()
    const callsBefore = mocks.listRouteStatus.mock.calls.length
    FakeEventSource.latest().fireOpen()
    FakeEventSource.latest().fireMessage('config_changed', JSON.stringify({ type: 'route', at: '2026-10-29T00:00:00Z' }))
    vi.advanceTimersByTime(1999)
    await flushPromises()
    expect(mocks.listRouteStatus.mock.calls.length).toBe(callsBefore)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(mocks.listRouteStatus.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('页面隐藏 → SSE 关闭暂停；恢复可见 → 重新订阅', async () => {
    const wrapper = factory()
    await flushPromises()
    const es1 = FakeEventSource.latest()
    es1.fireOpen()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(es1.closed).toBe(true)
    expect((wrapper.vm as any).streamMode).toBe('paused')

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    const es2 = FakeEventSource.latest()
    expect(es2).not.toBe(es1)
    es2.fireOpen()
    expect((wrapper.vm as any).streamMode).toBe('sse')
    wrapper.unmount()
  })

  it('卸载时关闭 SSE 连接', async () => {
    const wrapper = factory()
    await flushPromises()
    const es = FakeEventSource.latest()
    es.fireOpen()
    wrapper.unmount()
    expect(es.closed).toBe(true)
  })
})
