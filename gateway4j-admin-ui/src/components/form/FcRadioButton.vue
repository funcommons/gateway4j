<script setup lang="ts">
defineOptions({ name: 'FcRadioButton' })
/**
 * FcRadioButton — 分段按钮单选项 (SDK). 等价 el-radio-button.
 *
 * 必须放在 FcRadioGroup 内. 相邻按钮共用边框, 选中项高亮.
 *
 * 用法:
 *   <FcRadioGroup v-model="range" variant="button">
 *     <FcRadioButton value="7d">7天</FcRadioButton>
 *     <FcRadioButton value="30d">30天</FcRadioButton>
 *   </FcRadioGroup>
 */
import { computed, inject } from 'vue'
import { useFormDisabled } from 'element-plus'
import { FC_RADIO_GROUP_KEY, type RadioValue } from './radioContext'

export interface FcRadioButtonProps {
  value: RadioValue
  /** 禁用. 不传时继承所在分组 (分组本身再继承 el-form). */
  disabled?: boolean
}

/**
 * disabled **故意不给默认值**: Boolean prop 缺省会被 Vue cast 成 false,
 * 那样 `props.disabled` 恒为 false, 与分组的 OR 语义冲突.
 * 显式 `undefined` → 编译成 `default: undefined` → prop 真保持 undefined.
 */
const props = withDefaults(defineProps<FcRadioButtonProps>(), { disabled: undefined })

const group = inject(FC_RADIO_GROUP_KEY, null)

const checked = computed(() => group?.value.value === props.value)
/**
 * 禁用链: 自身 prop > 所在分组 (分组已解析过 el-form 继承) > el-form.
 * 与 EP 的 el-radio 同一套 (useFormDisabled(fallback=radioGroup.disabled)).
 */
const formDisabled = useFormDisabled(computed(() => group?.disabled.value))
const isDisabled = computed(() => formDisabled.value)
const size = computed(() => group?.size.value ?? 'default')

function onClick() {
  if (isDisabled.value) return
  group?.pick(props.value)
}
</script>

<template>
  <button
    type="button"
    role="radio"
    :aria-checked="checked"
    :disabled="isDisabled"
    class="fc-radio-button"
    :class="[`size-${size}`, { 'is-checked': checked, 'is-disabled': isDisabled }]"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.fc-radio-button {
  appearance: none;
  border: none;
  border-left: 1px solid var(--app-separator);
  background: var(--app-bg-card);
  color: var(--app-text-primary);
  padding: 8px 16px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, transform 0.1s ease;
  outline: none;

  &:first-child { border-left: none; }

  &.size-small { padding: 4px 12px; font-size: 12px; }
  &.size-large { padding: 12px 20px; font-size: 16px; }

  /* 焦点环：分组容器 overflow:hidden，用 inset 环避免被裁切；
     --app-focus-ring 对卡片底 ≥3:1，选中态（底色即主色）换成 --app-on-primary 才有对比。 */
  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--app-focus-ring);
  }

  &.is-checked:focus-visible {
    box-shadow: inset 0 0 0 2px var(--app-on-primary);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &.is-checked {
    background: var(--app-primary-fill);
    color: var(--app-on-primary);
    border-left-color: var(--app-primary-fill);
  }

  /* 禁用三通道: 透明度 + 光标 + 原生 disabled */
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

/* Hallmark gate 27：按下缩放属动效，需有 reduced-motion 兜底 */
@media (prefers-reduced-motion: reduce) {
  .fc-radio-button {
    transition: none;
  }

  .fc-radio-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
