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
  VueFlow: { name: 'VueFlow', template: '<div class="vueflow-stub"><slot /></div>' }
}))
vi.mock('@vue-flow/background', () => ({ Background: { name: 'Background', template: '<div class="bg-stub" />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { name: 'Controls', template: '<div class="controls-stub" />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { name: 'MiniMap', template: '<div class="minimap-stub" />' } }))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { saveFailed: '保存失败', loadFailed: '加载失败' },
      route: {
        panelTitle: '组件面板', dispatchNode: '分发路由', backendNode: '后置路由', pluginNode: '插件节点',
        pathPreview: '请求路径预览', noPath: '未配置路径',
        canvasSave: '保存画布', canvasUndo: '撤销', canvasRedo: '重做',
        canvasAutoSave: '自动保存', canvasTabCanvas: '流程画布'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/routes/:id/canvas', name: 'RouteCanvas', component: { template: '<div />' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' } }
    ]
  })
}

async function factory(routeId: string = 'r1') {
  const router = makeRouter()
  await router.push(`/routes/${routeId}/canvas`)
  await router.isReady()
  const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.getCanvas.mockReset()
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue load — canvas_data robust parsing (D19)', () => {
  it('accepts object canvas_data (legacy shape)', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: { nodes: [{ id: 'n1', type: 'DISPATCH', position: { x: 1, y: 2 }, data: { label: 'n1' } }], edges: [] }
    })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toHaveLength(1)
    expect(vm.nodes[0].id).toBe('n1')
  })

  it('parses canvas_data delivered as a JSON string', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: JSON.stringify({
        nodes: [{ id: 'n1', type: 'BACKEND', position: { x: 10, y: 20 }, data: { label: 'n1', upstream_url: 'http://a' } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { condition_type: 'PATH', condition_value: '', priority: 1 } }]
      })
    })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toHaveLength(1)
    expect(vm.nodes[0].data.upstream_url).toBe('http://a')
    expect(vm.edges).toHaveLength(1)
    expect(vm.loadError).toBe('')
  })

  it('loads an empty canvas with a visible hint when canvas_data string is unparsable', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1', canvas_data: '{not-json' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
    expect(vm.loadError).toContain('画布数据解析失败')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(true)
  })

  it('treats missing canvas_data as an empty canvas without error', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.loadError).toBe('')
  })
})

describe('Canvas.vue — empty canvas guidance (D7)', () => {
  it('shows the empty-state hint when nodes are empty', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1', canvas_data: { nodes: [], edges: [] } })
    const wrapper = await factory()
    const el = wrapper.find('[data-testid="canvas-empty"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('画布为空')
    expect(el.text()).toContain('分发路由')
  })

  it('hides the empty-state hint once nodes exist', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: { nodes: [{ id: 'n1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'n1' } }], edges: [] }
    })
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="canvas-empty"]').exists()).toBe(false)
  })
})
