/**
 * OPT-4-T：画布 MiniMap 接入（v2 优化建议 #6 上半 —— docs/ui-v2/gateway4j-v2优化.md §三.6）。
 * 先红是预期（RED 类型：行为缺失，画布真身 src/views-v2/canvas/Canvas.vue 存在且可挂载）：
 * S9a 已把裸 `<MiniMap />` 渲染进 VueFlow（e20d9c6），但缺四件成品化要素，本文件按
 * T→C 流程把契约固化，OPT-4-C 落地后自绿：
 *
 * ① pannable / zoomable —— 裸 `<MiniMap />` 两 prop 均未绑（默认 false）：大画布（MAX_NODES=200）
 *    缩略图必须可拖拽平移 + 滚轮缩放，否则「导航刚需」名不副实；
 * ② nodeColor 按节点类型映射 —— 现状所有 minimap 节点被 CSS 统一 fill（--app-text-tertiary），
 *    三类型不可辨；契约 = MiniMap `node-color` 传函数（@vue-flow/minimap 1.5.4 支持
 *    `nodeColor: string | (node) => string`），DISPATCH/BACKEND/PLUGIN → 三色互异、全 token、
 *    未知类型回退 token 色且确定性（同入参同出参，纯函数）；
 * ③ aria-label i18n —— 新 key `v2.canvas.minimapAria`（zh「画布缩略图」/ en「Canvas minimap」），
 *    替换包默认英文 aria（Vue Flow mini map）；铁律 6：zh/en 同步；
 * ④ testid `mini-map` —— 报告固化的新前缀契约（本步起新增 testid 用 mini-* 家族，与既有
 *    cnv-* 画布族区分；本文件无 vld-* 元素，连线校验新契约无新 DOM，见
 *    CanvasConnectValidation.test.ts 头注）。
 *
 * 样式 token 化（fs 源码契约，Settings.test.ts 375 防溢出同款手法）：S9a 已落
 * `:deep(.vue-flow__minimap / -node / -mask)` 三条 token 规则——本文件用「选择器存在 + 规则体
 * 零字面色值」两条源码契约钉死，防 C 步回退成 hex/rgb（位置沿用包默认 bottom-right，
 * 不新增 position 契约；遮罩/底色/描边全部走既有 --app-* token）。
 *
 * jsdom 出口说明：Vue Flow 四件套 stub（Canvas.test.ts L174-209 先例）；MiniMap stub 声明
 * 全量 props，断言走 findComponent({name:'MiniMap'}).props()（prop 契约）+ attr 透传
 * （data-testid 落 stub 单根）。只读（canEdit=false）画布「看图不受限」——MiniMap 必须保留。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
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
  canEdit: vi.fn(() => true)
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

// jsdom 不可真实渲染 Vue Flow：四件套 stub（Canvas.test.ts 同款手法，本文件独立声明）。
// 差异点：MiniMap stub 声明全量 props —— 本文件断言对象是「prop 契约」而非渲染面。
vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: ['nodes', 'edges', 'fitViewOnInit', 'nodesDraggable', 'nodesConnectable', 'elementsSelectable'],
    setup(_: unknown, { expose }: { expose: (api: Record<string, unknown>) => void }) {
      expose({ fitView: mocks.vueFlowFitView })
    },
    template: `<div class="vueflow-stub">
      <span
        v-for="n in nodes"
        :key="n.id"
        class="vueflow-stub__node"
        :data-testid="'cnv-stub-node-' + n.id"
        :class="n.class"
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
  MiniMap: {
    name: 'MiniMap',
    props: ['nodeColor', 'nodeStrokeColor', 'nodeClassName', 'nodeBorderRadius', 'nodeStrokeWidth',
      'maskColor', 'maskStrokeColor', 'maskStrokeWidth', 'position', 'pannable', 'zoomable',
      'width', 'height', 'ariaLabel', 'inversePan', 'zoomStep', 'offsetScale', 'maskBorderRadius'],
    template: '<div class="minimap-stub" />'
  }
}))

import Canvas from '@/views-v2/canvas/Canvas.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（Canvas.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Canvas.vue'), 'utf-8')
}

function makeNode(id: string, type: 'DISPATCH' | 'BACKEND' | 'PLUGIN' = 'BACKEND') {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id.toUpperCase() } }
}
function makeEdge(source: string, target: string) {
  return { id: `e-${source}-${target}`, source, target, data: { condition_type: 'PATH', condition_value: '', priority: 1 } }
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
function findMinimap(w: VueWrapper<any>) {
  return w.findComponent({ name: 'MiniMap' })
}

/** OPT-4-C 契约色映射函数入参形状（MiniMap nodeColor 收到带 type 的节点对象） */
type ColorFn = (node: { type?: string }) => string

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getCanvas.mockReset().mockResolvedValue({
    route_id: 'r1',
    canvas_data: {
      nodes: [makeNode('d1', 'DISPATCH'), makeNode('b1'), makeNode('p1', 'PLUGIN')],
      edges: [makeEdge('d1', 'b1')]
    }
  })
  mocks.getRoute.mockReset().mockResolvedValue({ id: 'r1', path: '/api/**' })
  mocks.canEdit.mockReturnValue(true)
})

// ── i18n 新 key（OPT-4 增量，铁律 6：zh/en 双语存在）─────────────────────────
const OPT4_KEYS = ['minimapAria'].map((k) => `v2.canvas.${k}`)

describe('v2 canvas/Canvas — OPT-4 MiniMap i18n key 双语存在（铁律 6）', () => {
  it.each(OPT4_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 canvas/Canvas — MiniMap 挂载与交互属性（先红：裸 <MiniMap /> 缺四要素）', () => {
  it('MiniMap 挂载于 VueFlow 内（stub name 命中；既有事实锁，防 C 步挪出画布）', async () => {
    const { wrapper } = await factory()
    expect(findMinimap(wrapper).exists()).toBe(true)
  })

  it('testid mini-map 落在 MiniMap 元素上（attr 透传到单根 stub；OPT-4 新 testid 表）', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'mini-map').exists()).toBe(true)
  })

  it('pannable=true（缩略图可拖拽平移 —— 大画布导航刚需，裸默认 false 不合格）', async () => {
    const { wrapper } = await factory()
    expect(findMinimap(wrapper).props('pannable')).toBe(true)
  })

  it('zoomable=true（缩略图可缩放，同上）', async () => {
    const { wrapper } = await factory()
    expect(findMinimap(wrapper).props('zoomable')).toBe(true)
  })

  it('aria-label 走 i18n：prop ariaLabel = t(v2.canvas.minimapAria)（替换包默认英文 aria）', async () => {
    const { wrapper } = await factory()
    expect(findMinimap(wrapper).props('ariaLabel')).toBe(t('v2.canvas.minimapAria'))
  })

  it('只读（canEdit=false）MiniMap 保留 —— 看图不受限（与 cnv-status / check chip 同规）', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(findMinimap(wrapper).exists()).toBe(true)
  })
})

describe('v2 canvas/Canvas — MiniMap 节点颜色映射（nodeColor 按节点类型，三色互异）', () => {
  it('nodeColor 是函数（string 常量色不构成「按类型映射」）', async () => {
    const { wrapper } = await factory()
    const color = findMinimap(wrapper).props('nodeColor')
    expect(typeof color).toBe('function')
  })

  it('DISPATCH / BACKEND / PLUGIN → 三色互异，且全为 token（var(-- 开头，禁字面色值）', async () => {
    const { wrapper } = await factory()
    const color = findMinimap(wrapper).props('nodeColor') as unknown as ColorFn
    const dispatch = color({ type: 'DISPATCH' })
    const backend = color({ type: 'BACKEND' })
    const plugin = color({ type: 'PLUGIN' })
    for (const [name, c] of [['DISPATCH', dispatch], ['BACKEND', backend], ['PLUGIN', plugin]] as const) {
      expect(c, `${name} 色不得为空`).toBeTruthy()
      expect(c.startsWith('var(--'), `${name} 色必须 token 化（var(--…），现值 ${c}`).toBe(true)
    }
    expect(new Set([dispatch, backend, plugin]).size).toBe(3)
  })

  it('未知 / 缺型节点 → 回退 token 色不抛错；纯函数（同入参同出参）', async () => {
    const { wrapper } = await factory()
    const color = findMinimap(wrapper).props('nodeColor') as unknown as ColorFn
    const fallback = color({})
    expect(fallback, '缺型回退色不得为空').toBeTruthy()
    expect(fallback.startsWith('var(--')).toBe(true)
    expect(() => color({ type: 'GHOST' })).not.toThrow()
    expect(color({ type: 'DISPATCH' })).toBe(color({ type: 'DISPATCH' }))
  })
})

describe('v2 canvas/Canvas — MiniMap 样式 token 源码契约（fs grep，Settings 375 同款手法）', () => {
  // 已绿锁（S9a 已落）：三条 :deep 规则存在 + 规则体零字面色值。防 C 步回退。
  it('minimap / minimap-node / minimap-mask 三选择器覆写存在（token 化配色落点）', () => {
    const source = readSource()
    for (const sel of ['.vue-flow__minimap', '.vue-flow__minimap-node', '.vue-flow__minimap-mask']) {
      expect(source, `Canvas.vue 缺少 ${sel} 覆写规则`).toMatch(new RegExp(sel.replace(/-/g, '\\-')))
    }
  })

  it('三条 minimap 规则体零字面色值（hex / rgb(a) / hsl(a) 全禁，只许 var()/color-mix token）', () => {
    const source = readSource()
    const rules = source.match(/:deep\(\.vue-flow__minimap[^)]*\)\s*\{[^}]*\}/g) ?? []
    expect(rules.length, '至少应有 3 条 minimap 规则（容器/node/mask）').toBeGreaterThanOrEqual(3)
    for (const rule of rules) {
      expect(rule, `minimap 规则含字面 hex：${rule}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(rule, `minimap 规则含字面 rgb(a)：${rule}`).not.toMatch(/\brgba?\s*\(/)
      expect(rule, `minimap 规则含字面 hsl(a)：${rule}`).not.toMatch(/\bhsla?\s*\(/)
    }
  })
})
