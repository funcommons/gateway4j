<script setup lang="ts">
defineOptions({ name: 'FcTable', inheritAttrs: false })
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import FcEmpty from '../display/FcEmpty.vue'
import type { TableColumn } from './_types'

interface Props {
  data: Record<string, unknown>[]
  columns?: TableColumn[]
  loading?: boolean
  rowKey?: string | ((row: Record<string, unknown>) => string | number)
  stripe?: boolean
  border?: boolean
  headerBg?: boolean
  highlightCurrentRow?: boolean
  emptyText?: string
  emptyType?: 'empty' | 'error' | 'search' | 'no-result' | 'processing'
  rowHeight?: number
  height?: number | string
  maxHeight?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  rowKey: 'id',
  stripe: false,
  border: false,
  headerBg: false,
  highlightCurrentRow: true,
  emptyType: 'empty',
  emptyText: undefined,
  rowHeight: 48,
  height: undefined,
  maxHeight: undefined,
})

const emit = defineEmits<{
  'row-click': [row: any, column: any, event: Event]
  'row-dblclick': [row: any, column: any, event: Event]
  'selection-change': [rows: any[]]
  'sort-change': [payload: { prop: string, order: 'ascending' | 'descending' | null }]
  select: [selection: any[], row: any]
  'select-all': [selection: any[]]
}>()

const rowKeyAttr = computed(() => {
  if (typeof props.rowKey === 'function') return undefined
  return props.rowKey
})

const listeners = {
  'row-click': (row: any, column: any, event: Event) => emit('row-click', row, column, event),
  'row-dblclick': (row: any, column: any, event: Event) => emit('row-dblclick', row, column, event),
  'selection-change': (rows: any[]) => emit('selection-change', rows),
  'sort-change': ({ prop, order }: { prop: string, order: 'ascending' | 'descending' | null }) =>
    emit('sort-change', { prop, order }),
  select: (selection: any[], row: any) => emit('select', selection, row),
  'select-all': (selection: any[]) => emit('select-all', selection),
}
</script>

<template>
  <div class="fc-table" :class="{ 'is-loading': loading }">
    <el-table
      v-bind="$attrs"
      :data="data"
      :row-key="rowKeyAttr"
      :stripe="stripe"
      :border="border"
      :height="height"
      :max-height="maxHeight"
      :header-cell-class-name="headerBg ? 'fc-table__header-cell--bg' : ''"
      :highlight-current-row="highlightCurrentRow"
      :row-class-name="`fc-table__row--h${rowHeight}`"
      v-on="listeners"
    >
      <el-table-column
        v-for="col in columns"
        :key="col.prop || col.label"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
        :align="col.align || 'left'"
        :header-align="col.headerAlign || col.align || 'left'"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :show-overflow-tooltip="col.overflow ?? true"
        :formatter="col.formatter"
      />

      <slot />

      <template #empty>
        <FcEmpty :type="emptyType" :title="emptyText" />
      </template>
    </el-table>

    <div v-if="loading" class="fc-table__loading">
      <el-icon class="fc-table__spinner"><Loading /></el-icon>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.fc-table {
  position: relative;
  width: 100%;
}

.fc-table :deep(.el-table) {
  --el-table-border-color: var(--app-separator, #e5e5e5);
  --el-table-header-bg-color: var(--app-bg-muted, #fafafa);
  --el-table-row-hover-bg-color: var(--app-bg-muted, #f5f5f5);

  border-radius: var(--app-radius-md, 8px);
  overflow: hidden;
}

.fc-table :deep(.el-table th.el-table__cell) {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text, #333);
  background: var(--el-table-header-bg-color);
}

.fc-table :deep(.el-table td.el-table__cell) {
  font-size: 13px;
  color: var(--app-text, #333);
  padding: 8px 0;
}

.fc-table :deep(.fc-table__row--h48) {
  height: 48px;
}

.fc-table :deep(.fc-table__header-cell--bg) {
  background: var(--app-bg-muted, #f5f5f5);
  font-weight: 600;
}

.fc-table__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--app-bg-card, #fff) 60%, transparent);
  backdrop-filter: blur(2px);
  z-index: 1;
}

.fc-table__spinner {
  font-size: 24px;
  color: var(--app-primary, #409eff);
  animation: fc-table-spin 0.8s linear infinite;
}

@keyframes fc-table-spin {
  to { transform: rotate(360deg); }
}
</style>
