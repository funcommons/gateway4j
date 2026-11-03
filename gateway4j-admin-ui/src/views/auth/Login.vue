<template>
  <div class="auth-page">
    <FcSectionCard width="420" class="auth-card">
      <h2 class="title">{{ t('auth.title') }}</h2>
      <p class="subtitle">{{ t('auth.welcome') }}</p>
      <el-form :model="form" :rules="rules" label-width="0" size="large" @keydown.enter.prevent="submit">
        <FcFormItem prop="username">
          <FcInput v-model="form.username" :placeholder="t('auth.username')" clearable maxlength="50">
            <template #prefix><FcIcon><EpIconUser /></FcIcon></template>
          </FcInput>
        </FcFormItem>
        <FcFormItem prop="password">
          <FcInput v-model="form.password" type="password" :placeholder="t('auth.password')" show-password>
            <template #prefix><FcIcon><EpIconLock /></FcIcon></template>
          </FcInput>
        </FcFormItem>
        <FcFormItem>
          <div class="remember-row">
            <FcCheckbox v-model="remember" :label="t('auth.remember')" />
          </div>
        </FcFormItem>
        <FcFormItem>
          <FcButton variant="primary" :loading="loading" @click="submit" style="width: 100%">
            {{ t('auth.submit') }}
          </FcButton>
        </FcFormItem>
      </el-form>
      <p v-if="error" class="auth-error">{{ error }}</p>
    </FcSectionCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcSectionCard, FcFormItem, FcInput, FcButton, FcIcon, FcCheckbox } from '@/components'
import { useAuthStore } from '@/store/auth'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const form = ref({ username: '', password: '' })
const remember = ref(true)
const loading = ref(false)
const error = ref('')

const rules = {
  username: [{ required: true, message: () => t('auth.username'), trigger: 'blur' }],
  password: [{ required: true, message: () => t('auth.password'), trigger: 'blur' }]
}

async function submit() {
  // Trim username to reject whitespace-only inputs. Password is NOT trimmed
  // for submission because passwords can legitimately contain leading/trailing
  // spaces, but we DO trim for the empty-check so all-whitespace passwords
  // are rejected as "empty".
  const username = (form.value.username || '').trim()
  const password = form.value.password || ''
  if (!username || !password.trim()) {
    error.value = t('auth.usernamePasswordRequired')
    return
  }
  error.value = ''
  loading.value = true
  try {
    await auth.doLogin(username, password, remember.value)
    const redirect = (route.query.redirect as string) || '/routes'
    await router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/routes')
  } catch (e: any) {
    error.value = e?.message || t('common.loginFailed')
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
  background: var(--app-bg-page);
}
.auth-card {
  max-width: 100%;
}
.title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--app-text);
}
.subtitle {
  margin: 0 0 24px;
  color: var(--app-text-secondary);
  font-size: 13px;
}
.auth-error {
  color: var(--app-danger);
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}
.remember-row { display: flex; align-items: center; }
</style>
