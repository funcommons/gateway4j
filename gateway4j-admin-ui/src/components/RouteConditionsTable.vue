<template>
  <div>
    <div class="toolbar">
      <FcButton variant="primary" @click="onAdd">{{ t('route.addCondition') }}</FcButton>
    </div>
    <FcTable :data="local as any">
      <el-table-column :label="t('route.condTypeLabel')" prop="condition_type" width="150">
        <template #default="{ row }">
          <div class="cond-type-cell">
            <FcSelect
              :model-value="(row as any).condition_type"
              :options="typeOptions"
              :data-testid="`cond-type-${(row as any).condition_type}`"
              @update:model-value="(v: string) => onTypeChange(row as RouteCondition, v)"
            />
            <FcTooltip v-if="(row as any).condition_type === 'WEIGHT'" :content="t('route.condWeightTip')">
              <span class="cond-type-help" data-testid="cond-weight-tip">?</span>
            </FcTooltip>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('route.operatorLabel')" prop="operator" width="120">
        <template #default="{ row }">
          <!-- WEIGHT 是流量分割声明而非请求谓词，不参与 match，运算符禁用占位 -->
          <FcSelect
            v-if="(row as any).condition_type === 'WEIGHT'"
            model-value="EQ"
            :options="operatorOptions"
            disabled
            data-testid="cond-operator-disabled"
          />
          <FcSelect
            v-else
            :model-value="(row as any).operator"
            :options="operatorOptions"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'operator', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('route.condKeyLabel')" prop="condition_key">
        <template #default="{ row }">
          <template v-if="(row as any).condition_type === 'WEIGHT'">
            <div class="weight-cell">
              <FcInputNumber
                :model-value="weightNumber(row as RouteCondition)"
                :min="1"
                :max="100"
                :step="1"
                step-strictly
                data-testid="cond-weight-input"
                @update:model-value="(v: number | undefined) => updateWeight(row as RouteCondition, v)"
              />
              <FcTag color="brand" size="sm" data-testid="weight-value-tag">{{ t('route.condWeightTag', { n: weightNumber(row as RouteCondition) || '-' }) }}</FcTag>
            </div>
            <div v-if="weightError(row as RouteCondition)" class="weight-error" data-testid="weight-error">{{ weightError(row as RouteCondition) }}</div>
          </template>
          <FcInput
            v-else
            :model-value="(row as any).condition_key"
            maxlength="200"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'condition_key', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('route.condValueLabel')" prop="condition_value">
        <template #default="{ row }">
          <!-- 契约：WEIGHT 行 condition_value 留空（禁用占位） -->
          <FcInput
            v-if="(row as any).condition_type === 'WEIGHT'"
            model-value=""
            disabled
            data-testid="cond-value-disabled"
          />
          <FcInput
            v-else
            :model-value="(row as any).condition_value"
            maxlength="500"
            @update:model-value="(v: string) => updateRow(row as RouteCondition, 'condition_value', v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('route.targetRouteLabel')" prop="target_route_name">
        <template #default="{ row }">
          <FcSelect
            :model-value="(row as any).target_route_id"
            :options="routeOptions"
            filterable
            @update:model-value="(v: string) => updateTargetRoute(row as RouteCondition, v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('route.priorityLabel')" prop="priority" width="100">
        <template #default="{ row }">
          <FcInputNumber
            :model-value="(row as any).priority"
            :min="1" :max="999"
            @update:model-value="(v: number | undefined) => updateRow(row as RouteCondition, 'priority', v ?? 1)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('route.actionLabel')" width="120">
        <template #default="{ $index }">
          <FcButton variant="text" size="sm" type="danger" @click="onDelete($index)">{{ t('common.delete') }}</FcButton>
        </template>
      </el-table-column>
    </FcTable>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { FcTable, FcButton, FcSelect, FcInput, FcTag, FcTooltip, FcInputNumber } from '@/components'
import type { SelectOption } from '@/components/form/_types'
import { parseWeight, WEIGHT_MIN, WEIGHT_MAX } from '@/utils/weight'

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
// 内容指纹：prop → local 的拷贝回写会改变对象身份，仅靠同步期标志挡不住
// （watch 回调是异步的，标志位在回调执行前已被复位）。deep watch 触发时比对
// 内容指纹，相同则不再回传 emit，斩断「emit → 父 set → prop watch → 再 emit」
// 的递归更新环（浏览器实测会打出 Maximum recursive updates exceeded）。
let lastPropJson = ''

watch(
  () => props.modelValue,
  (v) => {
    syncingFromProp = true
    local.value = v.map((r) => ({ ...r }))
    lastPropJson = JSON.stringify(v)
    syncingFromProp = false
  },
  { deep: true }
)

watch(
  local,
  (v) => {
    if (!syncingFromProp) {
      const json = JSON.stringify(v)
      if (json === lastPropJson) return
      lastPropJson = json
      emit('update:modelValue', v.map((r) => ({ ...r })))
    }
  },
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
    ElMessage.warning(t('route.maxConditionsReached'))
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
  { value: 'HEADER', label: t('route.condTypeHeader') },
  { value: 'PATH', label: t('route.condTypePath') },
  { value: 'QUERY', label: t('route.condTypeQuery') },
  { value: 'BODY', label: t('route.condTypeBody') },
  { value: 'GROOVY', label: t('route.condTypeGroovy') },
  // P2-4：权重分流声明（同优先级候选按权重比例分流）
  { value: 'WEIGHT', label: t('route.condTypeWeight') }
])

/** 行内权重展示值：非法时回退 null（数字输入框空态） */
function weightNumber(row: RouteCondition): number | null {
  return parseWeight(row.condition_key)
}

/** 权重校验信息：空/非数字/越界 → 文案；合法 → 空串 */
function weightError(row: RouteCondition): string {
  const raw = String(row.condition_key ?? '').trim()
  if (raw === '') return t('route.condWeightRequired')
  if (parseWeight(row.condition_key) === null) {
    return t('route.condWeightRange', { min: WEIGHT_MIN, max: WEIGHT_MAX })
  }
  return ''
}

/** 切换条件类型：进 WEIGHT 时把条件值区切换成权重语义（key=数字串、value 留空） */
function onTypeChange(row: RouteCondition, v: string) {
  if (v === 'WEIGHT') {
    const keep = parseWeight(row.condition_key) !== null ? row.condition_key : ''
    patchRow(row, { condition_type: v, condition_key: keep, condition_value: '', operator: 'EQ' })
    return
  }
  // 离开 WEIGHT：恢复普通谓词语义（key 保留既有输入，value 清回空待填）
  patchRow(row, { condition_type: v })
}

function patchRow(row: RouteCondition, patch: Partial<RouteCondition>) {
  const next = local.value.map((r) => (r === row ? { ...r, ...patch } : r))
  local.value = next
}

/** 权重数字输入：1~100 整数，写回 condition_key 数字字符串（契约） */
function updateWeight(row: RouteCondition, v: number | undefined) {
  if (v === undefined || v === null || Number.isNaN(v)) {
    patchRow(row, { condition_key: '' })
    return
  }
  const clamped = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(v)))
  patchRow(row, { condition_key: String(clamped) })
}

const operatorOptions = computed(() => [
  { value: 'EQ', label: t('route.operatorEq') },
  { value: 'NE', label: t('route.operatorNe') },
  { value: 'CONTAINS', label: t('route.operatorContains') },
  { value: 'REGEX', label: t('route.operatorRegex') },
  { value: 'EXISTS', label: t('route.operatorExists') },
  { value: 'GT', label: t('route.operatorGt') },
  { value: 'LT', label: t('route.operatorLt') }
])

defineExpose({ onAdd, onDelete, updateTargetRoute, local })
</script>

<style scoped>
.toolbar { margin-bottom: 12px; }
.cond-type-cell { display: flex; align-items: center; gap: 4px; }
.cond-type-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 11px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  cursor: help;
  flex: none;
}
.weight-cell { display: flex; align-items: center; gap: 8px; }
.weight-error {
  color: var(--app-danger);
  font-size: 12px;
  margin-top: 2px;
}
</style>
