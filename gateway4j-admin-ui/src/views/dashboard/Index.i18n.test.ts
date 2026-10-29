import { describe, it, expect, beforeEach, vi } from 'vitest'
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

vi.mock('@/components/layout/FcSection.vue', () => ({
  default: { name: 'FcSection', template: '<div class="section-stub"><slot /></div>' }
}))
vi.mock('@/components/layout/FcSectionCard.vue', () => ({
  default: { name: 'FcSectionCard', props: ['class'], template: '<div class="card-stub"><slot /></div>' }
}))
vi.mock('@/components/navigation/FcTabsPanel.vue', () => ({
  default: {
    name: 'FcTabsPanel',
    props: ['modelValue', 'tabs'],
    template: '<div class="tabs-stub"><slot :name="\'tab-\' + modelValue" /></div>'
  }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<div class="table-stub"><slot /></div>' }
}))
vi.mock('@/components/display/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub" />' }
}))
vi.mock('@/components/form/FcSelect.vue', () => ({
  default: { name: 'FcSelect', props: ['modelValue', 'options', 'placeholder', 'style'], template: '<select class="select-stub" />' }
}))
vi.mock('@/components/form/FcSegmented.vue', () => ({
  default: { name: 'FcSegmented', props: ['modelValue', 'options'], template: '<div class="segmented-stub" />' }
}))
vi.mock('@/components/form/FcSwitch.vue', () => ({
  default: { name: 'FcSwitch', props: ['modelValue'], template: '<div class="switch-stub" />' }
}))
vi.mock('@vue-flow/core', () => ({ VueFlow: { name: 'VueFlow', template: '<div class="vf-stub"><slot /></div>' } }))
vi.mock('@vue-flow/background', () => ({ Background: { name: 'Background', template: '<div />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { name: 'Controls', template: '<div />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { name: 'MiniMap', template: '<div />' } }))
vi.mock('echarts', () => {
  const mockChart = { setOption: vi.fn(), dispose: vi.fn() }
  return { init: () => mockChart }
})

import Dashboard from '@/views/dashboard/Index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      monitor: {
        status: '路由状态', metrics: '指标趋势', topology: '路由拓扑',
        qps: '当前 QPS', total: '总请求数', errorRate: '错误率',
        p50: 'P50', p95: 'P95', p99: 'P99', latency: '延迟',
        requests: '请求量', timeRange: '时间范围', granularity: '粒度',
        autoRefresh: '自动刷新', selectRoute: '选择路由',
        tabStatus: '路由状态', tabMetrics: '指标趋势', tabTopology: '路由拓扑',
        routeTotal: '路由总数', healthy: '健康路由', totalRequests: '总请求数',
        chartRequests: '请求量', chartErrorRate: '错误率%', chartNoData: '暂无数据'
      }
    }
  }
})

beforeEach(() => {
  mocks.listRouteStatus.mockReset().mockResolvedValue([])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset().mockResolvedValue({ data_points: [] })
  // P1-6: 时序接口不可用（旧 jar 404）→ 走旧 /metrics 回退路径, 保持本文件断言语义不变
  mocks.getRouteTimeseries.mockReset().mockRejectedValue(new Error('404 no timeseries'))
})

function factory() {
  return mount(Dashboard, { global: { plugins: [i18n] } })
}

describe('Dashboard/Index.vue — i18n rendering', () => {
  it('renders stat labels via i18n', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'test', status: 'HEALTHY', total_requests: 100, error_count: 5 }
    ])
    const wrapper = factory()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('路由总数')
    expect(html).toContain('健康路由')
    expect(html).toContain('总请求数')
    expect(html).toContain('错误率')
  })

  it('renders tab labels via i18n', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // Check that tabs array uses i18n keys
    const tabLabels = vm.tabs.map((tab: any) => tab.label)
    expect(tabLabels).toContain('路由状态')
    expect(tabLabels).toContain('指标趋势')
    expect(tabLabels).toContain('路由拓扑')
  })
})
