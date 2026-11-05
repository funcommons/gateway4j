<template>
  <!-- Error bar lives OUTSIDE the dialog root: preview/confirm failure shows it while the dialog stays closed -->
  <div v-if="errorMsg" class="v2-apply-error" data-testid="cnv-diff-error" role="alert">
    <FcIcon name="ri-error-warning-line" :size="14" />
    <span>{{ t('v2.canvas.applyFailed') }}</span>
  </div>

  <!-- Self-rendered modal: unmounts synchronously on close (el-dialog removal is transition+rAF deferred) -->
  <div v-if="open" class="v2-apply-overlay">
    <div class="v2-apply-panel" role="dialog" aria-modal="true" :aria-label="t('v2.canvas.applyTitle')" data-testid="cnv-diff-dialog">
      <div class="v2-apply-head">
        <h2>{{ t('v2.canvas.applyTitle') }}</h2>
      </div>

      <div class="v2-apply-body">
        <!-- Stage 1: dry_run preview in flight -->
        <div v-if="loading" class="v2-apply-loading" data-testid="cnv-diff-loading">
          <FcIcon name="ri-loader-4-line" :size="14" />
          <span>{{ t('v2.canvas.applyLoading') }}</span>
        </div>

        <!-- Stage 2: review the diff groups -->
        <template v-else-if="diff">
          <p class="v2-apply-conditions" data-testid="cnv-diff-conditions">
            {{ t('v2.canvas.applyConditionsChanges', { n: diff.conditions_changes ?? 0 }) }}
          </p>

          <div class="v2-apply-group" data-testid="cnv-diff-group-create">
            <div class="v2-apply-group-title">{{ t('v2.canvas.applyGroupCreate') }}<span class="v2-apply-group-count">{{ diff.to_create?.length || 0 }}</span></div>
            <div v-if="diff.to_create?.length" class="v2-apply-rows">
              <div v-for="(row, i) in diff.to_create" :key="`c-${i}`" class="v2-apply-row" data-testid="cnv-diff-create-row">
                <span class="v2-apply-row-main">{{ row.label }}</span>
                <span v-if="row.path" class="v2-apply-row-sub">{{ row.path }}</span>
                <span v-if="row.upstream_url" class="v2-apply-row-sub">{{ row.upstream_url }}</span>
              </div>
            </div>
            <p v-else class="v2-apply-empty">{{ t('common.empty') }}</p>
          </div>

          <div class="v2-apply-group" data-testid="cnv-diff-group-update">
            <div class="v2-apply-group-title">{{ t('v2.canvas.applyGroupUpdate') }}<span class="v2-apply-group-count">{{ diff.to_update?.length || 0 }}</span></div>
            <div v-if="diff.to_update?.length" class="v2-apply-rows">
              <div v-for="row in updateRows" :key="`u-${row.id}`" class="v2-apply-row" data-testid="cnv-diff-update-row">
                <span class="v2-apply-row-id">{{ row.id }}</span>
                <span class="v2-apply-row-main">{{ row.fields }}</span>
                <span class="v2-apply-row-sub">{{ row.detail }}</span>
              </div>
            </div>
            <p v-else class="v2-apply-empty">{{ t('common.empty') }}</p>
          </div>

          <div class="v2-apply-group" data-testid="cnv-diff-group-delete">
            <div class="v2-apply-group-title">{{ t('v2.canvas.applyGroupDelete') }}<span class="v2-apply-group-count">{{ diff.to_delete?.length || 0 }}</span></div>
            <p class="v2-apply-tip">{{ t('v2.canvas.applyDeleteTip') }}</p>
            <div v-if="deleteRows.length" class="v2-apply-rows">
              <!-- Deletion needs explicit per-row confirmation: unchecked by default (old _checked:false) -->
              <div v-for="row in deleteRows" :key="row.id" class="v2-apply-row v2-apply-row-check" :data-testid="`cnv-diff-delete-row-${row.id}`">
                <!-- State driven on @click (not @change): detached mounts never see jsdom change events -->
                <input
                  type="checkbox"
                  :checked="row._checked"
                  :data-testid="`cnv-diff-delete-check-${row.id}`"
                  :aria-label="`${row.id} ${row.name}`"
                  @click="toggleDeleteRow(row)"
                />
                <span class="v2-apply-row-id">{{ row.id }}</span>
                <span class="v2-apply-row-main">{{ row.name }}</span>
              </div>
            </div>
            <p v-else class="v2-apply-empty">{{ t('common.empty') }}</p>
          </div>

          <div class="v2-apply-field">
            <label class="v2-apply-label" for="cnv-diff-desc">{{ t('v2.canvas.applyDescLabel') }}</label>
            <textarea
              id="cnv-diff-desc"
              v-model="desc"
              class="v2-apply-desc"
              rows="2"
              maxlength="200"
              :placeholder="t('v2.canvas.applyDescPlaceholder')"
              data-testid="cnv-diff-desc"
            />
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Footer lives outside the dialog content root (stays mounted across close, per contract)
       and is visually removed only while the dialog is closed. -->
  <div class="v2-apply-foot" :class="{ 'is-hidden': !open }">
    <FcButton variant="secondary" size="sm" data-testid="cnv-diff-cancel" @click="close">
      {{ t('common.cancel') }}
    </FcButton>
    <FcButton variant="primary" size="sm" data-testid="cnv-diff-confirm" :disabled="loading || confirmLoading" @click="confirm">
      {{ t('v2.canvas.applyConfirm') }}
    </FcButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcButton, FcIcon, toast } from '@/components'
import { applyCanvas } from '@/api/routes'
import type { CanvasApplyDiff } from '@/api/routes'

/**
 * S9b-C：v2 应用到路由树弹窗（契约 §4 S9 拆步「ApplyDiffDialog.vue(dry_run 三段式,~190)」，
 * 交互语义随迁旧画布 Canvas.vue L623-728）。段一 dry_run=true 预览（空差异 info toast 不开窗）；
 * 段二三组 diff + 删除逐条勾选（默认不勾）+ 变更说明选填（maxlength 200，每次预览清空）；
 * 段三 dry_run=false + confirm_delete_ids + 去空格后非空才携带 change_description（最小 payload）。
 * 错误条文案一律 i18n（applyFailed），不透传原始异常 message；toast 走 SDK 统一入口。
 */
defineOptions({ name: 'V2ApplyDiffDialog' })

const props = defineProps<{
  routeId: string
  /** Canvas 传 live 取数器；段一/段三各自取最新 */
  getSnapshot: () => { nodes: any[]; edges: any[] }
}>()

const emit = defineEmits<{ applied: [] }>()

const { t } = useI18n()

const open = ref(false)
const loading = ref(false)
const confirmLoading = ref(false)
const errorMsg = ref(false)
const diff = ref<CanvasApplyDiff | null>(null)
const deleteRows = ref<Array<{ id: string; name: string; _checked: boolean }>>([])
const desc = ref('')

const checkedIds = computed(() => deleteRows.value.filter(r => r._checked).map(r => r.id))

/** 勾选状态走 @click 驱动（jsdom 对未连接 DOM 的 click 不派发 change，v-model 不可依赖） */
function toggleDeleteRow(row: { id: string; name: string; _checked: boolean }) {
  row._checked = !row._checked
}

function isEmptyDiff(d: CanvasApplyDiff | null): boolean {
  if (!d) return true
  return !(d.to_create?.length) && !(d.to_update?.length) && !(d.to_delete?.length)
}

// 旧 formatChangeValue/updateRows 随迁：changes 里 {from,to} 折叠为 "from → to"
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
  (diff.value?.to_update || []).map(u => {
    const changes = (u.changes || {}) as Record<string, unknown>
    return {
      id: u.id,
      fields: Object.keys(changes).join(', '),
      detail: Object.entries(changes).map(([k, v]) => `${k}: ${formatChangeValue(v)}`).join('；')
    }
  })
)

/** 段一·预览：open() → applyCanvas(routeId, { nodes, edges, dry_run: true }) 恰一次 */
async function openDialog() {
  errorMsg.value = false
  diff.value = null
  deleteRows.value = []
  desc.value = ''
  loading.value = true
  open.value = true
  try {
    const d = await applyCanvas(props.routeId, { ...props.getSnapshot(), dry_run: true })
    if (isEmptyDiff(d)) {
      // 旧 isEmptyDiff → toast.info 语义随迁：空差异不开窗
      toast.info(t('v2.canvas.applyNoDiff'))
      open.value = false
      return
    }
    diff.value = d
    deleteRows.value = (d.to_delete || []).map(x => ({ ...x, _checked: false }))
  } catch {
    errorMsg.value = true
    open.value = false
  } finally {
    loading.value = false
  }
}

/** 段三·确认：dry_run=false + 勾选 id + 选填说明（去空格非空才携带，旧 H7b 最小 payload） */
async function confirm() {
  if (!diff.value || confirmLoading.value || loading.value) return
  confirmLoading.value = true
  errorMsg.value = false
  try {
    const trimmed = desc.value.trim()
    await applyCanvas(props.routeId, {
      ...props.getSnapshot(),
      dry_run: false,
      confirm_delete_ids: checkedIds.value,
      ...(trimmed ? { change_description: trimmed } : {})
    })
    open.value = false
    emit('applied')
  } catch {
    errorMsg.value = true
  } finally {
    confirmLoading.value = false
  }
}

/** 取消：仅关闭，无写请求 */
function close() {
  open.value = false
}

defineExpose({ open: openDialog })
</script>

<style scoped lang="scss">
.v2-apply-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  border-radius: var(--app-radius-md);
}
.v2-apply-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--app-text) 32%, transparent);
}
.v2-apply-panel {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(82vh, 720px);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-lg, var(--app-shadow-sm));
}
.v2-apply-panel :focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.v2-apply-head {
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border-extra-light);

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--app-text);
  }
}
.v2-apply-body {
  flex: 1;
  min-height: 0;
  padding: 14px 18px;
  overflow-y: auto;
}
.v2-apply-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  font-size: 12.5px;
  color: var(--app-text-secondary);
}
.v2-apply-conditions {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--app-text-secondary);
}
.v2-apply-group {
  margin-bottom: 14px;
}
.v2-apply-group-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}
.v2-apply-group-count {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.v2-apply-tip {
  margin: 4px 0;
  font-size: 11.5px;
  color: var(--app-color-warning-text-on-tint);
}
.v2-apply-rows {
  margin-top: 6px;
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}
.v2-apply-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border-extra-light);

  &:last-child {
    border-bottom: none;
  }
}
.v2-apply-row-check {
  cursor: pointer;

  input {
    accent-color: var(--app-primary);
    cursor: pointer;
  }
}
.v2-apply-row-id {
  font-family: var(--app-font-mono, monospace);
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
.v2-apply-row-main {
  font-weight: 600;
}
.v2-apply-row-sub {
  color: var(--app-text-secondary);
  word-break: break-all;
}
.v2-apply-empty {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}
.v2-apply-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.v2-apply-label {
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
.v2-apply-desc {
  padding: 6px 10px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--app-text);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light, var(--app-border-extra-light));
  border-radius: var(--app-radius-md);
  resize: vertical;

  &::placeholder {
    color: var(--app-text-quaternary);
  }
}
.v2-apply-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border-extra-light);

  &.is-hidden {
    display: none;
  }
}
</style>
