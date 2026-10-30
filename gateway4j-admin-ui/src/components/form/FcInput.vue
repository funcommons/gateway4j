<script setup lang="ts">
defineOptions({ name: 'FcInput', inheritAttrs: false })
/**
 * FcInput — el-input 薄封装 (SDK).
 *
 * 替代项目里散落的 <el-input class="custom-input"> 写法,
 * 统一 placeholder 颜色、错误态、清空按钮、prefix/suffix 槽.
 *
 * 业务侧无需再写 :deep(.el-input__wrapper) 覆写样式.
 *
 * 用法:
 *   <FcInput v-model="val" placeholder="请输入" clearable />
 *   <FcInput v-model="email" error="邮箱格式错误" />
 *   <FcInput v-model="kw" @enter="search">
 *     <template #prefix><el-icon><Search /></el-icon></template>
 *   </FcInput>
 */
import { computed, useAttrs } from 'vue'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelValue: any
  /** 错误提示 (有值时显示红色边框 + 下方文案). */
  error?: string
  /** 占位符. */
  placeholder?: string
  /** 显示清空按钮. */
  clearable?: boolean
  /** 禁用. */
  disabled?: boolean
  /** 只读. */
  readonly?: boolean
  /** 类型. 默认 'text'. */
  type?: 'text' | 'password' | 'textarea' | 'number'
  /** 前置图标 (EP icon). */
  prefixIcon?: unknown
  /** 输入框尺寸. */
  size?: 'small' | 'default' | 'large'
  /** 最大长度 (show-word-limit 同时启用). */
  maxlength?: number | string
  /** textarea 行数. */
  rows?: number | string
  /** textarea 自适应高度. */
  autosize?: boolean | { minRows?: number; maxRows?: number }
}

const props = withDefaults(defineProps<Props>(), {
  clearable: false,
  disabled: false,
  readonly: false,
  type: 'text',
  size: 'default',
})

const emit = defineEmits<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'update:modelValue': [value: any]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enter: [value: any]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: [value: any]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  change: [value: any]
  clear: []
}>()

const attrs = useAttrs()
/**
 * attrs 拆分透传：class/style 留在 .fc-input 包装层（保持布局类调用方语义），
 * 其余（id / data-testid / 原生属性）给内部 el-input 落到原生控件 —— 单份。
 * 不拆分会双份透传（隐式 fallthrough + 手动 v-bind），Playwright 严格模式
 * 对重复 data-testid 直接抛错（2026-10-30 e2e 03-14/03-15 实锤）。
 */
const rootAttrs = computed<Record<string, unknown>>(() => ({
  class: (attrs as Record<string, unknown>).class,
  style: (attrs as Record<string, unknown>).style,
}))
const inputAttrs = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { class: _c, style: _s, ...rest } = attrs as Record<string, unknown>
  return rest
})
/** el-input 的 rows 只收 number；公开 prop 宽容 string，绑定前归一。 */
const rowsBound = computed(() => (props.rows == null ? undefined : Number(props.rows)))
const listeners = computed(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'update:modelValue': (v: any) => emit('update:modelValue', v),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: (v: any) => emit('input', v),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  change: (v: any) => emit('change', v),
  keyup: (e: KeyboardEvent) => { if (e.key === 'Enter') emit('enter', (e.target as HTMLInputElement).value) },
  clear: () => emit('clear'),
}))
</script>

<template>
  <div class="fc-input" v-bind="rootAttrs" :class="{ 'has-error': !!error, [`size-${size}`]: true }">
    <el-input
      v-bind="inputAttrs"
      :model-value="modelValue"
      :placeholder="placeholder"
      :clearable="clearable"
      :disabled="disabled"
      :readonly="readonly"
      :type="type"
      :size="size"
      :maxlength="maxlength"
      :show-word-limit="!!maxlength"
      :rows="rowsBound"
      :autosize="autosize"
      :prefix-icon="prefixIcon as any"
      v-on="listeners"
    >
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
      <template v-if="$slots.prepend" #prepend><slot name="prepend" /></template>
      <template v-if="$slots.append" #append><slot name="append" /></template>
    </el-input>
    <div v-if="error" class="fc-input__error">{{ error }}</div>
  </div>
</template>

<style scoped lang="scss">
.fc-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;

  &.has-error :deep(.el-input__wrapper),
  &.has-error :deep(.el-textarea__inner) {
    box-shadow: 0 0 0 1px var(--app-color-danger, #ff3b30) inset;
  }

  &.has-error :deep(.el-input__wrapper:hover),
  &.has-error :deep(.el-textarea__inner:hover) {
    box-shadow: 0 0 0 1px var(--app-color-danger, #ff3b30) inset;
  }

  &.has-error :deep(.el-input__wrapper.is-focus),
  &.has-error :deep(.el-textarea__inner:focus) {
    box-shadow: 0 0 0 1px var(--app-color-danger, #ff3b30) inset;
  }
}

.fc-input__error {
  font-size: 12px;
  color: var(--app-color-danger, #ff3b30);
  line-height: 1.4;
}
</style>
