import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

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
  VueFlow: {
    name: 'VueFlow',
    template: '<div class="vueflow-stub"><slot /></div>'
  }
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
  Controls: { name: 'Controls', template: '<div class="controls-stub" />' }
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { name: 'MiniMap', template: '<div class="minimap-stub" />' }
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
      common: { save: '保存' },
      route: { panelTitle: '组件面板', dispatchNode: '分发路由', backendNode: '后置路由', pluginNode: '插件节点', nodeLimit: '画布节点不可超过 200' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', component: { template: '<div />' } }
    ]
  })
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue load() — race condition protection', () => {
  it('routeId captured at setup time is the only id used (no reactivity issue)', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: { nodes: [{ id: 'n1' }], edges: [] }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    expect(mocks.getCanvas).toHaveBeenCalledWith('r1')
    expect((wrapper.vm as any).nodes).toEqual([{ id: 'n1' }])
  })

  it('uses the routeId from URL params (not a stale value)', async () => {
    mocks.getCanvas.mockImplementation((id: string) =>
      Promise.resolve({
        route_id: id,
        canvas_data: { nodes: [{ id: `n-${id}` }], edges: [] }
      })
    )
    const router = makeRouter()
    await router.push('/routes/r42/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    expect(mocks.getCanvas).toHaveBeenCalledWith('r42')
    expect((wrapper.vm as any).nodes).toEqual([{ id: 'n-r42' }])
  })

  it('handles getCanvas rejection gracefully (no crash, empty nodes/edges)', async () => {
    mocks.getCanvas.mockRejectedValue(new Error('500'))
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    expect((wrapper.vm as any).nodes).toEqual([])
    expect((wrapper.vm as any).edges).toEqual([])
  })

  it('canvas state survives save() failure (not reset)', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    // Simulate user adding a new node
    vm.nodes = [...vm.nodes, { id: 'n2' }]
    vm.edges = [...vm.edges, { id: 'e2' }]
    await vm.save()
    // Even after failed save, canvas state is preserved
    expect(vm.nodes.length).toBe(2)
    expect(vm.edges.length).toBe(2)
  })
})
