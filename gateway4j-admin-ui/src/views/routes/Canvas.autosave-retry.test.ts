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
vi.mock('@vue-flow/background', () => ({
  Background: { name: 'Background', template: '<div class="bg-stub" />' }
}))
vi.mock('@vue-flow/controls', () => ({
  Controls: { name: 'Controls', template: '<div class="controls-stub" />' }
}))
vi.mock('@vue-flow/minimap', () => ({
  MiniMap: { name: 'MiniMap', template: '<div class="minimap-stub" />' }
}))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存' },
      route: {
        panelTitle: '组件面板',
        dispatchNode: '分发路由',
        backendNode: '后置路由',
        pluginNode: '插件节点',
        nodeLimit: '画布节点不可超过 200',
        canvasAutoSave: '自动保存',
        canvasAutoSaved: '已自动保存',
        canvasAutoSaveFailed: '自动保存失败，请手动保存',
        canvasAutoSaveRetrying: '自动保存重试中…'
      }
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
  const wrapper = mount(Canvas, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

describe('Canvas.vue — auto-save retry', () => {
  it('retries up to 3 times on saveCanvas failure then shows manual-save prompt', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any

    // Mark dirty via markDirty (dirtyTracking is true after load)
    vm.markDirty()
    await flushPromises()

    // Call doAutoSave directly — it should retry 3 times then give up
    await vm.doAutoSave()
    await flushPromises()

    expect(mocks.saveCanvas.mock.calls.length).toBe(3)
    expect(vm.autoSaveResult).toContain('手动保存')
  })

  it('succeeds on retry without exhausting all 3 attempts', async () => {
    let callCount = 0
    mocks.saveCanvas.mockImplementation(() => {
      callCount++
      if (callCount < 3) return Promise.reject(new Error('500'))
      return Promise.resolve(undefined)
    })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.markDirty()
    await flushPromises()

    await vm.doAutoSave()
    await flushPromises()

    expect(mocks.saveCanvas.mock.calls.length).toBe(3)
    expect(vm.autoSaveResult).toContain('已自动保存')
  })

  it('succeeds immediately on first attempt when no error', async () => {
    mocks.saveCanvas.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.markDirty()
    await flushPromises()

    await vm.doAutoSave()
    await flushPromises()

    expect(mocks.saveCanvas.mock.calls.length).toBe(1)
    expect(vm.autoSaveResult).toContain('已自动保存')
  })

  it('shows retrying hint during retries and final failure message', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.markDirty()
    await flushPromises()

    await vm.doAutoSave()
    await flushPromises()

    // After all retries exhausted, show manual save prompt
    expect(vm.autoSaveResult).toContain('手动保存')
  })
})
