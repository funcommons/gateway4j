<template>
  <div class="app-page canvas-page">
    <FcTabsPanel v-model="tab" :tabs="tabs">
      <template #tab-canvas>
        <div class="canvas-toolbar">
          <FcButton v-if="canEdit('route')" variant="primary" :loading="saving" @click="save">{{ t('route.canvasSave') }}</FcButton>
          <FcButton v-if="canEdit('route')" variant="secondary" :loading="applying" data-testid="apply-to-tree" @click="applyToTree">{{ t('route.canvasApply') }}</FcButton>
          <!-- P1-3 应用画布成功后轮询配置同步状态（发布生效确认） -->
          <PublishSyncStatus ref="syncStatusRef" />
          <FcButton variant="secondary" :disabled="!canUndo" @click="undo">{{ t('route.canvasUndo') }}</FcButton>
          <FcButton variant="secondary" :disabled="!canRedo" @click="redo">{{ t('route.canvasRedo') }}</FcButton>
          <FcSwitch v-model="autoSave" />
          <label class="auto-save-label">{{ t('route.canvasAutoSave') }}</label>
          <span v-if="loadError" class="save-error" data-testid="load-error">{{ loadError }}</span>
          <span v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</span>
          <span v-if="autoSaveResult" class="auto-save-hint">{{ autoSaveResult }}</span>
          <span class="path-preview" data-testid="path-preview">
            {{ t('route.pathPreview') }}: {{ routePath || t('route.noPath') }}
          </span>
        </div>
        <div class="canvas-body">
          <div
            class="component-panel"
            :class="{ collapsed: panelCollapsed }"
            data-testid="component-panel"
          >
            <button class="panel-toggle" data-testid="panel-toggle" @click="panelCollapsed = !panelCollapsed">
              {{ panelCollapsed ? '›' : '‹' }}
            </button>
            <template v-if="!panelCollapsed">
              <div class="panel-title" data-testid="panel-title">{{ t('route.panelTitle') }}</div>
              <div
                v-for="nt in nodeTypes"
                :key="nt.type"
                class="node-type-item"
                data-testid="node-type-item"
                draggable="true"
                @dragstart="onDragStart($event, nt.type)"
              >
                <span class="node-icon" :class="nt.iconClass" />
                <span class="node-label">{{ nt.label }}</span>
              </div>
            </template>
          </div>
          <div
            class="canvas-shell"
            @dragover.prevent="onDragOver"
            @drop="onDrop"
          >
            <span v-if="nodeLimitError" class="node-limit-error" data-testid="node-limit-error">{{ nodeLimitError }}</span>
            <span v-if="connectionError" class="connection-error" data-testid="connection-error">{{ connectionError }}</span>
            <span v-if="orphanDispatchNodes.length" class="orphan-warning" data-testid="orphan-warning">{{ t('route.orphanDispatchWarning') }}</span>
            <div v-if="!loading && !loadError && nodes.length === 0" class="canvas-empty" data-testid="canvas-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <path d="M10 6.5h5.5a1.5 1.5 0 0 1 1.5 1.5v5" stroke-linecap="round" />
                <path d="M9.5 17.5H7a1.5 1.5 0 0 1-1.5-1.5V10" stroke-linecap="round" stroke-dasharray="2 2" />
              </svg>
              <p>画布为空：从左侧拖入「分发路由 / 后置路由 / 插件节点」开始编排</p>
            </div>
            <VueFlow
              v-model:nodes="nodes"
              v-model:edges="edges"
              @nodes-change="onNodesChange"
              @edges-change="onEdgesChange"
              @node-click="onNodeClick"
              @edge-click="onEdgeClick"
              @pane-click="onPaneClick"
              @connect="onConnect"
              fit-view-on-init
            >
              <Background pattern-color="#aaa" :gap="16" />
              <Controls />
              <MiniMap />
            </VueFlow>
          </div>
          <div class="property-panel" data-testid="property-panel">
            <div class="panel-title">{{ t('route.propTitle') }}</div>
            <div v-if="!selectedNode && !selectedEdge" class="prop-empty" data-testid="prop-no-selection">
              {{ t('route.propNoSelection') }}
            </div>
            <div v-else-if="selectedEdge" class="prop-content" data-testid="edge-panel-content">
              <template v-if="ensureEdgeData(selectedEdge)">
              <div class="prop-field">
                <label class="cond-type-label">
                  <span>{{ t('route.edgeCondType') }}</span>
                  <FcTooltip v-if="selectedEdge.data.condition_type === 'WEIGHT'" :content="t('route.condWeightTip')">
                    <span class="cond-type-help" data-testid="edge-weight-tip">?</span>
                  </FcTooltip>
                </label>
                <FcSelect
                  v-model="selectedEdge.data.condition_type"
                  data-testid="edge-cond-type"
                  :options="condTypeOptions"
                  @change="onEdgeCondTypeChange"
                />
              </div>
              <!-- P2-4：WEIGHT 权重边 → 条件值区切换为 1~100 数字输入（写入 condition_key，value 留空） -->
              <div v-if="selectedEdge.data.condition_type === 'WEIGHT'" class="prop-field">
                <label>{{ t('route.edgeWeight') }}</label>
                <el-input-number
                  :model-value="parseWeight(selectedEdge.data.condition_key)"
                  :min="1"
                  :max="100"
                  :step="1"
                  step-strictly
                  data-testid="edge-cond-weight"
                  @update:model-value="(v: number | undefined) => updateEdgeWeight(v)"
                />
              </div>
              <div v-else class="prop-field">
                <label>{{ t('route.edgeCondValue') }}</label>
                <FcInput v-model="selectedEdge.data.condition_value" data-testid="edge-cond-value" maxlength="500" @input="markDirty" />
              </div>
              <div class="prop-field">
                <label>{{ t('route.edgePriority') }}</label>
                <el-input-number v-model="selectedEdge.data.priority" data-testid="edge-priority" :min="1" :max="999" @change="markDirty" />
              </div>
              <div class="prop-actions">
                <FcButton variant="danger" size="sm" @click="deleteSelectedEdge">{{ t('common.delete') }}</FcButton>
              </div>
              </template>
            </div>
            <div v-else class="prop-content" data-testid="prop-panel-content">
              <div class="prop-field">
                <label>{{ t('route.propType') }}</label>
                <span data-testid="prop-type">{{ selectedNode.type }}</span>
              </div>
              <div class="prop-field">
                <label>{{ t('route.propLabel') }}</label>
                <FcInput v-model="selectedNode.data.label" data-testid="prop-label" maxlength="50" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'BACKEND'" class="prop-field">
                <label>{{ t('route.propUpstream') }}</label>
                <FcInput v-model="selectedNode.data.upstream_url" data-testid="prop-upstream" maxlength="500" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'DISPATCH'" class="prop-field">
                <label>{{ t('route.propPath') }}</label>
                <FcInput v-model="selectedNode.data.path" data-testid="prop-path" maxlength="500" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'PLUGIN'" class="prop-field">
                <label>{{ t('route.propConfig') }}</label>
                <FcInput v-model="selectedNode.data.config" data-testid="prop-config" type="textarea" maxlength="10000" @input="markDirty" />
              </div>
              <div class="prop-actions">
                <FcButton variant="danger" size="sm" @click="deleteSelectedNode">{{ t('common.delete') }}</FcButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </FcTabsPanel>

    <FcDialog
      v-model:open="applyOpen"
      :title="t('route.canvasApplyTitle')"
      width="680"
      :close-on-click-modal="false"
    >
      <div v-if="applyDiff" class="apply-diff" data-testid="apply-diff">
        <p class="diff-conditions" data-testid="apply-conditions-changes">
          {{ t('route.canvasApplyConditionsChanges') }}：{{ applyDiff.conditions_changes ?? 0 }}
        </p>

        <!-- H7b T2：画布 apply 变更说明（可选 —— diff 流已天然留痕，仅在填写时随 payload 携带） -->
        <div class="diff-group apply-desc" data-testid="apply-desc-block">
          <div class="diff-group-title">{{ t('env.changeDescLabel') }}（{{ t('common.optional') }}）</div>
          <FcInput
            v-model="applyChangeDesc"
            type="textarea"
            :rows="2"
            :maxlength="200"
            show-word-limit
            :placeholder="t('env.changeDescPlaceholder')"
            data-testid="apply-desc-input"
          />
        </div>

        <div class="diff-group" data-testid="apply-group-create">
          <div class="diff-group-title">{{ t('route.canvasApplyGroupCreate') }}（{{ applyDiff.to_create?.length || 0 }}）</div>
          <FcTable v-if="applyDiff.to_create?.length" :data="(applyDiff.to_create as any)" stripe>
            <el-table-column prop="label" :label="t('route.canvasApplyNodeLabel')" />
            <el-table-column prop="path" :label="t('route.path')" />
            <el-table-column prop="upstream_url" :label="t('route.upstream')" />
          </FcTable>
          <p v-else class="diff-empty">{{ t('common.empty') }}</p>
        </div>

        <div class="diff-group" data-testid="apply-group-update">
          <div class="diff-group-title">{{ t('route.canvasApplyGroupUpdate') }}（{{ applyDiff.to_update?.length || 0 }}）</div>
          <FcTable v-if="applyDiff.to_update?.length" :data="updateRows as any" stripe>
            <el-table-column prop="id" label="ID" width="140" />
            <el-table-column prop="fields" :label="t('route.canvasApplyChangeFields')" width="180" />
            <el-table-column prop="detail" :label="t('route.canvasApplyChangeDetail')" />
          </FcTable>
          <p v-else class="diff-empty">{{ t('common.empty') }}</p>
        </div>

        <div class="diff-group" data-testid="apply-group-delete">
          <div class="diff-group-title">{{ t('route.canvasApplyGroupDelete') }}（{{ applyDiff.to_delete?.length || 0 }}）</div>
          <p class="diff-tip">{{ t('route.canvasApplyDeleteTip') }}</p>
          <FcTable v-if="applyDiff.to_delete?.length" :data="applyDeleteRows as any" stripe>
            <el-table-column width="48">
              <template #default="{ row }">
                <el-checkbox v-model="row._checked" :data-testid="`apply-delete-check-${row.id}`" />
              </template>
            </el-table-column>
            <el-table-column prop="id" label="ID" width="140" />
            <el-table-column prop="name" :label="t('route.canvasApplyRouteName')" />
          </FcTable>
          <p v-else class="diff-empty">{{ t('common.empty') }}</p>
        </div>
      </div>
      <template #footer>
        <FcButton variant="secondary" @click="applyOpen = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="applyingConfirm" data-testid="apply-confirm" @click="confirmApply">{{ t('route.canvasApplyConfirm') }}</FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import {
  FcButton, FcTabsPanel, FcSwitch, FcInput, FcSelect, FcDialog, FcTable, PublishSyncStatus, toast
} from '@/components'
import { useRoute } from 'vue-router'
import { getCanvas, saveCanvas, getRoute, applyCanvas } from '@/api/routes'
import type { CanvasApplyDiff } from '@/api/routes'
import { parseWeight } from '@/utils/weight'

const { t } = useI18n()
const { confirm: fcConfirm } = useFcConfirm()
const { canEdit } = usePermission()
const route = useRoute()
const routeId = computed(() => route.params.id as string)
const tab = ref('canvas')
const tabs = computed(() => [{ value: 'canvas', label: t('route.canvasTabCanvas') }])
const loading = ref(true)
const saving = ref(false)
const saveError = ref('')
const loadError = ref('')
const autoSaveResult = ref('')
const nodeLimitError = ref('')
const routePath = ref('')

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const selectedNode = ref<any>(null)
const selectedEdge = ref<any>(null)
const condTypeOptions = computed(() => [
  { value: 'HEADER', label: t('route.condTypeHeader') },
  { value: 'PATH', label: t('route.condTypePath') },
  { value: 'QUERY', label: t('route.condTypeQuery') },
  { value: 'BODY', label: t('route.condTypeBody') },
  { value: 'GROOVY', label: t('route.condTypeGroovy') },
  // P2-4：权重分流（同优先级候选按权重比例分流，不是请求谓词）
  { value: 'WEIGHT', label: t('route.condTypeWeight') }
])

/** 权重数字输入写回：契约 condition_key=数字字符串、condition_value 留空 */
function updateEdgeWeight(v: number | undefined) {
  const edge = selectedEdge.value
  if (!edge?.data) return
  if (v === undefined || v === null || Number.isNaN(v)) {
    edge.data.condition_key = ''
  } else {
    edge.data.condition_key = String(Math.min(100, Math.max(1, Math.round(v))))
  }
  edge.data.condition_value = ''
  markDirty()
}

/** 边条件类型切换：进 WEIGHT 时把既有数值型 condition_value 迁到 condition_key 并清空 value */
function onEdgeCondTypeChange() {
  const edge = selectedEdge.value
  if (!edge?.data) return
  if (edge.data.condition_type === 'WEIGHT') {
    if (parseWeight(edge.data.condition_key) === null) {
      edge.data.condition_key = /^\d+$/.test(String(edge.data.condition_value ?? '').trim())
        ? String(edge.data.condition_value).trim()
        : ''
    }
    edge.data.condition_value = ''
  }
  markDirty()
}

const connectionError = ref('')

const orphanDispatchNodes = computed(() => {
  const sourcesWithEdges = new Set(edges.value.map(e => e.source))
  return nodes.value.filter(n => n.type === 'DISPATCH' && !sourcesWithEdges.has(n.id))
})

const MAX_DISPATCH_DEPTH = 5

const maxDispatchDepth = computed(() => {
  const dispatchIds = new Set(nodes.value.filter(n => n.type === 'DISPATCH').map(n => n.id))
  if (dispatchIds.size === 0) return 0
  const adj = new Map<string, string[]>()
  for (const id of dispatchIds) adj.set(id, [])
  for (const e of edges.value) {
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
})

function validateConnection({ sourceNode, targetNode }: { sourceNode: any; targetNode: any }): boolean {
  if (sourceNode.id && sourceNode.id === targetNode.id) {
    connectionError.value = t('route.selfLoopNotAllowed')
    return false
  }
  if (sourceNode.type === 'BACKEND') {
    connectionError.value = t('route.backendNoOutgoing')
    return false
  }
  connectionError.value = ''
  return true
}

function onConnect({ source, target }: { source: string; target: string }) {
  const sourceNode = nodes.value.find(n => n.id === source)
  const targetNode = nodes.value.find(n => n.id === target)
  if (!sourceNode || !targetNode) return
  if (!validateConnection({ sourceNode, targetNode })) return
  const id = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  edges.value = [...edges.value, { id, source, target, data: { condition_type: 'PATH', condition_value: '', priority: 1 } }]
  pushHistory()
  markDirty()
}

// Component panel
const panelCollapsed = ref(false)
const nodeTypes = computed(() => [
  { type: 'DISPATCH', label: t('route.dispatchNode'), iconClass: 'icon-dispatch' },
  { type: 'BACKEND', label: t('route.backendNode'), iconClass: 'icon-backend' },
  { type: 'PLUGIN', label: t('route.pluginNode'), iconClass: 'icon-plugin' }
])

const MAX_NODES = 200

watch(() => nodes.value.length, (len) => {
  if (len < MAX_NODES && nodeLimitError.value) nodeLimitError.value = ''
})

function onDragStart(event: DragEvent, nodeType: string) {
  event.dataTransfer?.setData('nodeType', nodeType)
}

function onDragOver(event: DragEvent) {
  const types = event.dataTransfer?.types
  if (types && (Array.from(types).includes('nodeType') || (types as any).contains?.('nodeType'))) {
    event.preventDefault()
  }
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('nodeType')
  if (!nodeType) return
  if (nodes.value.length >= MAX_NODES) {
    nodeLimitError.value = t('route.nodeLimit')
    return
  }
  nodeLimitError.value = ''
  const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const shell = (event.currentTarget as HTMLElement)
  const rect = shell?.getBoundingClientRect()
  const x = rect ? event.clientX - rect.left : (event.clientX ?? 100)
  const y = rect ? event.clientY - rect.top : (event.clientY ?? 100)
  nodes.value = [...nodes.value, { id, type: nodeType, position: { x, y }, data: { label: nodeType } }]
  pushHistory()
  markDirty()
}

// Undo/Redo
const MAX_HISTORY = 50
const history = ref<string[]>([])
const historyIndex = ref(-1)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

function snapshot() {
  return JSON.stringify({ nodes: nodes.value, edges: edges.value })
}

function pushHistory(currentState?: { nodes: any[]; edges: any[] }) {
  const snap = currentState ? JSON.stringify(currentState) : snapshot()
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
  markDirty()
}

function redo() {
  if (!canRedo.value) return
  historyIndex.value++
  const state = JSON.parse(history.value[historyIndex.value])
  nodes.value = state.nodes
  edges.value = state.edges
  selectedNode.value = null
  markDirty()
}

// Auto-save
const autoSave = ref(true)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false
let dirtyTracking = false

function markDirty() {
  if (!dirtyTracking) return
  dirty = true
  if (!autoSave.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(doAutoSave, 3000)
}

async function doAutoSave() {
  if (!canEdit('route')) return
  if (!dirty) return
  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await saveCanvas(routeId.value, { nodes: nodes.value, edges: edges.value })
      dirty = false
      autoSaveResult.value = t('route.canvasAutoSaved')
      setTimeout(() => { autoSaveResult.value = '' }, 2000)
      return
    } catch {
      if (attempt < MAX_RETRIES) {
        autoSaveResult.value = t('route.canvasAutoSaveRetrying')
      }
    }
  }
  dirty = true
  autoSaveResult.value = t('route.canvasAutoSaveFailed')
}

function onNodesChange() {
  pushHistory()
  markDirty()
}

function onEdgesChange() {
  pushHistory()
  markDirty()
}

function onNodeClick({ node }: any) {
  if (!node.data) node.data = {}
  selectedNode.value = node
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

function ensureEdgeData(edge: any) {
  if (!edge.data) edge.data = { condition_type: 'PATH', condition_value: '', priority: 1 }
  return true
}

function deleteSelectedEdge() {
  if (!selectedEdge.value) return
  const id = selectedEdge.value.id
  edges.value = edges.value.filter(e => e.id !== id)
  selectedEdge.value = null
  pushHistory()
  markDirty()
}

function deleteSelectedNode() {
  if (!selectedNode.value) return
  const id = selectedNode.value.id
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  selectedNode.value = null
  pushHistory()
  markDirty()
}

let loadEpoch = 0

// D19: canvas_data arrives either as an object ({nodes, edges}) or as a raw
// JSON string (entity column). Parse defensively; unparsable data loads as an
// empty canvas (with a visible hint) instead of throwing.
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

async function load() {
  const myEpoch = ++loadEpoch
  dirtyTracking = false
  loading.value = true
  loadError.value = ''
  try {
    const [r, routeDetail] = await Promise.all([
      getCanvas(routeId.value),
      getRoute(routeId.value).catch(() => null)
    ])
    if (myEpoch !== loadEpoch) return
    const raw = (r as any)?.canvas_data
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
        loadError.value = '画布数据解析失败，已按空画布加载'
      }
    }
    routePath.value = (routeDetail as any)?.path || ''
    pushHistory()
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    nodes.value = []
    edges.value = []
    routePath.value = ''
    loadError.value = e?.message || t('common.loadFailed')
  } finally {
    if (myEpoch === loadEpoch) {
      loading.value = false
      dirty = false
      dirtyTracking = true
    }
  }
}

async function save() {
  if (!canEdit('route')) return
  if (loading.value) return
  if (saving.value) return
  if (orphanDispatchNodes.value.length > 0) {
    saveError.value = t('route.dispatchNeedsEdge')
    return
  }
  if (maxDispatchDepth.value > MAX_DISPATCH_DEPTH) {
    saveError.value = t('route.dispatchNestingExceeded')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    await saveCanvas(routeId.value, { nodes: nodes.value, edges: edges.value })
    toast.success(t('route.saveSuccess'))
    dirty = false
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  } catch (e: any) {
    saveError.value = e?.message || t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

// ===== 应用到路由树：dry_run 预览 diff → 用户确认（含删除勾选）→ 正式应用 =====
const applying = ref(false)
const applyOpen = ref(false)
const applyDiff = ref<CanvasApplyDiff | null>(null)
const applyDeleteRows = ref<Array<{ id: string; name: string; _checked: boolean }>>([])
const applyingConfirm = ref(false)
// H7b T2：画布 apply 变更说明（可选，画布走 diff 流已天然留痕；仅在填写时随 payload 携带）
const applyChangeDesc = ref('')
// P1-3: 应用画布成功后轮询配置同步状态（发布生效确认）
const syncStatusRef = ref<InstanceType<typeof PublishSyncStatus> | null>(null)

const deleteCheckedIds = computed(() => applyDeleteRows.value.filter(r => r._checked).map(r => r.id))

function isEmptyDiff(d: CanvasApplyDiff | null): boolean {
  if (!d) return true
  return !(d.to_create?.length) && !(d.to_update?.length) && !(d.to_delete?.length)
}

function formatChangeValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('from' in o || 'to' in o) return `${formatChangeValue(o.from)} → ${formatChangeValue(o.to)}`
    return JSON.stringify(v)
  }
  return String(v)
}

const updateRows = computed(() =>
  (applyDiff.value?.to_update || []).map(u => {
    const changes = (u.changes || {}) as Record<string, unknown>
    return {
      id: u.id,
      fields: Object.keys(changes).join(', '),
      detail: Object.entries(changes).map(([k, v]) => `${k}: ${formatChangeValue(v)}`).join('；')
    }
  })
)

async function applyToTree() {
  if (!canEdit('route')) return
  if (loading.value) return
  if (applying.value) return
  if (orphanDispatchNodes.value.length > 0) {
    saveError.value = t('route.dispatchNeedsEdge')
    return
  }
  if (maxDispatchDepth.value > MAX_DISPATCH_DEPTH) {
    saveError.value = t('route.dispatchNestingExceeded')
    return
  }
  applying.value = true
  saveError.value = ''
  try {
    const diff = await applyCanvas(routeId.value, {
      nodes: nodes.value,
      edges: edges.value,
      dry_run: true
    })
    if (isEmptyDiff(diff)) {
      toast.info(t('route.canvasApplyNoDiff'))
      return
    }
    applyDiff.value = diff
    // 建议删除默认不勾选，需用户逐条确认
    applyDeleteRows.value = (diff.to_delete || []).map(d => ({ ...d, _checked: false }))
    // 每次打开预览都清空上次的变更说明输入
    applyChangeDesc.value = ''
    applyOpen.value = true
  } catch (e: any) {
    saveError.value = e?.message || t('common.saveFailed')
  } finally {
    applying.value = false
  }
}

async function confirmApply() {
  if (!canEdit('route')) return
  if (!applyDiff.value) return
  if (applyingConfirm.value) return
  applyingConfirm.value = true
  saveError.value = ''
  try {
    // H7b T2：变更说明选填 —— 仅在填写时携带 change_description（payload 保持最小形状）
    const desc = applyChangeDesc.value.trim()
    await applyCanvas(routeId.value, {
      nodes: nodes.value,
      edges: edges.value,
      dry_run: false,
      confirm_delete_ids: deleteCheckedIds.value,
      ...(desc ? { change_description: desc } : {})
    })
    applyOpen.value = false
    toast.success(t('route.canvasApplySuccess'))
    toast.success(t('route.canvasApplyPublishHint'))
    // P1-3: 落库成功后轮询 sync-status，确认网关已加载新配置（「已生效」）
    syncStatusRef.value?.start()
    applyDiff.value = null
    applyDeleteRows.value = []
    applyChangeDesc.value = ''
  } catch (e: any) {
    saveError.value = e?.message || t('common.saveFailed')
  } finally {
    applyingConfirm.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault()
    redo()
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})

watch(() => routeId.value, () => {
  load()
})

onUnmounted(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  window.removeEventListener('keydown', onKeydown)
})

onBeforeRouteLeave(async () => {
  if (dirty && !saving.value) {
    if (!await fcConfirm({ title: t('common.unsavedChanges'), variant: 'danger' })) return false
  }
})
</script>

<style scoped>
.canvas-page { display: flex; flex-direction: column; height: calc(100vh - 200px); }
.canvas-toolbar { display: flex; gap: 8px; align-items: center; padding: 8px 0; flex-wrap: wrap; }
.canvas-toolbar .save-error {
  color: var(--app-danger);
  font-size: 13px;
  margin-left: auto;
}
.auto-save-label { font-size: 13px; color: var(--app-text-secondary); }
.auto-save-hint { font-size: 12px; color: var(--app-text-secondary); margin-left: 8px; }
.path-preview { font-size: 12px; color: var(--app-text-secondary); margin-left: auto; font-family: monospace; }
.canvas-body { display: flex; flex: 1; min-height: 0; gap: 0; }
.component-panel {
  width: 180px;
  min-width: 180px;
  border-right: 1px solid var(--app-border);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  transition: width 0.2s, min-width 0.2s, padding 0.2s;
}
.component-panel.collapsed {
  width: 24px;
  min-width: 24px;
  padding: 4px;
}
.panel-toggle {
  position: absolute;
  top: 8px;
  right: -12px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-bg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  z-index: 1;
}
.panel-title { font-size: 13px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 4px; }
.cond-type-label { display: inline-flex; align-items: center; gap: 5px; }
.cond-type-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  font-size: 10px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  cursor: help;
}
.node-type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius-button);
  cursor: grab;
  font-size: 13px;
  user-select: none;
  transition: border-color 0.15s, background 0.15s;
}
.node-type-item:hover { border-color: var(--app-primary); background: color-mix(in srgb, var(--app-primary) 12%, transparent); }
.node-icon { width: 20px; height: 20px; border-radius: var(--app-radius-sm); display: inline-block; }
.icon-dispatch { background: var(--app-primary); }
.icon-backend { background: var(--app-success); }
.icon-plugin { background: var(--app-warning); }
.node-label { font-size: 13px; }
.canvas-shell { flex: 1; min-height: 600px; border: 1px solid var(--app-border); border-radius: var(--app-radius-md); position: relative; }
.canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
  z-index: 5;
  color: var(--app-text-secondary);
}
.canvas-empty svg { width: 48px; height: 48px; opacity: 0.55; }
.canvas-empty p { margin: 0; font-size: 13px; }
.property-panel {
  width: 240px;
  min-width: 240px;
  border-left: 1px solid var(--app-border);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.prop-empty { font-size: 13px; color: var(--app-text-secondary); text-align: center; padding: 24px 0; }
.prop-content { display: flex; flex-direction: column; gap: 12px; }
.prop-field { display: flex; flex-direction: column; gap: 4px; }
.prop-field label { font-size: 12px; color: var(--app-text-secondary); font-weight: 500; }
.prop-field span { font-size: 13px; }
.prop-actions { margin-top: 8px; }
.node-limit-error {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--app-danger);
  color: var(--app-text-inverse);
  padding: 4px 12px;
  border-radius: var(--app-radius-sm);
  font-size: 12px;
  z-index: 10;
}
.connection-error {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--app-warning);
  color: var(--app-text-inverse);
  padding: 4px 12px;
  border-radius: var(--app-radius-sm);
  font-size: 12px;
  z-index: 10;
}
.orphan-warning {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--app-warning);
  color: var(--app-text-inverse);
  padding: 4px 12px;
  border-radius: var(--app-radius-sm);
  font-size: 12px;
  z-index: 10;
}
.apply-diff { display: flex; flex-direction: column; gap: 16px; }
.diff-conditions { margin: 0; font-size: 13px; color: var(--app-text-secondary); }
.diff-group-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--app-text-primary); }
/* H7b T2：画布 apply 变更说明（可选填） */
.apply-desc { margin-bottom: 4px; }
.diff-tip { margin: 0 0 6px; font-size: 12px; color: var(--app-warning); }
.diff-empty { margin: 0; font-size: 12px; color: var(--app-text-secondary); }
</style>
