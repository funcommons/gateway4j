<script setup lang="ts">defineOptions({ name: 'FcSection' })
export interface FcSectionProps {
  noHeaderBorder?: boolean
  /** 内边距档位. 默认 inherit (沿用 .fc-main .fc-section 全局响应式 padding) */
  padding?: 'inherit' | 'none' | 'sm' | 'md' | 'lg'
  /** 阴影档位. 默认 md (跟 WorkSection 一致) */
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  /** 是否可 hover 交互 (整张卡片轻微浮起). 默认 false */
  hover?: boolean
}
withDefaults(defineProps<FcSectionProps>(), {
  noHeaderBorder: false,
  padding: 'inherit',
  shadow: 'md',
  hover: false,
})
</script>

<template>
  <section
    class="fc-section"
    :class="[
      `padding-${padding}`,
      `shadow-${shadow}`,
      { 'is-hoverable': hover }
    ]"
  >
    <div
      v-if="$slots.header"
      class="fc-section__header"
      :class="{ 'fc-section__header--flush': noHeaderBorder }"
    >
      <slot name="header" />
    </div>
    <div class="fc-section__body">
      <slot />
    </div>
    <!-- footer slot（gateway4j 保留能力：ldx2 快照版未含此插槽）-->
    <div
      v-if="$slots.footer"
      class="fc-section__footer"
    >
      <slot name="footer" />
    </div>
  </section>
</template>

<style scoped>
/* 跟 /mc-web-spec example WorkSection.vue 对齐 — 类名 fc-section, 默认带
   bg / radius / shadow / border, padding 由本组件自己控制（响应式 16/12/8）。
   底色/描边/阴影/过渡一律走项目 token —— 之前这几处引的是 EP 的
   --el-bg-color / --el-border-color-extra-light 和几个根本没定义的
   --transition-base / --shadow-sm / --shadow-lg，整条声明作废。 */
.fc-section {
  background: var(--app-bg-card);
  border-radius: var(--app-radius-card);
  box-shadow: var(--app-shadow-md);
  border: 1px solid var(--app-border-extra-light);
  transition: background-color var(--app-transition-base), border-color var(--app-transition-base),
    box-shadow var(--app-transition-base), border-radius var(--app-transition-base),
    transform 0.15s ease;
  /* 容器要塑形内容：没有内边距，表格/表单会直接贴着卡边框（双圆角 + 贴边）。 */
  padding: var(--app-card-padding, 16px);
}
@media (max-width: 1024px) {
  .fc-section { padding: 12px; }
}
@media (max-width: 768px) {
  .fc-section { padding: 8px; }
}
.fc-section__header {
  border-bottom: 1px solid var(--app-border-extra-light);
}
.fc-section__header--flush {
  border-bottom: none;
}
.fc-section__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ---- opt-in modifier: padding 覆盖默认档位 ---- */
.fc-section.padding-none { padding: 0; }
.fc-section.padding-sm { padding: var(--space-sm, 8px); }
.fc-section.padding-md { padding: var(--space-md, 12px); }
.fc-section.padding-lg { padding: var(--space-lg, 16px); }

/* ---- opt-in modifier: shadow 覆盖默认 var(--app-shadow-md) ---- */
.fc-section.shadow-none { box-shadow: none; }
.fc-section.shadow-sm { box-shadow: var(--app-shadow-sm); }
.fc-section.shadow-lg { box-shadow: var(--app-shadow-lg); }

/* ---- opt-in: 整卡 hover 浮起 ---- */
.fc-section.is-hoverable {
  cursor: pointer;
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--app-shadow-lg);
  }
  /* 按下回落 (瞬时, 不做过度动画) */
  &:active:not(:disabled) {
    transform: translateY(0);
  }
  /* 键盘聚焦环: 瞬时出现, 不做渐显 */
  &:focus-visible {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: 2px;
  }
  /* 禁用态三通道: 透明 + 光标 + 语义标记 */
  &:disabled,
  &[aria-disabled='true'] {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
}

/* 内部去线框化: 字段边框保留 (el-input / el-select), 区块边框剥掉
   遵循 auto-memory: WorkSection 内不要大线框/灰色背景, 用分隔线 */
.fc-section :deep(.el-card),
.fc-section :deep(.my-card) {
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
  padding: 0;
}
.fc-section :deep(.el-divider) {
  display: none;
}
.fc-section :deep(.el-descriptions__body),
.fc-section :deep(.el-descriptions .el-descriptions__table),
.fc-section :deep(.el-descriptions .el-descriptions__cell),
.fc-section :deep(.el-descriptions__label),
.fc-section :deep(.el-descriptions__content) {
  border: none !important;
  background: transparent !important;
}
.fc-section :deep(.el-descriptions .el-descriptions__table) {
  border-collapse: separate;
  border-spacing: 0;
}

.fc-section__footer {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-extra-light);
}

/* ---- 动效兜底: 用户关闭动效时不浮起 / 不回落 ---- */
@media (prefers-reduced-motion: reduce) {
  .fc-section {
    transition: none;
  }
  .fc-section.is-hoverable:hover,
  .fc-section.is-hoverable:active:not(:disabled) {
    transform: none;
  }
}
</style>