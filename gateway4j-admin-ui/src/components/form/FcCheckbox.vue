<script setup lang="ts">
import { computed, getCurrentInstance, useAttrs, useSlots } from 'vue'

defineOptions({ name: 'FcCheckbox', inheritAttrs: false })
/**
 * FcCheckbox — EP Checkbox 薄封装 (SDK).
 *
 * 替代业务页裸用 EP 勾选框（登录页「记住我」/ 角色授权多选 / 画布批量勾选）.
 *
 * 薄封装原则：**不改 EP 的 DOM 结构** —— 视觉隐藏的原生 input 仍是 EP 那个
 * `__original` 结尾的类、勾选框本体仍带 EP 的 checkbox 主类，
 * 所以 e2e 里按这两个类定位的逻辑不受影响.
 *
 * 相对裸 EP 的增量：
 *  - 受控/非受控语义正确（见 hasModel 注释）—— 薄封装最容易踩的坑；
 *  - 分组内取值走 `value`（EP 3.0 起 `label` 不再当值用）;
 *  - 其余 EP 原生 prop（border-color / true-value / name …）走 attrs 透传.
 *
 * 用法:
 *   <FcCheckbox v-model="remember" :label="t('auth.remember')" />
 *   <FcCheckbox :model-value="all" :indeterminate="some" @change="onToggle">全选</FcCheckbox>
 *   <FcCheckboxGroup v-model="checked">
 *     <FcCheckbox v-for="p in list" :key="p.id" :value="p.id">{{ p.label }}</FcCheckbox>
 *   </FcCheckboxGroup>
 */
export interface FcCheckboxProps {
  /** 勾选态（受控）。不传时为非受控（组件内部自持状态）。 */
  modelValue?: boolean | string | number
  /** 勾选框右侧文案（等价 EP 的 label）。 */
  label?: string | number
  /** 在 FcCheckboxGroup 内的取值（等价 EP 的 value）。 */
  value?: string | number | boolean
  /** 半选态（仅视觉）。 */
  indeterminate?: boolean
  /** 禁用。不传时继承 el-form / 所在分组的 disabled。 */
  disabled?: boolean
  /** 尺寸。不传时继承 el-form / 所在分组的 size。 */
  size?: 'large' | 'default' | 'small'
  /** 带边框样式。 */
  border?: boolean
}

/**
 * disabled 显式写 `undefined`（编译成 `default: undefined`）——
 * Vue 会把「缺省的 Boolean prop」自动 cast 成 false，
 * 那样 `props.disabled` 还是 false，就把「继承 el-form / 所在分组 disabled」
 * 的语义压死了。size 是 String 型，不会被 cast，保持不写即可。
 */
const props = withDefaults(defineProps<FcCheckboxProps>(), {
  indeterminate: false,
  border: false,
  disabled: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean | string | number]
  /**
   * change 事件 —— 与 EP 契约对齐: `change(value, event)`.
   *
   * EP 的 Checkbox 发的是 `(checkedValue, 原生 Event)`；薄封装若只透传第一个
   * payload，调用方写 `@change="(v, e) => …"` 拿到的 e 永远是 undefined。
   */
  change: [value: boolean | string | number, event?: Event]
}>()

const attrs = useAttrs()
const slots = useSlots()
const instance = getCurrentInstance()

/**
 * EP 的 Checkbox 用「vnode.props 里是否存在 modelValue 这个 key」判断是否受控
 * （useCheckboxModel.isControlled）。我们若无条件下发 model-value=undefined，
 * 没绑 v-model 的复选框会被误判成受控 —— 点一下不勾上。
 * 所以只有调用方真的传了 model-value 才下发这个 prop。
 */
const hasModel = computed(() => {
  const raw = (instance?.vnode.props ?? {}) as Record<string, unknown>
  return 'modelValue' in raw || 'model-value' in raw
})

/**
 * disabled / size 不给默认值 —— EP 用 `props.disabled ?? 继承值` 决定禁用，
 * 显式传 false 会把「继承 el-form / 分组 disabled」的语义压死。
 */
const bindAttrs = computed<Record<string, unknown>>(() => {
  const b: Record<string, unknown> = { ...(attrs as Record<string, unknown>) }
  if (hasModel.value) b['model-value'] = props.modelValue
  b['label'] = props.label
  b['value'] = props.value
  b['disabled'] = props.disabled
  b['size'] = props.size
  b['indeterminate'] = props.indeterminate
  b['border'] = props.border
  return b
})

const listeners = computed(() => ({
  'update:modelValue': (v: boolean | string | number) => emit('update:modelValue', v),
  // EP 发 `change(value, event)` —— 第二个 payload 原样透传，不丢
  change: (v: boolean | string | number, e?: Event) => emit('change', v, e),
}))

/**
 * 有自定义内容时走 default slot（EP 会用 slot 取代 label 文案），
 * 没有内容时保留 EP 原生行为（label 作文案、无 label 时不渲染空的 label 节点）。
 */
const hasSlot = computed(() => !!slots.default)
</script>

<template>
  <ElCheckbox v-if="hasSlot" class="fc-checkbox" v-bind="bindAttrs" v-on="listeners">
    <slot />
  </ElCheckbox>
  <ElCheckbox v-else class="fc-checkbox" v-bind="bindAttrs" v-on="listeners" />
</template>

<style scoped lang="scss">
/* 禁用三通道（39a）：EP 已给根节点加 not-allowed，这里兜一层，
   保证整块控件（含文案）都是 not-allowed 光标，不只靠透明度。 */
.fc-checkbox.is-disabled {
  cursor: not-allowed;
}

/* 键盘焦点环（26a）：EP 只把焦点环画在勾选框本体上，
   这里提到整块控件层，键盘用户能看到焦点边界；鼠标点击不闪环。 */
.fc-checkbox:has(input:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
  border-radius: 2px;
}
</style>
