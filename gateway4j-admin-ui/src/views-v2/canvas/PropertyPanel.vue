<template>
  <!-- No selection: render nothing at all (old prop-no-selection placeholder not migrated) -->
  <div v-if="node || edge" class="v2-prop" data-testid="cnv-prop-panel">
    <div class="v2-prop-title">{{ t('v2.canvas.panelTitle') }}</div>

    <!-- Node: in-place mutation of the very node object (same reference as the graph) -->
    <template v-if="node">
      <div class="v2-prop-field">
        <span class="v2-prop-label">{{ t('v2.canvas.propType') }}</span>
        <span class="v2-prop-type" data-testid="cnv-prop-type">{{ node.type }}</span>
      </div>
      <div class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-name">{{ t('v2.canvas.propName') }}</label>
        <FcInput
          id="cnv-prop-name"
          :model-value="nodeLabel"
          data-testid="cnv-prop-name"
          :maxlength="50"
          :disabled="!canEdit"
          @update:model-value="onNameInput"
        />
      </div>
      <div v-if="node.type === 'BACKEND'" class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-upstream">{{ t('v2.canvas.propUpstream') }}</label>
        <FcInput
          id="cnv-prop-upstream"
          :model-value="nodeUpstream"
          data-testid="cnv-prop-upstream"
          :maxlength="500"
          :disabled="!canEdit"
          @update:model-value="onUpstreamInput"
        />
      </div>
      <div v-if="node.type === 'DISPATCH'" class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-path">{{ t('v2.canvas.propPath') }}</label>
        <FcInput
          id="cnv-prop-path"
          :model-value="nodePath"
          data-testid="cnv-prop-path"
          :maxlength="500"
          :disabled="!canEdit"
          @update:model-value="onPathInput"
        />
      </div>
      <div v-if="node.type === 'PLUGIN'" class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-config">{{ t('v2.canvas.propConfig') }}</label>
        <FcInput
          id="cnv-prop-config"
          type="textarea"
          :rows="4"
          :model-value="nodeConfig"
          data-testid="cnv-prop-config"
          :maxlength="10000"
          :disabled="!canEdit"
          @update:model-value="onConfigInput"
        />
      </div>
      <div v-if="canEdit" class="v2-prop-actions">
        <FcButton variant="danger" size="sm" data-testid="cnv-prop-delete" @click="onDeleteNode">
          {{ t('v2.canvas.delete') }}
        </FcButton>
      </div>
    </template>

    <!-- Edge: condition type chips (el-select is not drivable in jsdom, ruling 6) + weight/value/priority -->
    <template v-else>
      <div class="v2-prop-field" data-testid="cnv-prop-cond-type">
        <span class="v2-prop-label">{{ t('v2.canvas.propCondType') }}</span>
        <div class="v2-prop-chips" role="group" :aria-label="t('v2.canvas.propCondType')">
          <button
            v-for="ct in COND_TYPES"
            :key="ct"
            type="button"
            class="v2-prop-chip"
            :class="{ 'is-active': edgeType === ct }"
            :data-testid="`cnv-prop-cond-${ct}`"
            :disabled="!canEdit"
            @click="onCondType(ct)"
          >
            {{ condLabel(ct) }}
          </button>
        </div>
      </div>
      <div v-if="edgeType === 'WEIGHT'" class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-weight">{{ t('v2.canvas.propWeight') }}</label>
        <input
          id="cnv-prop-weight"
          class="v2-prop-number"
          type="number"
          min="1"
          max="100"
          step="1"
          :value="weightDisplay"
          :disabled="!canEdit"
          data-testid="cnv-prop-weight"
          @input="onWeightInput"
        />
      </div>
      <div v-else class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-cond-value">{{ t('v2.canvas.propCondValue') }}</label>
        <FcInput
          id="cnv-prop-cond-value"
          :model-value="condValue"
          data-testid="cnv-prop-cond-value"
          :maxlength="500"
          :disabled="!canEdit"
          @update:model-value="onCondValueInput"
        />
      </div>
      <div class="v2-prop-field">
        <label class="v2-prop-label" for="cnv-prop-priority">{{ t('v2.canvas.propPriority') }}</label>
        <input
          id="cnv-prop-priority"
          class="v2-prop-number"
          type="number"
          min="1"
          max="999"
          step="1"
          :value="priorityDisplay"
          :disabled="!canEdit"
          data-testid="cnv-prop-priority"
          @input="onPriorityInput"
        />
      </div>
      <div v-if="canEdit" class="v2-prop-actions">
        <FcButton variant="danger" size="sm" data-testid="cnv-prop-delete" @click="onDeleteEdge">
          {{ t('v2.canvas.deleteEdge') }}
        </FcButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcButton, FcInput } from '@/components'
import { WEIGHT_MAX, WEIGHT_MIN, parseWeight } from '@/utils/weight'

/**
 * S9b-C：v2 画布属性面板（契约 §4 S9 拆步「PropertyPanel.vue(~260)」，语义随迁旧画布
 * Canvas.vue L78-150 / L277-302）。编辑就地变更传入对象（同一引用，画布状态同步）+
 * emit dirty；不入快照栈（旧属性编辑只 markDirty 不 pushHistory 随迁）。权重写经
 * emit('set-weight') 转交 useCanvasGraph.setEdgeWeight（面板侧再夹取一次为幂等冗余）。
 */
defineOptions({ name: 'V2PropertyPanel' })

const props = withDefaults(defineProps<{
  /** 选中节点（useCanvasGraph 的 selectedNode 同一对象引用） */
  node?: any | null
  /** 选中边（useCanvasGraph 的 selectedEdge 同一对象引用） */
  edge?: any | null
  /** false → 全部输入 disabled、无删除按钮（面板整体隐藏由 Canvas 接线负责） */
  canEdit?: boolean
}>(), {
  node: null,
  edge: null,
  canEdit: true
})

const emit = defineEmits<{
  dirty: []
  delete: [payload: { kind: 'node' | 'edge'; id: string }]
  'set-weight': [edge: any, value: number | undefined]
}>()

const { t } = useI18n()

const COND_TYPES = ['HEADER', 'PATH', 'QUERY', 'BODY', 'GROOVY', 'WEIGHT'] as const

// 旧 ensureEdgeData / onNodeClick 兜底随迁：缺 data 就地补齐
watch([() => props.node, () => props.edge], ([n, e]) => {
  if (n && !n.data) n.data = {}
  if (e && !e.data) e.data = { condition_type: 'PATH', condition_value: '', priority: 1 }
}, { immediate: true })

const nodeLabel = computed(() => String(props.node?.data?.label ?? ''))
const nodeUpstream = computed(() => String(props.node?.data?.upstream_url ?? ''))
const nodePath = computed(() => String(props.node?.data?.path ?? ''))
const nodeConfig = computed(() => String(props.node?.data?.config ?? ''))
const edgeType = computed(() => String(props.edge?.data?.condition_type ?? 'PATH'))
const condValue = computed(() => String(props.edge?.data?.condition_value ?? ''))
const weightDisplay = computed(() => {
  const w = parseWeight(props.edge?.data?.condition_key)
  return w === null ? '' : String(w)
})
const priorityDisplay = computed(() => String(props.edge?.data?.priority ?? 1))

function condLabel(type: string): string {
  return t(`v2.canvas.cond${type.charAt(0)}${type.slice(1).toLowerCase()}`)
}

// 以下 handler 以局部别名落地（就地变更语义）；权重/优先级为原生 number input（testid 落原生 input）
function onNameInput(v: string) {
  const n = props.node
  if (!n) return
  if (!n.data) n.data = {}
  n.data.label = v
  emit('dirty')
}
function onUpstreamInput(v: string) {
  const n = props.node
  if (!n) return
  if (!n.data) n.data = {}
  n.data.upstream_url = v
  emit('dirty')
}
function onPathInput(v: string) {
  const n = props.node
  if (!n) return
  if (!n.data) n.data = {}
  n.data.path = v
  emit('dirty')
}
function onConfigInput(v: string) {
  const n = props.node
  if (!n) return
  if (!n.data) n.data = {}
  n.data.config = v
  emit('dirty')
}
function onCondValueInput(v: string) {
  const e = props.edge
  if (!e) return
  if (!e.data) e.data = {}
  e.data.condition_value = v
  emit('dirty')
}

// 旧 onEdgeCondTypeChange 随迁：切到 WEIGHT 时数值型 condition_value 迁入 condition_key 并清空 value
function onCondType(type: string) {
  const e = props.edge
  if (!e || !props.canEdit) return
  if (!e.data) e.data = {}
  e.data.condition_type = type
  if (type === 'WEIGHT') {
    if (parseWeight(e.data.condition_key) === null) {
      e.data.condition_key = /^\d+$/.test(String(e.data.condition_value ?? '').trim())
        ? String(e.data.condition_value).trim()
        : ''
    }
    e.data.condition_value = ''
  }
  emit('dirty')
}

// 权重写：undefined/null/NaN → undefined（清除语义随迁）；否则 round + 夹取 1~100
function onWeightInput(ev: Event) {
  const e = props.edge
  if (!e) return
  const raw = (ev.target as HTMLInputElement).value
  let value: number | undefined
  if (raw !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n)) value = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(n)))
  }
  emit('set-weight', e, value)
  emit('dirty')
}

// 优先级 1~999 夹取写回（旧 FcInputNumber :min=1 :max=999 语义随迁）
function onPriorityInput(ev: Event) {
  const e = props.edge
  if (!e) return
  if (!e.data) e.data = {}
  const n = Number((ev.target as HTMLInputElement).value)
  e.data.priority = Number.isFinite(n) ? Math.min(999, Math.max(1, Math.round(n))) : 1
  emit('dirty')
}

function onDeleteNode() {
  const n = props.node
  if (n) emit('delete', { kind: 'node', id: n.id })
}
function onDeleteEdge() {
  const e = props.edge
  if (e) emit('delete', { kind: 'edge', id: e.id })
}
</script>

<style scoped lang="scss">
.v2-prop {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}
.v2-prop :deep(input:focus-visible),
.v2-prop input:focus-visible,
.v2-prop button:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.v2-prop-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}
.v2-prop-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.v2-prop-label {
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
.v2-prop-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}
.v2-prop-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.v2-prop-chip {
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-full);
  cursor: pointer;

  &:hover {
    border-color: color-mix(in srgb, var(--app-primary) 45%, transparent);
  }
  &.is-active {
    color: var(--app-color-primary-text-on-tint, var(--app-primary));
    background: color-mix(in srgb, var(--app-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-primary) 45%, transparent);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
.v2-prop-number {
  padding: 5px 8px;
  font-size: 12.5px;
  color: var(--app-text);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light, var(--app-border-extra-light));
  border-radius: var(--app-radius-md);
  font-variant-numeric: tabular-nums;

  &:disabled {
    background: var(--app-bg-muted);
    cursor: not-allowed;
  }
}
.v2-prop-actions {
  display: flex;
  justify-content: flex-end;
}
@media (prefers-reduced-motion: reduce) {
  .v2-prop-chip {
    transition: none;
  }
}
</style>
