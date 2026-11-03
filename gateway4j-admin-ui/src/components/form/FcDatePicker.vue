<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ name: 'FcDatePicker', inheritAttrs: false })
/**
 * FcDatePicker — EP 日期选择器薄封装 (SDK).
 *
 * 替代业务页裸用 EP 日期选择器（审计日志时间范围筛选）.
 *
 * 薄封装原则：**根节点就是日期选择器本身**（不额外套 div）——
 * 业务侧挂的 data-testid / style 仍然落在同一个元素上。
 *
 * 面板（popover）会被 teleport 到 body，所以：
 *  - 通过 `popper-class` 挂上 fc-date-picker-popper，面板底色/描边接应用主题
 *    （--app-bg-card / --app-border），深浅色跟着 data-theme 走；
 *  - 面板内部文字沿用 EP 自己的 token —— EP 的暗色 token 挂在 html.dark 上，
 *    FcThemeProvider 在暗色态会挂这个类，所以文字颜色自动跟着切暗。
 *
 * 相对裸 EP 的增量（与同批 FcCheckbox / FcInputNumber 对齐）：
 *  - 键盘焦点环（26a）画在内层原生 input 上，瞬时出现不渐显;
 *  - 禁用态三通道（39a）：透明度 + 光标 not-allowed + 原生 disabled，不只靠 opacity;
 *  - disabled / size 不给默认值 —— 保留 EP「继承 el-form」语义。
 *
 * 用法:
 *   <FcDatePicker v-model="date" type="date" value-format="YYYY-MM-DD" />
 *   <FcDatePicker v-model="range" type="datetimerange"
 *                 value-format="YYYY-MM-DDTHH:mm:ss"
 *                 :start-placeholder="t('start')" :end-placeholder="t('end')"
 *                 data-testid="audit-filter-range" @change="onFilter" />
 */
export interface FcDatePickerShortcut {
  /** 快捷项文案。 */
  text: string
  /** 快捷项取值：Date 或返回 Date 的函数。 */
  value: Date | (() => Date)
}

export interface FcDatePickerProps {
  /** 选中值（受控）。区间类型为 [起, 止] 数组。 */
  modelValue?: string | string[] | number | Date | null
  /** 选择器类型。 */
  type?:
    | 'date'
    | 'datetime'
    | 'daterange'
    | 'datetimerange'
    | 'month'
    | 'year'
    | 'dates'
    | 'week'
  /** 展示格式（不传则用 EP 默认）。 */
  format?: string
  /** 绑定值格式（不传则绑定 Date 对象）。 */
  valueFormat?: string
  /** 占位符（单值模式）。 */
  placeholder?: string
  /** 区间起始占位符。 */
  startPlaceholder?: string
  /** 区间结束占位符。 */
  endPlaceholder?: string
  /** 区间分隔符。 */
  rangeSeparator?: string
  /** 禁用。不传时继承 el-form 的 disabled。 */
  disabled?: boolean
  /** 只读。 */
  readonly?: boolean
  /** 是否可手动输入。 */
  editable?: boolean
  /** 是否显示清空按钮。默认 true。 */
  clearable?: boolean
  /** 尺寸。不传时继承 el-form 的 size。 */
  size?: 'large' | 'default' | 'small'
  /** 快捷选项。 */
  shortcuts?: FcDatePickerShortcut[]
  /** 面板弹层 class（会与内置的 fc-date-picker-popper 合并）。 */
  popperClass?: string
}

/**
 * disabled 显式写 `undefined`（编译成 `default: undefined`）——
 * Vue 会把「缺省的 Boolean prop」自动 cast 成 false，
 * 那样 `props.disabled` 还是 false，就把「继承 el-form disabled」的语义压死。
 * size 是 String 型，不会被 cast，保持不写即可。
 */
const props = withDefaults(defineProps<FcDatePickerProps>(), {
  type: 'date',
  clearable: true,
  shortcuts: () => [],
  disabled: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | string[] | Date | number | null]
  change: [value: string | string[] | Date | number | null]
}>()

const attrs = useAttrs()

/** 面板 class：内置 fc-date-picker-popper + 调用方自定义（两者都生效）。 */
const popperClass = computed(() =>
  ['fc-date-picker-popper', props.popperClass].filter(Boolean).join(' '),
)

const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...(attrs as Record<string, unknown>),
  'model-value': props.modelValue,
  type: props.type,
  format: props.format,
  'value-format': props.valueFormat,
  placeholder: props.placeholder,
  'start-placeholder': props.startPlaceholder,
  'end-placeholder': props.endPlaceholder,
  'range-separator': props.rangeSeparator,
  disabled: props.disabled,
  readonly: props.readonly,
  editable: props.editable,
  clearable: props.clearable,
  size: props.size,
  shortcuts: props.shortcuts,
}))

const listeners = computed(() => ({
  'update:modelValue': (v: string | string[] | Date | number | null) => emit('update:modelValue', v),
  change: (v: string | string[] | Date | number | null) => emit('change', v),
}))
</script>

<template>
  <ElDatePicker
    class="fc-date-picker"
    v-bind="bindAttrs"
    :popper-class="popperClass"
    v-on="listeners"
  />
</template>

<style>
/* 非 scoped：EP 日期选择器的面板 teleport 到 body，scoped 对它失效。
   弹层底色 / 描边接应用主题 token —— 深浅色跟着 data-theme 走，
   面板内文字沿用 EP 自己的 token（EP 暗色 token 挂在 html.dark 上）。 */
.fc-date-picker-popper .el-picker-panel {
  background-color: var(--app-bg-card);
  border-color: var(--app-border);
}

.fc-date-picker-popper .el-picker-panel__footer {
  background-color: var(--app-bg-muted);
  border-top-color: var(--app-border);
}
</style>

<style scoped lang="scss">
.fc-date-picker {
  /* 26a：焦点环画在内层原生 input 上，键盘导航时瞬时出现（无 transition） */
  :deep(.el-input__inner:focus-visible) {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: -1px;
  }

  /* 39a：禁用态三通道 —— 透明度 + 光标 + 底色，不只靠 opacity。
     EP 已经把原生 input 标成 disabled，这里补光标与视觉通道。 */
  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;

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
