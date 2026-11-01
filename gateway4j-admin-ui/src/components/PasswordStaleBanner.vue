<template>
  <!-- P2-9 弱口令横幅：常驻提示但不阻断任何导航/操作（非遮罩、无路由守卫介入） -->
  <div
    v-if="auth.showPasswordStaleBanner"
    class="pwd-stale-banner"
    data-testid="pwd-stale-banner"
    role="alert"
  >
    <span class="pwd-stale-text" data-testid="pwd-stale-text">{{ t('auth.pwdStaleBanner') }}</span>
    <FcButton variant="secondary" size="sm" data-testid="pwd-stale-action" @click="open = true">
      {{ t('auth.pwdStaleAction') }}
    </FcButton>
  </div>

  <FcDialog
    v-model:open="open"
    :title="t('auth.pwdDialogTitle')"
    width="420"
    :close-on-click-modal="false"
    append-to-body
  >
    <el-form label-width="110px" @submit.prevent>
      <FcFormItem :label="t('auth.pwdNew')" data-testid="pwd-new-item">
        <FcInput
          v-model="newPwd"
          type="password"
          show-password
          clearable
          maxlength="64"
          :placeholder="t('auth.pwdNewPlaceholder')"
          data-testid="pwd-new-input"
        />
      </FcFormItem>
      <FcFormItem :label="t('auth.pwdConfirm')">
        <FcInput
          v-model="confirmPwd"
          type="password"
          show-password
          clearable
          maxlength="64"
          :placeholder="t('auth.pwdConfirmPlaceholder')"
          :error="mismatchHint"
          data-testid="pwd-confirm-input"
        />
      </FcFormItem>
      <p v-if="submitError" class="pwd-stale-error" data-testid="pwd-stale-error">{{ submitError }}</p>
    </el-form>
    <template #footer>
      <FcButton @click="open = false">{{ t('common.cancel') }}</FcButton>
      <FcButton variant="primary" :loading="submitting" data-testid="pwd-stale-submit" @click="submit">
        {{ t('common.submit') }}
      </FcButton>
    </template>
  </FcDialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { FcButton, FcFormItem, FcInput, FcDialog } from '@/components'
import { useAuthStore } from '@/store/auth'
import { updateUser } from '@/api/misc'
import { mapFieldErrors } from '@/api/http'

/**
 * P2-9 弱口令横幅 + 改密对话框。
 *
 * 数据源：登录/刷新响应平铺字段 password_stale（缺省 false 非阻断）。
 * 改密端点：复用现有用户编辑端点 PATCH /v1/users/{id}（updateUser，payload { password }）。
 * 成功后 auth.markPasswordChanged()：横幅就地消失（sessionStorage 记录本会话已改），
 * 下次登录以后端响应字段为准。失败时保留横幅与对话框，不静默吞错。
 */
const { t } = useI18n()
const auth = useAuthStore()

const open = ref(false)
const newPwd = ref('')
const confirmPwd = ref('')
const submitting = ref(false)
const submitError = ref('')

const mismatchHint = computed(() => {
  if (!confirmPwd.value || newPwd.value === confirmPwd.value) return ''
  return t('auth.pwdMismatch')
})

function resetForm() {
  newPwd.value = ''
  confirmPwd.value = ''
  submitError.value = ''
}

async function submit() {
  if (submitting.value) return
  const pwd = newPwd.value
  if (!pwd) {
    submitError.value = t('auth.pwdRequired')
    return
  }
  if (pwd !== confirmPwd.value) {
    submitError.value = t('auth.pwdMismatch')
    return
  }
  const uid = auth.user?.id
  if (!uid) {
    submitError.value = t('common.actionFailed')
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    await updateUser(uid, { password: pwd })
    auth.markPasswordChanged()
    open.value = false
    resetForm()
    ElMessage.success(t('auth.pwdChanged'))
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    const first = Object.values(fieldErrs)[0]
    submitError.value = first || e?.message || t('common.actionFailed')
  } finally {
    submitting.value = false
  }
}

defineExpose({ submit, open, newPwd, confirmPwd, mismatchHint })
</script>

<style scoped>
.pwd-stale-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-warning) 35%, transparent);
  border-radius: var(--app-radius-sm);
}
.pwd-stale-text { flex: 1; }
.pwd-stale-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 4px 0 0;
}
</style>
