<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ name: 'FcInputNumber', inheritAttrs: false })
/**
 * FcInputNumber — EP 数字输入框薄封装 (SDK).
 *
 * 替代业务页裸用 EP 数字输入框（路由排序 / 权重 / 优先级 / 安全配置时长 …）.
 *
 * 薄封装原则：**根节点就是数字输入框本身**（不额外套 div）——
 * 业务侧挂的 style="width:100%" / data-testid 仍然落在同一个元素上。
 *
 * 相对裸 EP 的增量：
 *  - 数字用等宽数字（Hallmark F6）—— 增减时字符宽度不跳，列宽不抖;
 *  - 键盘焦点环（26a）画在内层原生 input 上，瞬时出现不渐显;
 *  - 禁用态三通道（39a）：透明度 + 光标 not-allowed + 底色，不只靠 opacity;
 *  - disabled / size 不给默认值 —— 保留 EP「继承 el-form」语义。
 *
 * 用法:
 *   <FcInputNumber v-model="sortOrder" :min="1" :max="9999" />
 *   <FcInputNumber :model-value="w" :min="1" :max="100" :step="1" step-strictly
 *                  data-testid="weight" @update:model-value="onWeight" />
 */
export interface FcInputNumberProps {
  /** 数值（受控）。 */
  modelValue?: number | null
  /** 最小值。 */
  min?: number
  /** 最大值。 */
  max?: number
  /** 步长。默认 1。 */
  step?: number
  /** 只允许 step 的整数倍。 */
  stepStrictly?: boolean
  /** 小数位数。 */
  precision?: number
  /** 禁用。不传时继承 el-form 的 disabled。 */
  disabled?: boolean
  /** 只读。 */
  readonly?: boolean
  /** 占位符。 */
  placeholder?: string
  /** 尺寸。不传时继承 el-form 的 size。 */
  size?: 'large' | 'default' | 'small'
  /** 是否显示增减按钮。默认 true。 */
  controls?: boolean
  /** 增减按钮位置：''=两侧，'right'=右侧。 */
  controlsPosition?: '' | 'right'
  /**
   * 清空时的取值。
   *
   * 类型与 EP 对齐: `null | number | 'min' | 'max'` —— 游离字符串不在 EP 契约内，
   * 传了会触发 EP 的 prop 校验告警。
   */
  valueOnClear?: null | number | 'min' | 'max'
  /** 原生 input 的 id。 */
  id?: string
  /** 原生 input 的 name。 */
  name?: string
}

/**
 * disabled 显式写 `undefined`（编译成 `default: undefined`）——
 * Vue 会把「缺省的 Boolean prop」自动 cast 成 false，
 * 那样 `props.disabled` 还是 false，就把「继承 el-form disabled」的语义压死。
 * size 是 String 型，不会被 cast，保持不写即可。
 */
const props = withDefaults(defineProps<FcInputNumberProps>(), {
  step: 1,
  controls: true,
  controlsPosition: '',
  disabled: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: number | undefined]
  change: [value: number | undefined, oldValue: number | undefined]
  input: [value: number | undefined]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const attrs = useAttrs()

/**
 * disabled / size 不给默认值 —— EP 用 `props.disabled ?? 继承值` 决定禁用，
 * 显式传 false 会把「继承 el-form disabled」的语义压死。
 */
const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...(attrs as Record<string, unknown>),
  'model-value': props.modelValue,
  min: props.min,
  max: props.max,
  step: props.step,
  'step-strictly': props.stepStrictly,
  precision: props.precision,
  disabled: props.disabled,
  readonly: props.readonly,
  placeholder: props.placeholder,
  size: props.size,
  controls: props.controls,
  'controls-position': props.controlsPosition,
  'value-on-clear': props.valueOnClear,
  id: props.id,
  name: props.name,
}))

const listeners = computed(() => ({
  'update:modelValue': (v: number | undefined) => emit('update:modelValue', v),
  change: (v: number | undefined, old: number | undefined) => emit('change', v, old),
  input: (v: number | undefined) => emit('input', v),
  blur: (e: FocusEvent) => emit('blur', e),
  focus: (e: FocusEvent) => emit('focus', e),
}))
</script>

<template>
  <ElInputNumber class="fc-input-number" v-bind="bindAttrs" v-on="listeners" />
</template>

<style scoped lang="scss">
.fc-input-number {
  /* F6：数字用等宽数字 —— 增减时字符宽度不跳，输入框宽度不抖 */
  :deep(.el-input__inner) {
    font-variant-numeric: tabular-nums;
  }

  /* 26a：焦点环画在内层原生 input 上，键盘导航时瞬时出现（无 transition） */
  :deep(.el-input__inner:focus-visible) {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: -1px;
  }

  /* 39a：禁用态三通道 —— 透明度 + 光标 + 底色，不只靠 opacity */
  &.is-disabled {
    cursor: not-allowed;

    :deep(.el-input__wrapper) {
      cursor: not-allowed;
      background-color: var(--app-bg-muted);
    }

    :deep(.el-input__inner) {
      cursor: not-allowed;
    }
  }
}
</style>
