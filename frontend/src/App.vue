<template>
  <FcThemeProvider
    :initial-brand="oem.config.brand || 'ldx2'"
    :initial-theme="(oem.config.theme as 'light' | 'dark') || 'light'"
    v-model:brand="brand"
    v-model:theme="theme"
  >
    <router-view />
  </FcThemeProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FcThemeProvider } from '@/components/sdk'
import { usePreferenceStore } from '@/store/preference'
import { useOemStore } from '@/store/oem'
import i18n from '@/locales'
import type { ThemeMode } from '@/components/sdk/theme/brands'

const preference = usePreferenceStore()
const oem = useOemStore()

// 主题/品牌状态由 FcThemeProvider 管理 (内部持久化到 localStorage)
const brand = ref<string>(oem.config.brand || 'ldx2')
const theme = ref<ThemeMode>((oem.config.theme as ThemeMode) || 'light')

// OEM 配置变化时同步默认值 (首次拉取后)
watch(() => oem.config, (cfg) => {
  // 仅当 localStorage 没存时才用 OEM 默认 (FcThemeProvider 已处理)
  // 这里只同步 ref 让 Provider 接收
  if (cfg.brand && !brand.value) brand.value = cfg.brand
  if (cfg.theme && !theme.value) theme.value = cfg.theme as ThemeMode
}, { deep: true })

// locale 仍由 preference store 管 (Provider 只管 brand/theme)
const locale = computed(() => preference.locale)
watch(locale, (v) => {
  i18n.global.locale.value = v
}, { immediate: true })

onMounted(() => {
  i18n.global.locale.value = preference.locale
})
</script>

<style>
/* 全局样式已在 styles/index.scss 中定义 */
</style>
