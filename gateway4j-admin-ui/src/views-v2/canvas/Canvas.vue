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
                @pane-click="onPaneClick"
                @connect="onConnect"
              >
                <Background pattern-color="var(--app-text-quaternary)" :gap="16" />
                <Controls />
                <MiniMap />
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
          <!-- Bottom status bar: counters stay visible in read-only (viewing is never restricted) -->
          <div class="cnv-status" data-testid="cnv-status">
            {{ t('v2.canvas.statusNodes', { n: nodes.length }) }}
            <span class="cnv-status-sep" aria-hidden="true">·</span>
            {{ t('v2.canvas.statusEdges', { n: edges.length }) }}
          </div>
        </div>
      </div>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import { FcButton, FcIcon, FcSection } from '@/components'
import { usePermission } from '@/composables/usePermission'
import { getCanvas, getRoute } from '@/api/routes'
import { useCanvasGraph } from './composables/useCanvasGraph'
import { MAX_DISPATCH_DEPTH, maxDispatchDepth, orphanDispatchNodes } from './composables/useCanvasValidation'

/**
 * S9a-C：v2 流程编排画布（原型 04）—— 内核 + 节点库（点击添加）+ 工具栏 + 校验 chips。
 * 本地编辑不落库：无保存 / 应用 / 自动保存 / 属性面板（S9b 接线）。
 * - 内核全部在 useCanvasGraph（旧画布五段逻辑随迁：parse/loadEpoch/快照栈/连线/权重写/键盘）；
 * - 校验纯函数在 useCanvasValidation（reason 枚举），本组件只做 i18n 文案映射；
 * - 只读态（canEdit('route')=false）：节点库隐藏、undo/redo/delete disabled、
 *   VueFlow nodesConnectable/nodesDraggable=false；看图（status/chips/back）不受限；
 * - 权重边 label 读侧 `${n}%`，其余边 label=condition_value（utils/weight 原封复用）。
 */
defineOptions({ name: 'V2Canvas' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { canEdit } = usePermission()
const canEditRoute = computed(() => canEdit('route'))
const routeId = computed(() => String(route.params.id ?? ''))

const {
  loading, loadError, nodes, edges, selectedNode,
  connectionError, limitHit, canUndo, canRedo,
  load, addNodeType, deleteSelected, onConnect, onNodeClick, onPaneClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- S9a 无属性面板；S9b 接线位，测试经 vm.setEdgeWeight 调用
  undo, redo, setEdgeWeight
} = useCanvasGraph(routeId, { loadCanvas: getCanvas, loadRoute: getRoute })

// 删除动作统一入口（宿主 span + 按钮键盘路径双入口，均幂等：第二次进入时
// selectedNode 已被 deleteSelected 清空直接早退）。点击时以最新选中态判定，
// 不依赖按钮 disabled 的 DOM 补丁时点。
function onDeleteClick() {
  if (!canEditRoute.value || !selectedNode.value) return
  deleteSelected()
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
.cnv-canvas :deep(.vue-flow__minimap-mask) { fill: color-mix(in srgb, var(--app-text) 8%, transparent); }
.cnv-canvas :deep(.vue-flow__controls-button) {
  background: var(--app-bg-card);
  border-bottom: 1px solid var(--app-border-extra-light);
  fill: var(--app-text-secondary);
}
.cnv-canvas :deep(.vue-flow__controls-button:hover) { background: var(--app-bg-muted); }

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
