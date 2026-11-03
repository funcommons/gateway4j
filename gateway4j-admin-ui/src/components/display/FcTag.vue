<script setup lang="ts">
defineOptions({ name: 'FcTag' })
/**
 * FcTag — 通用标签 / chip (SDK).
 *
 * 跟 FcTagGroup 配合 (group 是容器 + 可编辑 input, FcTag 是单个原子).
 * 替代项目里 el-tag 跟自写 .tag class 混用.
 *
 * color:
 *  - primary : 品牌主色浅底 (默认)
 *  - gray    : 中性灰
 *  - success : 绿
 *  - warning : 橙
 *  - danger  : 红
 *  - brand   : 跟主题 token 联动 (品牌切换跟着变)
 *
 * size: sm (默认) / md / lg
 *
 * 用法:
 *   <FcTag>{{ t('work.tag-trending') }}</FcTag>
 *   <FcTag color="danger" :closable="true" @close="onClose">违规</FcTag>
 *   <FcTag color="brand" solid>{{ t('common.featured') }}</FcTag>
 */
import { computed } from 'vue'

type TagColor = 'primary' | 'gray' | 'success' | 'warning' | 'danger' | 'brand'

export interface FcTagProps {
  /** 颜色 tone. */
  color?: TagColor
  /** 尺寸. */
  size?: 'sm' | 'md' | 'lg'
  /** 是否实底 (满色). 默认 false (浅底). */
  solid?: boolean
  /** 是否可关闭 (显示 ×). */
  closable?: boolean
  /** 是否禁用. */
  disabled?: boolean
  /** 是否选中 (业务多选时). */
  selected?: boolean
}

const props = withDefaults(defineProps<FcTagProps>(), {
  color: 'primary',
  size: 'sm',
  solid: false,
  closable: false,
  disabled: false,
  selected: false,
})

const emit = defineEmits<{
  close: []
  click: []
}>()

const classes = computed(() => [
  `color-${props.color}`,
  `size-${props.size}`,
  {
    'is-solid': props.solid,
    'is-disabled': props.disabled,
    'is-selected': props.selected,
    'is-clickable': !props.disabled,
  },
])
</script>

<template>
  <span
    class="fc-tag"
    :class="classes"
    role="tag"
    :tabindex="disabled ? -1 : 0"
    @click="!disabled && emit('click')"
    @keydown.enter.prevent="!disabled && emit('click')"
  >
    <span class="fc-tag__content">
      <slot />
    </span>
    <button
      v-if="closable"
      type="button"
      class="fc-tag__close"
      :tabindex="disabled ? -1 : 0"
      :disabled="disabled"
      :aria-label="'close'"
      @click.stop="!disabled && emit('close')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/>
      </svg>
    </button>
  </span>
</template>

<style scoped lang="scss">
.fc-tag {
  /* 色调（--tag-color）用于底色/描边；文字档（--tag-ink）是同一色相压暗一档
     的版本 —— 语义色本身在白卡上只有 2.4~3.2:1，作正文不达标（规则 40）。

     注意：浅底的底色不是白卡，而是「白卡 + 12% 语义色」的染色底 —— 比白卡深。
     所以墨色要用「染色底专用档」（--*-text-on-tint），不能用白卡正文档
     （--app-color-*-text）：后者按白卡配到 4.5:1，落到染色底上只有 4.3~4.4:1。 */
  --tag-color: var(--app-primary);
  --tag-ink: var(--app-accent-text-on-tint);

  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--app-radius-chip, 9999px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.01em;
  white-space: nowrap;
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: var(--tag-ink);
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  user-select: none;

  /* color tokens */
  &.color-primary { --tag-color: var(--app-primary);      --tag-ink: var(--app-accent-text-on-tint); }
  &.color-gray    { --tag-color: var(--app-text-tertiary); --tag-ink: var(--app-text-secondary-on-tint); }
  &.color-success { --tag-color: var(--app-color-success); --tag-ink: var(--app-color-success-text-on-tint); }
  &.color-warning { --tag-color: var(--app-color-warning); --tag-ink: var(--app-color-warning-text-on-tint); }
  &.color-danger  { --tag-color: var(--app-color-danger);  --tag-ink: var(--app-color-danger-text-on-tint); }
  &.color-brand   { --tag-color: var(--brand-primary, var(--app-primary)); --tag-ink: var(--app-accent-text-on-tint); }

  /* solid variant —— 白字压在浅色调上不达标，实底同样压暗一档
     （70% + 黑：语义色实底 + 白字 ≥4.5:1，与 --app-primary-fill 同一档） */
  &.is-solid {
    background: color-mix(in srgb, var(--tag-color) 70%, black);
    color: var(--app-on-primary);
  }

  /* sizes */
  &.size-sm {
    padding: 2px 8px;
    font-size: 11px;
  }
  &.size-md {
    padding: 4px 12px;
    font-size: 12px;
  }
  &.size-lg {
    padding: 8px 16px;
    font-size: 13px;
  }

  /* interactive states */
  &.is-clickable {
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--tag-color) 18%, transparent);
    }
    &.is-solid:hover {
      filter: brightness(0.95);
    }
    &:active {
      transform: scale(0.96);
    }
    &.is-selected {
      /* 满色底 + 白字：白字压品牌主色只有 2.9:1 —— 实底同样压暗一档 */
      background: color-mix(in srgb, var(--tag-color) 70%, black);
      color: var(--app-on-primary);
    }
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 键盘焦点环 */
.fc-tag:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.fc-tag__content {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.fc-tag__close {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: inherit;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;

  &:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--app-text) 10%, transparent);
  }

  /* 禁用三通道: 透明度 + 底色 + 光标 (配合模板上的原生 :disabled 属性) */
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: transparent;
    color: var(--app-text-tertiary);
  }

  &:focus-visible {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: 1px;
  }

  svg {
    width: 10px;
    height: 10px;
    display: block;
  }
}

/* 动效降级: 关闭过渡与按压缩放 */
@media (prefers-reduced-motion: reduce) {
  .fc-tag,
  .fc-tag__close {
    transition: none;
  }
  .fc-tag.is-clickable:active {
    transform: none;
  }
}
</style>
