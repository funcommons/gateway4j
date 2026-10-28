import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

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

describe('Index.vue — topology loading state', () => {
  it('shows FcSkeleton in topology tab while loading', async () => {
    let resolveTopo: (v: any) => void = () => {}
    mocks.getTopology.mockReset()
    mocks.getTopology.mockImplementation(() => new Promise((resolve) => { resolveTopo = resolve }))

    const wrapper = mount(Index, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    // Switch to topology tab
    vm.tab = 'topology'
    await flushPromises()

    // Trigger a new load while topology is pending
    const p = vm.load()
    await flushPromises()

    // While loading, the topology area should show skeleton
    const html = wrapper.html()
    expect(html).toContain('fc-skeleton')

    resolveTopo({ nodes: [], edges: [] })
    await p
    await flushPromises()
  })

  it('shows VueFlow after topology data loads', async () => {
    mocks.getTopology.mockResolvedValue({
      nodes: [{ id: 'r1', name: 'A', type: 'BACKEND', status: 'HEALTHY' }],
      edges: []
    })
    const wrapper = mount(Index, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    vm.tab = 'topology'
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('vf-stub')
  })
})
