<template>
  <div class="rol-page" data-testid="rol-page">
    <FcSection>
      <FcFilterBar>
        <template #actions>
          <FcButton
            v-if="canEdit('role')"
            variant="primary"
            data-testid="rol-action-create"
            @click="openCreate"
          >
            {{ t('v2.roles.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <p v-if="!canEdit('role')" class="rol-readonly" data-testid="rol-readonly-hint" role="status">
        {{ t('v2.roles.readonlyHint') }}
      </p>

      <FcSkeleton v-if="loading && !loadError" variant="text" :rows="6" data-testid="rol-skeleton" />
      <!-- Load failed: the error banner replaces the table area entirely (error state is not empty state) -->
      <div v-else-if="loadError" class="hint-banner is-error" data-testid="rol-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.roles.loadFailed') }}</span>
        <span class="rol-banner-msg">{{ loadError }}</span>
        <FcButton variant="text" size="sm" data-testid="rol-retry" @click="reload()">
          <FcIcon name="ri-refresh-line" :size="14" />
        </FcButton>
      </div>
      <template v-else>
        <!-- Row DOM contract: rol-row-<id> on the <tr>; semantic <table> + Fc atoms only -->
        <div v-if="rows.length" class="rol-table-scroll" data-testid="rol-list">
          <table class="rol-table">
            <thead>
              <tr>
                <th scope="col">{{ t('v2.roles.colCode') }}</th>
                <th scope="col">{{ t('v2.roles.colName') }}</th>
                <th scope="col">{{ t('v2.roles.colRemark') }}</th>
                <th scope="col" class="rol-col-actions">{{ t('v2.roles.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="rol-row" :data-testid="`rol-row-${row.id}`">
                <td class="rol-mono" :data-testid="`rol-cell-code-${row.id}`">{{ row.role_code }}</td>
                <td :data-testid="`rol-cell-name-${row.id}`">{{ row.role_name }}</td>
                <td :data-testid="`rol-cell-remark-${row.id}`">{{ row.remark || '-' }}</td>
                <td class="rol-actions">
                  <template v-if="canEdit('role')">
                    <FcButton variant="text" size="sm" :data-testid="`rol-action-edit-${row.id}`" @click="openEdit(row)">
                      {{ t('v2.roles.edit') }}
                    </FcButton>
                    <FcButton variant="text" size="sm" :data-testid="`rol-action-perm-${row.id}`" @click="openPerm(row)">
                      {{ t('v2.roles.perm') }}
                    </FcButton>
                    <FcButton
                      variant="text"
                      size="sm"
                      :data-testid="`rol-action-members-${row.id}`"
                      @click="openMembers(row)"
                    >
                      {{ t('v2.roles.members') }}
                    </FcButton>
                    <!-- Built-in admin row: delete disabled but visible (legacy ruling), never hidden -->
                    <FcButton
                      v-if="row.role_code === 'ROLE_ADMIN'"
                      variant="text"
                      size="sm"
                      class="rol-danger"
                      disabled
                      :title="t('v2.roles.adminDeleteHint')"
                      data-testid="rol-action-delete-disabled"
                    >
                      {{ t('v2.roles.delete') }}
                    </FcButton>
                    <FcButton
                      v-else
                      variant="text"
                      size="sm"
                      class="rol-danger"
                      :data-testid="`rol-action-delete-${row.id}`"
                      @click="onDelete(row)"
                    >
                      {{ t('v2.roles.delete') }}
                    </FcButton>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <FcEmpty v-else type="empty" :title="t('v2.roles.empty')" data-testid="rol-empty" />
      </template>

      <!-- Action error banner: coexists with the list; a failed action never clears rows -->
      <div v-if="actionError" class="hint-banner is-error" data-testid="rol-action-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ actionError }}</span>
      </div>
    </FcSection>

    <!-- Create / edit dialog (one shared dialog; role_code disabled in edit mode).
         maxlength contract: role_code 50 / role_name 50 / remark 200. Field errors:
         client validation and server mapFieldErrors share the rol-field-error-{field} channel. -->
    <FcDialog v-model:open="formOpen" :title="formTitle" width="480px">
      <div data-testid="rol-dialog" class="rol-form">
        <div class="rol-form-row">
          <label class="rol-label" for="rol-f-code">{{ t('v2.roles.fCode') }}</label>
          <FcInput
            id="rol-f-code"
            v-model="form.role_code"
            maxlength="50"
            :disabled="isEdit"
            data-testid="rol-input-code"
          />
          <p
            v-if="fieldErrors.role_code"
            class="rol-field-error"
            role="alert"
            data-testid="rol-field-error-role_code"
          >
            {{ fieldErrors.role_code }}
          </p>
        </div>
        <div class="rol-form-row">
          <label class="rol-label" for="rol-f-name">{{ t('v2.roles.fName') }}</label>
          <FcInput id="rol-f-name" v-model="form.role_name" maxlength="50" data-testid="rol-input-name" />
          <p
            v-if="fieldErrors.role_name"
            class="rol-field-error"
            role="alert"
            data-testid="rol-field-error-role_name"
          >
            {{ fieldErrors.role_name }}
          </p>
        </div>
        <div class="rol-form-row">
          <label class="rol-label" for="rol-f-remark">{{ t('v2.roles.fRemark') }}</label>
          <FcInput
            id="rol-f-remark"
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="200"
            data-testid="rol-input-remark"
          />
          <p v-if="fieldErrors.remark" class="rol-field-error" role="alert" data-testid="rol-field-error-remark">
            {{ fieldErrors.remark }}
          </p>
        </div>
      </div>
      <template #footer>
        <FcButton @click="formOpen = false">{{ t('v2.roles.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="saving" data-testid="rol-submit" @click="saveForm">
          {{ t('v2.roles.submit') }}
        </FcButton>
      </template>
    </FcDialog>

    <!-- Permission matrix dialog: lazy Promise.all(listPermissions + getRolePermissions(id));
         flat 3-column table + resource_type filter; save submits the FULL checked list (not delta). -->
    <FcDialog v-model:open="permOpen" :title="t('v2.roles.permTitle')" width="640px">
      <div data-testid="rol-dialog" class="rol-form">
        <div class="rol-perm-toolbar">
          <FcSegmented v-model="permTypeFilter" :options="typeOpts" size="sm" data-testid="rol-perm-type-filter" />
          <div class="rol-perm-tools">
            <FcButton variant="text" size="sm" data-testid="rol-perm-check-all" @click="checkAllPerms">
              {{ t('v2.roles.selectAll') }}
            </FcButton>
            <FcButton variant="text" size="sm" data-testid="rol-perm-check-none" @click="clearPerms">
              {{ t('v2.roles.clear') }}
            </FcButton>
            <span class="rol-perm-count" data-testid="rol-perm-count">
              {{ t('v2.roles.selectedCount', { selected: checkedCodes.length, total: perms.length }) }}
            </span>
          </div>
        </div>
        <div v-if="filteredPerms.length" class="rol-table-scroll" data-testid="rol-perm-matrix">
          <table class="rol-table">
            <thead>
              <tr>
                <th scope="col">{{ t('v2.roles.colPermission') }}</th>
                <th scope="col">{{ t('v2.roles.colPermName') }}</th>
                <th scope="col">{{ t('v2.roles.colResourceType') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in filteredPerms" :key="p.permission_code">
                <td>
                  <FcCheckbox
                    :model-value="checkedCodes.includes(p.permission_code)"
                    :data-testid="`rol-perm-checkbox-${p.permission_code}`"
                    @change="onPermToggle(p.permission_code, $event)"
                  >
                    <span class="rol-mono">{{ p.permission_code }}</span>
                  </FcCheckbox>
                </td>
                <td>{{ p.permission_name }}</td>
                <td>{{ resourceTypeLabel(p.resource_type) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <FcEmpty v-else type="empty" :title="t('v2.roles.permEmpty')" />
      </div>
      <template #footer>
        <FcButton @click="permOpen = false">{{ t('v2.roles.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="permSaving" data-testid="rol-submit" @click="savePerm">
          {{ t('v2.roles.submit') }}
        </FcButton>
      </template>
    </FcDialog>

    <!-- Members dialog: lazy loadAllUsers (paged aggregate, pageSize=100) + listRoleUsers echo;
         save submits the FULL member id list (not delta). -->
    <FcDialog v-model:open="membersOpen" :title="t('v2.roles.membersTitle')" width="520px">
      <div data-testid="rol-dialog" class="rol-form">
        <div class="rol-perm-toolbar">
          <div class="rol-perm-tools">
            <FcButton variant="text" size="sm" data-testid="rol-members-check-all" @click="checkAllMembers">
              {{ t('v2.roles.selectAll') }}
            </FcButton>
            <FcButton variant="text" size="sm" data-testid="rol-members-check-none" @click="clearMembers">
              {{ t('v2.roles.clear') }}
            </FcButton>
            <span class="rol-perm-count" data-testid="rol-members-count">
              {{ t('v2.roles.selectedCount', { selected: memberIds.length, total: allUsers.length }) }}
            </span>
          </div>
        </div>
        <div v-if="allUsers.length" class="rol-table-scroll" data-testid="rol-members-list">
          <table class="rol-table">
            <tbody>
              <tr v-for="u in allUsers" :key="u.id">
                <td>
                  <FcCheckbox
                    :model-value="memberIds.includes(u.id)"
                    :data-testid="`rol-members-user-${u.id}`"
                    @change="onMemberToggle(u.id, $event)"
                  >
                    <span class="rol-mono">{{ u.username }}</span>
                    <span v-if="u.real_name" class="rol-member-name">{{ u.real_name }}</span>
                  </FcCheckbox>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <FcEmpty v-else type="empty" :title="t('v2.roles.membersEmpty')" />
      </div>
      <template #footer>
        <FcButton @click="membersOpen = false">{{ t('v2.roles.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="membersSaving" data-testid="rol-submit" @click="saveMembers">
          {{ t('v2.roles.submit') }}
        </FcButton>
      </template>
    </FcDialog>

    <!-- a11y live region mirroring the toast feedback (rol-toast-success / rol-toast-error) -->
    <div
      v-if="toastFeedback"
      class="rol-toast-region"
      role="status"
      aria-live="polite"
      :data-testid="toastFeedback.kind === 'success' ? 'rol-toast-success' : 'rol-toast-error'"
    >
      {{ toastFeedback.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcFilterBar, FcInput, FcSegmented, FcCheckbox, FcButton, FcIcon,
  FcEmpty, FcSkeleton, FcDialog, toast
} from '@/components'
import {
  listRoles, listPermissions, createRole, updateRole, deleteRole,
  getRolePermissions, updateRolePermissions, listRoleUsers, updateRoleUsers
} from '@/api/auth'
import { listUsers } from '@/api/misc'
import { mapFieldErrors } from '@/api/http'

/**
 * 角色权限 v2（旧 src/views/users/Roles.vue 等价迁移，语义权威 = /tmp/p4d2-notes.md）：
 * 旧两 Tab（角色/权限浏览）合并为单页三弹窗（表单/权限矩阵/成员）；挂载只拉 listRoles()，
 * 矩阵与成员均在弹窗打开时懒加载；loadEpoch 竞态守卫；ROLE_ADMIN 行删除钮禁用不隐藏；
 * create payload {role_code, role_name, remark||undefined}，update payload 不含 role_code 键；
 * 矩阵/成员保存均提交【全量】勾选列表（回显序在前、新勾选按勾选次序追加）。
 */

interface RoleRow {
  id: string
  role_code: string
  role_name: string
  remark?: string
}
interface PermRow {
  permission_code: string
  permission_name: string
  resource_type: string
}
interface MemberUser {
  id: string
  username: string
  real_name?: string
}

const ROLE_CODE_PATTERN = /^ROLE_[A-Z0-9_]{2,40}$/
const MEMBER_PAGE_SIZE = 100
const MEMBER_PAGE_GUARD = 100

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()

// —— toast 反馈镜像（rol-toast-success / rol-toast-error a11y live region）——
const toastFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
function notifySuccess(msg: string) {
  toastFeedback.value = { kind: 'success', text: msg }
  toast.success(msg)
}

// —— 列表取数（loadEpoch 竞态守卫，旧页同名机制随迁）——
const rows = ref<RoleRow[]>([])
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
let loadEpoch = 0

function errMsg(e: unknown): string {
  return (e as { message?: string } | undefined)?.message || ''
}
function actionErrMsg(e: unknown): string {
  return errMsg(e) || t('v2.roles.actionFailed')
}

async function reload() {
  const myEpoch = ++loadEpoch
  loading.value = true
  // 旧错误条在重试挂起期间保持原样（重试钮可重入，竞态用例契约），仅随本轮结果更新
  try {
    const list = await listRoles()
    if (myEpoch !== loadEpoch) return
    rows.value = list as RoleRow[]
    loadError.value = ''
  } catch (e) {
    if (myEpoch !== loadEpoch) return
    loadError.value = errMsg(e) || t('v2.roles.loadFailed')
    rows.value = []
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}
void reload()

// —— 新建/编辑表单弹窗（两态共用；编辑态 role_code disabled 且 payload 不含该键）——
const formOpen = ref(false)
const saving = ref(false)
const form = ref<{ id?: string; role_code: string; role_name: string; remark: string }>({
  role_code: '',
  role_name: '',
  remark: ''
})
const isEdit = computed(() => !!form.value.id)
const formTitle = computed(() => (isEdit.value ? t('v2.roles.editTitle') : t('v2.roles.createTitle')))
const fieldErrors = ref<Record<string, string>>({})

function openCreate() {
  form.value = { role_code: '', role_name: '', remark: '' }
  fieldErrors.value = {}
  actionError.value = ''
  formOpen.value = true
}

function openEdit(row: RoleRow) {
  form.value = { id: row.id, role_code: row.role_code, role_name: row.role_name, remark: row.remark || '' }
  fieldErrors.value = {}
  actionError.value = ''
  formOpen.value = true
}

// 客户端校验（rol-field-error-{field} 通道，与 mapFieldErrors 服务端注入共用）
function validateForm(): boolean {
  const errs: Record<string, string> = {}
  if (!form.value.role_code) {
    errs.role_code = t('v2.roles.ruleCodeRequired')
  } else if (!ROLE_CODE_PATTERN.test(form.value.role_code)) {
    errs.role_code = t('v2.roles.ruleCodePattern')
  }
  if (!form.value.role_name) {
    errs.role_name = t('v2.roles.ruleNameRequired')
  } else if (form.value.role_name.length > 50) {
    errs.role_name = t('v2.roles.ruleNameTooLong')
  }
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}

async function saveForm() {
  if (!canEdit('role')) return
  if (saving.value) return
  if (!validateForm()) return
  saving.value = true
  actionError.value = ''
  try {
    if (isEdit.value) {
      // 编辑 payload 无 role_code 键（角色码不可改，旧语义随迁）
      await updateRole(form.value.id as string, {
        role_name: form.value.role_name,
        remark: form.value.remark || undefined
      })
    } else {
      await createRole({
        role_code: form.value.role_code,
        role_name: form.value.role_name,
        remark: form.value.remark || undefined
      })
    }
    notifySuccess(t('v2.roles.saveSuccess'))
    formOpen.value = false
    void reload()
  } catch (e) {
    // 服务端字段错误逐 prop 注入同一 rol-field-error-{field} 通道；弹窗不关
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) fieldErrors.value = { ...fieldErrors.value, ...fieldErrs }
    actionError.value = actionErrMsg(e)
  } finally {
    saving.value = false
  }
}

// —— 删除（ROLE_ADMIN 防护在模板层：禁用不隐藏；普通行走 confirm(danger)）——
async function onDelete(row: RoleRow) {
  if (!canEdit('role')) return
  const ok = await confirm({
    variant: 'danger',
    title: t('v2.roles.confirmDeleteTitle'),
    content: t('v2.roles.confirmDelete')
  })
  if (!ok) return
  actionError.value = ''
  try {
    await deleteRole(row.id)
    notifySuccess(t('v2.roles.deleteSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

// —— 权限矩阵弹窗（打开才 Promise.all 懒加载；保存全量 checked 非 delta）——
const permOpen = ref(false)
const permSaving = ref(false)
const permRole = ref<RoleRow | null>(null)
const perms = ref<PermRow[]>([])
// 有序勾选列表：回显序在前、新勾选按勾选次序追加（保存顺序契约）
const checkedCodes = ref<string[]>([])
const permTypeFilter = ref('ALL')

const typeOpts = computed(() => [
  { value: 'ALL', label: t('v2.roles.typeAll') },
  { value: 'MENU', label: t('v2.roles.typeMenu') },
  { value: 'BUTTON', label: t('v2.roles.typeButton') },
  { value: 'API', label: t('v2.roles.typeApi') }
])

// 旧页 resourceTypeLabel 随迁：MENU/BUTTON/API 走 i18n，其余原样
function resourceTypeLabel(resourceType: string): string {
  if (resourceType === 'MENU') return t('v2.roles.typeMenu')
  if (resourceType === 'BUTTON') return t('v2.roles.typeButton')
  if (resourceType === 'API') return t('v2.roles.typeApi')
  return resourceType
}

const filteredPerms = computed(() =>
  perms.value.filter((p) => permTypeFilter.value === 'ALL' || p.resource_type === permTypeFilter.value)
)

async function openPerm(row: RoleRow) {
  permRole.value = row
  permTypeFilter.value = 'ALL'
  checkedCodes.value = []
  perms.value = []
  actionError.value = ''
  permOpen.value = true
  try {
    const [all, owned] = await Promise.all([listPermissions(), getRolePermissions(row.id)])
    perms.value = all
    checkedCodes.value = [...owned]
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

function onPermToggle(code: string, on: boolean | string | number) {
  const has = checkedCodes.value.includes(code)
  if (on && !has) checkedCodes.value = [...checkedCodes.value, code]
  else if (!on && has) checkedCodes.value = checkedCodes.value.filter((c) => c !== code)
}

function checkAllPerms() {
  const next = [...checkedCodes.value]
  for (const p of filteredPerms.value) {
    if (!next.includes(p.permission_code)) next.push(p.permission_code)
  }
  checkedCodes.value = next
}

function clearPerms() {
  const skip = new Set(filteredPerms.value.map((p) => p.permission_code))
  checkedCodes.value = checkedCodes.value.filter((c) => !skip.has(c))
}

async function savePerm() {
  if (!canEdit('role') || !permRole.value) return
  if (permSaving.value) return
  permSaving.value = true
  actionError.value = ''
  try {
    // 全量 checked（非 delta，旧 saveGrant 语义随迁）
    await updateRolePermissions(permRole.value.id, [...checkedCodes.value])
    notifySuccess(t('v2.roles.permSaveSuccess'))
    permOpen.value = false
  } catch (e) {
    actionError.value = actionErrMsg(e)
  } finally {
    permSaving.value = false
  }
}

// —— 成员弹窗（打开才 loadAllUsers 分页聚合 + listRoleUsers 回显；保存全量 memberIds）——
const membersOpen = ref(false)
const membersSaving = ref(false)
const membersRole = ref<RoleRow | null>(null)
const allUsers = ref<MemberUser[]>([])
const memberIds = ref<string[]>([])

async function loadAllUsers(): Promise<MemberUser[]> {
  const acc: MemberUser[] = []
  for (let page = 1; page <= MEMBER_PAGE_GUARD; page++) {
    const res = await listUsers({ page, pageSize: MEMBER_PAGE_SIZE })
    const records = res.records ?? []
    acc.push(...records)
    if (records.length === 0 || acc.length >= (res.total ?? acc.length)) break
  }
  return acc
}

async function openMembers(row: RoleRow) {
  membersRole.value = row
  allUsers.value = []
  memberIds.value = []
  actionError.value = ''
  membersOpen.value = true
  try {
    const users = await loadAllUsers()
    const owned = await listRoleUsers(row.id)
    allUsers.value = users
    memberIds.value = owned.map((u) => String(u.id))
  } catch (e) {
    // 成员加载失败：页面级错误条（membersLoadFailed 兜底），弹窗不关不崩
    actionError.value = `${t('v2.roles.membersLoadFailed')} ${errMsg(e)}`
  }
}

function onMemberToggle(id: string, on: boolean | string | number) {
  const has = memberIds.value.includes(id)
  if (on && !has) memberIds.value = [...memberIds.value, id]
  else if (!on && has) memberIds.value = memberIds.value.filter((m) => m !== id)
}

function checkAllMembers() {
  const next = [...memberIds.value]
  for (const u of allUsers.value) {
    if (!next.includes(u.id)) next.push(u.id)
  }
  memberIds.value = next
}

function clearMembers() {
  const skip = new Set(allUsers.value.map((u) => u.id))
  memberIds.value = memberIds.value.filter((m) => !skip.has(m))
}

async function saveMembers() {
  if (!canEdit('role') || !membersRole.value) return
  if (membersSaving.value) return
  membersSaving.value = true
  actionError.value = ''
  try {
    // 全量 memberIds（非 delta，旧 saveMembers 语义随迁）
    await updateRoleUsers(membersRole.value.id, [...memberIds.value])
    notifySuccess(t('v2.roles.memberSaveSuccess'))
    membersOpen.value = false
  } catch (e) {
    actionError.value = actionErrMsg(e)
  } finally {
    membersSaving.value = false
  }
}
</script>

<style scoped>
/* —— 只读提示条（usr-readonly 同款配方，token only）—— */
.rol-readonly {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-sm);
}

/* —— 错误条（加载失败 / 动作失败，hint-banner 同款配方）—— */
.hint-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-top: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}
.rol-banner-msg {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* —— 语义化表格（token only；窄视口容器内横滚）—— */
.rol-table-scroll {
  min-width: 0;
  overflow-x: auto;
}
.rol-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  font-size: 13px;
}
.rol-table th {
  padding: 8px 12px; text-align: left;
  font-size: 12px; font-weight: 600;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-bottom: 1px solid var(--app-separator);
  white-space: nowrap;
}
.rol-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-extra-light);
  color: var(--app-text);
  vertical-align: middle;
}
.rol-row:hover {
  background: var(--app-bg-muted);
}
.rol-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.rol-col-actions {
  text-align: right;
}
.rol-actions {
  text-align: right; white-space: nowrap;
}
.rol-actions .rol-danger {
  color: var(--app-color-danger);
}

/* —— 弹窗内表单与矩阵工具行 —— */
.rol-form {
  display: flex; flex-direction: column; gap: 14px;
}
.rol-form-row {
  display: flex; flex-direction: column; gap: 6px;
}
.rol-label {
  font-size: 13px; font-weight: 500;
  color: var(--app-text-primary);
}
.rol-field-error {
  margin: 0;
  font-size: 12px;
  color: var(--app-color-danger-text-on-tint);
}
.rol-perm-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-wrap: wrap;
}
.rol-perm-tools {
  display: flex; align-items: center; gap: 4px;
}
.rol-perm-count {
  margin-left: 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}
.rol-member-name {
  margin-left: 8px;
  color: var(--app-text-secondary);
}

/* —— toast 镜像 live region（视觉零占位，仅供读屏/测试锚点）—— */
.rol-toast-region {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* 焦点环兜底：本页可聚焦元素统一 token 焦点环 */
.rol-page :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
</style>
