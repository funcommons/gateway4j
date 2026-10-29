import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import * as echarts from 'echarts'

const mocks = vi.hoisted(() => ({
  listRouteStatus: vi.fn(),
  getTopology: vi.fn(),
  getRouteMetrics: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus,
  getTopology: mocks.getTopology,
  getRouteMetrics: mocks.getRouteMetrics
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
        total: '总请求数', errorRate: '错误率',
        routeTotal: '路由总数', healthy: '健康路由', circuitOpen: '熔断路由', errorRoute: '异常路由', totalRequests: '总请求数',
        tabStatus: '路由状态', tabMetrics: '指标趋势', tabTopology: '路由拓扑',
        chartRequests: '请求量', chartErrorRate: '错误率%', chartNoData: '暂无数据',
        latency: '延迟', requests: '请求量', timeRange: '时间范围',
        granularity: '粒度', autoRefresh: '自动刷新', selectRoute: '选择路由',
        qps: '当前 QPS', p50: 'P50', p95: 'P95', p99: 'P99', status: '路由状态',
        metrics: '指标趋势', topology: '路由拓扑'
      }
    }
  }
})

function factory() {
  return mount(Index, { global: { plugins: [i18n] } })
}

function lastChartOptions(): any[] {
  const initMock = vi.mocked(echarts.init)
  const results = initMock.mock.results
  const chart = results[results.length - 1]?.value as any
  return (chart?.setOption as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
}

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([
    { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: '0', error_count: '0', error_rate: 0 }
  ])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset()
})

describe('P0-2 — trend chart X axis (ISO-8601 timestamps)', () => {
  it('renders real time labels (HH:mm:ss) — no Invalid Date from string timestamps', async () => {
    // 后端契约: timestamp 为 ISO-8601 字符串. 修复前裸 epoch 毫秒字符串
    // new Date("1793...") → Invalid Date, 整排 X 轴全坏.
    mocks.getRouteMetrics.mockResolvedValue({
      route_id: 'r1',
      data_points: [
        { timestamp: '2026-10-29T07:30:00Z', total_requests: 3, error_count: 0, error_rate: 0 },
        { timestamp: '2026-10-29T07:31:00Z', total_requests: 5, error_count: 1, error_rate: 0.2 },
        { timestamp: '2026-10-29T07:32:00Z', total_requests: 8, error_count: 0, error_rate: 0 }
      ]
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    const options = lastChartOptions()
    expect(options.length).toBeGreaterThan(0)
    const last = options[options.length - 1]
    const labels: string[] = last.xAxis.data
    expect(labels).toHaveLength(3)
    for (const label of labels) {
      expect(String(label)).not.toContain('Invalid')
      expect(String(label)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    }
  })

  it('keeps labels parseable and empty (not "Invalid Date") when a timestamp is malformed', async () => {
    mocks.getRouteMetrics.mockResolvedValue({
      route_id: 'r1',
      data_points: [
        { timestamp: 'not-a-date', total_requests: 1, error_count: 0, error_rate: 0 },
        { timestamp: '2026-10-29T07:31:00Z', total_requests: 2, error_count: 0, error_rate: 0 }
      ]
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    const options = lastChartOptions()
    const labels: string[] = options[options.length - 1].xAxis.data
    expect(labels[0]).toBe('')
    expect(labels[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('includes the date part when the range spans multiple days', async () => {
    mocks.getRouteMetrics.mockResolvedValue({
      route_id: 'r1',
      data_points: [
        { timestamp: '2026-10-01T00:00:00Z', total_requests: 1, error_count: 0, error_rate: 0 },
        { timestamp: '2026-10-29T04:00:00Z', total_requests: 2, error_count: 0, error_rate: 0 }
      ]
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    const options = lastChartOptions()
    const labels: string[] = options[options.length - 1].xAxis.data
    for (const label of labels) {
      expect(String(label)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(String(label)).not.toContain('Invalid')
    }
  })
})

describe('P0-2 — last refresh clock format', () => {
  it('formats lastRefresh as 24h HH:mm:ss, not locale-dependent 12h clock', async () => {
    mocks.getRouteMetrics.mockResolvedValue({
      route_id: 'r1',
      data_points: [{ timestamp: '2026-10-29T07:30:00Z', total_requests: 1, error_count: 0, error_rate: 0 }]
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadMetrics()
    expect(vm.lastRefresh).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(String(vm.lastRefresh)).not.toMatch(/[AP]M/i)
  })

  it('uses no locale-dependent toLocaleTimeString anywhere in the component', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')
    expect(source).not.toContain('toLocaleTimeString')
  })
})
