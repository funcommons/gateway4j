import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  saveCanvas: vi.fn(),
  getRoute: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  saveCanvas: mocks.saveCanvas,
  getRoute: mocks.getRoute
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
        selfLoopNotAllowed: '不允许自连接',
        pathPreview: '请求路径预览',
        noPath: '未配置路径'
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
  mocks.saveCanvas.mockReset().mockResolvedValue({})
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/v1/**' })
})

describe('Canvas.vue — route path preview', () => {
  it('loads route path on mount via getRoute', async () => {
    const wrapper = await factory()
    await flushPromises()
    expect(mocks.getRoute).toHaveBeenCalledWith('r1')
  })

  it('displays path preview in toolbar', async () => {
    mocks.getRoute.mockResolvedValue({ id: 'r1', path: '/api/v1/**' })
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="path-preview"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="path-preview"]').text()).toContain('/api/v1/**')
  })

  it('shows "no path" when route has no path', async () => {
    mocks.getRoute.mockResolvedValue({ id: 'r1', path: null })
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="path-preview"]').text()).toContain('未配置路径')
  })

  it('shows "no path" when getRoute fails', async () => {
    mocks.getRoute.mockRejectedValue(new Error('404'))
    const wrapper = await factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="path-preview"]').text()).toContain('未配置路径')
  })
})
