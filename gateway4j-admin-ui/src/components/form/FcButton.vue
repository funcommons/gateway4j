<script setup lang="ts">
defineOptions({ name: 'FcButton', inheritAttrs: false })
/**
 * FcButton — el-button 薄封装 (SDK).
 *
 * 替代业务侧散落 <el-button class="custom-btn"> + :deep 覆写.
 * 透传所有 el-button props, 内置统一: 字号、圆角、padding、loading spinner、hover shadow.
 *
 * variant (新增语义层): primary (默认) / secondary / text / danger
 *   - 业务侧写 <FcButton variant="primary"> 等同 <el-button type="primary">
 *   - 也可直接用 el-button 原生 type (type="primary|success|warning|danger|info|default")
 *   - variant 优先级低于显式 type
 *
 * size: sm / md (默认) / lg (FC 命名); 兼容 el-button 的 small/default/large
 *
 * 用法:
 *   <FcButton variant="primary" @click="save">保存</FcButton>
 *   <FcButton variant="danger" :loading="deleting" @click="del">删除</FcButton>
 *   <FcButton variant="text" size="sm" :icon="Edit">编辑</FcButton>
 *   <FcButton type="primary" plain :icon="Check">勾选</FcButton>
 *   <FcButton circle :icon="Edit" />
 */
import { computed, useAttrs, type Component } from 'vue'
import { useFormDisabled } from 'element-plus'

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'small' | 'default' | 'large'

export interface FcButtonProps {
  /** 视觉变体 (语义糖; 显式 type 优先). */
  variant?: ButtonVariant
  /** 尺寸 (FC 命名). */
  size?: ButtonSize
  /** EP 原生 type (优先于 variant). */
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'
  /** 前置图标. */
  icon?: Component | string
  /** 加载中. */
  loading?: boolean
  /** 禁用. 不传时继承 el-form 的 disabled. */
  disabled?: boolean
  /** 块级占满父宽. */
  block?: boolean
  /** 圆形. */
  circle?: boolean
  /** 描边样式. */
  plain?: boolean
  /** 链接样式 (跟 variant=text 重叠). */
  link?: boolean
  /** 文字按钮. */
  text?: boolean
  /** 原生 type. */
  nativeType?: 'button' | 'submit' | 'reset'
  /** EP size (传值则覆盖 size prop). */
  epSize?: 'large' | 'default' | 'small'
}

/**
 * disabled **故意不给默认值**（见 FcInput 的同款说明）:
 * Boolean prop 缺省会被 Vue cast 成 false, 那样 `props.disabled` 恒为 false,
 * el-form 的 disabled 就传不下去.
 * 显式 `undefined` → 编译成 `default: undefined` → prop 真保持 undefined.
 *
 * 注意: 本组件的 `size` 是 **FC 自己的档位** (sm/md/lg), 不是 EP 的 size,
 * 因此不受 el-form 的 size 继承影响 —— 它有独立的 epSize 逃生口.
 */
const props = withDefaults(defineProps<FcButtonProps>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: undefined,
  block: false,
  circle: false,
  plain: false,
  link: false,
  text: false,
  nativeType: 'button',
  epSize: undefined,
})

/** 生效禁用态: 自身 prop > el-form > false (与 el-button 内部的继承链同源). */
const formDisabled = useFormDisabled()
const isDisabled = computed(() => formDisabled.value)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const attrs = useAttrs()

const resolvedType = computed(() => {
  if (props.type) return props.type
  switch (props.variant) {
    case 'primary':   return 'primary'
    case 'secondary': return 'default'
    case 'text':      return 'primary'
    case 'danger':    return 'danger'
    default:          return 'default'
  }
})

const isTextLike = computed(() => props.variant === 'text' || props.text || props.link)

const resolvedSize = computed(() => {
  if (props.epSize) return props.epSize
  const sizeMap: Record<string, 'large' | 'default' | 'small'> = {
    sm: 'small', md: 'default', lg: 'large',
    small: 'small', default: 'default', large: 'large',
  }
  return sizeMap[props.size] ?? 'default'
})

const listeners = {
  click: (e: MouseEvent) => { if (!isDisabled.value && !props.loading) emit('click', e) },
}
</script>

<template>
  <el-button
    v-bind="attrs"
    :type="resolvedType"
    :size="resolvedSize"
    :icon="icon"
    :loading="loading"
    :disabled="isDisabled"
    :circle="circle"
    :plain="plain"
    :link="link"
    :text="text || isTextLike"
    :native-type="nativeType"
    :class="['fc-button', `variant-${variant}`, `size-${size}`, { 'is-block': block, 'is-text-like': isTextLike }]"
    v-on="listeners"
  >
    <slot />
  </el-button>
</template>

<style scoped lang="scss">
.fc-button.el-button {
  font-weight: 600;
  border-radius: var(--app-radius-md, 8px);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;

  &:active:not(.is-disabled) { transform: scale(0.97); }

  /* 禁用态: disabled 属性由 el-button 透传, 这里补一层光标语义 */
  &:disabled { cursor: not-allowed; }

  &.is-block { width: 100%; display: flex; }
}

.fc-button.size-sm { font-size: 12px; }
.fc-button.size-md { font-size: 13px; }
.fc-button.size-lg { font-size: 14px; }

.fc-button.variant-primary:not(.is-text-like):not(.is-plain) {
  background: var(--app-primary-fill);
  border-color: var(--app-primary-fill);
  color: var(--app-on-primary);

  &:hover:not(.is-disabled) {
    filter: brightness(0.95);
    box-shadow: var(--app-shadow-md);
  }
}

.fc-button.variant-danger:not(.is-text-like):not(.is-plain) {
  /* 危险底压深一档 (76% danger + black, 色相不变): 白字 ≥4.5:1 (规则 40),
     #f56c6c 原值只有 2.90:1 */
  background: color-mix(in srgb, var(--el-color-danger) 76%, black);
  border-color: color-mix(in srgb, var(--el-color-danger) 76%, black);
  color: var(--app-on-primary);

  &:hover:not(.is-disabled) {
    filter: brightness(0.95);
    box-shadow: var(--app-shadow-md);
  }
}

/* 动效降级: 关闭过渡与按压缩放 */
@media (prefers-reduced-motion: reduce) {
  .fc-button.el-button {
    transition: none;
  }
  .fc-button.el-button:active:not(.is-disabled) {
    transform: none;
  }
}
</style>
