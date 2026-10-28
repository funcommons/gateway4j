<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2 class="title">{{ t('gateway.auth.title') }}</h2>
      <p class="subtitle">{{ t('gateway.auth.welcome') }}</p>
      <el-form :model="form" :rules="rules" label-width="0" size="large" @keydown.enter.prevent="submit">
        <el-form-item prop="username">
          <el-input v-model="form.username" :placeholder="t('gateway.auth.username')" clearable maxlength="50">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" :placeholder="t('gateway.auth.password')" show-password>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <div class="remember-row">
            <el-checkbox v-model="remember">{{ t('gateway.auth.remember') }}</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="submit" style="width: 100%">
            {{ t('gateway.auth.submit') }}
          </el-button>
        </el-form-item>
      </el-form>
      <p v-if="error" class="auth-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { User, Lock } from '@element-plus/icons-vue'
import { useGatewayAuthStore } from '@/store/gateway-auth'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useGatewayAuthStore()

const form = ref({ username: '', password: '' })
const remember = ref(true)
const loading = ref(false)
const error = ref('')

const rules = {
  username: [{ required: true, message: () => t('gateway.auth.username'), trigger: 'blur' }],
  password: [{ required: true, message: () => t('gateway.auth.password'), trigger: 'blur' }]
}

async function submit() {
  const username = (form.value.username || '').trim()
  const password = form.value.password || ''
  if (!username || !password.trim()) {
    error.value = t('gateway.auth.usernamePasswordRequired')
    return
  }
  error.value = ''
  loading.value = true
  try {
    await auth.doLogin(username, password, remember.value)
    const redirect = (route.query.redirect as string) || '/routes'
    await router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/routes')
  } catch (e: any) {
    error.value = e?.message || t('gateway.common.loginFailed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-bg-page, #f5f7fa);
}
.auth-card {
  width: 420px;
  max-width: 100%;
  background: var(--el-bg-color, #fff);
  border-radius: 16px;
  padding: 40px 36px;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
}
.title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.subtitle {
  margin: 0 0 24px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}
.auth-error {
  color: var(--app-danger, #f56c6c);
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}
.remember-row { display: flex; align-items: center; }
</style>
