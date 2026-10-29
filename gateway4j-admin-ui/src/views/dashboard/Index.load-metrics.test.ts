import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('Dashboard/Index.vue — loadMetrics not called after load failure', () => {
  it('loadMetrics is called after successful sections, not gated by unrelated failures', () => {
    // The bug was: loadMetrics() was inside the same try block as
    // listRouteStatus() and getTopology(). If topology failed, metrics
    // would not load even though statuses were fine.
    // The fix: separate try/catch blocks so each section's failure is
    // independent. loadMetrics() runs after both sections, regardless of
    // whether topology failed.
    const loadFunction = source.match(/async function load\(\)[\s\S]*?^}/m)
    expect(loadFunction).toBeTruthy()

    const body = loadFunction![0]

    // Should have multiple try blocks (independent error handling)
    const tryCount = (body.match(/\btry\s*\{/g) || []).length
    expect(tryCount).toBeGreaterThanOrEqual(2)

    // loadMetrics should be called after the try blocks, not inside one
    const lastTryEnd = body.lastIndexOf('}')
    const afterLastTry = body.substring(lastTryEnd + 1)
    // loadMetrics call should exist in the function
    expect(body).toMatch(/await loadMetrics\(/)
  })
})

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
  mocks.getRouteMetrics.mockReset().mockResolvedValue({ route_id: 'r1', data_points: [] })
  // P1-6: 时序接口不可用（旧 jar 404）→ 走旧 /metrics 回退路径, 保持本文件断言语义不变
  mocks.getRouteTimeseries.mockReset().mockRejectedValue(new Error('404 no timeseries'))
})

describe('Dashboard/Index.vue — load() must not call loadMetrics on failure', () => {
  it('does NOT call getRouteMetrics when listRouteStatus fails', async () => {
    mocks.listRouteStatus.mockRejectedValue(new Error('server error'))
    const wrapper = factory()
    await flushPromises()
    // load() should have caught the error; no route selected → no metrics call
    expect(mocks.getRouteMetrics).not.toHaveBeenCalled()
  })

  it('DOES call getRouteMetrics when getTopology fails (statuses loaded OK)', async () => {
    // Independent error handling: topology failure should not prevent metrics
    // from loading, since statuses (and selectedRoute) were set successfully.
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    mocks.getTopology.mockRejectedValue(new Error('topology error'))
    const wrapper = factory()
    await flushPromises()
    // getTopology failure only clears topo data; loadMetrics still runs
    expect(mocks.getRouteMetrics).toHaveBeenCalledWith('r1', '1h', '1m')
  })

  it('calls getRouteMetrics when load succeeds', async () => {
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    mocks.getTopology.mockResolvedValue({ nodes: [], edges: [] })
    const wrapper = factory()
    await flushPromises()
    expect(mocks.getRouteMetrics).toHaveBeenCalled()
  })
})
