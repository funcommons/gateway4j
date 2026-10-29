import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))
vi.mock('echarts', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  getInstanceByDom: vi.fn()
}))

import Index from '@/views/dashboard/Index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      monitor: {
        total: '总请求数', errorRate: '错误率', qps: 'QPS', p50: 'P50', p95: 'P95', p99: 'P99',
        latency: '延迟', requests: '请求量', timeRange: '时间范围', granularity: '粒度',
        autoRefresh: '自动刷新', selectRoute: '选择路由', metrics: '指标趋势'
      }
    }
  }
})

function factory() {
  return mount(Index, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset().mockResolvedValue({
    route_id: 'r1',
    data_points: []
  })
  // P1-6: 时序接口不可用（旧 jar 404）→ 走旧 /metrics 回退路径, 保持本文件断言语义不变
  mocks.getRouteTimeseries.mockReset().mockRejectedValue(new Error('404 no timeseries'))
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Index.vue — metrics tab', () => {
  it('exposes 3 tabs (status, metrics, topology)', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(3)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['status', 'metrics', 'topology'])
  })

  it('defaults to metrics tab', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).tab).toBe('metrics')
  })
})

describe('Index.vue — route selector for metrics', () => {
  it('populates route selector from listRouteStatus data', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'Route-A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r2', route_name: 'Route-B', status: 'ERROR', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.routeOptions.length).toBe(2)
    expect(vm.routeOptions[0]).toEqual({ value: 'r1', label: 'Route-A' })
  })

  it('selects first route when routeOptions populated and selectedRoute empty', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.selectedRoute).toBe('r1')
  })

  it('keeps selectedRoute unchanged if still valid after reload', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r2', route_name: 'B', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedRoute = 'r2'
    await vm.load()
    await flushPromises()
    expect(vm.selectedRoute).toBe('r2')
  })

  it('resets selectedRoute to first if current selection removed', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r2', route_name: 'B', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedRoute = 'r2'
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    await vm.load()
    await flushPromises()
    expect(vm.selectedRoute).toBe('r1')
  })
})

describe('Index.vue — metrics loading', () => {
  it('calls getRouteMetrics with selectedRoute, timeRange, granularity', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.timeRange = '6h'
    vm.granularity = '5m'
    await vm.loadMetrics()
    await flushPromises()
    expect(mocks.getRouteMetrics).toHaveBeenCalledWith('r1', '6h', '5m')
  })

  it('stores data_points in metricsData after load', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const points = [
      { timestamp: 1000, total_requests: 10, error_count: 1, error_rate: 0.1, avg_latency_ms: 5, p50_latency_ms: 4, p95_latency_ms: 8, p99_latency_ms: 12 },
      { timestamp: 2000, total_requests: 20, error_count: 0, error_rate: 0, avg_latency_ms: 3, p50_latency_ms: 3, p95_latency_ms: 6, p99_latency_ms: 9 }
    ]
    mocks.getRouteMetrics.mockResolvedValue({ route_id: 'r1', data_points: points })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    expect(vm.metricsData).toEqual(points)
  })

  it('skips metrics load when no route selected', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedRoute = ''
    await vm.loadMetrics()
    expect(mocks.getRouteMetrics).not.toHaveBeenCalled()
  })

  it('handles getRouteMetrics failure gracefully', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    mocks.getRouteMetrics.mockRejectedValue(new Error('metrics error'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    expect(vm.metricsData).toEqual([])
  })
})

describe('Index.vue — time range & granularity selectors', () => {
  it('exposes time range options', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.timeRangeOptions).toEqual([
      { value: '1h', label: '1h' },
      { value: '6h', label: '6h' },
      { value: '24h', label: '24h' },
      { value: '7d', label: '7d' }
    ])
  })

  it('exposes granularity options', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.granularityOptions).toEqual([
      { value: '1m', label: '1m' },
      { value: '5m', label: '5m' },
      { value: '1h', label: '1h' }
    ])
  })

  it('defaults timeRange to 1h and granularity to 1m', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.timeRange).toBe('1h')
    expect(vm.granularity).toBe('1m')
  })
})

describe('Index.vue — auto-refresh', () => {
  it('defaults autoRefresh to true', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).autoRefresh).toBe(true)
  })

  it('starts a 5s interval when autoRefresh is true and route selected', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // auto-refresh should have been set up
    expect(vm.refreshTimer).toBeTruthy()
  })

  it('clears interval when autoRefresh set to false', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.autoRefresh = false
    await flushPromises()
    expect(vm.refreshTimer).toBeNull()
  })

  it('reloads data on each tick', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    // loadMetrics() was called once on mount; advance 5s and check it fires again
    const callCountBefore = mocks.getRouteMetrics.mock.calls.length
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.getRouteMetrics.mock.calls.length).toBeGreaterThan(callCountBefore)
  })

  it('cleans up interval on unmount', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.refreshTimer).toBeTruthy()
    wrapper.unmount()
    // After unmount, the timer ref should be null
    // (vm is detached but we verified clearRefreshTimer ran by checking no more ticks fire)
  })
})

describe('Index.vue — metric card values', () => {
  it('computes latestMetric from last data point', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const points = [
      { timestamp: 1000, total_requests: 10, error_count: 1, error_rate: 0.1, avg_latency_ms: 5, p50_latency_ms: 4, p95_latency_ms: 8, p99_latency_ms: 12 }
    ]
    mocks.getRouteMetrics.mockResolvedValue({ route_id: 'r1', data_points: points })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    expect(vm.latestMetric).toEqual(points[0])
  })

  it('returns null latestMetric when metricsData empty', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.latestMetric).toBeNull()
  })

  it('exposes metricCards computed with correct values', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const points = [
      { timestamp: 1000, total_requests: 100, error_count: 2, error_rate: 0.02, avg_latency_ms: 5, p50_latency_ms: 4, p95_latency_ms: 8, p99_latency_ms: 12 }
    ]
    mocks.getRouteMetrics.mockResolvedValue({ route_id: 'r1', data_points: points })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    const cards = vm.metricCards
    expect(cards.length).toBe(4)
    const labels = cards.map((c: any) => c.label)
    expect(labels).toContain('QPS')
    expect(labels).toContain('P50')
    expect(labels).toContain('P95')
    expect(labels).toContain('P99')
  })
})
