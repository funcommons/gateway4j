<script setup lang="ts">
/**
 * FcSelect — el-select 薄封装 (SDK).
 *
 * 替代散落的 <el-select class="custom-select"> 写法,
 * 统一空态文案、loading、清空、远程搜索.
 *
 * 用法:
 *   <FcSelect v-model="v" :options="opts" placeholder="请选择" />
 *   <FcSelect v-model="v" :options="opts" :loading="loading" remote @search="onSearch" />
 *   <FcSelect v-model="v" :options="opts">
 *     <template #empty>暂无数据</template>
 *   </FcSelect>
 */
import { computed, useAttrs } from 'vue'
import type { SelectOption } from './_types'

defineOptions({ name: 'FcSelect' })

export interface FcSelectProps {
  modelValue: any
  /** 列定义 (声明式用法; 不传则用 default slot 透传 el-option). */
  options?: SelectOption[]
  placeholder?: string
  clearable?: boolean
  /** 禁用. 不传时继承 el-form 的 disabled. */
  disabled?: boolean
  loading?: boolean
  /** 远程搜索模式 (启用 filterable + remote). */
  remote?: boolean
  /** 多选. */
  multiple?: boolean
  /** 尺寸. 不传时继承 el-form 的 size. */
  size?: 'small' | 'default' | 'large'
  /** 空态文案. 默认 '无数据'. */
  emptyText?: string
}

/**
 * disabled / size **故意不给默认值** —— EP 的 el-select 用
 * `props.disabled ?? 继承值` / `props.size || 继承值` 决定禁用与尺寸,
 * 显式写死 `disabled: false` / `size: 'default'` 会把「继承 el-form」的
 * 语义压死（el-form size="small" 对本组件无效）。
 *
 * 注意：Boolean 型 prop 光「不写进 withDefaults」还不够 ——
 * Vue 会把「缺省的 Boolean prop」自动 cast 成 false（`shouldCast`），
 * 那样 `props.disabled` 还是 false，一样压死继承。
 * 必须显式写 `disabled: undefined`（编译成 `default: undefined`），
 * prop 才会真的保持 undefined，EP 才能走「继承 el-form」。
 */
const props = withDefaults(defineProps<FcSelectProps>(), {
  clearable: false,
  disabled: undefined,
  loading: false,
  remote: false,
  multiple: false,
  size: undefined,
  emptyText: '无数据',
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
  change: [value: any]
  search: [query: string]
  clear: []
  'visible-change': [visible: boolean]
}>()

const attrs = useAttrs()
const filterable = computed(() => props.remote || true)
const optionsList = computed(() => props.options ?? [])
const remote = computed(() => props.remote)
const remoteMethod = computed(() => props.remote ? (q: string) => emit('search', q) : undefined)
const listeners = computed(() => ({
  'update:modelValue': (v: any) => emit('update:modelValue', v),
  change: (v: any) => emit('change', v),
  clear: () => emit('clear'),
  'visible-change': (v: boolean) => emit('visible-change', v),
}))
</script>

<template>
  <div class="fc-select" :class="size ? [`size-${size}`] : undefined">
    <el-select
      v-bind="attrs"
      :model-value="modelValue"
      :placeholder="placeholder"
      :clearable="clearable"
      :disabled="disabled"
      :loading="loading"
      :multiple="multiple"
      :size="size"
      :filterable="filterable"
      :remote="remote"
      :remote-method="remoteMethod"
      v-on="listeners"
    >
      <el-option
        v-for="opt in optionsList"
        :key="String(opt.value)"
        :label="opt.label"
        :value="opt.value"
        :disabled="opt.disabled"
      />
      <template v-if="$slots.empty || emptyText" #empty>
        <slot name="empty">{{ emptyText }}</slot>
      </template>
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <!-- default slot: 透传业务侧自定义 el-option (兼容已有 el-select 用法) -->
      <slot />
    </el-select>
  </div>
</template>

<style scoped lang="scss">
.fc-select {
  width: 100%;
}
</style>
