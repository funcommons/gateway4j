/**
 * S9a-C：画布校验纯函数（契约 §4 S9 拆步①：旧画布五段内核随迁，v2 抽为无 Vue 依赖模块）。
 *
 * 与旧实现的差异只有一处结构差异：旧版把校验混在 Canvas.vue（vm.validateConnection 直写
 * connectionError i18n 文案）；v2 把判定收敛为本文件纯函数，返回 reason 枚举，
 * i18n 文案映射归组件层（Canvas.vue：v2.canvas.selfLoop / backendOutgoing）。
 * 判定语义与旧 Canvas.vue L304-361（连线校验 / 孤儿识别 / 嵌套深度）逐条等价。
 *
 * 常量随迁勿改值（拆步裁决⑦）：MAX_DISPATCH_DEPTH = 5（分发路由最大嵌套层数）。
 */

/** 分发路由（DISPATCH）最大嵌套层数，超过由组件层告警（旧画布同名常量随迁） */
export const MAX_DISPATCH_DEPTH = 5

/** 连线判定入参的最小形状（Vue Flow connect 事件携带的 source/target 节点） */
export interface CanvasConnNode {
  id?: string
  type?: string
}

/** 连线判定结果：ok=false 时 reason ∈ 'selfLoop' | 'backendOutgoing'，组件层据此映射文案 */
export interface CanvasConnVerdict {
  ok: boolean
  reason: '' | 'selfLoop' | 'backendOutgoing'
}

/**
 * 连线校验（旧 validateConnection 随迁）：
 * - 自环（source.id 存在且 === target.id）→ 'selfLoop'；id 缺失不判自环（沿旧 guard）；
 * - BACKEND 出边（后置路由无出边）→ 'backendOutgoing'；
 * - 自环优先于 BACKEND 出边判定（两规则都命中报 selfLoop，旧顺序随迁）；
 * - 其余（DISPATCH/PLUGIN 源 → 任意目标）放行。
 */
export function validateConnection({ sourceNode, targetNode }: { sourceNode: CanvasConnNode; targetNode: CanvasConnNode }): CanvasConnVerdict {
  if (sourceNode.id && sourceNode.id === targetNode.id) {
    return { ok: false, reason: 'selfLoop' }
  }
  if (sourceNode.type === 'BACKEND') {
    return { ok: false, reason: 'backendOutgoing' }
  }
  return { ok: true, reason: '' }
}

/**
 * 孤儿分发节点（旧 orphanDispatchNodes computed 随迁）：
 * 出边集合里没有 source 的 DISPATCH 节点（BACKEND/PLUGIN 无出边不算孤儿）；
 * 返回顺序随 nodes 原序；出边指向不存在的节点也算「有出边」（不校验目标存在性）。
 */
export function orphanDispatchNodes(nodes: any[], edges: any[]): any[] {
  const sourcesWithEdges = new Set(edges.map(e => e.source))
  return nodes.filter(n => n.type === 'DISPATCH' && !sourcesWithEdges.has(n.id))
}

/**
 * 分发链最深层数（旧 maxDispatchDepth computed 随迁，DFS 记忆化 + visiting 集合防环死循环）：
 * - 无 DISPATCH 节点 → 0；孤立 DISPATCH（无边）→ 1；
 * - 只在 DISPATCH→DISPATCH 的边上递推（BACKEND/PLUGIN 目标不续链；目标不在节点表的边忽略）；
 * - 环上节点按 0 计入（visiting 命中返回 0，算法逐行随迁）。
 */
export function maxDispatchDepth(nodes: any[], edges: any[]): number {
  const dispatchIds = new Set(nodes.filter(n => n.type === 'DISPATCH').map(n => n.id))
  if (dispatchIds.size === 0) return 0
  const adj = new Map<string, string[]>()
  for (const id of dispatchIds) adj.set(id, [])
  for (const e of edges) {
    if (dispatchIds.has(e.source) && dispatchIds.has(e.target)) {
      adj.get(e.source)!.push(e.target)
    }
  }
  const memo = new Map<string, number>()
  function depth(id: string, visiting: Set<string> = new Set()): number {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const children = adj.get(id) || []
    const d = children.length === 0 ? 1 : 1 + Math.max(...children.map(c => depth(c, visiting)))
    visiting.delete(id)
    memo.set(id, d)
    return d
  }
  let max = 0
  for (const id of dispatchIds) max = Math.max(max, depth(id))
  return max
}
