import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn(),
  applyCanvas: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  getRoute: mocks.getRoute,
  saveCanvas: mocks.saveCanvas,
  applyCanvas: mocks.applyCanvas
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
  default: { name: 'FcEmpty', props: ['title', 'type'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/overlay/FcTooltip.vue', () => ({
  default: { name: 'FcTooltip', props: ['content', 'placement'], template: '<span class="tooltip-stub"><slot /></span>' }
}))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存', cancel: '取消', delete: '删除' },
      route: {
        panelTitle: '组件面板', propTitle: '节点属性', propType: '类型', propLabel: '名称',
        propUpstream: '后端地址', propPath: '匹配路径', propConfig: '配置参数',
        propNoSelection: '点击节点查看属性',
        edgeCondType: '条件类型', edgeCondValue: '条件值', edgePriority: '优先级',
        edgeWeight: '权重 (1~100)',
        condTypeHeader: 'Header', condTypePath: 'Path', condTypeQuery: 'Query',
        condTypeBody: 'Body', condTypeGroovy: 'Groovy', condTypeWeight: '权重',
        condWeightTip: '同优先级候选按权重比例分流（权重 1~100，非请求谓词）'
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
    global: {
      plugins: [i18n, router],
      stubs: { 'el-input-number': true }
    }
  })
}

const EMPTY_CANVAS = { route_id: 'r1', canvas_data: { nodes: [], edges: [] } }

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue(EMPTY_CANVAS)
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.saveCanvas.mockReset().mockResolvedValue({})
  mocks.applyCanvas.mockReset().mockResolvedValue({})
})

describe('Canvas.vue — P2-4 WEIGHT 权重边（T3）', () => {
  it('边条件类型下拉含 WEIGHT 选项', async () => {
    const wrapper = await factory()
    await flushPromises()
    const values = (wrapper.vm as any).condTypeOptions.map((o: any) => o.value)
    expect(values).toContain('WEIGHT')
  })

  it('选中 WEIGHT 边 → 值区切换为权重数字输入并显示说明 tooltip', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = { id: 'e1', source: 'a', target: 'b', data: { condition_type: 'WEIGHT', condition_key: '30', condition_value: '', priority: 1 } }
    await flushPromises()
    expect(wrapper.find('[data-testid="edge-panel-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-cond-weight"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-cond-value"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edge-weight-tip"]').exists()).toBe(true)
  })

  it('非 WEIGHT 边 → 保持条件值文本输入、无权重控件', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedEdge = { id: 'e1', source: 'a', target: 'b', data: { condition_type: 'HEADER', condition_key: 'X-Token', condition_value: 'v', priority: 1 } }
    await flushPromises()
    expect(wrapper.find('[data-testid="edge-cond-value"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edge-cond-weight"]').exists()).toBe(false)
  })

  it('updateEdgeWeight 夹取 1~100 写回 condition_key 数字串、condition_value 恒为空', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const edge = { id: 'e1', source: 'a', target: 'b', data: { condition_type: 'WEIGHT', condition_key: '', condition_value: 'residual', priority: 1 } }
    vm.selectedEdge = edge
    vm.updateEdgeWeight(40)
    expect(edge.data.condition_key).toBe('40')
    expect(edge.data.condition_value).toBe('')
    vm.updateEdgeWeight(0)
    expect(edge.data.condition_key).toBe('1')
    vm.updateEdgeWeight(999)
    expect(edge.data.condition_key).toBe('100')
    vm.updateEdgeWeight(undefined)
    expect(edge.data.condition_key).toBe('')
  })

  it('onEdgeCondTypeChange 进 WEIGHT：数值型 condition_value 迁移为 condition_key 并清空 value', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const edge = { id: 'e1', source: 'a', target: 'b', data: { condition_type: 'WEIGHT', condition_key: '', condition_value: '70', priority: 1 } }
    vm.selectedEdge = edge
    vm.onEdgeCondTypeChange()
    expect(edge.data.condition_key).toBe('70')
    expect(edge.data.condition_value).toBe('')
  })

  it('onEdgeCondTypeChange 进 WEIGHT：非数值 value 不迁移（key 置空待填）', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const edge = { id: 'e1', source: 'a', target: 'b', data: { condition_type: 'WEIGHT', condition_key: '', condition_value: '/api/x', priority: 1 } }
    vm.selectedEdge = edge
    vm.onEdgeCondTypeChange()
    expect(edge.data.condition_key).toBe('')
    expect(edge.data.condition_value).toBe('')
  })

  it('新边默认仍为 PATH（不改既有连线语义）', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.nodes = [
      { id: 'a', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D' } },
      { id: 'b', type: 'BACKEND', position: { x: 10, y: 10 }, data: { label: 'B' } }
    ]
    vm.onConnect({ source: 'a', target: 'b' })
    await flushPromises()
    expect(vm.edges.length).toBe(1)
    expect(vm.edges[0].data.condition_type).toBe('PATH')
  })
})
