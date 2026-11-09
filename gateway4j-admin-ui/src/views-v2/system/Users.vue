<template>
  <div class="usr-page" data-testid="usr-page">
    <FcSection>
      <FcFilterBar>
        <FcInput
          v-model="keywordInput"
          :placeholder="t('v2.users.searchPlaceholder')"
          :aria-label="t('v2.users.searchPlaceholder')"
          clearable
          data-testid="usr-search"
          style="max-width: 240px"
        />
        <FcFilterBarDivider />
        <!-- v2 increment over the legacy page: status filter ('ALL' sentinel -> param undefined) -->
        <FcSegmented v-model="statusFilter" :options="statusOpts" size="sm" data-testid="usr-status-filter" />
        <template #actions>
          <FcButton
            v-if="canEdit('user')"
            variant="primary"
            data-testid="usr-action-create"
            @click="openCreate"
          >
            {{ t('v2.users.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <p v-if="!canEdit('user')" class="usr-readonly" data-testid="usr-readonly-hint" role="status">
        {{ t('v2.users.readonlyHint') }}
      </p>

      <FcSkeleton v-if="loading" variant="text" :rows="6" data-testid="usr-skeleton" />
      <!-- Load failed: error state replaces the table area entirely (no table, no empty state) -->
      <div v-else-if="loadError" class="hint-banner is-error" data-testid="usr-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.users.loadFailed') }}</span>
        <span class="usr-banner-msg">{{ loadError }}</span>
        <FcButton variant="text" size="sm" data-testid="usr-retry" @click="reload()">
          <FcIcon name="ri-refresh-line" :size="14" />
        </FcButton>
      </div>
      <template v-else>
        <!-- Row-level DOM contract: data-testid=usr-row-<id> must sit on the <tr>; semantic
             <table> + Fc atoms, same ruling as plugins/List.vue (no element table wrappers) -->
        <div v-if="rows.length" class="usr-table-scroll" data-testid="usr-table">
          <table class="usr-table">
            <thead>
              <tr>
                <th scope="col">{{ t('v2.users.colUsername') }}</th>
                <th scope="col">{{ t('v2.users.colRealName') }}</th>
                <th scope="col">{{ t('v2.users.colPhone') }}</th>
                <th scope="col">{{ t('v2.users.colRoles') }}</th>
                <th scope="col">{{ t('v2.users.colStatus') }}</th>
                <th scope="col" class="usr-col-actions">{{ t('v2.users.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="usr-row" :data-testid="`usr-row-${row.id}`">
                <td class="usr-mono" :data-testid="`usr-cell-username-${row.id}`">{{ row.username }}</td>
                <td :data-testid="`usr-cell-realname-${row.id}`">{{ row.real_name || '-' }}</td>
                <td :data-testid="`usr-cell-phone-${row.id}`">{{ row.phone || '-' }}</td>
                <td :data-testid="`usr-cell-roles-${row.id}`">
                  <FcTag v-for="r in row.role_codes" :key="r" color="primary" size="sm">{{ roleName(r) }}</FcTag>
                </td>
                <td>
                  <FcStatusBadge
                    :data-testid="`usr-cell-status-${row.id}`"
                    :tone="row.status === 'ENABLED' ? 'success' : 'neutral'"
                    :label="row.status === 'ENABLED' ? t('v2.users.statusEnabled') : t('v2.users.statusDisabled')"
                  />
                </td>
                <td class="usr-actions">
                  <template v-if="canEdit('user')">
                    <FcButton variant="text" size="sm" :data-testid="`usr-action-edit-${row.id}`" @click="openEdit(row)">
                      {{ t('v2.users.edit') }}
                    </FcButton>
                    <!-- Four actions always visible (legacy user-page semantics); toggle label = target state -->
                    <FcButton
                      variant="text"
                      size="sm"
                      :data-testid="`usr-action-toggle-${row.id}`"
                      @click="toggleStatus(row)"
                    >
                      {{ row.status === 'ENABLED' ? t('v2.users.statusDisabled') : t('v2.users.statusEnabled') }}
                    </FcButton>
                    <FcButton
                      variant="text"
                      size="sm"
                      :data-testid="`usr-action-reset-pw-${row.id}`"
                      @click="openReset(row)"
                    >
                      {{ t('v2.users.resetPassword') }}
                    </FcButton>
                    <FcButton
                      variant="text"
                      size="sm"
                      class="usr-danger"
                      :data-testid="`usr-action-delete-${row.id}`"
                      @click="onDelete(row)"
                    >
                      {{ t('v2.users.delete') }}
                    </FcButton>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <FcPagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="paginationTotal"
            class="usr-pagination"
            data-testid="usr-pagination"
          />
        </div>

        <FcEmpty v-else type="empty" :title="t('v2.users.empty')" data-testid="usr-empty" />
      </template>

      <!-- Action error banner: coexists with the list; a failed action never clears rows -->
      <div v-if="actionError" class="hint-banner is-error" data-testid="usr-action-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ actionError }}</span>
      </div>
    </FcSection>

    <!-- Create / edit dialog (create and edit share one dialog: username disabled in edit mode).
         maxlength contract: username 50 / password 64 (contract 4.5 overrides legacy 100!) /
         real_name 50 / phone 20. Field errors: client validation and server mapFieldErrors
         share the usr-field-error-{field} channel. -->
    <FcDialog v-model:open="dialogOpen" :title="dialogTitle" width="480px">
      <div data-testid="usr-dialog" class="usr-form">
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-username">{{ t('v2.users.fUsername') }}</label>
          <FcInput
            id="usr-f-username"
            v-model="form.username"
            maxlength="50"
            :disabled="isEdit"
            data-testid="usr-input-username"
          />
          <p v-if="fieldErrors.username" class="usr-field-error" role="alert" data-testid="usr-field-error-username">
            {{ fieldErrors.username }}
          </p>
        </div>
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-password">{{ isEdit ? t('v2.users.fNewPassword') : t('v2.users.fPassword') }}</label>
          <FcInput
            id="usr-f-password"
            v-model="form.password"
            type="password"
            maxlength="64"
            :placeholder="isEdit ? t('v2.users.fNewPassword') : undefined"
            data-testid="usr-input-password"
          />
          <p v-if="fieldErrors.password" class="usr-field-error" role="alert" data-testid="usr-field-error-password">
            {{ fieldErrors.password }}
          </p>
        </div>
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-realname">{{ t('v2.users.fRealName') }}</label>
          <FcInput
            id="usr-f-realname"
            v-model="form.real_name"
            maxlength="50"
            data-testid="usr-input-realname"
          />
        </div>
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-phone">{{ t('v2.users.fPhone') }}</label>
          <FcInput
            id="usr-f-phone"
            v-model="form.phone"
            maxlength="20"
            data-testid="usr-input-phone"
          />
          <p v-if="fieldErrors.phone" class="usr-field-error" role="alert" data-testid="usr-field-error-phone">
            {{ fieldErrors.phone }}
          </p>
        </div>
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-roles">{{ t('v2.users.fRoles') }}</label>
          <FcSelect
            id="usr-f-roles"
            v-model="form.role_codes"
            multiple
            :options="roleOptions"
            data-testid="usr-input-roles"
          />
        </div>
      </div>
      <template #footer>
        <FcButton @click="dialogOpen = false">{{ t('v2.users.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="saving" data-testid="usr-submit" @click="save">
          {{ t('v2.users.submit') }}
        </FcButton>
      </template>
    </FcDialog>

    <!-- Reset password dialog: shares usr-dialog / usr-submit testids; only submits with non-empty newPwd -->
    <FcDialog v-model:open="resetOpen" :title="t('v2.users.resetTitle')" width="380px">
      <div data-testid="usr-dialog" class="usr-form">
        <div class="usr-form-row">
          <label class="usr-label" for="usr-f-newpwd">{{ t('v2.users.fNewPassword') }}</label>
          <FcInput
            id="usr-f-newpwd"
            v-model="newPwd"
            type="password"
            maxlength="64"
            data-testid="usr-input-newpwd"
          />
          <p v-if="fieldErrors.newpwd" class="usr-field-error" role="alert" data-testid="usr-field-error-newpwd">
            {{ fieldErrors.newpwd }}
          </p>
        </div>
      </div>
      <template #footer>
        <FcButton @click="resetOpen = false">{{ t('v2.users.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="resetting" data-testid="usr-submit" @click="doReset">
          {{ t('v2.users.submit') }}
        </FcButton>
      </template>
    </FcDialog>

    <!-- a11y live region mirroring the toast feedback (usr-toast-success / usr-toast-error) -->
    <div
      v-if="toastFeedback"
      class="usr-toast-region"
      role="status"
      aria-live="polite"
      :data-testid="toastFeedback.kind === 'success' ? 'usr-toast-success' : 'usr-toast-error'"
    >
      {{ toastFeedback.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounce } from '@/composables'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcFilterBar, FcFilterBarDivider, FcInput, FcSegmented, FcTag, FcStatusBadge,
  FcButton, FcIcon, FcPagination, FcEmpty, FcSkeleton, FcDialog, FcSelect, toast
} from '@/components'
import type { SelectOption } from '@/components/form/_types'
import { listUsers, createUser, updateUser, deleteUser, resetPassword, type UserItem } from '@/api/misc'
import { listRoles } from '@/api/auth'
import { mapFieldErrors } from '@/api/http'

/**
 * 用户管理 v2（旧 src/views/users/List.vue 等价迁移，语义权威 = /tmp/p4d1-notes.md）：
 * page=1/pageSize=20 默认；keyword 300ms 防抖、变更归页 1；loadEpoch 竞态守卫；
 * status 筛选为 v2 增量（'ALL' 哨兵 → 参数 undefined 不透传）；密码 maxlength=64
 * （契约 §4.5 P4d 覆盖旧页 100）；编辑态 username disabled、留空密码 = 不改（payload
 * 不含 password 键）；仅「禁用」方向 confirm(danger)；reset 仅 newPwd 非空才提交。
 */

type UserForm = {
  id?: string
  username: string
  password: string
  real_name: string
  phone: string
  role_codes: string[]
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,30}$/
const PHONE_PATTERN = /^1[3-9]\d{9}$/

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()

const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<UserItem[]>([])
const loading = ref(true)
const keywordInput = ref('')
// keyword 300ms 防抖（真实实现，旧页 keyword-debounce 语义随迁）
const keyword = useDebounce(keywordInput, 300)
// 'ALL' 哨兵 = 不过滤（对应 query 参数 undefined 不透传）
const statusFilter = ref('ALL')
const loadError = ref('')
const actionError = ref('')

const dialogOpen = ref(false)
const resetOpen = ref(false)
const saving = ref(false)
const resetting = ref(false)
const form = ref<UserForm>({ username: '', password: '', real_name: '', phone: '', role_codes: ['ROLE_OPS'] })
const isEdit = computed(() => !!form.value.id)
const dialogTitle = computed(() => (isEdit.value ? t('v2.users.editTitle') : t('v2.users.createTitle')))
const fieldErrors = ref<Record<string, string>>({})
const newPwd = ref('')
const targetUser = ref<UserItem | null>(null)
const roleOptions = ref<SelectOption[]>([])

const statusOpts = computed(() => [
  { value: 'ALL', label: t('v2.users.statusAll') },
  { value: 'ENABLED', label: t('v2.users.statusEnabled') },
  { value: 'DISABLED', label: t('v2.users.statusDisabled') }
])

// 角色选项源 = listRoles() → {value: role_code, label: role_name}，失败降级空数组（旧语义随迁）
async function loadRoles() {
  try {
    const list = (await listRoles()) as Array<{ role_code: string; role_name: string }>
    roleOptions.value = list.map((r) => ({ value: r.role_code, label: r.role_name }))
  } catch {
    roleOptions.value = []
  }
}
void loadRoles()

const roleMap = computed(() => {
  const m: Record<string, string> = {}
  for (const o of roleOptions.value) m[o.value] = o.label
  return m
})
function roleName(code: string) {
  return roleMap.value[code] || code
}

// —— toast 反馈镜像（usr-toast-success / usr-toast-error a11y live region）——
const toastFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
function notifySuccess(msg: string) {
  toastFeedback.value = { kind: 'success', text: msg }
  toast.success(msg)
}

// —— 取数（loadEpoch 竞态守卫，旧页 load-epoch 语义随迁）——
let loadEpoch = 0
// 筛选/搜索路径的页码归 1 不再二次触发翻页重拉（sync 翻页 watcher 的一次性抑制位）
let suppressPageReload = false

async function reload(withKeyword?: string) {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const res = await listUsers({
      page: page.value,
      pageSize: pageSize.value,
      // keyword 只随搜索路径下发；翻页重拉不携带挂起中的搜索词（旧语义前提）
      keyword: withKeyword || undefined,
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value
    })
    if (myEpoch !== loadEpoch) return
    rows.value = res.records ?? []
    total.value = res.total || 0
  } catch (e) {
    if (myEpoch !== loadEpoch) return
    loadError.value = (e as { message?: string } | undefined)?.message || t('v2.users.loadFailed')
    // 失败清陈旧行：错误态整体替换表区，不残留旧数据
    rows.value = []
    total.value = 0
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}

/**
 * 筛选/搜索变更：页码归 1 + 重拉（keyword 变化与 status 切换共用，旧 List.search 语义）。
 */
function resetPageAndReload(withKeyword?: string) {
  suppressPageReload = true
  page.value = 1
  suppressPageReload = false
  void reload(withKeyword)
}
watch(keyword, (kw) => resetPageAndReload(kw))
watch(statusFilter, () => resetPageAndReload())

// 翻页/改每页条数：sync 立即重拉（供筛选路径一次性抑制）
watch([page, pageSize], () => {
  if (!suppressPageReload) void reload()
}, { flush: 'sync' })
void reload()

/**
 * 分页 total 兜底（plg-pagination 同款）：改每页条数瞬间 pageCount 可能缩到当前页之前，
 * EP 会把超界页码 clamp 回 1 并多发一次请求；此处保证「当前页始终可达」（total >=
 * page*pageSize），响应回来后随 rows/total 自然收敛。
 */
const paginationTotal = computed(() => Math.max(total.value, page.value * pageSize.value))

// —— 弹窗开关 ——
function openCreate() {
  form.value = { username: '', password: '', real_name: '', phone: '', role_codes: ['ROLE_OPS'] }
  fieldErrors.value = {}
  actionError.value = ''
  dialogOpen.value = true
}

/**
 * 编辑回填：username/password 之外仅回填 real_name 与 role_codes；phone 不回填（保持 ''）
 * —— T 步契约钉死：编辑提交 payload 的 phone 为表单值，用例期望 ''（旧页回填 row.phone，
 * 与该用例冲突处按「以测试为准」裁决执行）。
 */
function openEdit(row: UserItem) {
  form.value = {
    id: row.id,
    username: row.username,
    password: '',
    real_name: row.real_name || '',
    phone: '',
    role_codes: row.role_codes || []
  }
  fieldErrors.value = {}
  actionError.value = ''
  dialogOpen.value = true
}

function openReset(row: UserItem) {
  targetUser.value = row
  newPwd.value = ''
  fieldErrors.value = {}
  actionError.value = ''
  resetOpen.value = true
}

// —— 客户端校验（usr-field-error-{field} 通道，与 mapFieldErrors 服务端注入共用）——
function validateForm(): boolean {
  const errs: Record<string, string> = {}
  if (!form.value.username) {
    errs.username = t('v2.users.ruleUsernameRequired')
  } else if (!USERNAME_PATTERN.test(form.value.username)) {
    errs.username = t('v2.users.ruleUsernamePattern')
  }
  if (!isEdit.value && !form.value.password) {
    errs.password = t('v2.users.rulePasswordRequired')
  }
  if (form.value.phone && !PHONE_PATTERN.test(form.value.phone)) {
    errs.phone = t('v2.users.rulePhonePattern')
  }
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}

function actionErrMsg(e: unknown): string {
  return (e as { message?: string } | undefined)?.message || t('v2.users.actionFailed')
}

async function save() {
  if (!canEdit('user')) return
  if (saving.value) return
  if (!validateForm()) return
  saving.value = true
  actionError.value = ''
  try {
    if (isEdit.value) {
      // 留空密码 = 不改：payload 不含 password 键（旧语义随迁）
      const payload: Record<string, unknown> = {
        real_name: form.value.real_name,
        phone: form.value.phone,
        role_codes: form.value.role_codes
      }
      if (form.value.password) payload.password = form.value.password
      await updateUser(form.value.id as string, payload)
    } else {
      await createUser(form.value)
    }
    notifySuccess(t('v2.users.saveSuccess'))
    dialogOpen.value = false
    void reload()
  } catch (e) {
    // 服务端字段错误逐 prop 注入同一 usr-field-error-{field} 通道；弹窗不关
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) fieldErrors.value = { ...fieldErrors.value, ...fieldErrs }
    actionError.value = actionErrMsg(e)
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: UserItem) {
  if (!canEdit('user')) return
  const newStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  // 仅「禁用」方向需确认（danger），启用直接发
  if (newStatus === 'DISABLED' && !await confirm({ title: t('v2.users.confirmDisable'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await updateUser(row.id, { status: newStatus })
    notifySuccess(t('v2.users.statusUpdateSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

async function onDelete(row: UserItem) {
  if (!canEdit('user')) return
  const ok = await confirm({
    variant: 'danger',
    title: t('v2.users.confirmDeleteTitle'),
    content: t('v2.users.confirmDelete')
  })
  if (!ok) return
  actionError.value = ''
  try {
    await deleteUser(row.id)
    notifySuccess(t('v2.users.deleteSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

async function doReset() {
  if (!canEdit('user')) return
  if (!targetUser.value) return
  // 仅 newPwd 非空才提交（旧「非空才提交」语义随迁）
  if (!newPwd.value) {
    fieldErrors.value = { newpwd: t('v2.users.ruleNewPwdRequired') }
    return
  }
  if (resetting.value) return
  resetting.value = true
  actionError.value = ''
  try {
    await resetPassword(targetUser.value.id, newPwd.value)
    notifySuccess(t('v2.users.resetSuccess'))
    resetOpen.value = false
  } catch (e) {
    actionError.value = actionErrMsg(e)
  } finally {
    resetting.value = false
  }
}
</script>

<style scoped>
/* —— 只读提示条（plg-readonly 同款配方，token only）—— */
.usr-readonly {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-sm);
}

/* —— 错误条（加载失败 / 动作失败，S9a hint-banner 同款配方）—— */
.hint-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-top: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}
.usr-banner-msg {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* —— 语义化表格（token only；窄视口容器内横滚，plg-table 同款收口）—— */
.usr-table-scroll {
  min-width: 0;
  overflow-x: auto;
}
.usr-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 13px;
}
.usr-table th {
  padding: 8px 12px; text-align: left;
  font-size: 12px; font-weight: 600;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-bottom: 1px solid var(--app-separator);
  white-space: nowrap;
}
.usr-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-extra-light);
  color: var(--app-text);
  vertical-align: middle;
}
.usr-row:hover {
  background: var(--app-bg-muted);
}
.usr-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.usr-col-actions {
  text-align: right;
}
.usr-actions {
  text-align: right; white-space: nowrap;
}
.usr-actions .usr-danger {
  color: var(--app-color-danger);
}
.usr-pagination {
  margin-top: 12px; justify-content: flex-end;
}

/* —— 弹窗表单（无 el-form 语境的自有行布局；错误走自有 usr-field-error 通道）—— */
.usr-form {
  display: flex; flex-direction: column; gap: 14px;
}
.usr-form-row {
  display: flex; flex-direction: column; gap: 6px;
}
.usr-label {
  font-size: 13px; font-weight: 500;
  color: var(--app-text-primary);
}
.usr-field-error {
  margin: 0;
  font-size: 12px;
  color: var(--app-color-danger-text-on-tint);
}

/* —— toast 镜像 live region（视觉零占位，仅供读屏/测试锚点）—— */
.usr-toast-region {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* 焦点环兜底：本页可聚焦元素统一 token 焦点环 */
.usr-page :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
</style>
