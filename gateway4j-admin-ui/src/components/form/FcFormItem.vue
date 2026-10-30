<script setup lang="ts">
defineOptions({ name: 'FcFormItem' })
/**
 * FcFormItem — el-form-item 薄封装 (SDK).
 *
 * 统一 label 字号/字重、必填星号位置、错误文案样式.
 * 业务侧无需再写 :deep(.el-form-item__label) 之类覆写.
 *
 * 用法:
 *   <FcFormItem label="姓名" required error="必填">
 *     <FcInput v-model="name" />
 *   </FcFormItem>
 *
 * 跟 el-form 校验配合:
 *   <el-form :model="form" :rules="rules">
 *     <FcFormItem prop="name" label="姓名">...</FcFormItem>
 *   </el-form>
 */
import { computed, useAttrs } from 'vue'

interface Props {
  /** 标签文案. */
  label?: string
  /** 字段名 (el-form 校验用). */
  prop?: string
  /**
   * ⚠️ 故意不声明 `required`：Vue 对 Boolean prop 有缺省转型（未传也是 false），
   * 而显式 required=false 会压死 el-form-item 从 rules 推导必填的语义——
   * 必填星号/校验展示全部失效（2026-10-30 e2e 03-07/06-08 二分实锤）。
   * 调用方显式传 required 时经 attrs 透传，未传则由 el-form-item 自行推导。
   * 同理 error 只在显式传入时下发（error watcher 会重置校验态）。
   */
  /** 错误文案 (覆盖 el-form 注入的错误). */
  error?: string
  /** 标签宽度. */
  labelWidth?: string | number
  /** 内容区右对齐文案 (如单位、提示). */
  hint?: string
}

const props = defineProps<Props>()

const attrs = useAttrs()
/**
 * required / error 只在显式传入时下发给 el-form-item：
 * - 显式 :required="false" 会压死 rules 推导的必填校验（EP 语义：未传才推导）；
 * - 显式 :error=undefined 会触发 EP 的 error watcher，把校验态重置回 validating，
 *   校验错误永远不渲染（2026-10-30 e2e 03-07/06-08 二分实锤）。
 */
const formItemProps = computed(() => ({
  ...attrs,
  ...(props.error !== undefined ? { error: props.error } : {}),
}))
</script>

<template>
  <el-form-item
    v-bind="formItemProps"
    :prop="prop"
    :label="label"
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
