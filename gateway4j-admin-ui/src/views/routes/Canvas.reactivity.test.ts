import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

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
  VueFlow: { name: 'VueFlow', template: '<div class="vf-stub" />' }
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
      route: {
        canvasSave: '保存画布', canvasUndo: '撤销', canvasRedo: '重做',
        canvasAutoSave: '自动保存', canvasAutoSaved: '已自动保存',
        canvasAutoSaveFailed: '自动保存失败', canvasTabCanvas: '流程画布',
        panelTitle: '组件面板', dispatchNeedsEdge: '分发路由必须至少有一条连线',
        dispatchNestingExceeded: '分发路由嵌套不可超过 5 层', nodeLimit: '画布节点不可超过 200',
        name: '路由名称', type: '类型', path: '匹配路径', upstream: '后端地址',
        config: '配置', propTitle: '节点属性', propNoSelection: '点击节点查看属性'
      },
      common: { save: '保存', failed: '操作失败', saveFailed: '保存失败' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', name: 'RouteCanvas', component: Canvas }
    ]
  })
}

async function factoryWithRoute(routeId: string) {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  await router.push(`/routes/${routeId}/canvas`)
  await flushPromises()
  const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ canvas_data: { nodes: [], edges: [] } })
  mocks.getRoute.mockReset().mockResolvedValue(null)
  mocks.saveCanvas.mockReset().mockResolvedValue({})
})

describe('routes/Canvas.vue — routeId reactivity', () => {
  it('loads canvas data on mount', async () => {
    const { wrapper } = await factoryWithRoute('r1')
    await flushPromises()
    expect(mocks.getCanvas).toHaveBeenCalledWith('r1')
  })

  it('reloads canvas data when route params change', async () => {
    mocks.getCanvas.mockResolvedValueOnce({ canvas_data: { nodes: [{ id: 'n1' }], edges: [] } })
    mocks.getCanvas.mockResolvedValueOnce({ canvas_data: { nodes: [{ id: 'n2' }], edges: [] } })

    const { wrapper, router } = await factoryWithRoute('r1')
    await flushPromises()

    expect(mocks.getCanvas).toHaveBeenCalledWith('r1')
    const vm = wrapper.vm as any
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n1')

    // Navigate to a different route's canvas
    await router.push('/routes/r2/canvas')
    await flushPromises()

    expect(mocks.getCanvas).toHaveBeenCalledWith('r2')
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n2')
  })
})
