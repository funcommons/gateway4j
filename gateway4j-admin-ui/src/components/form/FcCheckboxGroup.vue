<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ name: 'FcCheckboxGroup', inheritAttrs: false })
/**
 * FcCheckboxGroup — EP CheckboxGroup 薄封装 (SDK).
 *
 * 替代业务页裸用 EP 勾选分组（角色授权 / 角色成员多选）.
 *
 * 薄封装原则：**根节点就是分组组件本身**（不额外套 div）——
 * 业务侧给分组挂的布局 class（flex / gap / 换行）
 * 仍然作用在同一个元素上，视觉不变。
 *
 * 子项用 FcCheckbox（内部渲染 EP 的勾选框），分组上下文通过
 * provide/inject 穿透中间组件生效 —— 选中值 / min / max 限制照常工作。
 *
 * 用法:
 *   <FcCheckboxGroup v-model="checked" class="grant-group-items">
 *     <FcCheckbox v-for="p in list" :key="p.id" :value="p.id">{{ p.label }}</FcCheckbox>
 *   </FcCheckboxGroup>
 *
 *   <FcCheckboxGroup v-model="checked" :min="1" :max="3" />
 *
 *   <!-- 不给默认插槽时，EP 用 options prop 自己的 fallback 渲染 -->
 *   <FcCheckboxGroup v-model="checked" :options="[{ label: '甲', value: 'a' }]" />
 */
export interface FcCheckboxGroupOption {
  /** 显示文案（EP 的 props.label 键，缺省 'label'）。 */
  label?: string | number
  /** 取值（EP 的 props.value 键，缺省 'value'）。 */
  value?: string | number | boolean
  /** 禁用该项。 */
  disabled?: boolean
  /** 其余 EP 原生选项属性透传。 */
  [key: string]: unknown
}

export interface FcCheckboxGroupProps {
  /** 已选中的取值数组（受控）。 */
  modelValue?: Array<string | number | boolean>
  /** 最少选中个数（EP 2.8+）。 */
  min?: number
  /** 最多选中个数（EP 2.8+）。 */
  max?: number
  /** 禁用整个分组。不传时继承 el-form 的 disabled。 */
  disabled?: boolean
  /** 尺寸。不传时继承 el-form 的 size。 */
  size?: 'large' | 'default' | 'small'
  /** 根元素标签（默认 'div'）。 */
  tag?: string
  /**
   * 选项列表（EP 原生 options）。
   *
   * 只在**不给默认插槽**时生效 —— 与 EP 语义一致：默认插槽优先，
   * 没有插槽才由 EP 用 options 自己渲染。
   */
  options?: FcCheckboxGroupOption[]
  /** 渲染成勾选框还是按钮（EP 原生 type，默认 'checkbox'）。 */
  type?: 'checkbox' | 'button'
}

/**
 * disabled 显式写 `undefined`（编译成 `default: undefined`）——
 * Vue 会把「缺省的 Boolean prop」自动 cast 成 false，
 * 那样 `props.disabled` 还是 false，就把「继承 el-form disabled」的语义压死。
 * size 是 String 型，不会被 cast，保持不写即可。
 */
const props = withDefaults(defineProps<FcCheckboxGroupProps>(), {
  disabled: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: Array<string | number | boolean>]
  change: [value: Array<string | number | boolean>]
}>()

const attrs = useAttrs()

/**
 * disabled / size 不给默认值 —— EP 用 `props.disabled ?? 继承值` 决定禁用，
 * 显式传 false 会把「继承 el-form disabled」的语义压死（见上面的 withDefaults 注释）。
 */
const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...(attrs as Record<string, unknown>),
  'model-value': props.modelValue,
  min: props.min,
  max: props.max,
  disabled: props.disabled,
  size: props.size,
  tag: props.tag,
  options: props.options,
  type: props.type,
}))

const listeners = computed(() => ({
  'update:modelValue': (v: Array<string | number | boolean>) => emit('update:modelValue', v),
  change: (v: Array<string | number | boolean>) => emit('change', v),
}))
</script>

<template>
  <ElCheckboxGroup class="fc-checkbox-group" v-bind="bindAttrs" v-on="listeners">
    <!--
      有默认插槽才渲染 —— 让 EP 在**没有**插槽时走自己的 options fallback。
      （EP 的 renderSlot 拿到合法 vnode 就跳过 fallback，所以这里不能无条件渲染 <slot />。）
    -->
    <slot v-if="$slots.default" />
  </ElCheckboxGroup>
</template>
