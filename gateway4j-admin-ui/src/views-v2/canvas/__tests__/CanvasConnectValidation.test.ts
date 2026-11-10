/**
 * OPT-4-T：连线实时校验（v2 优化建议 #6 下半 —— docs/ui-v2/gateway4j-v2优化.md §三.6）。
 * 先红是预期（RED 类型：行为缺失，画布真身存在）。与本仓库既有用例的分工（零重叠、纯增量）：
 * Canvas.test.ts L512-550 已用 vm.onConnect 直调覆盖「判定语义」（自环/BACKEND 出边拒绝、
 * 合法放行、孤儿解除）——本文件不重复，专测直调覆盖不到的三件事：
 *
 * ① 模板级接线：用户真实拖线走 VueFlow `@connect` 事件（Canvas.vue template 绑定），
 *    vm 直调无法证明这条线活着 —— VueFlow stub 新增三个出口按钮（cnv-stub-conn-*，
 *    `$emit('connect', { source, target })`），点击即模拟真实连线事件；
 * ② 校验时机 = connect 即时而非 save：spy 既有纯函数 validateConnection（vi.mock +
 *    importOriginal 包装，不重写任何规则），断言 connect 事件同步触发判定、此时
 *    saveCanvas 未被调用；ghost 端点早退 guard 优先于校验（连校验函数都不进）；
 * ③ 非法连线「红」反馈升级（OPT-4 新契约，先红）：现状非法连线只有被动 warn chip
 *    （cnv-conn-error，持久驻留直到下次连线），无即时主动提示 —— 契约固化为
 *    「直接拒绝 + toast.error」：ElMessage.error（SDK toast 统一入口，ApplyDiffDialog
 *    ElMessage spy 先例）在连线当场弹出，文案 = 既有 reason 枚举同一 i18n key
 *    （v2.canvas.selfLoop / backendOutgoing，零新增 key）；绿路径保持静默（合法连线
 *    只加边 + 清 chip，不弹 toast，防告警噪音）。
 *
 * ══ OPT-4-C 实现要点（本文件即验收）══
 * - useCanvasGraph.onConnect 非法分支追加 `toast.error(t('v2.canvas.' + verdict.reason'))`
 *   或等价组件层接线（Canvas.vue 已 import toast；文案复用既有 key，不新增 i18n）；
 * - 校验规则零改动：validateConnection / orphanDispatchNodes / maxDispatchDepth 原样；
 * - 无新 DOM / 新 testid（vld-* 前缀本步未动用：红反馈走 toast + 既有 chip，绿反馈走
 *   既有加边路径）；
 * - 既有画布 testid / 交互零改动（cnv-* 全族原样，stub 出口 cnv-stub-conn-* 仅活在测试）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn(),
  applyCanvas: vi.fn(),
  vueFlowFitView: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true),
  // 校验 spy：importOriginal 包装真实纯函数（规则零重写），只观察「何时被谁调」
  validateConnection: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  getRoute: mocks.getRoute,
  saveCanvas: mocks.saveCanvas,
  applyCanvas: mocks.applyCanvas
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

// 校验纯函数 spy 化：spread actual 保住 MAX_DISPATCH_DEPTH / orphan / depth 真实实现
// （Canvas.vue chips 与 useCanvasGraph 内核都还吃真判定），仅 validateConnection 换成
// 委托真实实现的 spy —— 本文件只测「接线与时机」，判定语义归 useCanvasValidation.test.ts。
vi.mock('@/views-v2/canvas/composables/useCanvasValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views-v2/canvas/composables/useCanvasValidation')>()
  mocks.validateConnection.mockImplementation(
    // 入参形状 = CanvasConnNode 结构最小形（useCanvasValidation.ts 契约），保证零 TS 错
    (conn: { sourceNode: { id?: string; type?: string }; targetNode: { id?: string; type?: string } }) =>
      actual.validateConnection(conn)
  )
  return { ...actual, validateConnection: mocks.validateConnection }
})

// jsdom 不可真实渲染 Vue Flow：stub 出口扩展三枚连线按钮（$emit('connect', …)），
// 模拟用户拖线事件 —— vm 直调（既有用例）覆盖不到的模板级 @connect 绑定由此验证。
vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: ['nodes', 'edges', 'fitViewOnInit', 'nodesDraggable', 'nodesConnectable', 'elementsSelectable'],
    emits: ['connect'],
    setup(_: unknown, { expose }: { expose: (api: Record<string, unknown>) => void }) {
      expose({ fitView: mocks.vueFlowFitView })
    },
    template: `<div class="vueflow-stub">
      <span
        v-for="e in edges"
        :key="e.id"
        class="vueflow-stub__edge-label"
        :data-testid="'cnv-edge-label-' + e.id"
      >{{ e.label }}</span>
      <button
        type="button"
        class="vueflow-stub__conn"
        data-testid="cnv-stub-conn-valid"
        @click="$emit('connect', { source: 'd1', target: 'b1' })"
      />
      <button
        type="button"
        class="vueflow-stub__conn"
        data-testid="cnv-stub-conn-selfloop"
        @click="$emit('connect', { source: 'd1', target: 'd1' })"
      />
      <button
        type="button"
        class="vueflow-stub__conn"
        data-testid="cnv-stub-conn-backendout"
        @click="$emit('connect', { source: 'b1', target: 'd1' })"
      />
      <button
        type="button"
        class="vueflow-stub__conn"
        data-testid="cnv-stub-conn-ghost"
        @click="$emit('connect', { source: 'ghost-x', target: 'b1' })"
      />
      <slot />
    </div>`
  },
  EdgeLabelRenderer: { name: 'EdgeLabelRenderer', template: '<div class="edgelabel-stub"><slot /></div>' },
  useVueFlow: () => ({ fitView: mocks.vueFlowFitView })
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

import Canvas from '@/views-v2/canvas/Canvas.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function makeNode(id: string, type: 'DISPATCH' | 'BACKEND' | 'PLUGIN' = 'BACKEND') {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id.toUpperCase() } }
}
function makeEdge(source: string, target: string) {
  return { id: `e-${source}-${target}`, source, target, data: { condition_type: 'PATH', condition_value: '', priority: 1 } }
}

/** 基线画布 = 既有 normalGraph 同形：DISPATCH d1 → BACKEND b1/b2（无孤儿，深度 1） */
async function factory(routeId: string = 'r1'): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/canvas/:id', component: Canvas as any },
      { path: '/v2/routes', component: stub },
      { path: '/', component: stub }
    ]
  })
  await router.push(`/v2/routes/canvas/${routeId}`)
  await router.isReady()
  const wrapper = mount(Canvas, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)
async function emitConnect(w: VueWrapper<any>, sel: string) {
  await byTestid(w, sel).trigger('click')
  await nextTick()
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getCanvas.mockReset().mockResolvedValue({
    route_id: 'r1',
    canvas_data: {
      nodes: [makeNode('d1', 'DISPATCH'), makeNode('b1'), makeNode('b2')],
      edges: [makeEdge('d1', 'b1'), makeEdge('d1', 'b2')]
    }
  })
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.canEdit.mockReturnValue(true)
  mocks.validateConnection.mockClear()
  // toast spy（SDK toast → ElMessage，ApplyDiffDialog 先例）；mockClear 隔离用例间历史
  vi.spyOn(ElMessage, 'error').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'info').mockImplementation((() => ({})) as any)
  vi.mocked(ElMessage.error).mockClear()
  vi.mocked(ElMessage.success).mockClear()
  vi.mocked(ElMessage.warning).mockClear()
  vi.mocked(ElMessage.info).mockClear()
})

describe('v2 canvas/Canvas — 连线即时校验接线（connect 事件 → validateConnection，时机≠save）', () => {
  it('真实连线事件（stub emit connect 合法 d1→b1）→ validateConnection 同步调用恰一次，入参含两端节点', async () => {
    const { wrapper } = await factory()
    await emitConnect(wrapper, 'cnv-stub-conn-valid')
    expect(mocks.validateConnection).toHaveBeenCalledTimes(1)
    expect(mocks.validateConnection).toHaveBeenCalledWith(expect.objectContaining({
      sourceNode: expect.objectContaining({ id: 'd1' }),
      targetNode: expect.objectContaining({ id: 'b1' })
    }))
  })

  it('校验时机 = 连线当场而非保存：校验已发生时 saveCanvas 仍未调用（自动保存未介入）', async () => {
    const { wrapper } = await factory()
    await emitConnect(wrapper, 'cnv-stub-conn-valid')
    expect(mocks.validateConnection).toHaveBeenCalledTimes(1)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })

  it('ghost 端点 connect → 早退 guard 优先于校验：validateConnection 不调用、无边、无 toast', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    await emitConnect(wrapper, 'cnv-stub-conn-ghost')
    expect(mocks.validateConnection).not.toHaveBeenCalled()
    expect(vm.edges.length).toBe(before)
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled()
    expect(byTestid(wrapper, 'cnv-conn-error').exists()).toBe(false)
  })
})

describe('v2 canvas/Canvas — 合法连线放行（红绿预判之绿：加边，静默）', () => {
  it('stub emit connect（d1→b1）→ 边加入（默认 PATH/空值/priority 1）+ 不弹 error toast（绿路径静默）', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    await emitConnect(wrapper, 'cnv-stub-conn-valid')
    expect(vm.edges.length).toBe(before + 1)
    expect(vm.edges[vm.edges.length - 1]).toEqual(expect.objectContaining({
      source: 'd1',
      target: 'b1',
      data: expect.objectContaining({ condition_type: 'PATH', condition_value: '', priority: 1 })
    }))
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled()
    expect(byTestid(wrapper, 'cnv-conn-error').exists()).toBe(false)
  })
})

describe('v2 canvas/Canvas — 非法连线即时反馈（红绿预判之红：拒绝 + toast，OPT-4 新契约先红）', () => {
  it('自环连线事件（d1→d1）→ 边不加 + cnv-conn-error（selfLoop）+ ElMessage.error 当场弹出同源文案', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    await emitConnect(wrapper, 'cnv-stub-conn-selfloop')
    expect(vm.edges.length).toBe(before)
    expect(byTestid(wrapper, 'cnv-conn-error').text()).toContain(t('v2.canvas.selfLoop'))
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining(t('v2.canvas.selfLoop'))
    }))
  })

  it('BACKEND 出边连线事件（b1→d1）→ 边不加 + cnv-conn-error（backendOutgoing）+ ElMessage.error 同源文案', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    await emitConnect(wrapper, 'cnv-stub-conn-backendout')
    expect(vm.edges.length).toBe(before)
    expect(byTestid(wrapper, 'cnv-conn-error').text()).toContain(t('v2.canvas.backendOutgoing'))
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining(t('v2.canvas.backendOutgoing'))
    }))
  })

  it('红后转绿：错误连线后再合法连线 → chip 清除且不再弹 error toast（绿路径静默，防噪音）', async () => {
    const { wrapper } = await factory()
    await emitConnect(wrapper, 'cnv-stub-conn-selfloop')
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
    await emitConnect(wrapper, 'cnv-stub-conn-valid')
    expect(byTestid(wrapper, 'cnv-conn-error').exists()).toBe(false)
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(1)
  })
})
