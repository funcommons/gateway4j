import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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
  VueFlow: { name: 'VueFlow', props: ['nodes', 'edges', 'fitViewOnInit'], template: '<div class="vf-stub"><slot /></div>', emits: ['nodesChange', 'edgesChange'] }
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
  messages: { 'zh-CN': { common: { save: '保存' }, route: { panelTitle: '组件面板', dispatchNode: '分发路由', backendNode: '后置路由', pluginNode: '插件节点', nodeLimit: '画布节点不可超过 200' } } }
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
  vi.useFakeTimers()
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: { nodes: [], edges: [] } })
  mocks.getRoute.mockReset().mockResolvedValue({ id: "r1", path: "/api/**" })
  mocks.saveCanvas.mockReset().mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Canvas.vue — undo/redo', () => {
  it('exposes undo/redo functions', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.undo).toBe('function')
    expect(typeof vm.redo).toBe('function')
  })

  it('canUndo starts false after initial load (initial state is base)', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.canUndo).toBe(false)
    expect(vm.canRedo).toBe(false)
  })

  it('canUndo becomes true after a change', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // Simulate a change: set nodes, then pushHistory
    vm.nodes = [{ id: 'n1' }]
    vm.pushHistory()
    expect(vm.canUndo).toBe(true)
  })

  it('undo restores previous node state', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // Initial state: empty nodes (already pushed by load)
    // Change 1: add n1
    vm.nodes = [{ id: 'n1' }]
    vm.pushHistory()
    // Change 2: add n2
    vm.nodes = [{ id: 'n1' }, { id: 'n2' }]
    vm.pushHistory()
    // Undo: should go back to [{ id: 'n1' }]
    vm.undo()
    expect(vm.nodes.length).toBe(1)
    expect(vm.nodes[0].id).toBe('n1')
    expect(vm.canRedo).toBe(true)
  })

  it('redo restores undone state', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1' }]
    vm.pushHistory()
    vm.nodes = [{ id: 'n1' }, { id: 'n2' }]
    vm.pushHistory()
    vm.undo()
    expect(vm.nodes.length).toBe(1)
    vm.redo()
    expect(vm.nodes.length).toBe(2)
  })

  it('limits undo stack to 50 entries', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    for (let i = 0; i < 55; i++) {
      vm.nodes = [{ id: `n${i}` }]
      vm.pushHistory()
    }
    // Should only be able to undo up to 50 times (plus initial)
    let undoCount = 0
    while (vm.canUndo) { vm.undo(); undoCount++ }
    expect(undoCount).toBeLessThanOrEqual(52) // 50 max + initial + some buffer
  })
})

describe('Canvas.vue — auto-save', () => {
  it('saves canvas after 3s debounce on change', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.markDirty()
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(mocks.saveCanvas).toHaveBeenCalled()
  })

  it('does not save before 3s debounce', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.markDirty()
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })

  it('resets debounce timer on subsequent changes', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.markDirty()
    vi.advanceTimersByTime(2000)
    vm.markDirty()
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(mocks.saveCanvas).toHaveBeenCalled()
  })

  it('does not auto-save when autoSave is disabled', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.autoSave = false
    vm.markDirty()
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })
})
