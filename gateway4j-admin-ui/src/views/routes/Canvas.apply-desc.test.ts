import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

// H7b T2 契约用例：画布 apply 变更说明（可选）—— 填写才随 payload 携带 change_description，
// 未填写时 payload 保持最小形状（不出现该键）
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

vi.mock('@/components/data/FcTable.vue', () => ({
  default: {
    name: 'FcTable',
    props: ['data', 'stripe'],
    template: '<table class="table-stub" />'
  }
}))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存', cancel: '取消', empty: '暂无数据', saveFailed: '保存失败', optional: '可选' },
      env: { changeDescLabel: '变更说明', changeDescPlaceholder: '简要描述本次变更内容（1~200 字）' },
      route: {
        panelTitle: '组件面板', dispatchNode: '分发路由', backendNode: '后置路由', pluginNode: '插件节点',
        canvasApply: '应用到路由树', canvasApplyNoDiff: '画布与路由树一致，无需应用',
        canvasApplySuccess: '画布已应用到路由树', canvasApplyPublishHint: '路由树已更新，可发布生效'
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

const DIFF = {
  to_create: [],
  to_update: [{ id: 'n2', changes: { path: { from: '/a', to: '/b' } } }],
  to_delete: [],
  conditions_changes: 0
}

beforeEach(() => {
  vi.spyOn(ElMessage, 'info').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
  mocks.applyCanvas.mockReset().mockResolvedValue(DIFF)
})

describe('Canvas.vue — apply 变更说明（可选，T2）', () => {
  it('弹窗内渲染「变更说明（可选）」输入块并标注可选', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1', type: 'DISPATCH' }, { id: 'n2', type: 'BACKEND' }]
    vm.edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    await vm.applyToTree()
    expect(wrapper.find('[data-testid="apply-desc-block"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-desc-block"]').text()).toContain('可选')
  })

  it('未填写 → confirm payload 不携带 change_description（最小形状）', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    await vm.confirmApply()
    const payload = mocks.applyCanvas.mock.calls[mocks.applyCanvas.mock.calls.length - 1][1]
    expect(payload.dry_run).toBe(false)
    expect('change_description' in payload).toBe(false)
  })

  it('填写 → confirm payload 携带 trim 后的 change_description', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    vm.applyChangeDesc = '  重排拓扑  '
    await vm.confirmApply()
    expect(mocks.applyCanvas).toHaveBeenLastCalledWith('r1', expect.objectContaining({
      dry_run: false,
      change_description: '重排拓扑'
    }))
    // 成功后清空
    expect(vm.applyChangeDesc).toBe('')
  })

  it('仅空格 → 视为未填写，不携带 change_description', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    vm.applyChangeDesc = '   '
    await vm.confirmApply()
    const payload = mocks.applyCanvas.mock.calls[mocks.applyCanvas.mock.calls.length - 1][1]
    expect('change_description' in payload).toBe(false)
  })

  it('重新打开预览 → 上次输入被清空', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1', type: 'DISPATCH' }, { id: 'n2', type: 'BACKEND' }]
    vm.edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    await vm.applyToTree()
    vm.applyChangeDesc = '第一次的说明'
    vm.applyOpen = false
    await vm.applyToTree()
    expect(vm.applyChangeDesc).toBe('')
  })
})
