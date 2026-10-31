import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

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

// Stub FcTable so dialog tables render rows without real el-table (scoped slots
// of el-table-column cannot resolve in jsdom).
vi.mock('@/components/data/FcTable.vue', () => ({
  default: {
    name: 'FcTable',
    props: ['data', 'stripe'],
    template: '<table class="table-stub"><tr v-for="(r, i) in data" :key="i" class="stub-row"><td v-for="(v, k) in r" :key="k" :class="`cell-${k}`">{{ v }}</td></tr></table>'
  }
}))

import Canvas from '@/views/routes/Canvas.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存', cancel: '取消', empty: '暂无数据', saveFailed: '保存失败' },
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
  to_create: [{ label: 'DISPATCH', path: '/api', upstream_url: '' }],
  to_update: [{ id: 'n2', changes: { path: { from: '/a', to: '/b' } } }],
  to_delete: [{ id: 'd1', name: 'old-route' }],
  conditions_changes: 3
}

beforeEach(() => {
  vi.spyOn(ElMessage, 'info').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  mocks.getCanvas.mockReset().mockResolvedValue({ route_id: 'r1', canvas_data: {} })
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
  mocks.applyCanvas.mockReset().mockResolvedValue(DIFF)
})

describe('Canvas.vue — 应用到路由树', () => {
  it('renders the apply button next to save when canEdit', async () => {
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="apply-to-tree"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-to-tree"]').text()).toBe('应用到路由树')
  })

  it('calls applyCanvas with dry_run=true and opens the diff dialog', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.nodes = [{ id: 'n1', type: 'DISPATCH' }, { id: 'n2', type: 'BACKEND' }]
    vm.edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
    await vm.applyToTree()
    expect(mocks.applyCanvas).toHaveBeenCalledWith('r1', {
      nodes: vm.nodes, edges: vm.edges, dry_run: true
    })
    expect(vm.applyOpen).toBe(true)
    expect(vm.applyDiff).toEqual(DIFF)
    // 弹窗结构：三个分组 + 条件变更数
    expect(wrapper.find('[data-testid="apply-diff"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-group-create"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-group-update"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-group-delete"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="apply-conditions-changes"]').text()).toContain('3')
  })

  it('delete rows default to unchecked and only checked ids go to confirm_delete_ids', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    // 默认全部不勾选
    expect(vm.applyDeleteRows.map((r: any) => r._checked)).toEqual([false])
    expect(vm.deleteCheckedIds).toEqual([])
    // 用户勾选 d1 后确认
    vm.applyDeleteRows[0]._checked = true
    await vm.confirmApply()
    expect(mocks.applyCanvas).toHaveBeenLastCalledWith('r1', {
      nodes: vm.nodes, edges: vm.edges, dry_run: false, confirm_delete_ids: ['d1']
    })
    // 成功后关闭弹窗并提示可发布
    expect(vm.applyOpen).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.objectContaining({ message: '画布已应用到路由树' }))
    expect(ElMessage.success).toHaveBeenCalledWith(expect.objectContaining({ message: '路由树已更新，可发布生效' }))
  })

  it('empty diff shows info hint and does not open the dialog', async () => {
    mocks.applyCanvas.mockResolvedValue({ to_create: [], to_update: [], to_delete: [] })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    expect(vm.applyOpen).toBe(false)
    expect(vm.applyDiff).toBeNull()
    expect(ElMessage.info).toHaveBeenCalledWith(expect.objectContaining({ message: '画布与路由树一致，无需应用' }))
  })

  it('dry_run failure surfaces through the existing save-error display', async () => {
    mocks.applyCanvas.mockRejectedValue(new Error('后端暂未就绪'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    expect(vm.saveError).toBe('后端暂未就绪')
    await flushPromises()
    expect(wrapper.find('[data-testid="save-error"]').text()).toBe('后端暂未就绪')
    expect(vm.applyOpen).toBe(false)
  })

  it('confirm failure surfaces through save-error and keeps the dialog open', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    mocks.applyCanvas.mockRejectedValue(new Error('并发修改冲突'))
    await vm.confirmApply()
    expect(vm.saveError).toBe('并发修改冲突')
    expect(vm.applyOpen).toBe(true)
  })

  it('update rows render changed fields with from → to detail', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.applyToTree()
    const row = vm.updateRows[0]
    expect(row.id).toBe('n2')
    expect(row.fields).toBe('path')
    expect(row.detail).toBe('path: /a → /b')
  })
})
