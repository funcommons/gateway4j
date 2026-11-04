<template>
  <FcSection padding="lg" shadow="sm" class="v2-placeholder">
    <div class="v2-placeholder__inner">
      <h2 class="v2-placeholder__title">{{ title }}</h2>
      <p class="v2-placeholder__hint">{{ t('v2.placeholder.hint') }}</p>
      <p v-if="prototype" class="v2-placeholder__proto">
        <FcIcon name="ri-image-line" :size="14" />
        <span>{{ t('v2.placeholder.prototype', { file: prototype }) }}</span>
      </p>
    </div>
  </FcSection>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FcIcon, FcSection } from '@/components'

defineProps<{ title: string; prototype?: string }>()

const { t } = useI18n()
</script>

<style scoped>
.v2-placeholder__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 72px 16px;
  text-align: center;
}
.v2-placeholder__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.v2-placeholder__hint {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}
.v2-placeholder__proto {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>
