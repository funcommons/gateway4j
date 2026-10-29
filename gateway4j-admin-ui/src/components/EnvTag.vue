<script setup lang="ts">
/**
 * EnvTag — 路由「环境」小标签（H7b T4）。
 * default 灰、非 default 蓝；缺省/旧后端不下发 environment 视为 default。
 */
import { computed } from 'vue'
import { FcTag } from '@/components'
import { DEFAULT_ENV, envTagTone } from '@/utils/environment'

defineOptions({ name: 'EnvTag' })

const props = defineProps<{
  /** 路由归属环境；空 → default */
  environment?: string | null
}>()

const tone = computed(() => envTagTone(props.environment))
const label = computed(() => props.environment || DEFAULT_ENV)
</script>

<template>
  <FcTag :color="tone" size="sm" data-testid="env-tag">{{ label }}</FcTag>
</template>
