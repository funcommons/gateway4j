<template>
  <div>
    <div class="toolbar">
      <FcButton variant="primary" @click="onAdd">{{ t('gateway.route.addCondition') }}</FcButton>
    </div>
    <FcTable :data="local as any">
      <el-table-column :label="t('gateway.route.condTypeLabel')" prop="condition_type" width="120">
        <template #default="{ row }">
          <FcSelect
            :model-value="(row as any).condition_type"
            :options="typeOptions"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'condition_type', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.operatorLabel')" prop="operator" width="120">
        <template #default="{ row }">
          <FcSelect
            :model-value="(row as any).operator"
            :options="operatorOptions"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'operator', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.condKeyLabel')" prop="condition_key">
        <template #default="{ row }">
          <FcInput
            :model-value="(row as any).condition_key"
            maxlength="200"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'condition_key', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.condValueLabel')" prop="condition_value">
        <template #default="{ row }">
          <FcInput
            :model-value="(row as any).condition_value"
            maxlength="500"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'condition_value', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.targetRouteLabel')" prop="target_route_name">
        <template #default="{ row }">
          <FcSelect
            :model-value="(row as any).target_route_id"
            :options="routeOptions"
            filterable
            @update:model-value="(v: string) => updateTargetRoute(row as RouteCondition, v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.priorityLabel')" prop="priority" width="100">
        <template #default="{ row }">
          <el-input-number
            :model-value="(row as any).priority"
            :min="1" :max="999"
            @update:model-value="(v: number | undefined) => updateRow(row as RouteCondition, 'priority', v ?? 1)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('gateway.route.actionLabel')" width="120">
        <template #default="{ $index }">
          <FcButton variant="text" size="sm" type="danger" @click="onDelete($index)">{{ t('gateway.common.delete') }}</FcButton>
        </template>
      </el-table-column>
    </FcTable>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { FcTable, FcButton, FcSelect, FcInput } from '@/components/sdk'
import type { SelectOption } from '@/components/sdk'

const { t } = useI18n()

const MAX_CONDITIONS = 50

export interface RouteCondition {
  condition_type: string
  operator: string
  condition_key: string
  condition_value: string
  target_route_id: string
  target_route_name: string
  priority: number
}

const props = defineProps<{
  modelValue: RouteCondition[]
  routeOptions?: SelectOption[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: RouteCondition[]): void }>()

const local = ref<RouteCondition[]>(props.modelValue.map((r) => ({ ...r })))
let syncingFromProp = false

watch(
  () => props.modelValue,
  (v) => { syncingFromProp = true; local.value = v.map((r) => ({ ...r })); syncingFromProp = false },
  { deep: true }
)

watch(
  local,
  (v) => { if (!syncingFromProp) emit('update:modelValue', v.map((r) => ({ ...r }))) },
  { deep: true }
)

function clone(): RouteCondition {
  return {
    condition_type: 'HEADER',
    operator: 'EQ',
    condition_key: '',
    condition_value: '',
    target_route_id: '',
    target_route_name: '',
    priority: 1
  }
}

function onAdd() {
  if (local.value.length >= MAX_CONDITIONS) {
    ElMessage.warning(t('gateway.route.maxConditionsReached'))
    return
  }
  local.value = [...local.value, clone()]
}

function onDelete(index: number) {
  local.value = local.value.filter((_, i) => i !== index)
}

function updateRow(row: RouteCondition, key: keyof RouteCondition, value: unknown) {
  const next = local.value.map((r) => (r === row ? { ...r, [key]: value } : r))
  local.value = next
}

function updateTargetRoute(row: RouteCondition, id: string) {
  const next = local.value.map((r) => {
    if (r !== row) return r
    const opt = props.routeOptions?.find((o) => o.value === id)
    return { ...r, target_route_id: id, target_route_name: opt?.label ?? '' }
  })
  local.value = next
}

const typeOptions = computed(() => [
  { value: 'HEADER', label: t('gateway.route.condTypeHeader') },
  { value: 'PATH', label: t('gateway.route.condTypePath') },
  { value: 'QUERY', label: t('gateway.route.condTypeQuery') },
  { value: 'BODY', label: t('gateway.route.condTypeBody') },
  { value: 'GROOVY', label: t('gateway.route.condTypeGroovy') }
])

const operatorOptions = computed(() => [
  { value: 'EQ', label: t('gateway.route.operatorEq') },
  { value: 'NE', label: t('gateway.route.operatorNe') },
  { value: 'CONTAINS', label: t('gateway.route.operatorContains') },
  { value: 'REGEX', label: t('gateway.route.operatorRegex') },
  { value: 'EXISTS', label: t('gateway.route.operatorExists') },
  { value: 'GT', label: t('gateway.route.operatorGt') },
  { value: 'LT', label: t('gateway.route.operatorLt') }
])

defineExpose({ onAdd, onDelete, updateTargetRoute, local })
</script>

<style scoped>
.toolbar { margin-bottom: 12px; }
</style>
