import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRouteStatus: vi.fn(),
  getTopology: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus,
  getTopology: mocks.getTopology
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
        routeTotal: '路由总数', healthy: '健康路由', circuitOpen: '熔断路由', totalRequests: '总请求数',
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

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
})

function factory() {
  return mount(Index, { global: { plugins: [i18n] } })
}

describe('Index.vue — stat cards loading skeleton', () => {
  it('shows FcSkeleton for stat cards while loading', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listRouteStatus.mockReset()
    mocks.listRouteStatus.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))

    const wrapper = factory()
    await flushPromises()

    // While loading, stat cards area should show skeleton
    const html = wrapper.html()
    expect(html).toContain('fc-skeleton')

    // Resolve and verify skeleton is gone
    resolveList([])
    await flushPromises()
    const htmlAfter = wrapper.html()
    // After loading, stat values should be visible
    expect(htmlAfter).toContain('stat-value')
  })

  it('shows stat values after loading completes', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 100, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('stat-value')
  })
})
