<script setup lang="ts">
defineOptions({ name: 'FcStatusBadge' })
/**
 * FcStatusBadge — 状态徽标 (SDK).
 *
 * 统一 WorkCard / WorkDetailModal / admin 列表里的 status-* 散点 css.
 * 用 tone (语义色) + label (文案) + 可选 dot (运行中闪烁点).
 *
 * tone 跟 --app-color-* token 对齐:
 *  - success    : 成功 (绿色)
 *  - processing : 处理中 (品牌主色 + 闪烁 dot)
 *  - error      : 失败 (红色)
 *  - pending    : 待处理 (黄/橙)
 *  - neutral    : 中性 (灰)
 *
 * 用法:
 *   <FcStatusBadge tone="success" :label="t('work.status-success')" />
 *   <FcStatusBadge tone="processing" :label="t('work.generating')" dot />
 *   <FcStatusBadge tone="error">{{ t('work.failed') }}</FcStatusBadge>
 */
import { computed, useSlots } from 'vue'

type StatusTone = 'success' | 'processing' | 'error' | 'pending' | 'neutral'

export interface FcStatusBadgeProps {
  /** 语义色. */
  tone?: StatusTone
  /** 文案. 不传走 default slot. */
  label?: string
  /** 是否显示前缀圆点. 默认 tone=processing 时自动 true, 其他 false. */
  dot?: boolean
  /** 尺寸. */
  size?: 'sm' | 'md'
  /** 是否实底 (满色背景), 默认 false (浅色背景). */
  solid?: boolean
}

const props = withDefaults(defineProps<FcStatusBadgeProps>(), {
  tone: 'neutral',
  label: '',
  dot: undefined,
  size: 'sm',
  solid: false,
})

const slots = useSlots()

const showDot = computed(() => props.dot ?? props.tone === 'processing')

const resolvedLabel = computed(() => props.label || (slots.default ? '' : ''))
</script>

<template>
  <span
    class="fc-status-badge"
    :class="[`tone-${tone}`, `size-${size}`, { 'is-solid': solid, 'has-dot': showDot }]"
    role="status"
  >
    <span v-if="showDot" class="fc-status-badge__dot" />
    <span class="fc-status-badge__label">
      <slot>{{ resolvedLabel }}</slot>
    </span>
  </span>
</template>

<style scoped lang="scss">
.fc-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--app-radius-full, 9999px);
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  line-height: 1;

  /* 色调（--badge-color）用于底色/实底；文字档（--badge-ink）是同一色相压暗一档
     的版本 —— 语义色本身在白卡上只有 2.4~3.2:1，作正文不达标（规则 40）。 */
  --badge-bg: color-mix(in srgb, var(--badge-color, currentColor) 12%, transparent);
  --badge-fg: var(--badge-ink, var(--app-text-secondary));
}

/* 浅底 (默认) */
.fc-status-badge:not(.is-solid) {
  background: var(--badge-bg);
  color: var(--badge-fg);
}

/* 实底 —— 白字压在浅色调上不达标，实底同样压暗一档 */
.fc-status-badge.is-solid {
  background: color-mix(in srgb, var(--badge-color, currentColor) 75%, black);
  color: var(--app-on-primary);
}

/* tones */
.tone-success  { --badge-color: var(--app-color-success);  --badge-ink: var(--app-color-success-text); }
.tone-processing { --badge-color: var(--app-primary);      --badge-ink: var(--app-accent-text); }
.tone-error    { --badge-color: var(--app-color-danger);   --badge-ink: var(--app-color-danger-text); }
.tone-pending  { --badge-color: var(--app-color-warning);  --badge-ink: var(--app-color-warning-text); }
.tone-neutral  { --badge-color: var(--app-text-tertiary);  --badge-ink: var(--app-text-secondary); }

/* sizes */
.size-sm {
  padding: 2px 8px;
  font-size: 11px;
}
.size-md {
  padding: 4px 12px;
  font-size: 12px;
}

/* dot */
.fc-status-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.tone-processing .fc-status-badge__dot {
  animation: fc-status-pulse 1.4s ease-in-out infinite;
}

@keyframes fc-status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(0.8); }
}

/* 动效降级: 关闭呼吸动画 */
@media (prefers-reduced-motion: reduce) {
  .tone-processing .fc-status-badge__dot {
    animation: none;
    opacity: 1;
  }
}
</style>
