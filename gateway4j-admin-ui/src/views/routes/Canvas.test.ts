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

// Stub Vue Flow components which can't fully render in jsdom.
vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    template: '<div class="vueflow-stub"><slot /></div>'
  }
}))
vi.mock('@vue-flow/background', () => ({
  Background: { name: 'Background', template: '<div class="bg-stub" />' }
}))
vi.mock('@vue-flow/controls', () => ({
  Controls: { name: 'Controls', template: '<div class="controls-stub" />' }
}))
vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { name: 'MiniMap', template: '<div class="minimap-stub" />' }
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

async function factory(routeId: string = 'r1') {
  const router = makeRouter()
  await router.push(`/routes/${routeId}/canvas`)
  await router.isReady()
  const wrapper = mount(Canvas, {
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = await factory()
    expect(wrapper.html()).toContain('canvas-page')
  })

  it('starts on canvas tab', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).tab).toBe('canvas')
  })

  it('starts with empty nodes and edges', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
  })
})

describe('Canvas.vue — load()', () => {
  it('calls getCanvas with routeId from URL params', async () => {
    await factory('r42')
    expect(mocks.getCanvas).toHaveBeenCalledWith('r42')
  })

  it('populates nodes and edges from canvas_data', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'route', position: { x: 0, y: 0 }, data: { label: 'A' } },
          { id: 'n2', type: 'route', position: { x: 100, y: 0 }, data: { label: 'B' } }
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', data: { condition: 'always' } }
        ]
      }
    })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes.length).toBe(2)
    expect(vm.edges.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n1')
  })

  it('handles missing canvas_data gracefully (empty arrays)', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
  })

  it('handles canvas_data with non-array nodes/edges', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: { nodes: 'not an array', edges: null }
    })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
  })
})

describe('Canvas.vue — save()', () => {
  it('calls saveCanvas with routeId + canvas_data object (not JSON string)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1', position: { x: 1, y: 2 } }]
    vm.edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    await vm.save()
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    const [routeId, payload] = mocks.saveCanvas.mock.calls[0]
    expect(routeId).toBe('r1')
    // canvas_data must be an Object, not a string
    expect(typeof payload).toBe('object')
    expect(payload).not.toBeNull()
    expect(Array.isArray(payload.nodes)).toBe(true)
    expect(Array.isArray(payload.edges)).toBe(true)
    expect(payload.nodes[0].id).toBe('n1')
  })

  it('flips saving flag during save and back to false after', async () => {
    let resolveSave: (v: any) => void = () => {}
    mocks.saveCanvas.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const p = vm.save()
    expect(vm.saving).toBe(true)
    resolveSave(undefined)
    await p
    expect(vm.saving).toBe(false)
  })
})

describe('Canvas.vue — error resilience', () => {
  it('handles getCanvas rejection without crashing', async () => {
    mocks.getCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    // Component still mounted; nodes/edges stay at default []
    expect((wrapper.vm as any).nodes).toEqual([])
    expect((wrapper.vm as any).edges).toEqual([])
  })

  it('handles saveCanvas rejection without leaving saving stuck', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.save()
    expect(vm.saving).toBe(false)
  })
})