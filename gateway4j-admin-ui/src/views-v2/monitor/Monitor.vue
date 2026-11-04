<template>
  <V2PagePlaceholder :title="t('v2.page.monitor')" prototype="08-monitoring.html" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import V2PagePlaceholder from '@/views-v2/V2PagePlaceholder.vue'

const { t } = useI18n()
</script>
