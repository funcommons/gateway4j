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
    emits: ['nodesChange', 'edgesChange', 'connect']
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
      common: { save: '保存' },
      route: {
        canvas: '画布数据',
        panelTitle: '组件面板',
        dispatchNode: '分发路由',
        backendNode: '后置路由',
        pluginNode: '插件节点',
        nodeLimit: '画布节点不可超过 200'
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

describe('Canvas.vue — component panel', () => {
  it('renders the component panel sidebar', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="component-panel"]').exists()).toBe(true)
  })

  it('shows panel title', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="panel-title"]').text()).toBe('组件面板')
  })

  it('lists three draggable node types: dispatch, backend, plugin', async () => {
    const wrapper = await factory()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="node-type-item"]')
    expect(items.length).toBe(3)
    expect(items[0].text()).toContain('分发路由')
    expect(items[1].text()).toContain('后置路由')
    expect(items[2].text()).toContain('插件节点')
  })

  it('each node type item has draggable="true"', async () => {
    const wrapper = await factory()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="node-type-item"]')
    for (const item of items) {
      expect(item.attributes('draggable')).toBe('true')
    }
  })

  it('dragstart sets nodeType data on dataTransfer', async () => {
    const wrapper = await factory()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="node-type-item"]')
    const dt = { setData: vi.fn() }
    await items[0].trigger('dragstart', { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalledWith('nodeType', 'DISPATCH')
    await items[1].trigger('dragstart', { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalledWith('nodeType', 'BACKEND')
    await items[2].trigger('dragstart', { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalledWith('nodeType', 'PLUGIN')
  })

  it('drop on canvas area adds a node of the dragged type', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const flowEl = wrapper.find('[data-testid="vue-flow"]')
    await flowEl.trigger('dragover', { dataTransfer: { types: ['nodeType'] } })
    await flowEl.trigger('drop', {
      dataTransfer: { getData: (type: string) => type === 'nodeType' ? 'DISPATCH' : '' },
      clientX: 200,
      clientY: 150,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    })
    await flushPromises()
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].type).toBe('DISPATCH')
  })

  it('drop without nodeType data does nothing', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const flowEl = wrapper.find('[data-testid="vue-flow"]')
    await flowEl.trigger('drop', {
      dataTransfer: { getData: () => '' },
      clientX: 200,
      clientY: 150,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    })
    await flushPromises()
    expect(vm.nodes.length).toBe(0)
  })

  it('rejects drop when canvas has 200 nodes (limit)', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, type: 'BACKEND' })),
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const flowEl = wrapper.find('[data-testid="vue-flow"]')
    await flowEl.trigger('drop', {
      dataTransfer: { getData: (type: string) => type === 'nodeType' ? 'DISPATCH' : '' },
      clientX: 200,
      clientY: 150,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    })
    await flushPromises()
    expect(vm.nodes.length).toBe(200)
    expect(wrapper.find('[data-testid="node-limit-error"]').exists()).toBe(true)
  })

  it('node limit error clears on next successful drop under limit check', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: {
        nodes: Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, type: 'BACKEND' })),
        edges: []
      }
    })
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const flowEl = wrapper.find('[data-testid="vue-flow"]')
    await flowEl.trigger('drop', {
      dataTransfer: { getData: (type: string) => type === 'nodeType' ? 'DISPATCH' : '' },
      clientX: 200,
      clientY: 150,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="node-limit-error"]').exists()).toBe(true)
    // Remove a node to get below limit — watch clears the error
    vm.nodes = vm.nodes.slice(0, 199)
    await flushPromises()
    expect(wrapper.find('[data-testid="node-limit-error"]').exists()).toBe(false)
  })

  it('each node type item has a distinct icon class', async () => {
    const wrapper = await factory()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="node-type-item"]')
    const icons = items.map(i => i.find('.node-icon').classes())
    expect(icons[0]).toContain('icon-dispatch')
    expect(icons[1]).toContain('icon-backend')
    expect(icons[2]).toContain('icon-plugin')
  })

  it('panel is collapsible via toggle button', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.panelCollapsed).toBe(false)
    expect(wrapper.find('[data-testid="component-panel"]').classes()).not.toContain('collapsed')
    await wrapper.find('[data-testid="panel-toggle"]').trigger('click')
    await flushPromises()
    expect(vm.panelCollapsed).toBe(true)
    expect(wrapper.find('[data-testid="component-panel"]').classes()).toContain('collapsed')
  })
})
