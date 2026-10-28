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
    emits: ['nodesChange', 'edgesChange', 'connect', 'nodeClick']
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
        propConfig: '配置参数', propNoSelection: '点击节点查看属性'
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

describe('Canvas.vue — node property panel', () => {
  it('shows "no selection" hint when no node is selected', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-no-selection"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="prop-no-selection"]').text()).toContain('点击节点查看属性')
  })

  it('hides property panel content when no node is selected', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-panel-content"]').exists()).toBe(false)
  })

  it('selecting a node shows property panel with node data', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: '分发路由A' } }],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-panel-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="prop-type"]').text()).toBe('DISPATCH')
    expect(wrapper.find('[data-testid="prop-label"]').exists()).toBe(true)
  })

  it('property panel shows upstream field for BACKEND nodes', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', type: 'BACKEND', position: { x: 0, y: 0 }, data: { label: '后端路由A', upstream_url: 'http://api.example.com' } }],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-upstream"]').exists()).toBe(true)
  })

  it('property panel shows config field for PLUGIN nodes', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', type: 'PLUGIN', position: { x: 0, y: 0 }, data: { label: '限流插件', config: '{"rate": 100}' } }],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-config"]').exists()).toBe(true)
  })

  it('editing label in property panel updates the node data', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: '旧名称' } }],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    // Simulate editing the label
    vm.selectedNode.data.label = '新名称'
    await flushPromises()
    expect(vm.nodes[0].data.label).toBe('新名称')
  })

  it('deselecting node (clicking empty area) clears selection', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [{ id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'A' } }],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-panel-content"]').exists()).toBe(true)
    // Deselect
    vm.selectedNode = null
    await flushPromises()
    expect(wrapper.find('[data-testid="prop-no-selection"]').exists()).toBe(true)
  })

  it('delete node button removes the selected node from canvas', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'A' } },
          { id: 'n2', type: 'BACKEND', position: { x: 100, y: 0 }, data: { label: 'B' } }
        ],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedNode = vm.nodes[0]
    await flushPromises()
    await vm.deleteSelectedNode()
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n2')
    expect(vm.selectedNode).toBeNull()
  })
})
