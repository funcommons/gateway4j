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

// Stub Vue Flow components which can't fully render in jsdom.
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

async function factory(routeId: string = 'r1') {
  const router = makeRouter()
  await router.push(`/routes/${routeId}/canvas`)
  await router.isReady()
  const wrapper = mount(Canvas, {
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue save() — error feedback to user', () => {
  it('starts with empty saveError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).saveError).toBe('')
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(false)
  })

  it('saveCanvas failure sets saveError with server message', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('画布数据过大'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    expect(vm.saveError).toBe('画布数据过大')
  })

  it('saveCanvas failure renders error in UI', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('画布数据过大'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    await flushPromises()
    const el = wrapper.find('[data-testid="save-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('画布数据过大')
  })

  it('saveError is cleared before each save attempt', async () => {
    mocks.saveCanvas.mockRejectedValueOnce(new Error('first'))
    mocks.saveCanvas.mockResolvedValueOnce(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    expect(vm.saveError).toBe('first')
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
  })

  it('successful save leaves saveError empty', async () => {
    mocks.saveCanvas.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    await flushPromises()
    expect(vm.saveError).toBe('')
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(false)
  })

  it('failure does not lose canvas state (nodes/edges preserved for retry)', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const originalNodes = [{ id: 'n1', position: { x: 0, y: 0 } }]
    const originalEdges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    vm.nodes = originalNodes
    vm.edges = originalEdges
    await vm.save()
    expect(vm.nodes).toEqual(originalNodes)
    expect(vm.edges).toEqual(originalEdges)
  })

  it('failure still flips saving flag back to false', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    expect(vm.saving).toBe(false)
  })

  it('saveError persists across the page (user can take action)', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('画布被并发修改'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    await flushPromises()
    // Re-render without changing component
    await flushPromises()
    expect((wrapper.vm as any).saveError).toBe('画布被并发修改')
    expect(wrapper.find('[data-testid="save-error"]').text()).toBe('画布被并发修改')
  })

  it('JSON-like error from server is passed through', async () => {
    mocks.saveCanvas.mockRejectedValue(new SyntaxError('Unexpected token in JSON'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.edges = []
    await vm.save()
    expect(vm.saveError).toBe('Unexpected token in JSON')
  })
})
