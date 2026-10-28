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
    screenToFlowCoordinate: vi.fn(),
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
        condTypeBody: 'Body', condTypeGroovy: 'Groovy',
        backendNoOutgoing: '后置路由不可作为连线起点',
        selfLoopNotAllowed: '不允许自连接'
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

describe('Canvas.vue — edge connection validation', () => {
  it('validateConnection returns false when source is BACKEND node', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { type: 'BACKEND' }, targetNode: { type: 'DISPATCH' } })
    expect(result).toBe(false)
  })

  it('validateConnection returns true when source is DISPATCH and target is BACKEND', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { type: 'DISPATCH' }, targetNode: { type: 'BACKEND' } })
    expect(result).toBe(true)
  })

  it('validateConnection returns false for self-loop (source === target)', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { id: 'n1', type: 'DISPATCH' }, targetNode: { id: 'n1', type: 'DISPATCH' } })
    expect(result).toBe(false)
  })

  it('validateConnection returns true for DISPATCH → PLUGIN edge', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const result = vm.validateConnection({ sourceNode: { type: 'DISPATCH' }, targetNode: { type: 'PLUGIN' } })
    expect(result).toBe(true)
  })

  it('attempting invalid connection sets validation error message', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.validateConnection({ sourceNode: { type: 'BACKEND' }, targetNode: { type: 'DISPATCH' } })
    expect(vm.connectionError).toBeTruthy()
  })

  it('valid connection clears previous validation error', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.connectionError = 'some error'
    vm.validateConnection({ sourceNode: { type: 'DISPATCH' }, targetNode: { type: 'BACKEND' } })
    expect(vm.connectionError).toBe('')
  })

  it('DISPATCH nodes with no outgoing edges show warning indicator', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: [
          { id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
          { id: 'n2', type: 'BACKEND', position: { x: 200, y: 0 }, data: { label: 'B' } }
        ],
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const orphans = vm.orphanDispatchNodes
    expect(orphans.length).toBe(1)
    expect(orphans[0].id).toBe('n1')
  })

  it('DISPATCH nodes with at least one outgoing edge are not orphaned', async () => {
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
    expect(vm.orphanDispatchNodes.length).toBe(0)
  })
})
