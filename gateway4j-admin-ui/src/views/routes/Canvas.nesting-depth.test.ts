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
        orphanDispatchWarning: '存在未连线的分发路由',
        dispatchNestingExceeded: '分发路由嵌套不可超过 5 层'
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

describe('routes/Canvas.vue — dispatch nesting depth', () => {
  it('maxDispatchDepth is 0 with no dispatch nodes', async () => {
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.maxDispatchDepth).toBe(0)
  })

  it('maxDispatchDepth is 1 for single dispatch → backend', async () => {
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
    expect(vm.maxDispatchDepth).toBe(1)
  })

  it('maxDispatchDepth is 2 for dispatch → dispatch → backend', async () => {
    mocks.getCanvas.mockResolvedValue({
      canvas_data: {
        nodes: [
          { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
          { id: 'd2', type: 'DISPATCH', position: { x: 200, y: 0 }, data: { label: 'D2' } },
          { id: 'b1', type: 'BACKEND', position: { x: 400, y: 0 }, data: { label: 'B1' } }
        ],
        edges: [
          { id: 'e1', source: 'd1', target: 'd2' },
          { id: 'e2', source: 'd2', target: 'b1' }
        ]
      }
    })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.maxDispatchDepth).toBe(2)
  })

  it('save rejects when nesting depth exceeds 5', async () => {
    // Build 6-level deep: d1→d2→d3→d4→d5→d6→b1
    const nodes = []
    const edges = []
    for (let i = 1; i <= 6; i++) {
      nodes.push({ id: `d${i}`, type: 'DISPATCH', position: { x: i * 100, y: 0 }, data: { label: `D${i}` } })
      if (i > 1) edges.push({ id: `e${i}`, source: `d${i - 1}`, target: `d${i}` })
    }
    nodes.push({ id: 'b1', type: 'BACKEND', position: { x: 700, y: 0 }, data: { label: 'B1' } })
    edges.push({ id: 'e7', source: 'd6', target: 'b1' })

    mocks.getCanvas.mockResolvedValue({ canvas_data: { nodes, edges } })
    const router = makeRouter()
    await router.push('/routes/r1/canvas')
    await router.isReady()
    const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('分发路由嵌套不可超过 5 层')
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })

  it('save succeeds when nesting depth is exactly 5', async () => {
    // Build 5-level deep: d1→d2→d3→d4→d5→b1
    const nodes = []
    const edges = []
    for (let i = 1; i <= 5; i++) {
      nodes.push({ id: `d${i}`, type: 'DISPATCH', position: { x: i * 100, y: 0 }, data: { label: `D${i}` } })
      if (i > 1) edges.push({ id: `e${i}`, source: `d${i - 1}`, target: `d${i}` })
    }
    nodes.push({ id: 'b1', type: 'BACKEND', position: { x: 600, y: 0 }, data: { label: 'B1' } })
    edges.push({ id: 'e6', source: 'd5', target: 'b1' })

    mocks.getCanvas.mockResolvedValue({ canvas_data: { nodes, edges } })
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
})
