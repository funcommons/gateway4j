<template>
  <div class="v2-canvas" data-testid="cnv-canvas-root">
    <FcSection>
      <!-- Page head: back to /v2/routes (fixes the v2 List act-canvas dead link, ruling 6) + title + read-only badge -->
      <div class="cnv-head">
        <FcButton
          class="cnv-back"
          variant="text"
          size="sm"
          circle
          data-testid="cnv-back"
          :aria-label="t('v2.canvas.back')"
          @click="router.push('/v2/routes')"
        >
          <FcIcon name="ri-arrow-left-s-line" :size="16" />
        </FcButton>
        <div class="cnv-head-main">
          <h1>{{ t('v2.canvas.title') }}</h1>
        </div>
        <span v-if="!canEditRoute" class="cnv-readonly" data-testid="cnv-readonly">
          <FcIcon name="ri-lock-line" :size="12" />
          {{ t('v2.canvas.readonly') }}
        </span>
      </div>

      <!-- Load / parse failure: i18n text only (never the raw error message) + retry re-sending getCanvas -->
      <div v-if="loadError" class="hint-banner is-error" data-testid="cnv-load-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ loadErrorText }}</span>
        <FcButton class="cnv-retry" variant="secondary" size="sm" data-testid="cnv-retry" @click="load">
          <FcIcon name="ri-refresh-line" :size="13" />
          {{ t('v2.canvas.retry') }}
        </FcButton>
      </div>

      <!-- Toolbar: undo / redo / delete (read-only = disabled) + validation chips.
           Pass / orphan / depth are mutually exclusive; limit and connection errors sit beside them. -->
      <div class="cnv-toolbar" data-testid="cnv-toolbar">
        <FcButton
          variant="secondary"
          size="sm"
          data-testid="cnv-undo"
          :title="t('v2.canvas.keyboardHint')"
          :disabled="!canEditRoute || !canUndo"
          @click="undo"
        >
          {{ t('v2.canvas.undo') }}
        </FcButton>
        <FcButton
          variant="secondary"
          size="sm"
          data-testid="cnv-redo"
          :title="t('v2.canvas.keyboardHint')"
          :disabled="!canEditRoute || !canRedo"
          @click="redo"
        >
          {{ t('v2.canvas.redo') }}
        </FcButton>
        <!-- Delete host: the click surface is a span (never a BUTTON tag), so a click fired
             right after a programmatic selection still reaches the handler while the inner
             button's disabled state has not been re-patched yet. The FcButton keeps the real
             disabled semantics (visual + keyboard gating); both entries are idempotent. -->
        <span
          class="cnv-delete-host"
          data-testid="cnv-delete"
          :disabled="!canEditRoute || !selectedNode"
          @click="onDeleteClick"
        >
          <FcButton variant="danger" size="sm" :disabled="!canEditRoute || !selectedNode" @click="onDeleteClick">
            {{ t('v2.canvas.delete') }}
          </FcButton>
        </span>
        <!-- S12③: view/edit helpers — autolayout (graph change, read-only disabled),
             fit view + node search (pure-view aids, kept in read-only) -->
        <FcButton
          variant="secondary"
          size="sm"
          data-testid="cnv-autolayout"
          :disabled="!canEditRoute"
          :title="t('v2.canvas.autolayout')"
          @click="onAutolayout"
        >
          {{ t('v2.canvas.autolayout') }}
        </FcButton>
        <FcButton
          variant="secondary"
          size="sm"
          data-testid="cnv-fitview"
          :title="t('v2.canvas.fitView')"
          @click="onFitView"
        >
          {{ t('v2.canvas.fitView') }}
        </FcButton>
        <FcInput
          v-model="nodeSearch"
          class="cnv-search"
          data-testid="cnv-node-search"
          size="small"
          :placeholder="t('v2.canvas.searchPlaceholder')"
          clearable
        />
        <!-- S9b: apply-to-route-tree entry; guards (orphan / depth) run before the dialog opens -->
        <FcButton
          v-if="canEditRoute"
          variant="primary"
          size="sm"
          data-testid="cnv-apply"
          @click="onApplyClick"
        >
          {{ t('v2.canvas.applyTitle') }}
        </FcButton>
        <span class="cnv-chips">
          <span v-if="limitHit" class="cnv-chip is-warn" data-testid="cnv-limit-chip">{{ t('v2.canvas.limitWarn') }}</span>
          <span v-if="connectionError" class="cnv-chip is-warn" data-testid="cnv-conn-error">{{ connErrorText }}</span>
          <span v-if="orphanCount > 0" class="cnv-chip is-warn" data-testid="cnv-orphan-chip">{{ t('v2.canvas.orphanWarn') }}</span>
          <span v-else-if="maxDepth > MAX_DISPATCH_DEPTH" class="cnv-chip is-warn" data-testid="cnv-depth-chip">{{ t('v2.canvas.depthWarn') }}</span>
          <span v-else class="cnv-chip is-ok" data-testid="cnv-check-chip">{{ t('v2.canvas.checkPass') }}</span>
        </span>
      </div>

      <div class="cnv-body">
        <!-- Palette: click-to-add is the drag-free equivalent entry (ruling 4); hidden entirely in read-only -->
        <aside v-if="canEditRoute" class="cnv-palette" data-testid="cnv-node-palette">
          <div class="cnv-palette-title">{{ t('v2.canvas.paletteTitle') }}</div>
          <button
            v-for="pt in palette"
            :key="pt.type"
            type="button"
            class="cnv-palette-item"
            :data-testid="`cnv-add-${pt.id}`"
            :aria-label="t('v2.canvas.addNodeAria', { type: pt.label })"
            @click="addNodeType(pt.type)"
          >
            <FcIcon :name="pt.icon" :size="12" />
            {{ pt.label }}
          </button>
          <p class="cnv-palette-hint">{{ t('v2.canvas.paletteHint') }}</p>
        </aside>

        <div class="cnv-main">
          <!-- Horizontal-scroll shell: 375 viewports scroll inside the container, the page body stays put -->
          <div class="cnv-scroll" data-testid="cnv-scroll">
            <div class="cnv-canvas" data-testid="cnv-canvas">
              <VueFlow
                v-model:nodes="nodes"
                v-model:edges="edges"
                fit-view-on-init
                :nodes-connectable="canEditRoute"
                :nodes-draggable="canEditRoute"
                :elements-selectable="true"
                @node-click="onNodeClick"
                @edge-click="onEdgeClick"
                @pane-click="onPaneClick"
                @connect="onConnect"
              >
                <Background pattern-color="var(--app-text-quaternary)" :gap="16" />
                <Controls />
                <!-- OPT-4: production-grade minimap — draggable pan + wheel zoom + per-type
                     token colors + i18n aria (new mini-* testid family; kept in read-only) -->
                <MiniMap
                  data-testid="mini-map"
                  :pannable="true"
                  :zoomable="true"
                  :aria-label="t('v2.canvas.minimapAria')"
                  :node-color="minimapNodeColor"
                  :node-class-name="minimapNodeClass"
                />
              </VueFlow>
              <div v-if="showEmpty" class="cnv-empty" data-testid="cnv-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <path d="M10 6.5h5.5a1.5 1.5 0 0 1 1.5 1.5v5" stroke-linecap="round" />
                  <path d="M9.5 17.5H7a1.5 1.5 0 0 1-1.5-1.5V10" stroke-linecap="round" stroke-dasharray="2 2" />
                </svg>
                <p class="cnv-empty-title">{{ t('v2.canvas.empty') }}</p>
                <p class="cnv-empty-hint">{{ t('v2.canvas.emptyHint') }}</p>
              </div>
            </div>
          </div>
          <!-- S9b: property panel dock (appears only while a node/edge is selected) -->
          <PropertyPanel
            v-if="canEditRoute"
            class="cnv-prop-dock"
            :node="selectedNode"
            :edge="selectedEdge"
            :can-edit="canEditRoute"
            @dirty="touch"
            @delete="onPanelDelete"
            @set-weight="setEdgeWeight"
          />
          <!-- Bottom status bar: counters stay visible in read-only (viewing is never restricted) -->
          <div class="cnv-status" data-testid="cnv-status">
            {{ t('v2.canvas.statusNodes', { n: nodes.length }) }}
            <span class="cnv-status-sep" aria-hidden="true">·</span>
            {{ t('v2.canvas.statusEdges', { n: edges.length }) }}
            <!-- S9b: autosave state chip (idle | dirty | saving | saved | failed) -->
            <span
              v-if="canEditRoute"
              class="cnv-save-chip"
              :class="`is-${saveState}`"
              data-testid="cnv-save-chip"
              :data-state="saveState"
            >
              <span v-if="saveStateTextKey">{{ t(saveStateTextKey) }}</span>
            </span>
          </div>
        </div>
      </div>
    </FcSection>
    <!-- S9b: apply-to-tree dialog stays mounted while editable; entry guards live in onApplyClick -->
    <ApplyDiffDialog
      v-if="canEditRoute"
      ref="applyRef"
      :route-id="routeId"
      :get-snapshot="getSnapshot"
      @applied="onApplied"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { FcButton, FcIcon, FcInput, FcSection, toast } from '@/components'
import { usePermission } from '@/composables/usePermission'
import { getCanvas, getRoute } from '@/api/routes'
import { useCanvasGraph } from './composables/useCanvasGraph'
import { useCanvasAutosave } from './composables/useCanvasAutosave'
import { MAX_DISPATCH_DEPTH, maxDispatchDepth, orphanDispatchNodes } from './composables/useCanvasValidation'
import PropertyPanel from './PropertyPanel.vue'
import ApplyDiffDialog from './ApplyDiffDialog.vue'

/**
 * S9b-C 接线：v2 流程编排画布（原型 04）—— 内核 + 节点库 + 工具栏 + 校验 chips
 * + 属性面板 + 自动保存（3s 防抖 + 3 重试）+ 应用到路由树（dry_run 三段式弹窗）。
 * - 内核/校验在 useCanvasGraph / useCanvasValidation（旧画布五段逻辑随迁）；
 * - 自动保存在 useCanvasAutosave：图变更（增删/连线/undo/redo/权重/面板编辑）→ markDirty；
 *   load 尾部 → markLoaded（旧 dirty=false 语义随迁）；状态 chip idle/dirty/saving/saved/failed；
 * - 应用入口守卫（孤儿分发 / 嵌套深度）通过后才 open() 弹窗；成功 toast 归本层（S9b 范围）；
 * - 只读态（canEdit('route')=false）：可写 UI（节点库/面板/应用入口/保存 chip）全隐，
 *   undo/redo/delete disabled；看图（status/chips/back）不受限；
 * - OPT-4：MiniMap 成品化（pannable/zoomable + 按类型 token 配色 + i18n aria，只读保留）；
 *   非法连线即时 toast（watch connectionError，文案复用 reason 枚举 key，绿路径静默）。
 */
defineOptions({ name: 'V2Canvas' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { canEdit } = usePermission()
const canEditRoute = computed(() => canEdit('route'))
const routeId = computed(() => String(route.params.id ?? ''))

const autosave = useCanvasAutosave({
  routeId,
  getSnapshot
})

function touch() {
  if (!canEditRoute.value) return
  autosave.markDirty()
}

function onGraphLoaded() {
  autosave.markLoaded()
}

const {
  loading, loadError, nodes, edges, selectedNode, selectedEdge,
  connectionError, limitHit, canUndo, canRedo,
  load, addNodeType, deleteSelected, deleteEdge, onConnect, onNodeClick, onPaneClick, onEdgeClick,
  undo, redo, setEdgeWeight, autolayout
} = useCanvasGraph(routeId, {
  loadCanvas: getCanvas,
  loadRoute: getRoute,
  onMutate: touch,
  onLoaded: onGraphLoaded
})

// —— OPT-4：非法连线即时反馈（组件层接线，内核 useCanvasGraph 保持无 i18n / 无 toast）——
// 红：内核把 reason 枚举写入 connectionError 的当场 toast（文案复用既有 v2.canvas.selfLoop /
// backendOutgoing key，零新增），与持久 chip（cnv-conn-error）双通道；绿：内核清错（reason=''
// 不弹）、ghost 端点早退（ref 不动不弹）均静默，防告警噪音。watch 只在新错误落地时触发。
watch(connectionError, (reason) => {
  if (reason) toast.error(t(`v2.canvas.${reason}`))
})

// —— OPT-4：缩略图节点配色（MiniMap node-color 入参，纯函数：同入参同出参）——
// 全 token 色禁字面值；分发=紫系 --app-secondary（P3-e 新增第四色相档：品牌主色被重映射为
// 橙时与 warning 仅差 Δhue 4.2° / 1.11:1 不可分，紫 252° 与 warning 29°/success 134°/
// danger 0° 色相距离 ≥118°）/ 后置=warning / 插件=success；
// 未知 / 缺型回退 = 既有 .vue-flow__minimap-node CSS fill 同款 --app-text-tertiary。
function minimapNodeColor(node: { type?: string }): string {
  if (node?.type === 'DISPATCH') return 'var(--app-secondary)'
  if (node?.type === 'BACKEND') return 'var(--app-color-warning)'
  if (node?.type === 'PLUGIN') return 'var(--app-color-success)'
  return 'var(--app-text-tertiary)'
}

// OPT-4 修复：nodeColor 经包内实现落为 rect 的 fill **attribute**（@vue-flow/minimap dist
// `fill: _ctx.color`），而下方既有 `:deep(.vue-flow__minimap-node)` 作者规则按级联恒压
// presentation attribute（且 var() 不解析于 attribute）——不补类名时 per-type 配色 DOM 层
// 永不生效（三类型仍全灰）。故按 type 附类，配下方高一档特异度 token 规则真实上色；
// nodeColor 契约原样保留（CanvasMinimap.test.ts prop 契约钉死其为函数 + var(--) 返回）。
function minimapNodeClass(node: { type?: string }): string {
  if (node?.type === 'DISPATCH') return 'cnv-mm-dispatch'
  if (node?.type === 'BACKEND') return 'cnv-mm-backend'
  if (node?.type === 'PLUGIN') return 'cnv-mm-plugin'
  return ''
}

// —— S12③：适应画布 / 自动布局（fitView 走 useVueFlow 实例通道，只读保留）——
const { fitView } = useVueFlow()

function onFitView() {
  void fitView()
}

function onAutolayout() {
  if (!canEditRoute.value) return
  autolayout()
}

// —— S12③：检索节点（纯前端：id + data.label 大小写不敏感子串；node.class 通道）——
const NODE_HIT_CLS = 'cnv-node-hit'
const NODE_DIM_CLS = 'cnv-node-dim'
const nodeSearch = ref('')

function applyNodeSearch() {
  const q = nodeSearch.value.trim().toLowerCase()
  for (const n of nodes.value) {
    const hit = q !== ''
      && (String(n.id ?? '').toLowerCase().includes(q) || String(n.data?.label ?? '').toLowerCase().includes(q))
    n.class = q === '' ? '' : (hit ? NODE_HIT_CLS : NODE_DIM_CLS)
  }
}

// 图替换（load/undo/redo/增删/布局）后按当前检索词重算，避免残留旧标记
watch([nodeSearch, nodes], applyNodeSearch)

/** live 取数器：自动保存与应用弹窗共用（保存语义 saveCanvas(routeId, { nodes, edges })） */
function getSnapshot() {
  return { nodes: nodes.value, edges: edges.value }
}

// 删除动作统一入口（宿主 span + 按钮键盘路径双入口，均幂等：第二次进入时
// selectedNode 已被 deleteSelected 清空直接早退）。点击时以最新选中态判定，
// 不依赖按钮 disabled 的 DOM 补丁时点。
function onDeleteClick() {
  if (!canEditRoute.value || !selectedNode.value) return
  deleteSelected()
}

// —— S9b：属性面板删除 → 图删除（节点走选中删除；边按 id）——
function onPanelDelete(payload: { kind: 'node' | 'edge'; id: string }) {
  if (!canEditRoute.value) return
  if (payload.kind === 'node') {
    if (selectedNode.value?.id === payload.id) deleteSelected()
  } else {
    deleteEdge(payload.id)
  }
}

// —— S9b：保存状态 chip（idle/dirty/saving/saved/failed；文案仅非 idle 有）——
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed'
const saveState = computed<SaveState>(() => {
  if (autosave.failed.value) return 'failed'
  if (autosave.saving.value) return 'saving'
  if (autosave.dirty.value) return 'dirty'
  if (autosave.lastSavedAt.value) return 'saved'
  return 'idle'
})
const saveStateTextKey = computed(() => {
  const keys: Record<SaveState, string> = {
    dirty: 'v2.canvas.saveDirty',
    saving: 'v2.canvas.saveSaving',
    saved: 'v2.canvas.saveSaved',
    failed: 'v2.canvas.saveFailed',
    idle: ''
  }
  return keys[saveState.value]
})

// —— S9b：应用到路由树（入口守卫：孤儿分发 / 嵌套深度，通过后才开弹窗）——
const applyRef = ref<InstanceType<typeof ApplyDiffDialog> | null>(null)

async function onApplyClick() {
  if (!canEditRoute.value || loading.value) return
  if (orphanCount.value > 0 || maxDepth.value > MAX_DISPATCH_DEPTH) return
  await applyRef.value?.open()
}

function onApplied() {
  toast.success(t('v2.canvas.applySuccess'))
}

// 校验 chips 数据（纯函数 + computed；check 与 orphan/depth 互斥由模板 v-if 链保证）
const orphanCount = computed(() => orphanDispatchNodes(nodes.value, edges.value).length)
const maxDepth = computed(() => maxDispatchDepth(nodes.value, edges.value))
const showEmpty = computed(() => !loading.value && !loadError.value && nodes.value.length === 0)

// reason / loadError 枚举 → i18n 文案（组件层映射，不透传原始异常 message）
const loadErrorText = computed(() => (loadError.value ? t(`v2.canvas.${loadError.value}`) : ''))
const connErrorText = computed(() => (connectionError.value ? t(`v2.canvas.${connectionError.value}`) : ''))

// 节点库 3 类型（点击添加；icon 沿用拓扑/列表的类型语义色）
const palette = computed(() => [
  { id: 'dispatch', type: 'DISPATCH', label: t('v2.canvas.nodeDispatch'), icon: 'ri-git-merge-line' },
  { id: 'backend', type: 'BACKEND', label: t('v2.canvas.nodeBackend'), icon: 'ri-git-branch-line' },
  { id: 'plugin', type: 'PLUGIN', label: t('v2.canvas.nodePlugin'), icon: 'ri-flashlight-line' }
])
</script>

<style scoped lang="scss">
.v2-canvas {
  min-width: 0;
}

/* 焦点环兜底：本页所有可聚焦元素统一 token 焦点环（无自绘动画，PRM 无需回退） */
.v2-canvas :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* —— 页头（同 DecisionTree 配方）—— */
.cnv-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.cnv-head-main {
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--app-text);
  }
}
.cnv-readonly {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 2px 10px;
  font-size: 11.5px;
  color: var(--app-color-warning-text-on-tint);
  background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-warning) 30%, transparent);
  border-radius: var(--app-radius-full);
}

/* —— 提示条（加载 / 解析失败，同 S3/S6/S7 配方）—— */
.hint-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);

  &.is-error {
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  }
}
.cnv-retry {
  margin-left: auto;
}

/* —— 工具栏 + 校验 chips —— */
.cnv-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.cnv-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: 0;
}
.cnv-delete-host {
  display: inline-flex;
}
/* S12③：检索输入（工具栏内定宽，不随 flex 拉伸） */
.cnv-search {
  width: 180px;
}
.cnv-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font-size: 11.5px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-full);

  &.is-ok {
    color: var(--app-color-success-text-on-tint);
    background: color-mix(in srgb, var(--app-color-success) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-success) 30%, transparent);
  }
  &.is-warn {
    color: var(--app-color-warning-text-on-tint);
    background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-warning) 30%, transparent);
  }
}

/* —— 主栅格：左节点库 + 右画布（窄视口节点库下沉为横向 chip 行）—— */
.cnv-body {
  display: grid;
  grid-template-columns: 172px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.cnv-main {
  min-width: 0;
}
.cnv-palette {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}
.cnv-palette-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}
.cnv-palette-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
  color: var(--app-text);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-full);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, background 0.15s;

  .fc-icon {
    color: var(--app-text-secondary);
  }

  &:hover {
    border-color: color-mix(in srgb, var(--app-primary) 45%, transparent);
    background: color-mix(in srgb, var(--app-primary) 8%, transparent);
  }
}
.cnv-palette-hint {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--app-text-tertiary);
}

/* —— 画布：横滚容器 + 点阵底（缩略图/控件走项目 token，旧画布同款覆写）—— */
.cnv-scroll {
  min-width: 0;
  overflow-x: auto;
}
.cnv-canvas {
  position: relative;
  height: 440px;
  min-width: 560px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}
.cnv-canvas :deep(.vue-flow__minimap) {
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}
.cnv-canvas :deep(.vue-flow__minimap-node) { fill: var(--app-text-tertiary); }
/* OPT-4 修复：per-type 配色落点——特异度须高于上一行统一 fill 规则（+1 类），全 token 零字面
   （CanvasMinimap.test.ts fs 契约：.vue-flow__minimap* 规则体禁 hex/rgb/hsl），未知/缺型无类名
   仍走上方 --app-text-tertiary 回退。 */
.cnv-canvas :deep(.vue-flow__minimap-node.cnv-mm-dispatch) { fill: var(--app-secondary); }
.cnv-canvas :deep(.vue-flow__minimap-node.cnv-mm-backend) { fill: var(--app-color-warning); }
.cnv-canvas :deep(.vue-flow__minimap-node.cnv-mm-plugin) { fill: var(--app-color-success); }
.cnv-canvas :deep(.vue-flow__minimap-mask) { fill: color-mix(in srgb, var(--app-text) 8%, transparent); }
.cnv-canvas :deep(.vue-flow__controls-button) {
  background: var(--app-bg-card);
  border-bottom: 1px solid var(--app-border-extra-light);
  fill: var(--app-text-secondary);
}
.cnv-canvas :deep(.vue-flow__controls-button:hover) { background: var(--app-bg-muted); }

/* —— S12②③：边条件标签 + 检索命中/置灰（真实件渲染面，jsdom 走 stub 出口）——
   边标签走 Vue Flow 内置 EdgeLabelRenderer：字号/内边距对齐本页 chip 族（11.5px + token 配色）；
   检索命中/置灰走 node.class（与 .vue-flow__node 同元素，outline 描边不挤布局），不改选中态。 */
.cnv-canvas :deep(.vue-flow__edge-text) {
  font-size: 11.5px;
  font-weight: 500;
  fill: var(--app-text-secondary);
}
.cnv-canvas :deep(.vue-flow__edge-textbg) {
  fill: var(--app-bg-card);
}
.cnv-canvas :deep(.vue-flow__node.cnv-node-hit) {
  outline: 2px solid color-mix(in srgb, var(--app-primary) 55%, transparent);
  outline-offset: 1px;
}
.cnv-canvas :deep(.vue-flow__node.cnv-node-dim) {
  opacity: 0.35;
}

/* —— 空态（nodes 空且非 loading 且无 loadError 才出现）—— */
.cnv-empty {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  color: var(--app-text-secondary);
  text-align: center;

  svg {
    width: 44px;
    height: 44px;
    margin-bottom: 4px;
    opacity: 0.55;
  }
}
.cnv-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.cnv-empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/* —— 底部状态条 —— */
.cnv-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 2px 0;
  font-size: 12px;
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}
.cnv-status-sep {
  color: var(--app-text-quaternary);
}
/* —— S9b：自动保存状态 chip（idle/dirty/saving/saved/failed 五态，token-only 配色）—— */
.cnv-save-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  padding: 2px 10px;
  font-size: 11.5px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-full);

  &.is-idle {
    color: var(--app-text-tertiary);
    background: var(--app-bg-muted);
    border-color: var(--app-border-extra-light);
  }
  &.is-dirty {
    color: var(--app-color-warning-text-on-tint);
    background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-warning) 30%, transparent);
  }
  &.is-saving {
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
    border-color: var(--app-border-light, var(--app-border-extra-light));
  }
  &.is-saved {
    color: var(--app-color-success-text-on-tint);
    background: color-mix(in srgb, var(--app-color-success) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-success) 30%, transparent);
  }
  &.is-failed {
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  }
}
/* —— S9b：属性面板停靠卡片（选中即现于画布下方）—— */
.cnv-prop-dock {
  margin-top: 12px;
  max-width: 560px;
}

/* —— 窄视口：节点库下沉为横向 chip 行，画布降高（横滚由容器吸收，页面无横向溢出）—— */
@media (max-width: 900px) {
  .cnv-body {
    grid-template-columns: 1fr;
  }
  .cnv-palette {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;

    .cnv-palette-title {
      flex-basis: 100%;
    }
    .cnv-palette-item {
      flex: none;
    }
    .cnv-palette-hint {
      flex-basis: 100%;
    }
  }
  .cnv-canvas {
    height: 360px;
    min-width: 520px;
  }
}

/* PRM：去掉 chip / 节点库项的过渡动画 */
@media (prefers-reduced-motion: reduce) {
  .cnv-palette-item {
    transition: none;
  }
}
</style>
