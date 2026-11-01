<script setup lang="ts">
defineOptions({ name: 'FcTooltip', inheritAttrs: false })
/**
 * FcTooltip — el-tooltip 薄封装 (SDK).
 *
 * 替代业务侧散落 <el-tooltip class="custom-tip"> + 自写 :deep 覆写.
 * 统一字体/颜色/padding/delay, 桌面 hover 触发, 移动端降级为长按.
 *
 * 用法:
 *   <FcTooltip :content="t('help.hint')" placement="top">
 *     <el-icon><Question /></el-icon>
 *   </FcTooltip>
 *   <FcTooltip content="删除后无法恢复" variant="danger">
 *     <FcButton variant="danger">删除</FcButton>
 *   </FcTooltip>
 */
import { computed, useSlots } from 'vue'

type TooltipPlacement = 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'

export interface FcTooltipProps {
  /** 提示文案. */
  content?: string
  /** 位置. 默认 'top'. */
  placement?: TooltipPlacement
  /** 视觉变体. 'danger' 用红色字. */
  variant?: 'default' | 'danger'
  /** 是否禁用. */
  disabled?: boolean
  /** 是否显示箭头. 默认 true. */
  showArrow?: boolean
  /** 进入延迟 (ms). 默认 100. */
  showDelay?: number
  /** 离开延迟 (ms). 默认 100. */
  hideDelay?: number
  /** 是否纯文字. 默认 true. (false 时显示深色背景). */
  light?: boolean
}

const props = withDefaults(defineProps<FcTooltipProps>(), {
  placement: 'top',
  variant: 'default',
  disabled: false,
  showArrow: true,
  showDelay: 100,
  hideDelay: 100,
  light: true,
})

const slots = useSlots()
const hasDefaultSlot = computed(() => !!slots.default)

const popperClass = computed(() => [
  'fc-tooltip',
  `variant-${props.variant}`,
  { 'is-light': props.light, 'is-dark': !props.light },
].filter(Boolean).join(' '))
</script>

<template>
  <el-tooltip
    v-if="hasDefaultSlot"
    :content="content"
    :placement="placement"
    :disabled="disabled"
    :show-arrow="showArrow"
    :show-delay="showDelay"
    :hide-delay="hideDelay"
    :popper-class="popperClass"
    :virtual-triggering="false"
  >
    <slot />
  </el-tooltip>
  <span v-else class="fc-tooltip-empty" />
</template>

<style>
/* 非 scoped: el-tooltip teleport 到 body */
.fc-tooltip {
  /* 亮色变体专用 token; 暗色变体直接用全局 --app-tooltip-bg / --app-tooltip-text
     (不能在此覆盖同名变量, 否则暗色变体会被局部值盖掉) */
  --fc-tooltip-bg: var(--app-bg-card);
  --fc-tooltip-text: var(--app-text);

  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: var(--app-radius-sm, 4px);
  max-width: 280px;
  word-break: break-word;
}

.fc-tooltip.is-light {
  background: var(--fc-tooltip-bg);
  color: var(--fc-tooltip-text);
  border: 1px solid var(--app-separator);
  box-shadow: var(--app-shadow-sm);
}

.fc-tooltip.is-dark {
  background: var(--app-tooltip-bg);
  color: var(--app-tooltip-text);
  border-color: var(--app-tooltip-bg);
}

.fc-tooltip.variant-danger {
  --fc-tooltip-text: var(--app-color-danger);
  --app-tooltip-text: var(--app-color-danger);
}

.fc-tooltip-empty {
  display: inline-block;
}
</style>
