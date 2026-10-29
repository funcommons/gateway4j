import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

// H7b T1 契约用例：大盘联动顶栏环境 —— 切换环境 → 全量重拉。
// 契约口径：监控接口未定义 environment 参数（固定契约仅覆盖 /v1/routes 系列），
// 这里保证「切换即刷新」；降级（404）时 current 恒为 default，watch 不触发、不多打请求。
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
import { useEnvironmentStore } from '@/store/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

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
        metrics: '指标趋势', topology: '路由拓扑', lastRefresh: '最近刷新', sourcePrometheus: 'Prometheus', sourceSnapshot: '快照'
      }
    }
  }
})

function factory() {
  return mount(Index, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listRouteStatus.mockReset().mockResolvedValue([
    { route_id: 'r1', route_name: 'r1', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
  ])
  mocks.getTopology.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.getRouteMetrics.mockReset().mockResolvedValue({ route_id: 'r1', data_points: [] })
  mocks.getRouteTimeseries.mockReset().mockResolvedValue({ source: 'snapshot', data_points: [] })
})

describe('Index.vue — H7b：顶栏切换环境 → 大盘刷新', () => {
  it('切换 current → listRouteStatus / getTopology 重新拉取', async () => {
    factory()
    await flushPromises()
    const callsAfterMount = mocks.listRouteStatus.mock.calls.length
    expect(callsAfterMount).toBeGreaterThanOrEqual(1)
    const s = useEnvironmentStore()
    s.$patch({ available: true, loaded: true, environments: ['default', 'staging'], current: 'default' })
    s.setCurrent('staging')
    await flushPromises()
    expect(mocks.listRouteStatus.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('降级（current 恒 default）→ setCurrent(default) 同值不触发额外请求', async () => {
    factory()
    await flushPromises()
    const callsAfterMount = mocks.listRouteStatus.mock.calls.length
    const s = useEnvironmentStore()
    s.setCurrent('default')
    await flushPromises()
    expect(mocks.listRouteStatus.mock.calls.length).toBe(callsAfterMount)
  })
})
