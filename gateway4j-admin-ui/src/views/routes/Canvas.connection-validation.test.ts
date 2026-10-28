import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  saveCanvas: vi.fn(),
  getRoute: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  saveCanvas: mocks.saveCanvas,
  getRoute: mocks.getRoute
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: ['nodes', 'edges', 'fitViewOnInit', 'nodesDraggable', 'nodesConnectable', 'elementsSelectable'],
    template: '<div class="vf-stub"><slot /></div>',
    provide: () => ({})
  },
  useVueFlow: () => ({
    addNodes: vi.fn(), screenToFlowCoordinate: vi.fn(),
    onConnect: vi.fn(), onNodesChange: vi.fn(), onEdgesChange: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), canUndo: ref(true), canRedo: ref(false),
    findNode: vi.fn(), applyNodeChanges: vi.fn(), applyEdgeChanges: vi.fn()
  })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))
vi.mock('@vue-flow/background', () => ({ Background: { name: 'Background', template: '<div />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { name: 'Controls', template: '<div />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { name: 'MiniMap', template: '<div />' } }))

import { ref } from 'vue'
import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { delete: '删除', saveFailed: '保存失败' },
      route: {
        panelTitle: '组件面板', dispatchNode: '分发路由', backendNode: '后置路由', pluginNode: '插件节点',
        nodeLimit: '画布节点不可超过 200', propTitle: '节点属性', propType: '类型', propLabel: '名称',
        propUpstream: '后端地址', propPath: '匹配路径', propConfig: '配置参数', propNoSelection: '点击节点查看属性',
        edgeCondType: '条件类型', edgeCondValue: '条件值', edgePriority: '优先级',
        condTypeHeader: 'Header', condTypePath: 'Path', condTypeQuery: 'Query', condTypeBody: 'Body', condTypeGroovy: 'Groovy',
        backendNoOutgoing: '后置路由不可作为连线起点', selfLoopNotAllowed: '不允许自连接',
        pathPreview: '请求路径预览', noPath: '未配置路径',
        canvasSave: '保存画布', canvasUndo: '撤销', canvasRedo: '重做',
        canvasAutoSave: '自动保存', canvasAutoSaved: '已自动保存', canvasAutoSaveFailed: '自动保存失败',
        canvasTabCanvas: '流程画布',
        dispatchNeedsEdge: '分发路由必须至少有一条连线',
        orphanDispatchWarning: '存在未连线的分发路由'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/routes/:id/canvas', name: 'RouteCanvas', component: Canvas },
      { path: '/routes', name: 'Routes', component: { template: '<div />' } }
    ]
  })
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ nodes: [], edges: [] })
  mocks.saveCanvas.mockReset().mockResolvedValue({})
  mocks.getRoute.mockReset().mockResolvedValue(null)
})

describe('routes/Canvas.vue — connection validation', () => {
  it('validateConnection rejects self-loop', async () => {
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { id: 'n1', type: 'DISPATCH' }, targetNode: { id: 'n1', type: 'DISPATCH' } })
    expect(result).toBe(false)
    expect(vm.connectionError).toBe('不允许自连接')
  })

  it('validateConnection rejects BACKEND as source', async () => {
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { id: 'n1', type: 'BACKEND' }, targetNode: { id: 'n2', type: 'DISPATCH' } })
    expect(result).toBe(false)
    expect(vm.connectionError).toBe('后置路由不可作为连线起点')
  })

  it('validateConnection allows DISPATCH → BACKEND', async () => {
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { id: 'n1', type: 'DISPATCH' }, targetNode: { id: 'n2', type: 'BACKEND' } })
    expect(result).toBe(true)
    expect(vm.connectionError).toBe('')
  })

  it('orphanDispatchNodes detects dispatch nodes without outgoing edges', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
          { id: 'b1', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.orphanDispatchNodes.length).toBe(1)
    expect(vm.orphanDispatchNodes[0].id).toBe('d1')
  })

  it('orphanDispatchNodes is empty when all dispatch nodes have edges', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
          { id: 'b1', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B1' } }
        ],
        edges: [{ id: 'e1', source: 'd1', target: 'b1' }]
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.orphanDispatchNodes.length).toBe(0)
  })

  it('save rejects when orphan dispatch nodes exist', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('分发路由必须至少有一条连线')
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })

  it('save succeeds when no orphan dispatch nodes exist', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
          { id: 'b1', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B1' } }
        ],
        edges: [{ id: 'e1', source: 'd1', target: 'b1' }]
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
    expect(mocks.saveCanvas).toHaveBeenCalled()
  })

  it('save allows canvas with no dispatch nodes', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'b1', type: 'BACKEND', position: { x: 0, y: 0 }, data: { label: 'B1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
    expect(mocks.saveCanvas).toHaveBeenCalled()
  })

  it('onConnect rejects self-loop connection', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const prevEdgeCount = vm.edges.length
    vm.onConnect({ source: 'd1', target: 'd1' })
    expect(vm.connectionError).toBe('不允许自连接')
    expect(vm.edges.length).toBe(prevEdgeCount)
  })

  it('onConnect rejects BACKEND as source', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'b1', type: 'BACKEND', position: { x: 0, y: 0 }, data: { label: 'B1' } },
          { id: 'd1', type: 'DISPATCH', position: { x: 200, y: 0 }, data: { label: 'D1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.onConnect({ source: 'b1', target: 'd1' })
    expect(vm.connectionError).toBe('后置路由不可作为连线起点')
    expect(vm.edges.length).toBe(0)
  })

  it('onConnect creates edge for valid DISPATCH → BACKEND', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
          { id: 'b1', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B1' } }
        ],
        edges: []
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.onConnect({ source: 'd1', target: 'b1' })
    expect(vm.connectionError).toBe('')
    expect(vm.edges.length).toBe(1)
    expect(vm.edges[0].source).toBe('d1')
    expect(vm.edges[0].target).toBe('b1')
    expect(vm.edges[0].data.condition_type).toBe('PATH')
  })
})
