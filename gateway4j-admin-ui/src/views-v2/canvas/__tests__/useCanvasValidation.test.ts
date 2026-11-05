/**
 * S9a-T：画布校验纯函数测试（契约 §4 S9：useCanvasValidation.ts = 连线/孤儿/嵌套≤5/权重，纯函数）。
 * 断言对象沿用旧画布五段逻辑（Canvas.connection-validation / Canvas.nesting-depth 语义），
 * 按 v2 结构重设计：旧实现混在 Canvas.vue 里（vm.validateConnection/orphanDispatchNodes/
 * maxDispatchDepth + connectionError i18n 文案直写），v2 抽为无 Vue 依赖的纯函数模块，
 * i18n 映射归组件层（Canvas.vue 用 reason 枚举 → v2.canvas.selfLoop / backendOutgoing）。
 *
 * ── 模块契约（S9a-C 实现 src/views-v2/canvas/composables/useCanvasValidation.ts）────
 * - 零 Vue / vue-i18n 依赖（不 import 'vue'，不 import locale）——入参出参全是普通数据。
 * - export const MAX_DISPATCH_DEPTH = 5（裁决⑦：随迁勿改值）。
 * - validateConnection(conn: { sourceNode; targetNode }): { ok: boolean; reason: '' | 'selfLoop' | 'backendOutgoing' }
 *   * 自环（sourceNode.id 存在且 === targetNode.id）→ { ok:false, reason:'selfLoop' }；
 *     （id 缺失不判自环，沿旧 guard `if (sourceNode.id && …)`）
 *   * sourceNode.type === 'BACKEND' → { ok:false, reason:'backendOutgoing' }（后置路由无出边）；
 *   * 其余（DISPATCH/PLUGIN 源 → 任意目标）→ { ok:true, reason:'' }。
 * - orphanDispatchNodes(nodes, edges): 出边集合里没有 source 的 DISPATCH 节点数组
 *   （BACKEND/PLUGIN 无出边不算孤儿；顺序随 nodes 原序）。
 * - maxDispatchDepth(nodes, edges): DISPATCH 链最深层数 —— 无 DISPATCH → 0；单层 → 1；
 *   d1→d2→b1 → 2；只在 DISPATCH→DISPATCH 的边上递推（BACKEND/PLUGIN 目标不续链）；
 *   环安全（visiting 集合防死循环，环上节点按 0 计入，旧算法随迁）。
 */
import { describe, it, expect } from 'vitest'
import {
  validateConnection,
  orphanDispatchNodes,
  maxDispatchDepth,
  MAX_DISPATCH_DEPTH
} from '@/views-v2/canvas/composables/useCanvasValidation'

// ── fixtures：Vue Flow 节点/边最小形状 ──────────────────────────────────────
function n(id: string, type: 'DISPATCH' | 'BACKEND' | 'PLUGIN' = 'BACKEND') {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id } }
}
function e(source: string, target: string) {
  return { id: `${source}->${target}`, source, target, data: { condition_type: 'PATH', condition_value: '', priority: 1 } }
}

describe('useCanvasValidation — 常量（裁决⑦随迁勿改值）', () => {
  it('MAX_DISPATCH_DEPTH === 5', () => {
    expect(MAX_DISPATCH_DEPTH).toBe(5)
  })
})

describe('useCanvasValidation — validateConnection（连线校验）', () => {
  it('自环（同 id）→ 拒绝 reason=selfLoop', () => {
    expect(validateConnection({ sourceNode: n('d1', 'DISPATCH'), targetNode: n('d1', 'DISPATCH') }))
      .toEqual({ ok: false, reason: 'selfLoop' })
  })

  it('同 id 但类型不同仍判自环（id 是判据，沿旧 guard）', () => {
    expect(validateConnection({ sourceNode: n('x', 'DISPATCH'), targetNode: n('x', 'BACKEND') }))
      .toEqual({ ok: false, reason: 'selfLoop' })
  })

  it('BACKEND 出边 → 拒绝 reason=backendOutgoing（目标随意）', () => {
    expect(validateConnection({ sourceNode: n('b1', 'BACKEND'), targetNode: n('d1', 'DISPATCH') }))
      .toEqual({ ok: false, reason: 'backendOutgoing' })
    expect(validateConnection({ sourceNode: n('b1', 'BACKEND'), targetNode: n('b2', 'BACKEND') }))
      .toEqual({ ok: false, reason: 'backendOutgoing' })
  })

  it('正常边放行：DISPATCH→BACKEND / DISPATCH→DISPATCH / PLUGIN→BACKEND 均 ok', () => {
    expect(validateConnection({ sourceNode: n('d1', 'DISPATCH'), targetNode: n('b1', 'BACKEND') }))
      .toEqual({ ok: true, reason: '' })
    expect(validateConnection({ sourceNode: n('d1', 'DISPATCH'), targetNode: n('d2', 'DISPATCH') }))
      .toEqual({ ok: true, reason: '' })
    expect(validateConnection({ sourceNode: n('p1', 'PLUGIN'), targetNode: n('b1', 'BACKEND') }))
      .toEqual({ ok: true, reason: '' })
  })

  it('自环优先于 BACKEND 出边判定（两规则都命中时报 selfLoop）', () => {
    expect(validateConnection({ sourceNode: n('b1', 'BACKEND'), targetNode: n('b1', 'BACKEND') }))
      .toEqual({ ok: false, reason: 'selfLoop' })
  })
})

describe('useCanvasValidation — orphanDispatchNodes（孤儿识别）', () => {
  it('无出边的 DISPATCH 是孤儿；有出边的不是', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH'), n('b1')]
    const edges = [e('d2', 'b1')]
    const orphans = orphanDispatchNodes(nodes, edges)
    expect(orphans.map((x: any) => x.id)).toEqual(['d1'])
  })

  it('BACKEND / PLUGIN 无出边不算孤儿（仅 DISPATCH 参与判定）', () => {
    const nodes = [n('b1'), n('p1', 'PLUGIN'), n('d1', 'DISPATCH')]
    expect(orphanDispatchNodes(nodes, []).map((x: any) => x.id)).toEqual(['d1'])
  })

  it('多个孤儿按 nodes 原序返回', () => {
    const nodes = [n('d2', 'DISPATCH'), n('b1'), n('d1', 'DISPATCH'), n('d3', 'DISPATCH')]
    const edges = [e('d3', 'b1')]
    expect(orphanDispatchNodes(nodes, edges).map((x: any) => x.id)).toEqual(['d2', 'd1'])
  })

  it('出边指向不存在节点也计为「有出边」（不校验目标存在性，沿旧语义）', () => {
    const nodes = [n('d1', 'DISPATCH')]
    const edges = [e('d1', 'ghost')]
    expect(orphanDispatchNodes(nodes, edges)).toEqual([])
  })

  it('空图 → 空数组', () => {
    expect(orphanDispatchNodes([], [])).toEqual([])
  })
})

describe('useCanvasValidation — maxDispatchDepth（嵌套深度，边界 5）', () => {
  it('无 DISPATCH 节点 → 0（纯 BACKEND 图也是 0）', () => {
    expect(maxDispatchDepth([], [])).toBe(0)
    expect(maxDispatchDepth([n('b1')], [])).toBe(0)
  })

  it('单层 DISPATCH→BACKEND → 1', () => {
    expect(maxDispatchDepth([n('d1', 'DISPATCH'), n('b1')], [e('d1', 'b1')])).toBe(1)
  })

  it('孤立 DISPATCH（无边）→ 1', () => {
    expect(maxDispatchDepth([n('d1', 'DISPATCH')], [])).toBe(1)
  })

  it('d1→d2→b1 → 2（DISPATCH 链逐层 +1，BACKEND 不续链）', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH'), n('b1')]
    const edges = [e('d1', 'd2'), e('d2', 'b1')]
    expect(maxDispatchDepth(nodes, edges)).toBe(2)
  })

  it('恰好 5 层（d1→…→d5→b1）→ 5（边界：合法）', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH'), n('d3', 'DISPATCH'), n('d4', 'DISPATCH'), n('d5', 'DISPATCH'), n('b1')]
    const edges = [e('d1', 'd2'), e('d2', 'd3'), e('d3', 'd4'), e('d4', 'd5'), e('d5', 'b1')]
    expect(maxDispatchDepth(nodes, edges)).toBe(5)
    expect(maxDispatchDepth(nodes, edges)).toBeLessThanOrEqual(MAX_DISPATCH_DEPTH)
  })

  it('6 层链 → 6（> MAX_DISPATCH_DEPTH，由组件层据此告警）', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH'), n('d3', 'DISPATCH'), n('d4', 'DISPATCH'), n('d5', 'DISPATCH'), n('d6', 'DISPATCH'), n('b1')]
    const edges = [e('d1', 'd2'), e('d2', 'd3'), e('d3', 'd4'), e('d4', 'd5'), e('d5', 'd6'), e('d6', 'b1')]
    expect(maxDispatchDepth(nodes, edges)).toBe(6)
  })

  it('多分支取最深：d1→(d2→d3→b1 | b2) → 3', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH'), n('d3', 'DISPATCH'), n('b1'), n('b2')]
    const edges = [e('d1', 'd2'), e('d2', 'd3'), e('d3', 'b1'), e('d1', 'b2')]
    expect(maxDispatchDepth(nodes, edges)).toBe(3)
  })

  it('环（d1→d2→d1）防死循环：有穷返回且值为 2（环上节点按 0 计入，沿旧 visiting 集合算法）', () => {
    const nodes = [n('d1', 'DISPATCH'), n('d2', 'DISPATCH')]
    const edges = [e('d1', 'd2'), e('d2', 'd1')]
    expect(maxDispatchDepth(nodes, edges)).toBe(2)
  })

  it('自环边（d1→d1）防死循环 → 1', () => {
    expect(maxDispatchDepth([n('d1', 'DISPATCH')], [e('d1', 'd1')])).toBe(1)
  })

  it('DISPATCH→DISPATCH 边但目标不在节点表 → 忽略该边（按无子链计）', () => {
    expect(maxDispatchDepth([n('d1', 'DISPATCH')], [e('d1', 'ghost-dispatch')])).toBe(1)
  })
})
