/**
 * S9a-C：v2 画布内核 composable（契约 §4 S9 拆步①：旧画布五段内核随迁，旧文件零改动）。
 *
 * 随迁清单（语义逐条等价，结构差异只有两处）：
 * - load（旧 L555-593）：loadEpoch 竞态防护必须随迁（拆步裁决①）——load 先 ++，响应落地前
 *   myEpoch !== loadEpoch 直接丢弃；与旧版的差异：loadError 存**枚举**（''|'loadFailed'|'parseFailed'），
 *   文案映射归组件层（不透传原始异常 message）。
 * - parseCanvasData（旧 L538-552 / D19）：string → JSON.parse（失败 null）；非 object/数组 → null；
 *   nodes/edges 非数组按 []；解析失败按空画布 + parseFailed。
 * - 快照栈（旧 L406-446）：JSON.stringify({nodes,edges}) 入栈，MAX_HISTORY=50 超出 shift 最旧；
 *   undo/redo 恢复后清选中。S9a 不落库，markDirty/自动保存整段不随迁（S9b 接线）。
 * - 连线（旧 L339-361）：判定改调 useCanvasValidation 纯函数（reason 枚举入 connectionError），
 *   新边默认 data { PATH / 空 value / priority 1 }，写后 pushHistory。
 * - 节点上限（旧 L371-404 拖放语义 → 点击添加 addNodeType）：MAX_NODES=200 超限拒绝 + limitHit
 *   置位；节点数回退 <200 后由 watch 清除（旧 watch(len) 语义随迁）。
 * - 权重写（旧 updateEdgeWeight L277-287 → setEdgeWeight(edge, v)）：undefined/null/NaN →
 *   condition_key=''；否则 String(clamp(round(v), 1, 100))；condition_value 恒 ''；写后 pushHistory。
 * - 边 label（读侧）：WEIGHT 且 parseWeight(condition_key) 合法 → `${n}%`；其余 → condition_value
 *   （utils/weight 随迁勿改值，拆步裁决⑦）。
 * - 键盘（旧 L730-752）：window 级 keydown Ctrl/Cmd+Z undo / Ctrl/Cmd+Y redo，onUnmounted 配对卸载。
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { getCanvas, getRoute } from '@/api/routes'
import { WEIGHT_MAX, WEIGHT_MIN, parseWeight } from '@/utils/weight'
import { validateConnection } from './useCanvasValidation'

/** 节点数上限（旧画布同名常量随迁勿改值） */
export const MAX_NODES = 200
/** 快照栈深度（旧画布同名常量随迁勿改值） */
export const MAX_HISTORY = 50

/** 加载错误枚举：组件层映射 v2.canvas.loadFailed / parseFailed */
export type CanvasLoadError = '' | 'loadFailed' | 'parseFailed'
/** 连线校验错误枚举：组件层映射 v2.canvas.selfLoop / backendOutgoing */
export type CanvasConnError = '' | 'selfLoop' | 'backendOutgoing'

/** 取数入口（默认直连 @/api/routes；组件层显式传入以声明 API 面，便于 S9b 扩展） */
export interface CanvasLoaders {
  loadCanvas: (id: string) => Promise<any>
  loadRoute: (id: string) => Promise<any>
  /** S9b：load 尾部回调（旧 load() finally 里 dirty=false 语义随迁 → autosave.markLoaded） */
  onLoaded?: () => void
  /** S9b：任意图变更成功落地后的回调（→ autosave.markDirty；键盘 undo/redo 同样触发） */
  onMutate?: () => void
}

export function useCanvasGraph(routeId: Ref<string>, loaders: CanvasLoaders = { loadCanvas: getCanvas, loadRoute: getRoute }) {
  const loading = ref(true)
  const loadError = ref<CanvasLoadError>('')
  const nodes = ref<any[]>([])
  const edges = ref<any[]>([])
  const selectedNode = ref<any>(null)
  const selectedEdge = ref<any>(null)
  const connectionError = ref<CanvasConnError>('')
  const limitHit = ref(false)

  // ── load 竞态防护（旧 loadEpoch 随迁）：实例内计数，load 先 ++，落地前校验 ──
  let loadEpoch = 0

  // D19：canvas_data 为对象或原始 JSON 字符串（实体列）。防御性解析，解析失败按空画布
  // 加载（组件层出提示）而不是抛错（旧 parseCanvasData 逐行随迁）。
  function parseCanvasData(raw: any): { nodes: any[]; edges: any[] } | null {
    let data = raw
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return null
      }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : []
    }
  }

  /** 边 label 读侧：WEIGHT 且 condition_key 合法 → `${n}%`；其余 → condition_value */
  function edgeLabelOf(e: any): string {
    const w = parseWeight(e?.data?.condition_key)
    if (e?.data?.condition_type === 'WEIGHT' && w !== null) return `${w}%`
    return String(e?.data?.condition_value ?? '')
  }

  /** 边数组 label 同步（label 挂在边对象上，Vue Flow 直接读） */
  function syncLabels() {
    for (const e of edges.value) e.label = edgeLabelOf(e)
  }

  function applyCanvasPayload(raw: unknown) {
    if (raw == null) {
      nodes.value = []
      edges.value = []
    } else {
      const data = parseCanvasData(raw)
      if (data) {
        nodes.value = data.nodes
        edges.value = data.edges
      } else {
        nodes.value = []
        edges.value = []
        loadError.value = 'parseFailed'
      }
    }
    selectedNode.value = null
    selectedEdge.value = null
    syncLabels()
    pushHistory()
  }

  async function load() {
    const myEpoch = ++loadEpoch
    loading.value = true
    loadError.value = ''
    try {
      const [r] = await Promise.all([
        loaders.loadCanvas(routeId.value),
        // 页面数据（path 预览归 S9b）；失败可容忍，不得拖垮画布加载
        loaders.loadRoute(routeId.value).catch(() => null)
      ])
      if (myEpoch !== loadEpoch) return
      applyCanvasPayload((r as any)?.canvas_data)
    } catch {
      if (myEpoch !== loadEpoch) return
      nodes.value = []
      edges.value = []
      selectedNode.value = null
      // 不透传原始异常 message（契约：错误条文案一律 i18n）
      loadError.value = 'loadFailed'
    } finally {
      if (myEpoch === loadEpoch) {
        loading.value = false
        // S9b：load 尾部（旧 dirty=false 语义随迁）→ autosave.markLoaded
        loaders.onLoaded?.()
      }
    }
  }

  // ── 快照栈（旧 L406-446 随迁，去掉 markDirty）────────────────────────────
  const history = ref<string[]>([])
  const historyIndex = ref(-1)
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  function snapshot() {
    return JSON.stringify({ nodes: nodes.value, edges: edges.value })
  }

  function pushHistory() {
    const snap = snapshot()
    if (historyIndex.value >= 0 && history.value[historyIndex.value] === snap) return
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(snap)
    if (history.value.length > MAX_HISTORY) {
      history.value.shift()
    }
    historyIndex.value = history.value.length - 1
  }

  function undo() {
    if (!canUndo.value) return
    historyIndex.value--
    const state = JSON.parse(history.value[historyIndex.value])
    nodes.value = state.nodes
    edges.value = state.edges
    selectedNode.value = null
    selectedEdge.value = null
    syncLabels()
    loaders.onMutate?.()
  }

  function redo() {
    if (!canRedo.value) return
    historyIndex.value++
    const state = JSON.parse(history.value[historyIndex.value])
    nodes.value = state.nodes
    edges.value = state.edges
    selectedNode.value = null
    selectedEdge.value = null
    syncLabels()
    loaders.onMutate?.()
  }

  // ── 节点增删（旧 onDrop 拖放语义 → addNodeType 点击添加，拆步裁决④）───────
  function addNodeType(type: string) {
    if (nodes.value.length >= MAX_NODES) {
      limitHit.value = true
      return
    }
    limitHit.value = false
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const n = nodes.value.length
    nodes.value = [...nodes.value, { id, type, position: { x: 40 + (n % 8) * 36, y: 40 + (n % 8) * 36 }, data: { label: type } }]
    pushHistory()
    loaders.onMutate?.()
  }

  // 节点数回退到上限内后解除 limit 提示（旧 watch(len) 清除语义随迁）
  watch(() => nodes.value.length, (len) => {
    if (len < MAX_NODES && limitHit.value) limitHit.value = false
  })

  /** 删除选中节点及其相连边（旧 deleteSelectedNode 随迁） */
  function deleteSelected() {
    const id = selectedNode.value?.id
    if (!id) return
    nodes.value = nodes.value.filter(n => n.id !== id)
    edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
    selectedNode.value = null
    syncLabels()
    pushHistory()
    loaders.onMutate?.()
  }

  /** S9b：按 id 删除单条边（属性面板删除连线入口，pushHistory 可撤销） */
  function deleteEdge(id: string) {
    const before = edges.value.length
    edges.value = edges.value.filter(e => e.id !== id)
    if (edges.value.length === before) return
    if (selectedEdge.value?.id === id) selectedEdge.value = null
    syncLabels()
    pushHistory()
    loaders.onMutate?.()
  }

  // ── 连线（旧 onConnect 随迁：判定走纯函数，错误存 reason 枚举）────────────
  function onConnect({ source, target }: { source: string; target: string }) {
    const sourceNode = nodes.value.find(n => n.id === source)
    const targetNode = nodes.value.find(n => n.id === target)
    if (!sourceNode || !targetNode) return
    const verdict = validateConnection({ sourceNode, targetNode })
    if (!verdict.ok) {
      connectionError.value = verdict.reason
      return
    }
    connectionError.value = ''
    const id = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const edge = { id, source, target, data: { condition_type: 'PATH', condition_value: '', priority: 1 }, label: '' }
    edge.label = edgeLabelOf(edge)
    edges.value = [...edges.value, edge]
    pushHistory()
    loaders.onMutate?.()
  }

  // ── 选择（旧 onNodeClick / onPaneClick / onEdgeClick 随迁）─────────────────
  function onNodeClick({ node }: any) {
    if (!node.data) node.data = {}
    selectedNode.value = node
    selectedEdge.value = null
  }

  function onPaneClick() {
    selectedNode.value = null
    selectedEdge.value = null
  }

  function onEdgeClick({ edge }: any) {
    if (!edge.data) edge.data = { condition_type: 'PATH', condition_value: '', priority: 1 }
    selectedNode.value = null
    selectedEdge.value = edge
  }

  // ── 权重写（旧 updateEdgeWeight 写语义随迁，edge 改为入参）─────────────────
  function setEdgeWeight(edge: any, v: number | undefined | null) {
    if (!edge?.data) return
    if (v === undefined || v === null || Number.isNaN(v)) {
      edge.data.condition_key = ''
    } else {
      edge.data.condition_key = String(Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(v))))
    }
    edge.data.condition_value = ''
    syncLabels()
    pushHistory()
    loaders.onMutate?.()
  }

  // ── 键盘（旧 L730-752 随迁，配对卸载）────────────────────────────────────
  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      redo()
    }
  }

  // mount 恰好触发一次 load（watch 不带 immediate，禁止重复调用）
  onMounted(() => {
    load()
    window.addEventListener('keydown', onKeydown)
  })

  watch(() => routeId.value, () => {
    load()
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    loading, loadError, nodes, edges, selectedNode, selectedEdge,
    connectionError, limitHit, canUndo, canRedo,
    load, addNodeType, deleteSelected, deleteEdge, onConnect, onNodeClick, onPaneClick, onEdgeClick,
    undo, redo, setEdgeWeight
  }
}
