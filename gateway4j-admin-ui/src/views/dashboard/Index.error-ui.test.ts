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
    'zh-CN': { monitor: { total: '总请求数', errorRate: '错误率' } }
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

describe('Index.vue — load() error feedback', () => {
  it('starts with empty loadError', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('listRouteStatus failure sets loadError with server message', async () => {
    mocks.listRouteStatus.mockRejectedValue(new Error('监控服务不可用'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('监控服务不可用')
  })

  it('listRouteStatus failure renders error in UI', async () => {
    mocks.listRouteStatus.mockRejectedValue(new Error('监控服务不可用'))
    const wrapper = factory()
    await flushPromises()
    const el = wrapper.find('[data-testid="load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('监控服务不可用')
  })

  it('getTopology failure does NOT set loadError (independent error handling)', async () => {
    // With independent error handling, topology failure only clears topo data.
    // loadError is only set when listRouteStatus fails.
    mocks.listRouteStatus.mockResolvedValue([
      { route_id: 'r1', route_name: 'A', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    mocks.getTopology.mockRejectedValue(new Error('拓扑查询超时'))
    const wrapper = factory()
    await flushPromises()
    // Statuses loaded fine, topo failed silently — no loadError
    expect((wrapper.vm as any).loadError).toBe('')
    expect((wrapper.vm as any).topoNodes).toEqual([])
  })

  it('successful load clears loadError', async () => {
    mocks.listRouteStatus.mockResolvedValue([])
    mocks.getTopology.mockResolvedValue({ nodes: [], edges: [] })
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('loadError is NOT reset to zero stats — error path leaves data empty but tells user', async () => {
    // Critical regression: empty stats array should NOT imply "all healthy"
    mocks.listRouteStatus.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.statuses).toEqual([])  // data is empty
    expect(vm.loadError).toBeTruthy()  // but user is told WHY
  })

  it('manual reload() after failure clears stale error and retries', async () => {
    mocks.listRouteStatus.mockRejectedValueOnce(new Error('first'))
    mocks.listRouteStatus.mockResolvedValueOnce([
      { route_id: 'r1', status: 'HEALTHY', total_requests: 0, error_count: 0, error_rate: 0 }
    ])
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('first')
    await (wrapper.vm as any).load()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect((wrapper.vm as any).statuses.length).toBe(1)
  })
})
