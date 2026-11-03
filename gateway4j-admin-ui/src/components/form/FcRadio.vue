<script setup lang="ts">
defineOptions({ name: 'FcRadio' })
/**
 * FcRadio — 圆点单选项 (SDK). 等价 el-radio.
 *
 * 必须放在 FcRadioGroup 内 (通过 inject 拿分组状态).
 * label 走 default slot.
 *
 * 用法:
 *   <FcRadioGroup v-model="v">
 *     <FcRadio value="a">选项A</FcRadio>
 *     <FcRadio value="b" disabled>选项B</FcRadio>
 *   </FcRadioGroup>
 */
import { computed, inject } from 'vue'
import { useFormDisabled } from 'element-plus'
import { FC_RADIO_GROUP_KEY, type RadioValue } from './radioContext'

export interface FcRadioProps {
  value: RadioValue
  /** 禁用. 不传时继承所在分组 (分组本身再继承 el-form). */
  disabled?: boolean
}

/**
 * disabled **故意不给默认值**: Boolean prop 缺省会被 Vue cast 成 false,
 * 那样 `props.disabled` 恒为 false, 与分组的 OR 语义冲突.
 * 显式 `undefined` → 编译成 `default: undefined` → prop 真保持 undefined.
 */
const props = withDefaults(defineProps<FcRadioProps>(), { disabled: undefined })

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
  <label
    class="fc-radio"
    :class="[`size-${size}`, { 'is-checked': checked, 'is-disabled': isDisabled }]"
  >
    <span
      class="fc-radio__input"
      role="radio"
      :aria-checked="checked"
      tabindex="0"
      @click="onClick"
      @keydown.enter.prevent="onClick"
      @keydown.space.prevent="onClick"
    >
      <span class="fc-radio__dot" />
    </span>
    <span class="fc-radio__label"><slot /></span>
  </label>
</template>

<style scoped lang="scss">
.fc-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  color: var(--app-text-primary);

  &.size-small { font-size: 12px; }
  &.size-large { font-size: 16px; }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.fc-radio__input {
  --fc-radio-size: 16px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--fc-radio-size);
  height: var(--fc-radio-size);
  border: 1px solid var(--app-separator);
  border-radius: 50%;
  background: var(--app-bg-card);
  transition: border-color 0.2s, background 0.2s;
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: 2px;
  }
}

.fc-radio.size-small .fc-radio__input { --fc-radio-size: 14px; }
.fc-radio.size-large .fc-radio__input { --fc-radio-size: 18px; }

.fc-radio__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-bg-card);
  transform: scale(0);
  transition: transform 0.2s;
}

.fc-radio.is-checked .fc-radio__input {
  border-color: var(--app-accent-text);
  background: var(--app-primary-fill);
}

.fc-radio.is-checked .fc-radio__dot {
  transform: scale(1);
}

.fc-radio.is-checked .fc-radio__label {
  color: var(--app-accent-text);
}
</style>
