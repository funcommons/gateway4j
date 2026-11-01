<script setup lang="ts">defineOptions({ name: 'FcSectionCard' })
/**
 * FcSectionCard — 基于 FcSection 的"短小交互卡"快捷方式.
 *
 * 跟 FcSection 区别:
 *  - FcSection = 通用页面分区, 默认无 padding/shadow/hover (由 CSS 变量或外层 class 控制)
 *  - FcSectionCard = 短小独立卡片, 默认 padding=md / shadow=sm, 可选 hover
 *
 * 实现: 内部 = FcSection + padding/shadow/hover prop 透传, 不重复样式.
 */
import { computed } from 'vue'
import FcSection from '../section/FcSection.vue'

export interface FcSectionCardProps {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
  /** 卡片宽度（数字按 px 处理）。传了才生效 —— 之前 width 只是透传成
   *  DOM attribute 落在 <section> 上，对 div 无效（登录页实测 255px）。 */
  width?: string | number
}

const props = withDefaults(defineProps<FcSectionCardProps>(), {
  padding: 'md',
  shadow: 'sm',
  hover: false,
})

/** 数字宽度按 px 处理；纯数字字符串（'420'）也补 px，其余字符串原样。 */
const widthStyle = computed<Record<string, string> | undefined>(() => {
  if (props.width == null || props.width === '') return undefined
  if (typeof props.width === 'number') return { width: `${props.width}px` }
  const raw = String(props.width).trim()
  if (/^\d+(\.\d+)?$/.test(raw)) return { width: `${raw}px` }
  return { width: raw }
})
</script>

<template>
  <FcSection :hover="hover" :padding="padding" :shadow="shadow" :style="widthStyle">
    <slot />
    <!-- footer slot（gateway4j 保留能力：ldx2 快照版未含此插槽）-->
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </FcSection>
</template>
