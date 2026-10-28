<template>
  <FcThemeProvider>
    <router-view />
  </FcThemeProvider>
</template>

<script setup lang="ts">
import { FcThemeProvider } from '@/components'
import { useBusinessErrorHandler } from '@/composables/useBusinessErrorHandler'

useBusinessErrorHandler()
</script>
