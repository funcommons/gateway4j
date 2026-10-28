<script setup lang="ts">
defineOptions({ name: 'FcInput' })
import { computed, useAttrs } from 'vue'

interface Props {
  modelValue: any
  error?: string
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  readonly?: boolean
  type?: 'text' | 'password' | 'textarea' | 'number'
  prefixIcon?: unknown
  size?: 'small' | 'default' | 'large'
  maxlength?: number | string
  rows?: number | string
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
  'update:modelValue': [value: any]
  enter: [value: any]
  input: [value: any]
  change: [value: any]
  clear: []
}>()

const attrs = useAttrs()
const listeners = computed(() => ({
  'update:modelValue': (v: any) => emit('update:modelValue', v),
  input: (v: any) => emit('input', v),
  change: (v: any) => emit('change', v),
  keyup: (e: KeyboardEvent) => { if (e.key === 'Enter') emit('enter', (e.target as HTMLInputElement).value) },
  clear: () => emit('clear'),
}))
</script>

<template>
  <div class="fc-input" :class="{ 'has-error': !!error, [`size-${size}`]: true }">
    <el-input
      v-bind="attrs"
      :model-value="modelValue"
      :placeholder="placeholder"
      :clearable="clearable"
      :disabled="disabled"
      :readonly="readonly"
      :type="type"
      :size="size"
      :maxlength="maxlength"
      :show-word-limit="!!maxlength"
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
