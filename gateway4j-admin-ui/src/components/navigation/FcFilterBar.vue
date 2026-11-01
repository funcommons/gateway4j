<script setup lang="ts">
defineOptions({ name: 'FcFilterBar' })
/**
 * FcFilterBar — 一行水平排列的筛选标签容器 (SDK).
 *
 * 跟 FcFilterButton / FcFilterBarDivider 配套用. 多选筛选语义.
 *
 * 槽位:
 *  - default: 左侧筛选按钮区
 *  - actions: 右侧操作区 (新建/导入等按钮), margin-left:auto 右对齐 (D2).
 *
 * 用法:
 *   <FcFilterBar>
 *     <FcFilterButton :active="..." @click="...">全部</FcFilterButton>
 *     <FcFilterButton :active="..." @click="...">视频</FcFilterButton>
 *     <FcFilterBarDivider />
 *     <FcFilterButton :active="..." @click="...">4K</FcFilterButton>
 *   </FcFilterBar>
 *
 * 历史: 由 components/common/FilterBar.vue 迁入, 加 Fc 前缀.
 */
export interface FcFilterBarProps {
  /** 是否全宽 (justify-content: flex-start 不变, 但 width: 100%). 默认 false. */
  block?: boolean
}
withDefaults(defineProps<FcFilterBarProps>(), { block: false })
</script>

<template>
  <div class="fc-filter-bar" :class="{ 'is-block': block }">
    <slot />
    <!-- actions 插槽（gateway4j 保留能力：ldx2 快照版未含此插槽）——
         右侧主操作区（新建/导入等），margin-left:auto 右对齐（D2）。 -->
    <div v-if="$slots.actions" class="fc-filter-bar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.fc-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  &.is-block {
    width: 100%;
  }

  /* 兜底: slot 内"裸"交互元素的状态样式.
     FcFilterButton / FcButton / FcInput 等 SDK 组件自带八态, 这里只兜底
     未带 fc- 类名的原生控件, 避免覆盖组件自身的状态契约. */
  :deep(button:not([class*='fc-'])) {
    &:focus-visible {
      outline: 2px solid var(--app-focus-ring);
      outline-offset: 2px;
    }
    &:active:not(:disabled) {
      opacity: 0.85;
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.fc-filter-bar__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
