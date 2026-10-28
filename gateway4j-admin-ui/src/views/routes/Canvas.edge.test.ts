import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

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
    props: ['nodes', 'edges', 'fitViewOnInit'],
    template: '<div class="vf-stub" data-testid="vue-flow"><slot /></div>',
    emits: ['nodesChange', 'edgesChange', 'connect', 'nodeClick', 'paneClick', 'edgeClick']
  },
  useVueFlow: () => ({
    addNodes: vi.fn(),
    screenToFlowCoordinate: vi.fn((p: any) => ({ x: p.x ?? 100, y: p.y ?? 100 })),
    onConnect: vi.fn()
  })
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
      common: { save: '保存', cancel: '取消', delete: '删除' },
      route: {
        canvas: '画布数据', panelTitle: '组件面板', dispatchNode: '分发路由',
        backendNode: '后置路由', pluginNode: '插件节点', nodeLimit: '画布节点不可超过 200',
        propTitle: '节点属性', propType: '类型', propLabel: '名称',
        propUpstream: '后端地址', propPath: '匹配路径',
        propConfig: '配置参数', propNoSelection: '点击节点查看属性',
        edgeCondType: '条件类型', edgeCondValue: '条件值', edgePriority: '优先级',
        condTypeHeader: 'Header', condTypePath: 'Path', condTypeQuery: 'Query',
        condTypeBody: 'Body', condTypeGroovy: 'Groovy'
      }
    }
  }
})

async function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', component: Canvas }
    ]
  })
  await router.push('/routes/r1/canvas')
  await router.isReady()
  return mount(Canvas, {
    global: { plugins: [i18n, router] }
  })
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: { nodes: [], edges: [] } })
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue({})
})

describe('Canvas.vue — edge condition editing', () => {
  it('clicking an edge shows edge condition panel instead of node panel', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { condition_type: 'PATH', condition_value: '/api/*', priority: 1 } }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="edge-panel-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-cond-type"]').exists()).toBe(true)
  })

  it('edge condition panel shows condition type, value, and priority fields', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { condition_type: 'HEADER', condition_value: 'X-Region=east', priority: 5 } }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="edge-cond-type"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-cond-value"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-priority"]').exists()).toBe(true)
  })

  it('editing edge condition value updates the edge data', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { condition_type: 'PATH', condition_value: '/old', priority: 1 } }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    vm.selectedEdge.data.condition_value = '/new'
    await flushPromises()
    expect(vm.edges[0].data.condition_value).toBe('/new')
  })

  it('clicking pane deselects edge', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: {} }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    vm.onPaneClick()
    await flushPromises()
    expect(vm.selectedEdge).toBeNull()
  })

  it('delete edge button removes the selected edge', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: {} }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    await vm.deleteSelectedEdge()
    expect(vm.edges.length).toBe(0)
    expect(vm.selectedEdge).toBeNull()
  })

  it('edge panel initializes data object if missing', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = vm.edges[0]
    await flushPromises()
    expect(vm.edges[0].data).toBeDefined()
    expect(vm.edges[0].data.condition_type).toBeDefined()
  })
})
