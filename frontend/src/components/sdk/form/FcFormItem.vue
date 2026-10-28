<script setup lang="ts">
defineOptions({ name: 'FcFormItem' })
import { useAttrs } from 'vue'

interface Props {
  label?: string
  prop?: string
  required?: boolean
  error?: string
  labelWidth?: string | number
  hint?: string
}

withDefaults(defineProps<Props>(), {
  required: false,
})

const attrs = useAttrs()
</script>

<template>
  <el-form-item
    v-bind="attrs"
    :prop="prop"
    :label="label"
    :required="required"
    :error="error"
    :label-width="labelWidth"
    class="fc-form-item"
  >
    <slot />
    <template v-if="$slots.label" #label><slot name="label" /></template>
    <template v-if="hint" #error>
      <slot name="error">{{ error }}</slot>
      <div class="fc-form-item__hint">{{ hint }}</div>
    </template>
    <template v-else-if="$slots.error" #error><slot name="error" /></template>
  </el-form-item>
</template>

<style scoped lang="scss">
.fc-form-item {
  :deep(.el-form-item__label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text, inherit);
  }

  :deep(.el-form-item__error) {
    font-size: 12px;
    padding-top: 2px;
  }
}

.fc-form-item__hint {
  font-size: 12px;
  color: var(--app-text-tertiary, #999);
  line-height: 1.4;
  padding-top: 2px;
}
</style>
