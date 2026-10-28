<template>
  <div class="app-page">
    <FcSection>
      <FcFilterBar>
        <FcInput v-model="keyword" :placeholder="t('gateway.user.searchPlaceholder')" clearable @enter="reload" />
        <template #actions>
          <FcButton v-if="canEdit('user')" variant="primary" @click="openCreate">{{ t('gateway.common.create') }}</FcButton>
        </template>
      </FcFilterBar>

      <FcSkeleton v-if="loading" variant="text" :rows="6" />
      <template v-else>
      <FcTable :data="rows" stripe>
        <el-table-column prop="username" :label="t('gateway.user.name')" />
        <el-table-column prop="real_name" :label="t('gateway.user.realName')" />
        <el-table-column prop="phone" :label="t('gateway.user.phone')" width="140" />
        <el-table-column :label="t('gateway.user.roles')">
          <template #default="{ row }">
            <FcTag v-for="r in row.role_codes" :key="r" color="primary" size="sm">{{ roleName(r) }}</FcTag>
          </template>
        </el-table-column>
        <el-table-column :label="t('gateway.user.status')" width="100">
          <template #default="{ row }">
            <FcStatusBadge
              :tone="row.status === 'ENABLED' ? 'success' : 'neutral'"
              :label="row.status === 'ENABLED' ? t('gateway.common.enabled') : t('gateway.common.disabled')"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('gateway.common.more')" width="320" fixed="right">
          <template #default="{ row }">
            <FcButton v-if="canEdit('user')" variant="text" size="sm" @click="openEdit(row)">{{ t('gateway.common.edit') }}</FcButton>
            <FcButton v-if="canEdit('user')" variant="text" size="sm" @click="toggleStatus(row)">{{ row.status === 'ENABLED' ? t('gateway.common.disable') : t('gateway.common.enable') }}</FcButton>
            <FcButton v-if="canEdit('user')" variant="text" size="sm" @click="openReset(row)">{{ t('gateway.user.resetPassword') }}</FcButton>
            <FcConfirm v-if="canEdit('user')" :content="t('gateway.common.confirmDelete')" @confirm="del(row)">
              <FcButton variant="text" size="sm" type="danger">{{ t('gateway.common.delete') }}</FcButton>
            </FcConfirm>
          </template>
        </el-table-column>
      </FcTable>

      <FcPagination
        v-model:current-page="page" v-model:page-size="pageSize" :total="total"
        style="margin-top: 12px; justify-content: flex-end"
      />
      </template>
    </FcSection>

    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
    <p v-if="actionError && !open && !resetOpen" class="action-error" data-testid="action-error">{{ actionError }}</p>

    <FcDialog v-model:open="open" :title="isEdit ? t('gateway.user.editTitle') : t('gateway.user.createTitle')" width="480px">
      <el-form :model="form" :rules="formRules" label-width="100px" ref="formRef">
        <el-form-item :label="t('gateway.user.name')" prop="username"><FcInput v-model="form.username" :disabled="isEdit" maxlength="50" /></el-form-item>
        <el-form-item v-if="!isEdit" :label="t('gateway.user.password')" prop="password"><FcInput v-model="form.password" type="password" maxlength="100" /></el-form-item>
        <el-form-item v-if="isEdit" :label="t('gateway.user.newPassword')" prop="password"><FcInput v-model="form.password" type="password" :placeholder="t('gateway.user.newPasswordHint')" maxlength="100" /></el-form-item>
        <el-form-item :label="t('gateway.user.realName')"><FcInput v-model="form.real_name" maxlength="50" /></el-form-item>
        <el-form-item :label="t('gateway.user.phone')" prop="phone"><FcInput v-model="form.phone" maxlength="20" /></el-form-item>
        <el-form-item :label="t('gateway.user.roles')">
          <FcSelect v-model="form.role_codes" multiple :options="roleOptions" />
        </el-form-item>
      </el-form>
      <p v-if="actionError && open" class="dialog-error" data-testid="dialog-error">{{ actionError }}</p>
      <template #footer>
        <FcButton @click="open = false">{{ t('gateway.common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="saving" @click="save">{{ t('gateway.common.save') }}</FcButton>
      </template>
    </FcDialog>

    <FcDialog v-model:open="resetOpen" :title="t('gateway.user.resetPassword')" width="380px">
      <el-form label-width="100px">
        <el-form-item :label="t('gateway.user.newPassword')"><FcInput v-model="newPwd" type="password" maxlength="100" /></el-form-item>
      </el-form>
      <p v-if="actionError && resetOpen" class="dialog-error" data-testid="dialog-error">{{ actionError }}</p>
      <template #footer>
        <FcButton @click="resetOpen = false">{{ t('gateway.common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="resetting" @click="doReset">{{ t('gateway.common.submit') }}</FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { useDebounce } from '@/composables/useDebounce'
import {
  FcSection, FcFilterBar, FcInput, FcSelect, FcTable, FcTag, FcStatusBadge,
  FcButton, FcConfirm, FcDialog, FcPagination, FcSkeleton
} from '@/components/sdk'
import type { SelectOption } from '@/components/sdk'
import { listUsers, createUser, updateUser, deleteUser, resetPassword } from '@/api/gateway/misc'
import { listRoles } from '@/api/gateway/auth'
import { mapFieldErrors } from '@/api/gateway/envelope'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const page = ref(1); const pageSize = ref(20); const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)
const keyword = ref('')
const debouncedKeyword = useDebounce(keyword, 300)

const open = ref(false)
const resetOpen = ref(false)
const saving = ref(false); const resetting = ref(false)
const form = ref<any>({ username: '', password: '', real_name: '', phone: '', role_codes: ['ROLE_OPS'] })
const isEdit = computed(() => !!form.value.id)
const roleOptions = ref<SelectOption[]>([])
const newPwd = ref('')
const targetUser = ref<any>(null)
const formRef = ref<any>(null)

const formRules = computed(() => ({
  username: [
    { required: true, message: () => t('gateway.user.nameRequired'), trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{2,30}$/, message: () => t('gateway.user.namePattern'), trigger: 'blur' }
  ],
  password: isEdit.value
    ? []
    : [{ required: true, message: () => t('gateway.user.passwordRequired'), trigger: 'blur' }],
  phone: [
    { validator: (_rule: any, value: string, cb: (err?: Error) => void) => {
        if (value && !/^1[3-9]\d{9}$/.test(value)) {
          cb(new Error(t('gateway.user.phonePattern')))
        } else {
          cb()
        }
      }, trigger: 'blur' }
  ]
}))

async function loadRoles() {
  try {
    const list = await listRoles() as any
    roleOptions.value = list.map((r: any) => ({ value: r.role_code, label: r.role_name }))
  } catch {
    roleOptions.value = []
  }
}
loadRoles()

const roleMap = computed(() => {
  const m: Record<string, string> = {}
  for (const o of roleOptions.value) m[o.value] = o.label
  return m
})
function roleName(code: string) { return roleMap.value[code] || code }

const loadError = ref('')
let loadEpoch = 0

async function reload() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const r: any = await listUsers({ page: page.value, pageSize: pageSize.value, keyword: debouncedKeyword.value || undefined })
    if (myEpoch !== loadEpoch) return
    rows.value = r.records || []
    total.value = r.total || 0
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('gateway.common.loadFailed')
    rows.value = []
    total.value = 0
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}
watch(debouncedKeyword, () => { page.value = 1; reload() })
watch([page, pageSize], reload)
reload()

const actionError = ref('')

function openCreate() {
  form.value = { username: '', password: '', real_name: '', phone: '', role_codes: ['ROLE_OPS'] }
  actionError.value = ''
  open.value = true
}

function openEdit(row: any) {
  form.value = { id: row.id, username: row.username, password: '', real_name: row.real_name || '', phone: row.phone || '', role_codes: row.role_codes || [] }
  actionError.value = ''
  open.value = true
}

async function save() {
  if (!canEdit('user')) return
  if (saving.value) return
  if (formRef.value) {
    try { await formRef.value.validate() } catch { return }
  }
  saving.value = true
  actionError.value = ''
  try {
    if (isEdit.value) {
      const payload: Record<string, any> = { real_name: form.value.real_name, phone: form.value.phone, role_codes: form.value.role_codes }
      if (form.value.password) payload.password = form.value.password
      await updateUser(form.value.id, payload)
    } else {
      await createUser(form.value)
    }
    ElMessage.success(t('gateway.user.saveSuccess'))
    open.value = false
    form.value = { username: '', password: '', real_name: '', phone: '', role_codes: ['ROLE_OPS'] }
    reload()
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0 && formRef.value) {
      const fields = (formRef.value as any).fields || {}
      for (const [prop, msg] of Object.entries(fieldErrs)) {
        const item = fields[prop]
        if (item) { item.validateState = 'error'; item.validateMessage = msg }
      }
    }
    actionError.value = e?.message || t('gateway.common.actionFailed')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: any) {
  if (!canEdit('user')) return
  const newStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  if (newStatus === 'DISABLED' && !await confirm({ title: t('gateway.common.confirmDisableUser'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await updateUser(row.id, { status: newStatus })
    ElMessage.success(t('gateway.user.statusUpdateSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}

async function del(r: any) {
  if (!canEdit('user')) return
  actionError.value = ''
  try {
    await deleteUser(r.id)
    ElMessage.success(t('gateway.user.deleteSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}
function openReset(r: any) { targetUser.value = r; newPwd.value = ''; resetOpen.value = true; actionError.value = '' }
async function doReset() {
  if (!canEdit('user')) return
  if (!targetUser.value || !newPwd.value) return
  if (resetting.value) return
  resetting.value = true
  actionError.value = ''
  try {
    await resetPassword(targetUser.value.id, newPwd.value)
    ElMessage.success(t('gateway.user.resetSuccess'))
    resetOpen.value = false
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  } finally {
    resetting.value = false
  }
}
</script>

<style scoped>
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.dialog-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 8px 0 0;
}
</style>
