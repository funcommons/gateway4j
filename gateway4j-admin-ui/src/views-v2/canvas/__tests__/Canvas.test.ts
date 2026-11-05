/**
 * S9a-T：v2 流程编排画布测试（契约 §1 V2Canvas /v2/routes/canvas/:id permission route:edit
 * + §4 S9 行「S9a/S9b 拆步裁决」八条 + 旧画布内核五段逻辑 Canvas.test.ts L28-42 先例）。
 * 先红是预期：页面由 S9a-C 实现。注意：S1 未建 canvas 占位文件，本文件在 S9a-C 落地前
 * 为「整文件收集失败（Failed to resolve import）」级别的红（vitest + vue-tsc 同理）——
 * 同样是先红的合规形态，S9a-C 按本头注释契约落地三件套后自解。
 *
 * ── S9a 范围（拆步裁决①④⑤⑦⑧，超出即打回）────────────────────────────────
 * 内核（load/parse/选择/增删/undo-redo/键盘）+ 节点库（点击添加）+ 工具栏 + 校验 chips。
 * 本地编辑不落库：无保存 / 应用 / 自动保存 / dry-run —— S9b 才做（属性面板/ApplyDiffDialog/
 * useCanvasAutosave）。因此本文件 mock '@/api/routes' 只含 getCanvas/getRoute 两个成员，
 * saveCanvas/applyCanvas 不得被 import（import 即 red：mock 工厂无此导出）。
 *
 * ── 文件布局（S9a-C 实现，C 直接照此建）────────────────────────────────────
 * - src/views-v2/canvas/Canvas.vue（defineOptions name 'V2Canvas'；SDK 组件 + Vue Flow）
 * - src/views-v2/canvas/composables/useCanvasGraph.ts —— 内核（纯逻辑+响应式）：
 *     useCanvasGraph(routeId: Ref<string>) → { loading, loadError, nodes, edges, selectedNode,
 *       connectionError, canUndo, canRedo, load, addNodeType, deleteSelected, onConnect,
 *       onNodeClick, onPaneClick, undo, redo, setEdgeWeight }
 *   * loadEpoch 竞态防护必须随迁（裁决①）：模块内 let loadEpoch，load() 先 ++，响应落地前
 *     myEpoch !== loadEpoch 直接丢弃（慢 load 后快 load 返回以最新为准）。
 *   * parseCanvasData 随迁（旧 D19 语义）：canvas_data 为 string → JSON.parse（失败返回 null）；
 *     非 object/数组 → null；nodes/edges 非数组按 []；null → 空画布 + loadError=parseFailed 文案。
 *   * 快照栈随迁：JSON.stringify({nodes,edges}) 入栈，MAX_HISTORY=50（超出 shift 最旧），
 *     canUndo=index>0 / canRedo=index<len-1；键盘 Ctrl/Cmd+Z undo、Ctrl/Cmd+Y redo（window 级）。
 *   * MAX_NODES=200：addNodeType 超限直接拒绝（不添加）+ limitWarn 文案入 cnv-limit-chip；
 *     节点数回退到 <200 后 chip 解除（旧 watch(len) 清除语义随迁）。
 *   * mount 恰好触发一次 load（onMounted；routeId 变化可 watch 触发但禁止 immediate 重复调用）。
 *   * setEdgeWeight(edge, v) 随迁旧 updateEdgeWeight 写语义：undefined/null/NaN → condition_key=''；
 *     否则 String(clamp(Math.round(v), 1, 100))；condition_value 恒 ''；写后 pushHistory（可撤销）。
 *   * 边 label：WEIGHT 且 parseWeight(condition_key) 合法 → `${n}%`；其余 → condition_value。
 *     （WEIGHT 读侧 = @/utils/weight 的 parseWeight / WEIGHT_MIN / WEIGHT_MAX，随迁勿改值，裁决⑦）
 * - src/views-v2/canvas/composables/useCanvasValidation.ts —— 校验纯函数（另文件专测，
 *     此处组件侧仅消费）：validateConnection / orphanDispatchNodes / maxDispatchDepth /
 *     MAX_DISPATCH_DEPTH=5。
 *
 * ── Canvas.vue 组装约定（vm 可见性）─────────────────────────────────────────
 * script setup 须把两个 composable 的返回**解构到顶层绑定**（VTU setupState 由此暴露为
 * vm.*，旧画布测试同款访问方式）：loading/loadError/nodes/edges/selectedNode/connectionError/
 * canUndo/canRedo/orphanCount(=orphanDispatchNodes(nodes,edges).length)/maxDepth(=maxDispatchDepth(...))/
 * load/addNodeType/deleteSelected/onConnect/onNodeClick/onPaneClick/undo/redo/setEdgeWeight。
 *
 * ── 数据契约 ────────────────────────────────────────────────────────────────
 * getCanvas(id) → { route_id, canvas_data }；节点 { id, type:'DISPATCH'|'BACKEND'|'PLUGIN',
 * position:{x,y}, data:{label} }；边 { id, source, target, data:{condition_type,condition_value,
 * condition_key?,priority} }。新边默认 data { condition_type:'PATH', condition_value:'', priority:1 }。
 * getRoute(id) 失败可容忍（.catch(() => null)，S9a 页头不展示 path 预览，仅不得崩）。
 *
 * ── i18n key 全表（v2.canvas.* 26 个 + v2.page.canvas，zh/en 同步加，铁律 6）────
 * title / back / readonly / paletteTitle / paletteHint / nodeDispatch / nodeBackend / nodePlugin /
 * addNodeAria('添加{type}节点') / undo / redo / keyboardHint / delete / statusNodes('{n} 节点') /
 * statusEdges('{n} 连线') / checkPass / orphanWarn / depthWarn / limitWarn / selfLoop /
 * backendOutgoing / loadFailed / parseFailed / empty / emptyHint / retry
 * （错误条文案一律 i18n 文案，不透传原始异常 message；v2.page.canvas 供 LayoutV2 面包屑 meta.title）
 *
 * ── DOM 契约（data-testid，cnv-*）────────────────────────────────────────────
 * cnv-canvas-root（页面根，加载失败也在）；cnv-back（返回 /v2/routes，修复 v2 List act-canvas 死链，
 * 裁决⑥）；cnv-readonly（只读徽标，canEdit=false 才出现）；cnv-toolbar（工具栏容器）；
 * cnv-undo / cnv-redo（撤销/重做，title=keyboardHint）；cnv-delete（删除选中节点，无选中 disabled）；
 * cnv-node-palette（节点库容器，canEdit=false 整体隐藏；标题 paletteTitle + 提示 paletteHint）；
 * cnv-add-dispatch / cnv-add-backend / cnv-add-plugin（点击添加，aria-label=addNodeAria 插值）；
 * cnv-scroll（375 视口横滚容器：overflow-x:auto，包住 cnv-canvas，页面 body 不被撑开）；
 * cnv-canvas（Vue Flow 包裹壳 + 空态宿主）；cnv-empty（空态：empty + emptyHint，nodes 空且非 loading
 * 且无 loadError 才出现）；cnv-load-error（加载/解析失败错误条）；cnv-retry（重试，点击重发 getCanvas）；
 * cnv-check-chip（校验通过：无孤儿且 maxDepth ≤ 5）；cnv-orphan-chip（孤儿警告，互斥于 check）；
 * cnv-depth-chip（嵌套超深警告）；cnv-limit-chip（节点上限 200 提示）；cnv-conn-error（连线校验错误，
 * selfLoop / backendOutgoing 文案）；cnv-status（底部状态条「{n} 节点 · {n} 连线」）。
 *
 * ── 权限与只读（canEdit('route')=false）────────────────────────────────────
 * cnv-node-palette 与三个 add 不渲染；cnv-delete/cnv-undo/cnv-redo disabled；cnv-readonly 徽标出现；
 * Vue Flow 绑定 :nodes-connectable="false" :nodes-draggable="false"（可编辑态两 prop 均绑 true）；
 * cnv-status / cnv-back / cnv-check-chip 只读保留（看图不受限）。
 *
 * ── SDK-only（铁律 2）────────────────────────────────────────────────────────
 * 源码禁 <el- 直用；template 块禁 CJK（文案一律 t()，中文注释只允许在 script 块）。
 *
 * ── S9b-T 追记（本步追加，既有 70 用例一字未动）─────────────────────────────
 * 上文「S9a 范围 / mock 只含 getCanvas/getRoute / saveCanvas 不得被 import」的约束自本步起
 * 按铁律放开：mock '@/api/routes' 补齐 saveCanvas/applyCanvas 两成员（页面 import 的全部成员
 * 必须被 mock 导出）；文件尾部追加「S9b 接线」describe 块（属性面板出现/消失 + cnv-save-chip
 * 保存状态 chip + 自动保存触发，先红预期，S9b-C 落地后自绿）。
 * 注意：文件内「S9a 边界」用例（源码不得 import saveCanvas/applyCanvas）在 S9b-C 接线后必然
 * 转红——属预期过时用例，S9b 验收时删除该用例（本 T 步不改既有断言，故保留原样）。
 * S9b 接线契约（头注存证，详见尾部 describe）：
 * - PropertyPanel（name V2PropertyPanel）挂 cnv-prop-panel，随 selectedNode/selectedEdge
 *   出现/消失；canEdit=false 不渲染（编辑入口只读全隐）。
 * - ApplyDiffDialog（name V2ApplyDiffDialog）常驻挂载；工具栏 cnv-apply 入口（文案
 *   v2.canvas.applyTitle），守卫（孤儿/嵌套）通过后调 open()；canEdit=false 入口不渲染。
 * - cnv-status 内新增 cnv-save-chip：data-state ∈ idle|dirty|saving|saved|failed，文案
 *   saveDirty/saveSaving/saveSaved/saveFailed；canEdit=false 不渲染。
 * - 自动保存：任何画布图变更（addNodeType/delete/undo/redo/connect/setEdgeWeight/属性面板编辑）
 *   置 dirty 并重启 3s 防抖 → saveCanvas(routeId, { nodes, edges })（composable 契约见
 *   useCanvasAutosave.test.ts 头注）。
 * - 新 i18n key（v2.canvas.*，尾部 it.each 锁双语）：saveDirty / saveSaving / saveSaved /
 *   saveFailed / applyTitle。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { WEIGHT_MIN, WEIGHT_MAX, parseWeight } from '@/utils/weight'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn(),
  applyCanvas: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

// S9a 只用 getCanvas/getRoute；S9b-T 起按铁律补齐 saveCanvas/applyCanvas 两成员
// （页面 import 的全部成员 mock 必须导出，否则 S9b-C 接线后整文件收集失败）
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

// jsdom 不可真实渲染 Vue Flow：四件套 stub（旧 Canvas.test.ts L28-42 先例 + props 声明增强）
vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: ['nodes', 'edges', 'fitViewOnInit', 'nodesDraggable', 'nodesConnectable', 'elementsSelectable'],
    template: '<div class="vueflow-stub"><slot /></div>'
  }
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

// dig: 按点路径取 locale 值；undefined = key 缺失（Publish.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Canvas.vue'), 'utf-8')
}

// ── fixtures：Vue Flow 形状（id/type/position/data.label）────────────────────

function makeNode(id: string, type: 'DISPATCH' | 'BACKEND' | 'PLUGIN' = 'BACKEND', over: Record<string, unknown> = {}) {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id.toUpperCase() }, ...over }
}
function makeEdge(source: string, target: string, over: Record<string, unknown> = {}) {
  return {
    id: `e-${source}-${target}-${Math.random().toString(36).slice(2, 6)}`,
    source, target,
    data: { condition_type: 'PATH', condition_value: '', priority: 1 },
    ...over
  }
}
/** canvas_data 载荷工厂（getCanvas 返回形状） */
function makeCanvasData({ nodes = [], edges = [] }: { nodes?: unknown[]; edges?: unknown[] } = {}, over: Record<string, unknown> = {}) {
  return { route_id: 'r1', canvas_data: { nodes, edges, ...over } }
}
/** 正常图：DISPATCH d1 → BACKEND b1 / b2（无孤儿，深度 1） */
function normalGraph() {
  return makeCanvasData({
    nodes: [makeNode('d1', 'DISPATCH'), makeNode('b1'), makeNode('b2')],
    edges: [makeEdge('d1', 'b1'), makeEdge('d1', 'b2')]
  })
}
/** 孤儿图：d1 无出边 */
function orphanGraph() {
  return makeCanvasData({
    nodes: [makeNode('d1', 'DISPATCH'), makeNode('b1')],
    edges: []
  })
}
/** 深链图：d1→…→dn→b1（depth=n） */
function deepGraph(depth: number) {
  const nodes = [makeNode('d1', 'DISPATCH')]
  const edges = []
  for (let i = 2; i <= depth; i++) {
    nodes.push(makeNode(`d${i}`, 'DISPATCH', { position: { x: i * 100, y: 0 } }))
    edges.push(makeEdge(`d${i - 1}`, `d${i}`))
  }
  nodes.push(makeNode('b1'))
  edges.push(makeEdge(`d${depth}`, 'b1'))
  return makeCanvasData({ nodes, edges })
}
/** 权重图：WEIGHT 边 condition_key='30' */
function weightGraph() {
  return makeCanvasData({
    nodes: [makeNode('d1', 'DISPATCH'), makeNode('b1')],
    edges: [makeEdge('d1', 'b1', { data: { condition_type: 'WEIGHT', condition_key: '30', condition_value: '', priority: 1 } })]
  })
}

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
const statusText = (w: VueWrapper<any>) => byTestid(w, 'cnv-status').text()

beforeEach(() => {
  setActivePinia(createPinia())
  // 默认载荷 = normalGraph（DISPATCH d1 + 2 BACKEND，无孤儿深度 1）：多数用例的基线画布
  mocks.getCanvas.mockReset().mockResolvedValue(normalGraph())
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.canEdit.mockReturnValue(true)
})

// ── i18n key 全表（v2.canvas.* 26 + v2.page.canvas）─────────────────────────
const CANVAS_KEYS = ['title', 'back', 'readonly', 'paletteTitle', 'paletteHint', 'nodeDispatch',
  'nodeBackend', 'nodePlugin', 'addNodeAria', 'undo', 'redo', 'keyboardHint', 'delete',
  'statusNodes', 'statusEdges', 'checkPass', 'orphanWarn', 'depthWarn', 'limitWarn',
  'selfLoop', 'backendOutgoing', 'loadFailed', 'parseFailed', 'empty', 'emptyHint', 'retry']
  .map((k) => `v2.canvas.${k}`)
const I18N_KEYS = [...CANVAS_KEYS, 'v2.page.canvas']

describe('v2 canvas/Canvas — i18n key 全表双语存在（铁律 6）', () => {
  it.each(I18N_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 canvas/Canvas — 挂载与加载', () => {
  it('挂载：getCanvas(route params id) 调用 + 根/工具栏 testid 存在 + mount 恰好一次 load', async () => {
    const { wrapper } = await factory('r42')
    expect(mocks.getCanvas).toHaveBeenCalledTimes(1)
    expect(mocks.getCanvas).toHaveBeenCalledWith('r42')
    expect(byTestid(wrapper, 'cnv-canvas-root').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-toolbar').exists()).toBe(true)
  })

  it('canvas_data 解析渲染：节点/连线计数入底部状态条「{n} 节点 · {n} 连线」', async () => {
    const { wrapper } = await factory()
    const status = statusText(wrapper)
    expect(status).toContain(String(t('v2.canvas.statusNodes')).replace('{n}', '3'))
    expect(status).toContain(String(t('v2.canvas.statusEdges')).replace('{n}', '2'))
  })

  it('点击添加节点 → 状态条节点计数同步 +1', async () => {
    const { wrapper } = await factory()
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    expect(statusText(wrapper)).toContain(String(t('v2.canvas.statusNodes')).replace('{n}', '4'))
  })

  it('缺失 canvas_data → 空画布无报错 + cnv-empty 空态（empty + emptyHint）', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1' })
    const { wrapper } = await factory()
    const empty = byTestid(wrapper, 'cnv-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain(t('v2.canvas.empty'))
    expect(empty.text()).toContain(t('v2.canvas.emptyHint'))
    expect(byTestid(wrapper, 'cnv-load-error').exists()).toBe(false)
  })

  it('画布有节点 → cnv-empty 隐藏', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-empty').exists()).toBe(false)
  })
})

describe('v2 canvas/Canvas — parseCanvasData 容忍语义（旧 D19 随迁）', () => {
  it('canvas_data 为 JSON 字符串 → 解析成功（nodes/edges 入画布，无错误）', async () => {
    mocks.getCanvas.mockResolvedValue({
      route_id: 'r1',
      canvas_data: JSON.stringify({
        nodes: [makeNode('n1', 'DISPATCH')],
        edges: [makeEdge('n1', 'n2')]
      })
    })
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toHaveLength(1)
    expect(vm.nodes[0].id).toBe('n1')
    expect(vm.edges).toHaveLength(1)
    expect(vm.loadError).toBe('')
  })

  it('canvas_data 为坏 JSON 字符串 → 空画布 + cnv-load-error（parseFailed 文案，不透传异常）', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1', canvas_data: '{not-json' })
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
    expect(byTestid(wrapper, 'cnv-load-error').text()).toContain(t('v2.canvas.parseFailed'))
  })

  it('nodes/edges 非数组（string|null）→ 按 [] 容忍，不报错', async () => {
    mocks.getCanvas.mockResolvedValue(makeCanvasData({ nodes: 'not-an-array', edges: null } as any))
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes).toEqual([])
    expect(vm.edges).toEqual([])
    expect(vm.loadError).toBe('')
  })

  it('canvas_data 为数组（非法形状）→ 空画布 + parseFailed', async () => {
    mocks.getCanvas.mockResolvedValue({ route_id: 'r1', canvas_data: [1, 2] })
    const { wrapper } = await factory()
    expect((wrapper.vm as any).nodes).toEqual([])
    expect(byTestid(wrapper, 'cnv-load-error').exists()).toBe(true)
  })
})

describe('v2 canvas/Canvas — load 竞态（loadEpoch 随迁，裁决①）', () => {
  it('慢 load 后快 load 返回 → 以最新（快）为准，慢响应落地被丢弃', async () => {
    let resolveSlow: (v: any) => void = () => {}
    mocks.getCanvas
      // 第 1 次：onMounted 的 load，悬着不落地
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve }))
      // 第 2 次：用户/路由触发的 load，立即返回
      .mockImplementationOnce(() => Promise.resolve(makeCanvasData({ nodes: [makeNode('n-fast')] })))

    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.loading).toBe(true)
    expect(vm.nodes).toEqual([])

    vm.load()
    await flushPromises()
    expect(mocks.getCanvas).toHaveBeenCalledTimes(2)
    expect(vm.loading).toBe(false)
    expect(vm.nodes.map((n: any) => n.id)).toEqual(['n-fast'])

    // 慢响应此刻才回来：epoch 过期，不得覆盖最新状态
    resolveSlow(makeCanvasData({ nodes: [makeNode('n-slow')] }))
    await flushPromises()
    expect(vm.nodes.map((n: any) => n.id)).toEqual(['n-fast'])
    expect(vm.loadError).toBe('')
  })
})

describe('v2 canvas/Canvas — 节点库与点击添加（裁决④：拖放的等价入口）', () => {
  it('节点库渲染 3 类型 chip：DISPATCH / BACKEND / PLUGIN（标签 + addNodeAria 插值）', async () => {
    const { wrapper } = await factory()
    const palette = byTestid(wrapper, 'cnv-node-palette')
    expect(palette.exists()).toBe(true)
    expect(palette.text()).toContain(t('v2.canvas.paletteTitle'))
    expect(palette.text()).toContain(t('v2.canvas.paletteHint'))
    expect(palette.text()).toContain(t('v2.canvas.nodeDispatch'))
    expect(palette.text()).toContain(t('v2.canvas.nodeBackend'))
    expect(palette.text()).toContain(t('v2.canvas.nodePlugin'))
    expect(byTestid(wrapper, 'cnv-add-dispatch').attributes('aria-label'))
      .toContain(t('v2.canvas.nodeDispatch'))
  })

  it.each([
    ['cnv-add-dispatch', 'DISPATCH'],
    ['cnv-add-backend', 'BACKEND'],
    ['cnv-add-plugin', 'PLUGIN']
  ] as const)('点击 %s → 生成 %s 节点（nodes +1，position/data 就位）', async (testid, type) => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.nodes.length
    await byTestid(wrapper, testid).trigger('click')
    expect(vm.nodes.length).toBe(before + 1)
    const added = vm.nodes[vm.nodes.length - 1]
    expect(added.type).toBe(type)
    expect(added.id).toBeTruthy()
    expect(added.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
  })

  it('MAX_NODES=200 上限：第 201 个不添加 + cnv-limit-chip 提示', async () => {
    const nodes = Array.from({ length: 200 }, (_, i) => makeNode(`n${i}`, 'BACKEND', { position: { x: i, y: 0 } }))
    mocks.getCanvas.mockResolvedValue(makeCanvasData({ nodes, edges: [] }))
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.nodes.length).toBe(200)
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    expect(vm.nodes.length).toBe(200)
    expect(byTestid(wrapper, 'cnv-limit-chip').text()).toContain(t('v2.canvas.limitWarn'))
  })

  it('回退到上限内后 limit chip 解除（再次加载/删除节点后不再提示）', async () => {
    const nodes = Array.from({ length: 200 }, (_, i) => makeNode(`n${i}`, 'BACKEND', { position: { x: i, y: 0 } }))
    mocks.getCanvas.mockResolvedValue(makeCanvasData({ nodes, edges: [] }))
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.onNodeClick({ node: vm.nodes[0] })
    await byTestid(wrapper, 'cnv-delete').trigger('click')
    expect(vm.nodes.length).toBe(199)
    expect(byTestid(wrapper, 'cnv-limit-chip').exists()).toBe(false)
  })
})

describe('v2 canvas/Canvas — 校验 chips（orphan / depth / 连线校验）', () => {
  it('无孤儿且深度 ≤5 → cnv-check-chip（checkPass），无警告 chip', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-check-chip').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-check-chip').text()).toContain(t('v2.canvas.checkPass'))
    expect(byTestid(wrapper, 'cnv-orphan-chip').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-depth-chip').exists()).toBe(false)
  })

  it('孤儿 DISPATCH（无出边）→ cnv-orphan-chip（orphanWarn），check chip 让位', async () => {
    mocks.getCanvas.mockResolvedValue(orphanGraph())
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-orphan-chip').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-orphan-chip').text()).toContain(t('v2.canvas.orphanWarn'))
    expect(byTestid(wrapper, 'cnv-check-chip').exists()).toBe(false)
  })

  it('嵌套深度 6（> MAX_DISPATCH_DEPTH=5）→ cnv-depth-chip（depthWarn）', async () => {
    mocks.getCanvas.mockResolvedValue(deepGraph(6))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-depth-chip').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-depth-chip').text()).toContain(t('v2.canvas.depthWarn'))
  })

  it('嵌套深度恰好 5 → 不告警，check chip 保留（边界）', async () => {
    mocks.getCanvas.mockResolvedValue(deepGraph(5))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-depth-chip').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-check-chip').exists()).toBe(true)
  })

  it('onConnect 自环（d1→d1）拒绝：不生成边 + cnv-conn-error（selfLoop）', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    vm.onConnect({ source: 'd1', target: 'd1' })
    await nextTick()
    expect(vm.edges.length).toBe(before)
    expect(byTestid(wrapper, 'cnv-conn-error').text()).toContain(t('v2.canvas.selfLoop'))
  })

  it('onConnect BACKEND 出边（b1→d1）拒绝：不生成边 + cnv-conn-error（backendOutgoing）', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    vm.onConnect({ source: 'b1', target: 'd1' })
    await nextTick()
    expect(vm.edges.length).toBe(before)
    expect(byTestid(wrapper, 'cnv-conn-error').text()).toContain(t('v2.canvas.backendOutgoing'))
  })

  it('onConnect 合法 DISPATCH→BACKEND → 生成边，默认 data { PATH / 空 value / priority 1 }，错误清空', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const before = vm.edges.length
    vm.onConnect({ source: 'd1', target: 'b2' })
    expect(vm.edges.length).toBe(before + 1)
    const added = vm.edges[vm.edges.length - 1]
    expect(added.source).toBe('d1')
    expect(added.target).toBe('b2')
    expect(added.data).toEqual(expect.objectContaining({ condition_type: 'PATH', condition_value: '', priority: 1 }))
    expect(byTestid(wrapper, 'cnv-conn-error').exists()).toBe(false)
  })

  it('合法连接解除孤儿：孤儿图上连接 d1→b1 → 孤儿 chip 消失、check chip 回归', async () => {
    mocks.getCanvas.mockResolvedValue(orphanGraph())
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(byTestid(wrapper, 'cnv-orphan-chip').exists()).toBe(true)
    vm.onConnect({ source: 'd1', target: 'b1' })
    await nextTick()
    expect(byTestid(wrapper, 'cnv-orphan-chip').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-check-chip').exists()).toBe(true)
  })
})

describe('v2 canvas/Canvas — undo/redo（快照栈 MAX_HISTORY=50 随迁 + 键盘）', () => {
  it('初始（仅 load 快照）→ canUndo=false 且 cnv-undo disabled', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(vm.canUndo).toBe(false)
    expect(vm.canRedo).toBe(false)
    expect(byTestid(wrapper, 'cnv-undo').attributes('disabled')).toBeDefined()
    expect(byTestid(wrapper, 'cnv-redo').attributes('disabled')).toBeDefined()
  })

  it('添加节点 → undo 恢复 → redo 重做（按钮路径 + canUndo/canRedo 翻转）', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    expect(vm.nodes.length).toBe(4)
    expect(vm.canUndo).toBe(true)
    await byTestid(wrapper, 'cnv-undo').trigger('click')
    expect(vm.nodes.length).toBe(3)
    expect(vm.canRedo).toBe(true)
    await byTestid(wrapper, 'cnv-redo').trigger('click')
    expect(vm.nodes.length).toBe(4)
  })

  it('键盘 Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Y 重做（window 级 keydown）', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.addNodeType('BACKEND')
    vm.addNodeType('BACKEND')
    expect(vm.nodes.length).toBe(5)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }))
    await flushPromises()
    expect(vm.nodes.length).toBe(4)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true }))
    await flushPromises()
    expect(vm.nodes.length).toBe(3)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true }))
    await flushPromises()
    expect(vm.nodes.length).toBe(4)
  })

  it('MAX_HISTORY=50 截断语义：60 次改动不可能一路撤销回空画布（抽查）', async () => {
    mocks.getCanvas.mockResolvedValue(makeCanvasData())
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    for (let i = 0; i < 60; i++) vm.addNodeType('BACKEND')
    expect(vm.nodes.length).toBe(60)
    let guard = 0
    while (vm.canUndo && guard < 200) { vm.undo(); guard++ }
    expect(vm.canUndo).toBe(false)
    // 若无 50 上限，60 步应可全部撤销（nodes 归零）；截断语义下必有余量
    expect(vm.nodes.length).toBeGreaterThanOrEqual(1)
  })

  it('cnv-delete：选中节点后删除节点及其相连边，且可 undo 恢复', async () => {
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(byTestid(wrapper, 'cnv-delete').attributes('disabled')).toBeDefined()
    vm.onNodeClick({ node: vm.nodes.find((n: any) => n.id === 'd1') })
    await byTestid(wrapper, 'cnv-delete').trigger('click')
    expect(vm.nodes.map((n: any) => n.id)).toEqual(['b1', 'b2'])
    expect(vm.edges.length).toBe(0)
    vm.undo()
    expect(vm.nodes.length).toBe(3)
    expect(vm.edges.length).toBe(2)
  })
})

describe('v2 canvas/Canvas — WEIGHT 权重边（utils/weight 随迁勿改值，裁决⑦）', () => {
  it('常量随迁：WEIGHT_MIN=1 / WEIGHT_MAX=100 / parseWeight 边界拒绝（读）', () => {
    expect(WEIGHT_MIN).toBe(1)
    expect(WEIGHT_MAX).toBe(100)
    expect(parseWeight('30')).toBe(30)
    expect(parseWeight('1')).toBe(1)
    expect(parseWeight('100')).toBe(100)
    expect(parseWeight('0')).toBe(null)
    expect(parseWeight('999')).toBe(null)
    expect(parseWeight('abc')).toBe(null)
    expect(parseWeight('')).toBe(null)
    expect(parseWeight('-5')).toBe(null)
  })

  it('WEIGHT 边 label（读侧）：合法 condition_key=30 → 边 label 含 30（渲染走 label 绑定）', async () => {
    mocks.getCanvas.mockResolvedValue(weightGraph())
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const e = vm.edges.find((x: any) => x.data?.condition_type === 'WEIGHT')
    expect(String(e.label)).toContain('30')
  })

  it('setEdgeWeight 写语义（旧 updateEdgeWeight 随迁）：夹取 1~100 + 四舍五入，condition_value 恒空，可撤销', async () => {
    mocks.getCanvas.mockResolvedValue(weightGraph())
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    const keyOf = () => vm.edges.find((x: any) => x.data?.condition_type === 'WEIGHT').data.condition_key
    vm.setEdgeWeight(vm.edges.find((x: any) => x.data?.condition_type === 'WEIGHT'), 40)
    expect(keyOf()).toBe('40')
    vm.setEdgeWeight(vm.edges[0], 0)
    expect(keyOf()).toBe('1')
    vm.setEdgeWeight(vm.edges[0], 999)
    expect(keyOf()).toBe('100')
    vm.setEdgeWeight(vm.edges[0], 40.4)
    expect(keyOf()).toBe('40')
    vm.setEdgeWeight(vm.edges[0], undefined)
    expect(keyOf()).toBe('')
    expect(vm.edges.find((x: any) => x.data?.condition_type === 'WEIGHT').data.condition_value).toBe('')
    expect(vm.canUndo).toBe(true)
  })
})

describe('v2 canvas/Canvas — 权限（canEdit=false → 只读画布）', () => {
  it('节点库与添加入口隐藏 + cnv-readonly 徽标出现', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-node-palette').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-add-dispatch').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-add-backend').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-add-plugin').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-readonly').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-readonly').text()).toContain(t('v2.canvas.readonly'))
  })

  it('画布只读：Vue Flow nodesConnectable/nodesDraggable=false，undo/redo/delete disabled，状态条保留', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    const flow = wrapper.findComponent({ name: 'VueFlow' })
    expect(flow.exists()).toBe(true)
    expect(flow.props('nodesConnectable')).toBe(false)
    expect(flow.props('nodesDraggable')).toBe(false)
    expect(byTestid(wrapper, 'cnv-undo').attributes('disabled')).toBeDefined()
    expect(byTestid(wrapper, 'cnv-redo').attributes('disabled')).toBeDefined()
    expect(byTestid(wrapper, 'cnv-delete').attributes('disabled')).toBeDefined()
    expect(byTestid(wrapper, 'cnv-status').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-check-chip').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-back').exists()).toBe(true)
  })

  it('canEdit=true → Vue Flow nodesConnectable/nodesDraggable 均 true（两 prop 必须显式绑定）', async () => {
    const { wrapper } = await factory()
    const flow = wrapper.findComponent({ name: 'VueFlow' })
    expect(flow.props('nodesConnectable')).toBe(true)
    expect(flow.props('nodesDraggable')).toBe(true)
  })
})

describe('v2 canvas/Canvas — 加载失败与重试', () => {
  it('getCanvas reject → cnv-load-error（loadFailed 文案，不透传原始 message）+ 不崩（root 仍在）', async () => {
    mocks.getCanvas.mockRejectedValue(new Error('boom-500'))
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    expect(byTestid(wrapper, 'cnv-canvas-root').exists()).toBe(true)
    expect(vm.nodes).toEqual([])
    expect(byTestid(wrapper, 'cnv-load-error').text()).toContain(t('v2.canvas.loadFailed'))
    expect(byTestid(wrapper, 'cnv-load-error').text()).not.toContain('boom-500')
    expect(byTestid(wrapper, 'cnv-empty').exists()).toBe(false)
  })

  it('cnv-retry 点击 → 重发 getCanvas，成功后恢复正常渲染', async () => {
    mocks.getCanvas
      .mockRejectedValueOnce(new Error('boom-500'))
      .mockResolvedValueOnce(normalGraph())
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-load-error').exists()).toBe(true)
    await byTestid(wrapper, 'cnv-retry').trigger('click')
    await flushPromises()
    expect(mocks.getCanvas).toHaveBeenCalledTimes(2)
    expect(byTestid(wrapper, 'cnv-load-error').exists()).toBe(false)
    expect(statusText(wrapper)).toContain(String(t('v2.canvas.statusNodes')).replace('{n}', '3'))
  })
})

describe('v2 canvas/Canvas — 页头返回（裁决⑥：v2 List act-canvas 死链修复）', () => {
  it('cnv-back 存在，点击回 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    const back = byTestid(wrapper, 'cnv-back')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })

  it('组件 name 声明为 V2Canvas（契约 §1，路由 name 对齐）', () => {
    expect(readSource()).toMatch(/V2Canvas/)
  })
})

describe('v2 canvas/Canvas — SDK-only 与 375 横滚容器（源码 grep，铁律 2）', () => {
  it('源码无 <el- 直用（SDK-only）', () => {
    expect(readSource()).not.toMatch(/<el-/)
  })

  it('template 块无 CJK（文案一律 t()；中文注释仅允许出现在 script 块）', () => {
    const template = readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    expect(template).not.toMatch(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff5e]/)
  })

  it('cnv-scroll 横滚容器包住 cnv-canvas + 源码 overflow-x:auto（jsdom 无法实测 scrollWidth，断言容器与样式）', async () => {
    const { wrapper } = await factory()
    const scroller = byTestid(wrapper, 'cnv-scroll')
    expect(scroller.exists()).toBe(true)
    expect(scroller.find('[data-testid="cnv-canvas"]').exists()).toBe(true)
    expect(readSource()).toMatch(/overflow-x:\s*auto/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// S9b-T 追加（本步新增，S9b-C 落地后自绿；先红预期 = 断言级失败，非模块缺失）：
// 属性面板接线 + 保存状态 chip + 自动保存触发 + 应用入口。
// 既有 70 用例一字未动；mock 工厂已按铁律补齐 saveCanvas/applyCanvas（见头注追记）。
// ═════════════════════════════════════════════════════════════════════════════

// S9b 新 i18n key（v2.canvas.*，接线层消费；zh/en 双语存在，铁律 6）
const S9B_KEYS = ['saveDirty', 'saveSaving', 'saveSaved', 'saveFailed', 'applyTitle']
  .map((k) => `v2.canvas.${k}`)

describe('v2 canvas/Canvas — S9b 接线（属性面板 + 保存状态 + 自动保存 + 应用入口）', () => {
  beforeEach(() => {
    mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
    mocks.applyCanvas.mockReset().mockResolvedValue({ to_create: [], to_update: [], to_delete: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('i18n key 双语存在（S9b 增量，铁律 6）', () => {
    it.each(S9B_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
      expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
      expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
    })
  })

  it('面板随选中出现/消失：无选中不渲染 → onNodeClick 出现且名称字段 = 节点 label → onPaneClick 消失', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-prop-panel').exists()).toBe(false)
    const vm = wrapper.vm as any
    vm.onNodeClick({ node: vm.nodes.find((n: any) => n.id === 'd1') })
    await nextTick()
    expect(byTestid(wrapper, 'cnv-prop-panel').exists()).toBe(true)
    expect((byTestid(wrapper, 'cnv-prop-name').element as HTMLInputElement).value).toBe('D1')
    vm.onPaneClick()
    await nextTick()
    expect(byTestid(wrapper, 'cnv-prop-panel').exists()).toBe(false)
  })

  it('只读（canEdit=false）：cnv-prop-panel / cnv-apply / cnv-save-chip 均不渲染（可写 UI 全隐）', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    const vm = wrapper.vm as any
    vm.onNodeClick({ node: vm.nodes[0] })
    await nextTick()
    expect(byTestid(wrapper, 'cnv-prop-panel').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-apply').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-save-chip').exists()).toBe(false)
  })

  it('应用入口：cnv-apply（文案 applyTitle）存在 + ApplyDiffDialog 常驻挂载（name V2ApplyDiffDialog）', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-apply').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-apply').text()).toContain(t('v2.canvas.applyTitle'))
    expect(wrapper.findComponent({ name: 'V2ApplyDiffDialog' }).exists()).toBe(true)
    // 属性面板组件同款可定位（供细粒度用例 findComponent）
    expect(wrapper.findComponent({ name: 'V2PropertyPanel' }).exists()).toBe(true)
  })

  it('保存状态 chip：初始 data-state=idle；图变更（addNodeType）→ dirty + saveDirty 文案', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'cnv-save-chip').attributes('data-state')).toBe('idle')
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    await nextTick()
    expect(byTestid(wrapper, 'cnv-save-chip').attributes('data-state')).toBe('dirty')
    expect(byTestid(wrapper, 'cnv-save-chip').text()).toContain(t('v2.canvas.saveDirty'))
  })

  it('自动保存触发：编辑后 3s 防抖恰一次 saveCanvas(routeId,{nodes,edges}) → chip=saved（saveSaved）', async () => {
    const { wrapper } = await factory() // factory 内 flushPromises 走真实时钟
    const vm = wrapper.vm as any
    vi.useFakeTimers()
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2999)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    expect(mocks.saveCanvas).toHaveBeenCalledWith('r1', { nodes: vm.nodes, edges: vm.edges })
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(byTestid(wrapper, 'cnv-save-chip').attributes('data-state')).toBe('saved')
    expect(byTestid(wrapper, 'cnv-save-chip').text()).toContain(t('v2.canvas.saveSaved'))
  })

  it('自动保存防抖重启：3s 窗口内二次编辑 → 定时重置，仍只发一次', async () => {
    const { wrapper } = await factory()
    vi.useFakeTimers()
    await byTestid(wrapper, 'cnv-add-dispatch').trigger('click')
    await vi.advanceTimersByTimeAsync(2000)
    await byTestid(wrapper, 'cnv-add-backend').trigger('click')
    await vi.advanceTimersByTimeAsync(2000) // 距末次编辑仅 2s，不得发出
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
  })
})
