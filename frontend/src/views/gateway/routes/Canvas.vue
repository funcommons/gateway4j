<template>
  <div class="app-page canvas-page">
    <FcTabsPanel v-model="tab" :tabs="tabs">
      <template #tab-canvas>
        <div class="canvas-toolbar">
          <FcButton v-if="canEdit('route')" variant="primary" :loading="saving" @click="save">{{ t('gateway.route.canvasSave') }}</FcButton>
          <FcButton variant="secondary" :disabled="!canUndo" @click="undo">{{ t('gateway.route.canvasUndo') }}</FcButton>
          <FcButton variant="secondary" :disabled="!canRedo" @click="redo">{{ t('gateway.route.canvasRedo') }}</FcButton>
          <FcSwitch v-model="autoSave" />
          <label class="auto-save-label">{{ t('gateway.route.canvasAutoSave') }}</label>
          <span v-if="loadError" class="save-error" data-testid="load-error">{{ loadError }}</span>
          <span v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</span>
          <span v-if="autoSaveResult" class="auto-save-hint">{{ autoSaveResult }}</span>
          <span class="path-preview" data-testid="path-preview">
            {{ t('gateway.route.pathPreview') }}: {{ routePath || t('gateway.route.noPath') }}
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
              <div class="panel-title" data-testid="panel-title">{{ t('gateway.route.panelTitle') }}</div>
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
            <span v-if="orphanDispatchNodes.length" class="orphan-warning" data-testid="orphan-warning">{{ t('gateway.route.orphanDispatchWarning') }}</span>
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
            <div class="panel-title">{{ t('gateway.route.propTitle') }}</div>
            <div v-if="!selectedNode && !selectedEdge" class="prop-empty" data-testid="prop-no-selection">
              {{ t('gateway.route.propNoSelection') }}
            </div>
            <div v-else-if="selectedEdge" class="prop-content" data-testid="edge-panel-content">
              <template v-if="ensureEdgeData(selectedEdge)">
              <div class="prop-field">
                <label>{{ t('gateway.route.edgeCondType') }}</label>
                <FcSelect
                  v-model="selectedEdge.data.condition_type"
                  data-testid="edge-cond-type"
                  :options="condTypeOptions"
                  @change="markDirty"
                />
              </div>
              <div class="prop-field">
                <label>{{ t('gateway.route.edgeCondValue') }}</label>
                <FcInput v-model="selectedEdge.data.condition_value" data-testid="edge-cond-value" maxlength="500" @input="markDirty" />
              </div>
              <div class="prop-field">
                <label>{{ t('gateway.route.edgePriority') }}</label>
                <el-input-number v-model="selectedEdge.data.priority" data-testid="edge-priority" :min="1" :max="999" @change="markDirty" />
              </div>
              <div class="prop-actions">
                <FcButton variant="danger" size="sm" @click="deleteSelectedEdge">{{ t('gateway.common.delete') }}</FcButton>
              </div>
              </template>
            </div>
            <div v-else class="prop-content" data-testid="prop-panel-content">
              <div class="prop-field">
                <label>{{ t('gateway.route.propType') }}</label>
                <span data-testid="prop-type">{{ selectedNode.type }}</span>
              </div>
              <div class="prop-field">
                <label>{{ t('gateway.route.propLabel') }}</label>
                <FcInput v-model="selectedNode.data.label" data-testid="prop-label" maxlength="50" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'BACKEND'" class="prop-field">
                <label>{{ t('gateway.route.propUpstream') }}</label>
                <FcInput v-model="selectedNode.data.upstream_url" data-testid="prop-upstream" maxlength="500" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'DISPATCH'" class="prop-field">
                <label>{{ t('gateway.route.propPath') }}</label>
                <FcInput v-model="selectedNode.data.path" data-testid="prop-path" maxlength="500" @input="markDirty" />
              </div>
              <div v-if="selectedNode.type === 'PLUGIN'" class="prop-field">
                <label>{{ t('gateway.route.propConfig') }}</label>
                <FcInput v-model="selectedNode.data.config" data-testid="prop-config" type="textarea" maxlength="10000" @input="markDirty" />
              </div>
              <div class="prop-actions">
                <FcButton variant="danger" size="sm" @click="deleteSelectedNode">{{ t('gateway.common.delete') }}</FcButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </FcTabsPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
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

import { FcButton, FcTabsPanel, FcSwitch, FcInput, FcSelect } from '@/components/sdk'
import { useRoute } from 'vue-router'
import { getCanvas, saveCanvas, getRoute } from '@/api/gateway/routes'

const { t } = useI18n()
const { confirm: fcConfirm } = useFcConfirm()
const { canEdit } = usePermission()
const route = useRoute()
const routeId = computed(() => route.params.id as string)
const tab = ref('canvas')
const tabs = computed(() => [{ value: 'canvas', label: t('gateway.route.canvasTabCanvas') }])
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
  { value: 'HEADER', label: t('gateway.route.condTypeHeader') },
  { value: 'PATH', label: t('gateway.route.condTypePath') },
  { value: 'QUERY', label: t('gateway.route.condTypeQuery') },
  { value: 'BODY', label: t('gateway.route.condTypeBody') },
  { value: 'GROOVY', label: t('gateway.route.condTypeGroovy') }
])

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
    connectionError.value = t('gateway.route.selfLoopNotAllowed')
    return false
  }
  if (sourceNode.type === 'BACKEND') {
    connectionError.value = t('gateway.route.backendNoOutgoing')
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
  { type: 'DISPATCH', label: t('gateway.route.dispatchNode'), iconClass: 'icon-dispatch' },
  { type: 'BACKEND', label: t('gateway.route.backendNode'), iconClass: 'icon-backend' },
  { type: 'PLUGIN', label: t('gateway.route.pluginNode'), iconClass: 'icon-plugin' }
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
    nodeLimitError.value = t('gateway.route.nodeLimit')
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
      autoSaveResult.value = t('gateway.route.canvasAutoSaved')
      setTimeout(() => { autoSaveResult.value = '' }, 2000)
      return
    } catch {
      if (attempt < MAX_RETRIES) {
        autoSaveResult.value = t('gateway.route.canvasAutoSaveRetrying')
      }
    }
  }
  dirty = true
  autoSaveResult.value = t('gateway.route.canvasAutoSaveFailed')
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
    const data = (r as any).canvas_data || {}
    nodes.value = Array.isArray(data.nodes) ? data.nodes : []
    edges.value = Array.isArray(data.edges) ? data.edges : []
    routePath.value = (routeDetail as any)?.path || ''
    pushHistory()
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    nodes.value = []
    edges.value = []
    routePath.value = ''
    loadError.value = e?.message || t('gateway.common.loadFailed')
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
    saveError.value = t('gateway.route.dispatchNeedsEdge')
    return
  }
  if (maxDispatchDepth.value > MAX_DISPATCH_DEPTH) {
    saveError.value = t('gateway.route.dispatchNestingExceeded')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    await saveCanvas(routeId.value, { nodes: nodes.value, edges: edges.value })
    ElMessage.success(t('gateway.route.saveSuccess'))
    dirty = false
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  } catch (e: any) {
    saveError.value = e?.message || t('gateway.common.saveFailed')
  } finally {
    saving.value = false
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
    if (!await fcConfirm({ title: t('gateway.common.unsavedChanges'), variant: 'danger' })) return false
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
.node-type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--app-border);
  border-radius: 6px;
  cursor: grab;
  font-size: 13px;
  user-select: none;
  transition: border-color 0.15s, background 0.15s;
}
.node-type-item:hover { border-color: var(--app-primary); background: var(--app-primary-light, #f0f5ff); }
.node-icon { width: 20px; height: 20px; border-radius: 4px; display: inline-block; }
.icon-dispatch { background: #409eff; }
.icon-backend { background: #67c23a; }
.icon-plugin { background: #e6a23c; }
.node-label { font-size: 13px; }
.canvas-shell { flex: 1; min-height: 600px; border: 1px solid var(--app-border); border-radius: 8px; position: relative; }
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
  background: var(--app-danger, #f56c6c);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
}
.connection-error {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--app-warning, #e6a23c);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
}
.orphan-warning {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--app-warning, #e6a23c);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
}
</style>
