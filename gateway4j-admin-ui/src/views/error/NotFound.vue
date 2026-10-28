<template>
  <!-- D15: 未知路由兜底页 — 替代原先静默 redirect:'/routes' -->
  <div class="notfound-page">
    <FcSectionCard width="420" class="notfound-card">
      <p class="code">404</p>
      <h2 class="title">页面不存在</h2>
      <p class="desc">您访问的页面不存在或已被移除，请检查地址是否正确</p>
      <FcButton variant="primary" class="home-btn" @click="goHome">返回首页</FcButton>
    </FcSectionCard>
  </div>
</template>

<script setup lang="ts">
// 与登录页 (views/auth/Login.vue) 同风格: FcSectionCard 居中卡 + FcButton.
// 文案硬编码中文: locales 归另一模块管理, 这里不新增 t() key, 避免破坏 i18n 覆盖测试.
import { useRouter } from 'vue-router'
import { FcSectionCard, FcButton } from '@/components'

defineOptions({ name: 'NotFound' })

const router = useRouter()

async function goHome() {
  // '/' 会按路由表 redirect 到 /routes
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
  color: var(--app-primary, var(--el-color-primary, #409eff));
}
.title {
  margin: 16px 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
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
