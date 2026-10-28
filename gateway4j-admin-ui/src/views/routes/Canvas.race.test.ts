import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  getRoute: mocks.getRoute,
  saveCanvas: mocks.saveCanvas
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@vue-flow/core', () => ({
  VueFlow: { name: 'VueFlow', template: '<div class="vf-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@vue-flow/background', () => ({
  Background: { name: 'Background', template: '<div class="bg-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@vue-flow/controls', () => ({
  Controls: { name: 'Controls', template: '<div class="ctrl-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { name: 'MiniMap', template: '<div class="mm-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: {
        canvasSave: '保存', canvasUndo: '撤销', canvasRedo: '重做',
        canvasAutoSave: '自动保存', canvasAutoSaved: '已保存',
        canvasAutoSaveFailed: '保存失败', canvasTabCanvas: '画布',
        panelTitle: '面板', dispatchNeedsEdge: '需要连线',
        dispatchNestingExceeded: '嵌套过深', nodeLimit: '节点过多',
        name: '名称', type: '类型', path: '路径', upstream: '后端',
        config: '配置', propTitle: '属性', propNoSelection: '无选择'
      },
      common: { save: '保存', failed: '失败', saveFailed: '保存失败' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', name: 'RouteCanvas', component: Canvas }
    ]
  })
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ canvas_data: { nodes: [], edges: [] } })
  mocks.getRoute.mockReset().mockResolvedValue(null)
  mocks.saveCanvas.mockReset().mockResolvedValue({})
})

describe('Canvas.vue — race condition', () => {
  it('discards stale load() result when routeId changes mid-flight', async () => {
    // Simulate slow API for r1, fast API for r2
    let resolveR1: (v: any) => void = () => {}
    mocks.getCanvas.mockImplementation((id: string) => {
      if (id === 'r1') return new Promise((resolve) => { resolveR1 = resolve })
      return Promise.resolve({ canvas_data: { nodes: [{ id: 'n2' }], edges: [] } })
    })

    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()

    // r1 is still loading. Navigate to r2.
    await router.push('/routes/r2/canvas')
    await flushPromises()

    // r2 should have loaded
    const vm = wrapper.vm as any
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n2')

    // Now resolve r1 (stale). The canvas should NOT be overwritten.
    resolveR1({ canvas_data: { nodes: [{ id: 'stale-n1' }], edges: [] } })
    await flushPromises()

    // Canvas should still show r2's data
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n2')
  })
})
