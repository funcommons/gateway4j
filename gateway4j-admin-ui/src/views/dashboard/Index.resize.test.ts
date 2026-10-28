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

const mockResize = vi.fn()
const mockDispose = vi.fn()
const mockSetOption = vi.fn()

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
  init: vi.fn(() => ({ setOption: mockSetOption, resize: mockResize, dispose: mockDispose })),
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
        routeTotal: '路由总数', healthy: '健康路由', totalRequests: '总请求数',
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

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mockResize.mockReset()
  mockDispose.mockReset()
  mockSetOption.mockReset()
})

describe('Index.vue — chart resize', () => {
  it('registers a window resize listener on mount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    factory()
    await flushPromises()
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    addSpy.mockRestore()
  })

  it('removes the window resize listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = factory()
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('calls chartInstance.resize() on window resize', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    await flushPromises()

    // Simulate chart being initialized (in jsdom, chartRef may be null so
    // renderChart won't create chartInstance; set it manually)
    const echarts = await import('echarts')
    const mockChart = (echarts as any).init()
    vm.chartInstance = mockChart

    // Simulate window resize
    window.dispatchEvent(new Event('resize'))
    expect(mockResize).toHaveBeenCalled()
  })
})
