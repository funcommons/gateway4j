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

// Stub Vue Flow + i18n-dependent SDK components.
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

function factory() {
  return mount(Index, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
})

describe('Index.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts on metrics tab', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).tab).toBe('metrics')
  })

  it('starts with empty statuses + topology', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.statuses).toEqual([])
    expect(vm.topoNodes).toEqual([])
    expect(vm.topoEdges).toEqual([])
  })

  it('exposes 3 tabs (status, metrics, topology)', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(3)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['status', 'metrics', 'topology'])
  })
})

describe('Index.vue — stats computed', () => {
  it('returns 4 stat cards with zero values when empty', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.stats.length).toBe(5)
    expect(vm.stats[0]).toEqual({ label: '路由总数', value: '0' })
    expect(vm.stats[1]).toEqual({ label: '健康路由', value: '0' })
    expect(vm.stats[2]).toEqual({ label: '熔断路由', value: '0' })
    expect(vm.stats[3]).toEqual({ label: '总请求数', value: '0' })
    expect(vm.stats[4]).toEqual({ label: '错误率', value: '0%' })
  })

  it('aggregates total_requests across all statuses', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 100, error_count: 0, error_rate: 0 },
      { route_id: 'r2', route_name: 'B', status: 'ERROR', total_requests: 50, error_count: 5, error_rate: 0.1 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const total = vm.stats.find((s: any) => s.label === '总请求数')
    expect(total?.value).toBe('150')
  })

  it('counts healthy routes correctly', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r2', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r3', status: 'ERROR', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const healthy = vm.stats.find((s: any) => s.label === '健康路由')
    expect(healthy?.value).toBe('2')
  })

  it('computes error rate as percentage string', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', status: 'HEALTHY', total_requests: 100, error_count: 25, error_rate: 0.25 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rate = vm.stats.find((s: any) => s.label === '错误率')
    expect(rate?.value).toBe('25.00%')
  })

  it('reports route count from statuses.length', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r2', status: 'CIRCUIT_OPEN', total_requests: 0, error_count: 0, error_rate: 0 },
      { route_id: 'r3', status: 'ERROR', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const total = vm.stats.find((s: any) => s.label === '路由总数')
    expect(total?.value).toBe('3')
  })
})

describe('Index.vue — load() data transformation', () => {
  it('populates statuses from listRouteStatus', async () => {
    const data = [
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ]
    mocks.listRouteStatus.mockResolvedValue(data)
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).statuses).toEqual(data)
  })

  it('transforms topology nodes to Vue Flow shape with id + position + data.label', async () => {
    mocks.getTopology.mockResolvedValue({
      nodes: [
        { id: 'r1', name: 'Route A', type: 'BACKEND', status: 'OK' },
        { id: 'r2', name: 'Route B', type: 'DISPATCH', status: 'OK' }
      ],
      edges: []
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.topoNodes.length).toBe(2)
    expect(vm.topoNodes[0].id).toBe('r1')
    expect(typeof vm.topoNodes[0].position.x).toBe('number')
    expect(typeof vm.topoNodes[0].position.y).toBe('number')
    expect(vm.topoNodes[0].data.label).toContain('Route A')
    expect(vm.topoNodes[0].data.label).toContain('BACKEND')
  })

  it('transforms topology edges to Vue Flow shape with composite id', async () => {
    mocks.getTopology.mockResolvedValue({
      nodes: [],
      edges: [
        { source_id: 'r1', target_id: 'r2', condition: 'header X-Token exists' }
      ]
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.topoEdges.length).toBe(1)
    expect(vm.topoEdges[0].id).toBe('r1->r2')
    expect(vm.topoEdges[0].source).toBe('r1')
    expect(vm.topoEdges[0].target).toBe('r2')
    expect(vm.topoEdges[0].label).toBe('header X-Token exists')
  })

  it('handles missing topology nodes/edges arrays (defaults to empty)', async () => {
    mocks.getTopology.mockResolvedValue({})
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.topoNodes).toEqual([])
    expect(vm.topoEdges).toEqual([])
  })
})

describe('Index.vue — loading + error resilience', () => {
  it('flips loading during load and back to false after', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listRouteStatus.mockReset()
    mocks.listRouteStatus.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const p = vm.load()
    expect(vm.loadingStatus).toBe(true)
    resolveList([])
    await p
    expect(vm.loadingStatus).toBe(false)
  })

  it('handles listRouteStatus rejection without crashing', async () => {
    mocks.listRouteStatus.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadingStatus).toBe(false)
  })

  it('handles getTopology rejection without crashing', async () => {
    mocks.getTopology.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadingStatus).toBe(false)
    expect((wrapper.vm as any).topoNodes).toEqual([])
  })
})