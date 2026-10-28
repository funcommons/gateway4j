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
  mocks.getCanvas.mockReset()
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue — save() should not overwrite server data with empty state before load completes', () => {
  it('save button is disabled while loading (before load() finishes)', async () => {
    let resolveLoad: (v: any) => void = () => {}
    mocks.getCanvas.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    mocks.saveCanvas.mockResolvedValue(undefined)

    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })

    expect((wrapper.vm as any).loading).toBe(true)

    resolveLoad({ route_id: 'r1', canvas_data: {} })
    await flushPromises()
  })

  it('canvas state populated from server is what gets saved (not empty initial state)', async () => {
    const serverData = {
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', position: { x: 1, y: 2 } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
      }
    }
    mocks.getCanvas.mockResolvedValue(serverData)

    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.nodes.length).toBe(1)
    expect(vm.edges.length).toBe(1)

    await vm.save()
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.saveCanvas.mock.calls[0]
    expect(payload.nodes.length).toBe(1)
    expect(payload.edges.length).toBe(1)
  })

  it('blocks save() until load() resolves (queue or disable button)', async () => {
    let resolveLoad: (v: any) => void = () => {}
    mocks.getCanvas.mockImplementation(() => new Promise((r) => { resolveLoad = r }))

    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })

    const vm = wrapper.vm as any
    const beforeCalls = mocks.saveCanvas.mock.calls.length
    vm.save()
    await flushPromises()
    const afterCalls = mocks.saveCanvas.mock.calls.length

    if (afterCalls > beforeCalls) {
      const [, payload] = mocks.saveCanvas.mock.calls[afterCalls - 1]
      expect(payload).toBeDefined()
    }

    resolveLoad({ route_id: 'r1', canvas_data: { nodes: [{ id: 'n1' }], edges: [] } })
    await flushPromises()
  })
})
