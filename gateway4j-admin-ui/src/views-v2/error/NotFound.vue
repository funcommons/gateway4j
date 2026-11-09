<template>
  <!-- D15: 未知路由兜底页 — 替代原先静默 redirect:'/routes' -->
  <div class="notfound-page">
    <FcSectionCard width="420" class="notfound-card">
      <p class="code">404</p>
      <h2 class="title">{{ t('common.notFoundTitle') }}</h2>
      <p class="desc">{{ t('common.notFoundDesc') }}</p>
      <FcButton variant="primary" class="home-btn" @click="goHome">{{ t('common.notFoundBackHome') }}</FcButton>
    </FcSectionCard>
  </div>
</template>

<script setup lang="ts">
// 与登录页 (views-v2/auth/Login.vue) 同风格: FcSectionCard 居中卡 + FcButton.
// 文案走 i18n (common.notFound*), 中英双语在 locales 中对齐.
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcSectionCard, FcButton } from '@/components'

const { t } = useI18n()

defineOptions({ name: 'NotFound' })

const router = useRouter()

async function goHome() {
  // '/' 会按路由表 redirect 到 /v2/overview（P4f C2 摘旧树后）
  await router.push('/')
}
</script>

<style scoped>
.notfound-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-bg-page);
}
.notfound-card {
  max-width: 100%;
  text-align: center;
}
.code {
  margin: 8px 0 0;
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 4px;
  color: var(--app-accent-text);
}
.title {
  margin: 16px 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
  overflow-wrap: break-word;
  min-width: 0;
}
.desc {
  margin: 0 0 24px;
  font-size: 13px;
  color: var(--app-text-secondary);
}
.home-btn {
  min-width: 120px;
}
</style>
