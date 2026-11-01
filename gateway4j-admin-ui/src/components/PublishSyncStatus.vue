<template>
  <!-- idle 时不渲染任何内容；终态仅是行内小状态条，不弹模态 -->
  <span v-if="phase !== 'idle'" class="publish-sync-status" :data-testid="`publish-sync-${phase}`">
    <span v-if="phase === 'polling'" class="sync-dot sync-dot--processing" aria-hidden="true" />
    <span v-else-if="phase === 'synced'" class="sync-ok" aria-hidden="true">✓</span>
    <span v-else class="sync-dot sync-dot--warning" aria-hidden="true" />
    <span class="sync-label">{{ label }}</span>
    <FcButton
      v-if="phase === 'delayed'"
      variant="text"
      size="sm"
      data-testid="publish-sync-retry"
      @click="retry"
    >{{ t('common.refresh') }}</FcButton>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FcButton from './form/FcButton.vue'
import { usePublishSync } from '@/composables/usePublishSync'

/**
 * P1-3 发布生效确认状态条。发布/应用画布动作成功后由父级调用 start()
 * （defineExpose），组件内部完成 1s 轮询与终态展示；「同步延迟」时提供重试。
 */
const { t } = useI18n()
const { phase, lastStatus, start, retry } = usePublishSync()

const label = computed(() => {
  if (phase.value === 'polling') return t('route.publishSyncPending')
  if (phase.value === 'synced') return t('route.publishSynced')
  return t('route.publishSyncDelayed')
})

defineExpose({ start, retry, phase, lastStatus })
</script>

<style scoped>
.publish-sync-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
}
.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.sync-dot--processing {
  background: var(--app-primary);
  animation: sync-pulse 1s ease-in-out infinite;
}
.sync-dot--warning {
  background: var(--app-warning);
}
.sync-ok {
  color: var(--app-success);
  font-weight: 700;
}
.sync-label { white-space: nowrap; }
@keyframes sync-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .sync-dot--processing {
    animation: none;
    opacity: 1;
  }
}
</style>
