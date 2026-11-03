<script setup lang="ts">
defineOptions({ name: 'FcSwitch', inheritAttrs: false })
/**
 * FcSwitch - 原生 switch 实现 (SDK).
 *
 * 不用 el-switch 薄封装, 因为 EP switch 内部 watch(modelValue) 直接设
 * input.value.checked, 在条件渲染切换时 input ref 未挂载会抛
 * "Cannot set properties of undefined (setting 'checked')".
 *
 * 自实现 toggle + a11y, 颜色走品牌 token, 兼容 EP 的 active/inactive value
 * 与文案.
 *
 * 用法:
 *   <FcSwitch v-model="enabled" />
 *   <FcSwitch v-model="opt" active-text="开" inactive-text="关" />
 *   <FcSwitch v-model="sync" loading />
 */
import { computed } from 'vue'
import { useFormDisabled, useFormSize } from 'element-plus'

export interface FcSwitchProps {
  modelValue: boolean | string | number | undefined
  /** 开启值. 默认 true. */
  activeValue?: boolean | string | number
  /** 关闭值. 默认 false. */
  inactiveValue?: boolean | string | number
  /** 开启文案. */
  activeText?: string
  /** 关闭文案. */
  inactiveText?: string
  /** 禁用. 不传时继承 el-form 的 disabled. */
  disabled?: boolean
  /** 加载中. */
  loading?: boolean
  /** 尺寸. 不传时继承 el-form 的 size. */
  size?: 'large' | 'default' | 'small'
  /** 内联文案 (写在 knob 内部). */
  inlinePrompt?: boolean
}

/**
 * disabled / size **故意不给默认值**（见 FcInput 的同款说明）:
 * - Boolean 型 prop 光「不写进 withDefaults」不够 —— Vue 会把缺省 Boolean prop
 *   自动 cast 成 false, 一样压死「继承 el-form」的语义;
 *   必须显式写 `disabled: undefined`（编译成 `default: undefined`）才真保持 undefined.
 * - size 写死 'default' 同理压死 el-form 的 size.
 * 本组件是原生实现 (不是 el-switch), 所以自己用 EP 的 useFormDisabled /
 * useFormSize 解析继承链: 自身 prop > el-form > false / 'default'.
 */
const props = withDefaults(defineProps<FcSwitchProps>(), {
  activeValue: true,
  inactiveValue: false,
  disabled: undefined,
  loading: false,
  size: undefined,
  inlinePrompt: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean | string | number]
  change: [value: boolean | string | number]
}>()

const isActive = computed(() => props.modelValue === props.activeValue)

/** 生效禁用态: 自身 prop > el-form > false. */
const formDisabled = useFormDisabled()
const isDisabled = computed(() => formDisabled.value)
/** 生效尺寸: 自身 prop > el-form > 'default'. */
const formSize = useFormSize()
const resolvedSize = computed(() => props.size || formSize.value || 'default')

const sizeMap = {
  large:   { w: 56, h: 28, knob: 22, font: 14 },
  default: { w: 44, h: 22, knob: 18, font: 12 },
  small:   { w: 36, h: 18, knob: 14, font: 11 },
} as const
const dims = computed(() => sizeMap[resolvedSize.value] ?? sizeMap.default)

function toggle() {
  if (isDisabled.value || props.loading) return
  const next = isActive.value ? props.inactiveValue : props.activeValue
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isActive"
    :disabled="isDisabled || loading"
    class="fc-switch"
    :class="[
      `size-${resolvedSize}`,
      {
        'is-active': isActive,
        'is-disabled': isDisabled,
        'is-loading': loading,
        'has-text': !!activeText || !!inactiveText,
      },
    ]"
    :style="{
      '--fc-switch-w': `${dims.w}px`,
      '--fc-switch-h': `${dims.h}px`,
      '--fc-switch-knob': `${dims.knob}px`,
      '--fc-switch-font': `${dims.font}px`,
    }"
    @click="toggle"
  >
    <span v-if="inactiveText && !isActive" class="fc-switch__label fc-switch__label--inactive">
      {{ inactiveText }}
    </span>
    <span class="fc-switch__track">
      <span class="fc-switch__knob">
        <span v-if="loading" class="fc-switch__spinner" />
        <span v-else-if="inlinePrompt && isActive" class="fc-switch__inline">✓</span>
      </span>
    </span>
    <span v-if="activeText && isActive" class="fc-switch__label fc-switch__label--active">
      {{ activeText }}
    </span>
  </button>
</template>

<style scoped lang="scss">
.fc-switch {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fc-switch-font, 12px);
  line-height: 1;
  outline: none;
  vertical-align: middle;
  user-select: none;
  /* 开关文案不折行 (长文案会把轨道挤歪) */
  white-space: nowrap;

  &:focus-visible .fc-switch__track {
    box-shadow: 0 0 0 2px var(--app-focus-ring);
  }

  /* 按下微缩 */
  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  /* 禁用三通道: 透明度 + 光标 + 原生 disabled */
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-disabled,
  &.is-loading {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.fc-switch__track {
  display: inline-block;
  position: relative;
  width: var(--fc-switch-w, 44px);
  height: var(--fc-switch-h, 22px);
  border-radius: calc(var(--fc-switch-h, 22px) / 2);
  background: var(--app-separator);
  transition: background 0.2s ease;
}

.fc-switch__knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: var(--fc-switch-knob, 18px);
  height: var(--fc-switch-knob, 18px);
  border-radius: 50%;
  background: var(--app-bg-card);
  box-shadow: var(--app-shadow-md);
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 白色旋钮上的 loading spinner 墨色: 原来是白 on 白 (1.00:1, 规则 40) */
  color: color-mix(in srgb, var(--app-primary) 70%, black);
}

.fc-switch.is-active .fc-switch__track {
  background: var(--app-primary);
}

.fc-switch.is-active .fc-switch__knob {
  transform: translateX(calc(var(--fc-switch-w, 44px) - var(--fc-switch-knob, 18px) - 2px));
}

.fc-switch__label {
  color: var(--app-text-secondary);
  font-size: var(--fc-switch-font, 12px);

  &--active {
    color: var(--app-accent-text);
  }
}

.fc-switch__spinner {
  width: 60%;
  height: 60%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: fc-switch-spin 0.6s linear infinite;
}

.fc-switch__inline {
  font-size: 10px;
  color: var(--app-accent-text);
  font-weight: 700;
}

.fc-switch.is-active .fc-switch__inline {
  color: var(--app-on-primary);
}

@keyframes fc-switch-spin {
  to { transform: rotate(360deg); }
}

/* 动效兜底: 用户关闭动效时 spinner 不转、旋钮不滑 */
@media (prefers-reduced-motion: reduce) {
  .fc-switch__spinner {
    animation: none;
  }
  .fc-switch__track,
  .fc-switch__knob {
    transition: none;
  }
  .fc-switch:active:not(:disabled) {
    transform: none;
  }
}
</style>
