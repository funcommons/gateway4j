/**
 * S9b-T：v2 画布属性面板契约测试（docs/ui-v2/实施契约.md §4 S9 行拆步「PropertyPanel.vue(~260)」
 * + 拆步裁决② testid 前缀与 i18n 新树 + 旧画布 Canvas.vue L78-150 属性面板交互语义随迁）。
 * 先红是预期：组件由 S9b-C 实现，落地前本文件为整文件收集失败级别的红
 * （Failed to resolve import …/PropertyPanel.vue，vitest + vue-tsc 同理，合规先红形态）。
 *
 * ── 公开 API 契约（S9b-C 照此实现）────────────────────────────────────────
 * // src/views-v2/canvas/PropertyPanel.vue，defineOptions name 'V2PropertyPanel'
 * props: {
 *   node?: any | null      // 选中节点（useCanvasGraph 的 selectedNode 同一对象引用）
 *   edge?: any | null      // 选中边（S9b-C 在 useCanvasGraph 增设 selectedEdge + onEdgeClick）
 *   canEdit?: boolean      // 默认 true；false → 全部输入 disabled、无删除按钮
 * }
 * emits: {
 *   dirty(): void                       // 任何字段编辑后发（Canvas 接线 → autosave.markDirty()）
 *   delete(payload: { kind: 'node'|'edge'; id: string }): void   // Canvas 接线 → 图删除
 *   'set-weight'(edge: any, value: number | undefined): void     // 参数序与 useCanvasGraph
 *                                                       // setEdgeWeight(edge, v) 对齐，可直接绑定
 * }
 * 根节点 v-if="node || edge"：无选中不渲染（出现/消失由 Canvas 接线用例锁定）。
 *
 * ── 编辑语义裁决（旧实现随迁）────────────────────────────────────────────
 * ① 文本字段（名称/上游/路径/插件配置/条件值）= 就地变更传入的 node/edge 对象（旧画布
 *    v-model 直改 selectedNode.data 语义随迁：同一引用 → 画布状态同步）+ emit('dirty')。
 *    不 pushHistory（旧画布属性编辑只 markDirty 不入快照栈，语义随迁）。
 * ② 权重写 = emit('set-weight', edge, clampedValue) 转交 useCanvasGraph.setEdgeWeight
 *    （S9a 已测 clamp/condition_value 清空/pushHistory；面板侧再夹取一次为幂等冗余）+
 *    emit('dirty')。undefined/null/NaN → value=undefined（旧 updateEdgeWeight 清除语义随迁）。
 * ③ 条件类型切换（旧 onEdgeCondTypeChange L290-302 随迁）：切到 WEIGHT 时数值型
 *    condition_value 迁入 condition_key 并清空 value；非数值 → condition_key=''；均 emit('dirty')。
 * ④ 权重读侧 = parseWeight(condition_key)（@/utils/weight，随迁勿改值）：合法 1~100 显示数字，
 *    非法显示空。优先级 1~999 夹取写回（旧 FcInputNumber :min=1 :max=999 语义随迁）。
 * ⑤ 旧 prop-no-selection 空态占位不随迁：v2 面板无选中整体不渲染（接线用例「随选中出现/消失」）。
 * ⑥ 条件类型选择器不用 FcSelect（jsdom 不可驱动 el-select）：渲染为 6 个 chip 按钮点击切换。
 *
 * ── testid 契约表（data-testid，cnv-prop-*，拆步裁决②；不引用 route.* 旧树）────
 * cnv-prop-panel        面板根（无选中不渲染；只读态由 Canvas 接线隐藏）
 * cnv-prop-type         类型只读文本（'DISPATCH'|'BACKEND'|'PLUGIN'）
 * cnv-prop-name         名称输入（label，maxlength 50）
 * cnv-prop-upstream     上游地址（仅 BACKEND，maxlength 500）
 * cnv-prop-path         匹配路径（仅 DISPATCH，maxlength 500）
 * cnv-prop-config       插件配置（仅 PLUGIN，textarea，maxlength 10000）
 * cnv-prop-cond-type    条件类型容器（仅边）
 * cnv-prop-cond-{TYPE}  类型 chip ×6（HEADER/PATH/QUERY/BODY/GROOVY/WEIGHT，点击切换）
 * cnv-prop-weight       权重输入（仅 WEIGHT 边，min=1 max=100，testid 落原生 input）
 * cnv-prop-cond-value   条件值输入（仅非 WEIGHT 边，maxlength 500）
 * cnv-prop-priority     优先级（仅边，min=1 max=999，testid 落原生 input）
 * cnv-prop-delete       删除按钮（节点文案复用 v2.canvas.delete；边文案 deleteEdge）
 *
 * ── i18n key 清单（v2.canvas.* 新树，zh/en 同步加，铁律 6；17 个）───────────
 * panelTitle('属性') / propType('类型') / propName('名称') / propUpstream('上游地址') /
 * propPath('匹配路径') / propConfig('插件配置') / propCondType('条件类型') /
 * propCondValue('条件值') / propWeight('权重') / propPriority('优先级') /
 * deleteEdge('删除连线') / condHeader('请求头') / condPath('路径') / condQuery('查询参数') /
 * condBody('请求体') / condGroovy('Groovy 表达式') / condWeight('权重')
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { WEIGHT_MIN, WEIGHT_MAX, parseWeight } from '@/utils/weight'
import PropertyPanel from '@/views-v2/canvas/PropertyPanel.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（Canvas.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)
const inputValue = (w: VueWrapper<any>, sel: string) => (byTestid(w, sel).element as HTMLInputElement).value

function makeNode(id: string, type: 'DISPATCH' | 'BACKEND' | 'PLUGIN', over: Record<string, unknown> = {}) {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id.toUpperCase() }, ...over }
}
function makeEdge(over: Record<string, unknown> = {}) {
  return {
    id: 'e1', source: 'd1', target: 'b1',
    data: { condition_type: 'PATH', condition_value: '', priority: 1 },
    ...over
  }
}

function factory(props: { node?: any; edge?: any; canEdit?: boolean }): VueWrapper<any> {
  return mount(PropertyPanel, {
    props: { node: null, edge: null, canEdit: true, ...props },
    global: { plugins: [ElementPlus, i18n] }
  })
}

// ── i18n key 全表（v2.canvas.* 17 个，zh/en 双语存在，铁律 6）────────────────
const PANEL_KEYS = ['panelTitle', 'propType', 'propName', 'propUpstream', 'propPath', 'propConfig',
  'propCondType', 'propCondValue', 'propWeight', 'propPriority', 'deleteEdge',
  'condHeader', 'condPath', 'condQuery', 'condBody', 'condGroovy', 'condWeight']
  .map((k) => `v2.canvas.${k}`)

describe('v2 canvas/PropertyPanel — i18n key 全表双语存在（铁律 6）', () => {
  it.each(PANEL_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 canvas/PropertyPanel — 渲染与 DISPATCH/BACKEND/PLUGIN 字段差异', () => {
  it('node 与 edge 均未选中 → cnv-prop-panel 不渲染（旧 prop-no-selection 占位不随迁，裁决⑤）', () => {
    const w = factory({})
    expect(byTestid(w, 'cnv-prop-panel').exists()).toBe(false)
  })

  it.each([
    ['BACKEND', 'cnv-prop-upstream', ['cnv-prop-path', 'cnv-prop-config']],
    ['DISPATCH', 'cnv-prop-path', ['cnv-prop-upstream', 'cnv-prop-config']],
    ['PLUGIN', 'cnv-prop-config', ['cnv-prop-path', 'cnv-prop-upstream']]
  ] as const)('%s 节点：cnv-prop-type 显示类型 + 名称字段 + 专属 %s 在，%j 不在', (type, present, absent) => {
    const w = factory({ node: makeNode('n1', type) })
    expect(byTestid(w, 'cnv-prop-panel').exists()).toBe(true)
    expect(byTestid(w, 'cnv-prop-type').text()).toBe(type)
    expect(byTestid(w, 'cnv-prop-name').exists()).toBe(true)
    expect(inputValue(w, 'cnv-prop-name')).toBe('N1')
    expect(byTestid(w, present).exists()).toBe(true)
    for (const tid of absent) expect(byTestid(w, tid).exists()).toBe(false)
  })

  it('权重域常量随迁勿改值（面板 min/max 与 @/utils/weight 同源，裁决⑦）', () => {
    expect(WEIGHT_MIN).toBe(1)
    expect(WEIGHT_MAX).toBe(100)
    expect(parseWeight('30')).toBe(30)
    expect(parseWeight('0')).toBe(null)
  })
})

describe('v2 canvas/PropertyPanel — 编辑触发画布状态更新（就地变更 + dirty emit，裁决①）', () => {
  it('名称编辑 → node.data.label 同步 + emit dirty', async () => {
    const node = makeNode('n1', 'BACKEND')
    const w = factory({ node })
    await byTestid(w, 'cnv-prop-name').setValue('renamed')
    expect(node.data.label).toBe('renamed')
    expect(w.emitted('dirty')).toHaveLength(1)
  })

  it.each([
    ['BACKEND', 'cnv-prop-upstream', 'upstream_url'],
    ['DISPATCH', 'cnv-prop-path', 'path'],
    ['PLUGIN', 'cnv-prop-config', 'config']
  ] as const)('%s 专属字段编辑 → node.data.%s 同步 + dirty（maxlength 约束随迁）', async (type, testid, field) => {
    const node = makeNode('n1', type)
    const w = factory({ node })
    await byTestid(w, testid).setValue('edited-value')
    expect((node.data as Record<string, unknown>)[field]).toBe('edited-value')
    expect(w.emitted('dirty')).toHaveLength(1)
  })

  it('字段 maxlength 随迁：name=50 / upstream=500 / path=500 / config=10000（旧 label-config 约束）', () => {
    const w = factory({ node: makeNode('n1', 'PLUGIN', { data: { label: 'P', config: '' } }) })
    expect(byTestid(w, 'cnv-prop-name').attributes('maxlength')).toBe('50')
    expect(byTestid(w, 'cnv-prop-config').attributes('maxlength')).toBe('10000')
    const w2 = factory({ node: makeNode('n1', 'BACKEND') })
    expect(byTestid(w2, 'cnv-prop-upstream').attributes('maxlength')).toBe('500')
    const w3 = factory({ node: makeNode('n1', 'DISPATCH') })
    expect(byTestid(w3, 'cnv-prop-path').attributes('maxlength')).toBe('500')
  })

  it('删除节点按钮 → emit delete { kind: node, id }（文案复用 v2.canvas.delete）', async () => {
    const node = makeNode('n1', 'BACKEND')
    const w = factory({ node })
    expect(byTestid(w, 'cnv-prop-delete').text()).toContain(t('v2.canvas.delete'))
    await byTestid(w, 'cnv-prop-delete').trigger('click')
    expect(w.emitted('delete')![0]).toEqual([{ kind: 'node', id: 'n1' }])
  })

  it('删除边按钮 → emit delete { kind: edge, id }（文案 deleteEdge）', async () => {
    const edge = makeEdge()
    const w = factory({ edge })
    expect(byTestid(w, 'cnv-prop-delete').text()).toContain(t('v2.canvas.deleteEdge'))
    await byTestid(w, 'cnv-prop-delete').trigger('click')
    expect(w.emitted('delete')![0]).toEqual([{ kind: 'edge', id: 'e1' }])
  })
})

describe('v2 canvas/PropertyPanel — 边：WEIGHT 权重域（utils/weight 随迁）', () => {
  it('WEIGHT 边读侧：condition_key 合法显示权重、非法显示空；min/max 属性 = 权重域；cond-value 不渲染', () => {
    const w = factory({ edge: makeEdge({ data: { condition_type: 'WEIGHT', condition_key: '30', condition_value: '', priority: 1 } }) })
    expect(byTestid(w, 'cnv-prop-weight').exists()).toBe(true)
    expect(inputValue(w, 'cnv-prop-weight')).toBe('30')
    expect(byTestid(w, 'cnv-prop-weight').attributes('min')).toBe('1')
    expect(byTestid(w, 'cnv-prop-weight').attributes('max')).toBe('100')
    expect(byTestid(w, 'cnv-prop-weight').attributes('step')).toBe('1')
    expect(byTestid(w, 'cnv-prop-cond-value').exists()).toBe(false)
    const w2 = factory({ edge: makeEdge({ data: { condition_type: 'WEIGHT', condition_key: 'abc', condition_value: '', priority: 1 } }) })
    expect(inputValue(w2, 'cnv-prop-weight')).toBe('')
  })

  it('权重写：合法直传 + 越界夹取 1~100 + 空值清除语义 → set-weight(edge, value) + dirty（裁决②）', async () => {
    const edge = makeEdge({ data: { condition_type: 'WEIGHT', condition_key: '30', condition_value: '', priority: 1 } })
    const w = factory({ edge })
    await byTestid(w, 'cnv-prop-weight').setValue('40')
    expect(w.emitted('set-weight')!.at(-1)).toEqual([edge, 40])
    await byTestid(w, 'cnv-prop-weight').setValue('0')
    expect(w.emitted('set-weight')!.at(-1)).toEqual([edge, 1])
    await byTestid(w, 'cnv-prop-weight').setValue('999')
    expect(w.emitted('set-weight')!.at(-1)).toEqual([edge, 100])
    await byTestid(w, 'cnv-prop-weight').setValue('40.4')
    expect(w.emitted('set-weight')!.at(-1)).toEqual([edge, 40])
    await byTestid(w, 'cnv-prop-weight').setValue('')
    expect(w.emitted('set-weight')!.at(-1)).toEqual([edge, undefined])
    expect(w.emitted('dirty')).toHaveLength(5)
  })

  it('非 WEIGHT 边（PATH）：cond-value 渲染 + 编辑同步 edge.data.condition_value + dirty + maxlength 500', async () => {
    const edge = makeEdge()
    const w = factory({ edge })
    expect(byTestid(w, 'cnv-prop-cond-value').exists()).toBe(true)
    expect(byTestid(w, 'cnv-prop-weight').exists()).toBe(false)
    expect(byTestid(w, 'cnv-prop-cond-value').attributes('maxlength')).toBe('500')
    await byTestid(w, 'cnv-prop-cond-value').setValue('/api/a/**')
    expect(edge.data.condition_value).toBe('/api/a/**')
    expect(w.emitted('dirty')).toHaveLength(1)
  })
})

describe('v2 canvas/PropertyPanel — 边：条件类型切换（旧 onEdgeCondTypeChange 随迁，裁决③⑥）', () => {
  it('6 个类型 chip 全渲染（cnv-prop-cond-{TYPE}，文案 condHeader..condWeight）', () => {
    const w = factory({ edge: makeEdge() })
    expect(byTestid(w, 'cnv-prop-cond-type').exists()).toBe(true)
    const pairs: Array<[string, string]> = [
      ['cnv-prop-cond-HEADER', 'condHeader'],
      ['cnv-prop-cond-PATH', 'condPath'],
      ['cnv-prop-cond-QUERY', 'condQuery'],
      ['cnv-prop-cond-BODY', 'condBody'],
      ['cnv-prop-cond-GROOVY', 'condGroovy'],
      ['cnv-prop-cond-WEIGHT', 'condWeight']
    ]
    for (const [tid, key] of pairs) {
      expect(byTestid(w, tid).text()).toContain(t(`v2.canvas.${key}`))
    }
  })

  it('PATH→WEIGHT：数值 condition_value 迁入 condition_key 且 value 清空 + dirty', async () => {
    const edge = makeEdge({ data: { condition_type: 'PATH', condition_value: '40', priority: 1 } })
    const w = factory({ edge })
    await byTestid(w, 'cnv-prop-cond-WEIGHT').trigger('click')
    expect(edge.data.condition_type).toBe('WEIGHT')
    expect((edge.data as Record<string, unknown>).condition_key).toBe('40')
    expect(edge.data.condition_value).toBe('')
    expect(w.emitted('dirty')).toHaveLength(1)
  })

  it('切到 WEIGHT 且 value 非数值 → condition_key 置空字符串（不清出垃圾值）+ dirty', async () => {
    const edge = makeEdge({ data: { condition_type: 'PATH', condition_value: '/api/**', priority: 1 } })
    const w = factory({ edge })
    await byTestid(w, 'cnv-prop-cond-WEIGHT').trigger('click')
    expect(edge.data.condition_type).toBe('WEIGHT')
    expect((edge.data as Record<string, unknown>).condition_key).toBe('')
    expect(edge.data.condition_value).toBe('')
    expect(w.emitted('dirty')).toHaveLength(1)
  })
})

describe('v2 canvas/PropertyPanel — 边：优先级（1~999 夹取随迁）', () => {
  it('priority 输入 min=1 max=999；写入夹取（0→1 / 5000→999）+ 同步 edge.data.priority + dirty', async () => {
    const edge = makeEdge()
    const w = factory({ edge })
    expect(byTestid(w, 'cnv-prop-priority').attributes('min')).toBe('1')
    expect(byTestid(w, 'cnv-prop-priority').attributes('max')).toBe('999')
    await byTestid(w, 'cnv-prop-priority').setValue('5')
    expect(edge.data.priority).toBe(5)
    await byTestid(w, 'cnv-prop-priority').setValue('0')
    expect(edge.data.priority).toBe(1)
    await byTestid(w, 'cnv-prop-priority').setValue('5000')
    expect(edge.data.priority).toBe(999)
    expect(w.emitted('dirty')).toHaveLength(3)
  })
})

describe('v2 canvas/PropertyPanel — 只读（canEdit=false）', () => {
  it('全部输入 disabled + 无删除按钮（面板整体隐藏由 Canvas 接线负责，此处锁面板内形态）', () => {
    const w = factory({ node: makeNode('n1', 'BACKEND'), canEdit: false })
    expect(byTestid(w, 'cnv-prop-name').attributes('disabled')).toBeDefined()
    expect(byTestid(w, 'cnv-prop-upstream').attributes('disabled')).toBeDefined()
    expect(byTestid(w, 'cnv-prop-delete').exists()).toBe(false)
  })
})
