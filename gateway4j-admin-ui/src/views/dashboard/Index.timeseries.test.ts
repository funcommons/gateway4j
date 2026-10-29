import { describe, it, expect, beforeEach, vi } from 'vitest'

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
vi.mock('echarts', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  getInstanceByDom: vi.fn()
}))

import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import Index from '@/views/dashboard/Index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      monitor: {
        total: '总请求数', errorRate: '错误率',
        routeTotal: '路由总数', healthy: '健康路由', totalRequests: '总请求数',
        tabStatus: '路由状态', tabMetrics: '指标趋势', tabTopology: '路由拓扑',
        chartRequests: '请求量', chartErrorRate: '错误率%', chartNoData: '暂无数据',
        latency: '延迟', requests: '请求量', timeRange: '时间范围',
        granularity: '粒度', autoRefresh: '自动刷新', selectRoute: '选择路由',
        qps: 'QPS', p50: 'P50', p95: 'P95', p99: 'P99', status: '路由状态',
        metrics: '指标趋势', topology: '路由拓扑',
        sourcePrometheus: 'Prometheus', sourceSnapshot: '快照'
      },
      route: { statusAll: '全部', searchPlaceholder: '搜索路由名' }
    }
  }
})

const STATUS = [
  { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
]

function factory() {
  return mount(Index, { global: { plugins: [i18n] } })
}

function badge(wrapper: ReturnType<typeof factory>) {
  return wrapper.find('[data-testid="metrics-source-badge"]')
}

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue(STATUS)
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset().mockResolvedValue({ route_id: 'r1', data_points: [] })
  mocks.getRouteTimeseries.mockReset().mockResolvedValue({ source: 'prometheus', data_points: [] })
})

describe('Dashboard/Index.vue — P1-6 指标 Tab 切时序源', () => {
  it('metrics 图表改调 /v1/monitor/timeseries，参数透传 routeId/timeRange/granularity', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(mocks.getRouteTimeseries).toHaveBeenCalledWith('r1', '1h', '1m')
    const vm = wrapper.vm as any
    vm.timeRange = '6h'
    vm.granularity = '5m'
    await flushPromises()
    expect(mocks.getRouteTimeseries).toHaveBeenLastCalledWith('r1', '6h', '5m')
    // 不再从大盘调旧 /metrics
    expect(mocks.getRouteMetrics).not.toHaveBeenCalled()
  })

  it('source=prometheus → 绿色 Prometheus 徽标', async () => {
    mocks.getRouteTimeseries.mockResolvedValue({
      source: 'prometheus',
      data_points: [{ timestamp: '2026-10-29T07:30:00Z', total_requests: 1, error_count: 0, error_rate: 0 }]
    })
    const wrapper = await factory()
    await flushPromises()
    const b = badge(wrapper)
    expect(b.exists()).toBe(true)
    expect(b.text()).toBe('Prometheus')
    expect(b.classes()).toContain('source-badge--prometheus')
    expect((wrapper.vm as any).metricsSource).toBe('prometheus')
  })

  it('source=snapshot → 灰色「快照」徽标（分位数与均值同口径，徽标已说明）', async () => {
    mocks.getRouteTimeseries.mockResolvedValue({
      source: 'snapshot',
      data_points: [{
        timestamp: '2026-10-29T07:30:00Z', total_requests: 2, error_count: 0, error_rate: 0,
        avg_latency_ms: 10, p50_latency_ms: 10, p95_latency_ms: 10, p99_latency_ms: 10
      }]
    })
    const wrapper = await factory()
    await flushPromises()
    const b = badge(wrapper)
    expect(b.exists()).toBe(true)
    expect(b.text()).toBe('快照')
    expect(b.classes()).toContain('source-badge--snapshot')
    // snapshot 下分位数照常进图（p50/p95/p99 有值即展示）
    const setOption = (wrapper.vm as any).chartInstance?.setOption
    expect(setOption).toBeTruthy()
  })

  it('timeseries 404（旧 jar 混布）→ 回退旧 /metrics，图表数据照常渲染，不白屏', async () => {
    mocks.getRouteTimeseries.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    mocks.getRouteMetrics.mockResolvedValue({
      route_id: 'r1',
      data_points: [{ timestamp: '2026-10-29T07:30:00Z', total_requests: 7, error_count: 0, error_rate: 0 }]
    })
    const wrapper = await factory()
    await flushPromises()
    expect(mocks.getRouteMetrics).toHaveBeenCalledWith('r1', '1h', '1m')
    expect((wrapper.vm as any).metricsData).toHaveLength(1)
    // 回退口径不显示 source 徽标
    expect(badge(wrapper).exists()).toBe(false)
    expect((wrapper.vm as any).metricsSource).toBe('')
  })

  it('timeseries 与旧 /metrics 都失败 → 空数据兜底，页面不抛错', async () => {
    mocks.getRouteTimeseries.mockRejectedValue(new Error('404'))
    mocks.getRouteMetrics.mockRejectedValue(new Error('boom'))
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).metricsData).toEqual([])
    expect(badge(wrapper).exists()).toBe(false)
  })
})
