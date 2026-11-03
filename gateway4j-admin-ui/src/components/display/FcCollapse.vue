<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ name: 'FcCollapse', inheritAttrs: false })
/**
 * FcCollapse — EP 折叠面板薄封装 (SDK).
 *
 * 替代业务页裸用 EP 折叠面板（环境对比的逐路由字段差异折叠面板）。
 *
 * 薄封装原则：**根节点就是折叠面板本身**（不额外套 div）——
 * 业务侧挂的 class（env-diff__collapse 等）仍然作用在同一个元素上。
 *
 * 子项用 FcCollapseItem（内部渲染 EP 的折叠项），折叠箭头由 FcCollapseItem
 * 用 FcIcon(remixicon) 提供 —— 装饰性图标不用 emoji（Hallmark 30a）。
 *
 * 用法:
 *   <FcCollapse v-model="activeNames" class="env-diff__collapse">
 *     <FcCollapseItem v-for="c in changed" :key="c.route_name"
 *                     :name="c.route_name" :title="c.route_name">
 *       内容
 *     </FcCollapseItem>
 *   </FcCollapse>
 */
export interface FcCollapseProps {
  /** 展开项 name 列表（非 accordion）或单个 name（accordion）。 */
  modelValue?: string[] | string | number
  /** 手风琴模式：同时只展开一项。 */
  accordion?: boolean
  /** 箭头位置。默认 'right'。 */
  expandIconPosition?: 'left' | 'right'
}

const props = withDefaults(defineProps<FcCollapseProps>(), {
  accordion: false,
  expandIconPosition: 'right',
})

const emit = defineEmits<{
  'update:modelValue': [value: string[] | string | number]
  change: [value: string[] | string | number]
}>()

const attrs = useAttrs()

const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...(attrs as Record<string, unknown>),
  'model-value': props.modelValue,
  accordion: props.accordion,
  'expand-icon-position': props.expandIconPosition,
}))

const listeners = computed(() => ({
  'update:modelValue': (v: string[] | string | number) => emit('update:modelValue', v),
  change: (v: string[] | string | number) => emit('change', v),
}))
</script>

<template>
  <ElCollapse class="fc-collapse" v-bind="bindAttrs" v-on="listeners">
    <slot />
  </ElCollapse>
</template>
