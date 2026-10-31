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
}

.fc-filter-bar__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
