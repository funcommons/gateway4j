<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-roles>
          <p v-if="rolesLoadError" class="load-error" data-testid="roles-load-error">{{ rolesLoadError }}</p>
          <template v-else>
            <div v-if="canManage" class="roles-toolbar">
              <FcButton variant="primary" size="sm" data-testid="create-role" @click="openCreate">{{ t('role.createRole') }}</FcButton>
            </div>
            <FcTable :data="roles" :loading="rolesLoading" stripe>
              <el-table-column prop="role_code" :label="t('role.code')" width="160" />
              <el-table-column prop="role_name" :label="t('role.name')" />
              <el-table-column :label="t('role.remark')">
                <template #default="{ row }">{{ (row as any).remark || '-' }}</template>
              </el-table-column>
              <el-table-column v-if="canManage" :label="t('route.actionLabel')" width="280" fixed="right">
                <template #default="{ row }">
                  <FcButton variant="text" size="sm" data-testid="role-grant" @click="openGrant(row as any)">{{ t('role.grant') }}</FcButton>
                  <FcButton variant="text" size="sm" data-testid="role-members" @click="openMembers(row as any)">{{ t('role.members') }}</FcButton>
                  <FcButton variant="text" size="sm" data-testid="role-edit" @click="openEdit(row as any)">{{ t('common.edit') }}</FcButton>
                  <!-- ROLE_ADMIN 内置管理员角色不可删除：禁用而非隐藏，让规则可见 -->
                  <FcButton
                    v-if="(row as any).role_code === 'ROLE_ADMIN'"
                    variant="text"
                    size="sm"
                    type="danger"
                    disabled
                    data-testid="role-delete-disabled"
                  >{{ t('common.delete') }}</FcButton>
                  <FcConfirm v-else :content="t('role.confirmDelete')" @confirm="del(row as any)">
                    <FcButton variant="text" size="sm" type="danger" data-testid="role-delete">{{ t('common.delete') }}</FcButton>
                  </FcConfirm>
                </template>
              </el-table-column>
            </FcTable>
            <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
          </template>
        </template>
        <template #tab-permissions>
          <p v-if="permissionsLoadError" class="load-error" data-testid="permissions-load-error">{{ permissionsLoadError }}</p>
          <template v-else>
            <!-- 权限类型筛选：语义单选（全部/菜单/按钮/接口） -->
            <div class="permission-type-filter" data-testid="permission-type-filter">
              <span class="permission-type-filter__label">{{ t('role.typeFilter') }}</span>
              <FcRadioGroup
                v-model="permissionType"
                :options="permissionTypeOptions"
                variant="button"
                size="small"
              />
            </div>
            <FcTable :data="filteredPermissions" :loading="permissionsLoading" stripe>
              <el-table-column prop="permission_code" :label="t('role.permission')" width="200" />
              <el-table-column prop="permission_name" :label="t('role.name')" />
              <el-table-column :label="t('role.type')" width="120">
                <template #default="{ row }">{{ resourceTypeLabel(row.resource_type) }}</template>
              </el-table-column>
            </FcTable>
            <FcEmpty v-if="!permissions.length" :title="t('role.noPermissions')" />
            <FcEmpty v-else-if="!filteredPermissions.length" :title="t('common.empty')" />
          </template>
        </template>
      </FcTabsPanel>
    </FcSection>

    <!-- 新建/编辑角色 -->
    <FcDialog v-model:open="formOpen" :title="roleForm.id ? t('role.editRole') : t('role.createRole')" width="460px">
      <el-form :model="roleForm" :rules="roleRules" label-width="100px" ref="roleFormRef">
        <FcFormItem :label="t('role.codeLabel')" prop="role_code">
          <FcInput v-model="roleForm.role_code" :disabled="!!roleForm.id" maxlength="50" :placeholder="t('role.codePlaceholder')" />
        </FcFormItem>
        <FcFormItem :label="t('role.nameLabel')" prop="role_name">
          <FcInput v-model="roleForm.role_name" maxlength="50" />
        </FcFormItem>
        <FcFormItem :label="t('role.remark')">
          <FcInput v-model="roleForm.remark" type="textarea" :rows="3" maxlength="200" />
        </FcFormItem>
      </el-form>
      <p v-if="formError" class="dialog-error" data-testid="save-error">{{ formError }}</p>
      <template #footer>
        <FcButton @click="formOpen = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="savingRole" data-testid="save-role" @click="saveRole">{{ t('common.save') }}</FcButton>
      </template>
    </FcDialog>

    <!-- 角色授权：按 resource 前缀分组，checkbox 多选，保存提交全量 -->
    <FcDialog v-model:open="grantOpen" :title="t('role.grantTitle', { role: grantRoleName })" width="680px">
      <FcSkeleton v-if="grantLoading" variant="text" :rows="6" />
      <template v-else>
        <div class="grant-toolbar">
          <FcButton variant="text" size="sm" data-testid="grant-check-all" @click="checkAll">{{ t('common.selectAll') }}</FcButton>
          <FcButton variant="text" size="sm" data-testid="grant-check-none" @click="checkNone">{{ t('common.clear') }}</FcButton>
          <span class="grant-count" data-testid="grant-count">{{ t('role.selectedCount', { selected: checked.length, total: allPermissions.length }) }}</span>
        </div>
        <div class="grant-groups" data-testid="grant-groups">
          <div v-for="g in groupedPermissions" :key="g.prefix" class="grant-group" :data-testid="`grant-group-${g.prefix}`">
            <div class="grant-group-header">
              <span class="grant-group-title">{{ g.prefix }}</span>
              <el-checkbox
                :model-value="isGroupAll(g)"
                :indeterminate="isGroupIndeterminate(g)"
                @change="(v: any) => toggleGroup(g, v)"
              >{{ t('common.selectAll') }}</el-checkbox>
            </div>
            <el-checkbox-group v-model="checked" class="grant-group-items">
              <el-checkbox
                v-for="p in g.items"
                :key="p.permission_code"
                :value="p.permission_code"
                :data-testid="`perm-${p.permission_code}`"
              >
                {{ p.permission_code }}<span v-if="p.permission_name" class="perm-name">{{ p.permission_name }}</span>
              </el-checkbox>
            </el-checkbox-group>
          </div>
          <FcEmpty v-if="!groupedPermissions.length" :title="t('role.noAssignablePermissions')" />
        </div>
      </template>
      <p v-if="grantError" class="dialog-error" data-testid="save-error">{{ grantError }}</p>
      <template #footer>
        <FcButton @click="grantOpen = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="savingGrant" data-testid="save-grant" @click="saveGrant">{{ t('common.save') }}</FcButton>
      </template>
    </FcDialog>

    <!-- 角色成员管理：多选用户，打开时回显已选，保存提交全量 -->
    <FcDialog v-model:open="memberOpen" :title="t('role.memberTitleOf', { role: memberRoleName })" width="560px">
      <FcSkeleton v-if="memberLoading" variant="text" :rows="6" />
      <template v-else>
        <div class="grant-toolbar">
          <FcButton variant="text" size="sm" data-testid="member-check-all" @click="memberCheckAll">{{ t('common.selectAll') }}</FcButton>
          <FcButton variant="text" size="sm" data-testid="member-check-none" @click="memberCheckNone">{{ t('common.clear') }}</FcButton>
          <span class="grant-count" data-testid="member-count">{{ t('role.selectedCount', { selected: memberIds.length, total: allUsers.length }) }}</span>
        </div>
        <div class="member-list" data-testid="member-list">
          <el-checkbox-group v-model="memberIds" class="member-items">
            <el-checkbox
              v-for="u in allUsers"
              :key="u.id"
              :value="u.id"
              :data-testid="`member-user-${u.id}`"
            >
              {{ u.username }}<span v-if="u.real_name" class="perm-name">{{ u.real_name }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <FcEmpty v-if="!allUsers.length" :title="t('role.noSelectableUsers')" />
        </div>
      </template>
      <p v-if="memberError" class="dialog-error" data-testid="member-error">{{ memberError }}</p>
      <template #footer>
        <FcButton @click="memberOpen = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="savingMembers" data-testid="save-members" @click="saveMembers">{{ t('common.save') }}</FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FcSection, FcTabsPanel, FcTable, FcEmpty, FcButton, FcInput, FcDialog, FcConfirm, FcFormItem,
  FcSkeleton, FcRadioGroup, toast
} from '@/components'
import type { RadioValue } from '@/components/form/radioContext'
import {
  listRoles, listPermissions,
  createRole, updateRole, deleteRole,
  getRolePermissions, updateRolePermissions,
  listRoleUsers, updateRoleUsers
} from '@/api/auth'
import { listUsers } from '@/api/misc'
import { usePermission } from '@/composables/usePermission'

const { t } = useI18n()
const { hasPermission } = usePermission()
// D16: 管理能力（新建/授权/编辑/删除）统一由 role:edit 权限门控
const canManage = computed(() => hasPermission('role:edit'))

const resourceTypeMap: Record<string, string> = { MENU: 'role.typeMenu', BUTTON: 'role.typeButton', API: 'role.typeApi' }
function resourceTypeLabel(type: string) { return t(resourceTypeMap[type] || type) }
const tab = ref('roles')
const tabs = computed(() => [
  { value: 'roles', label: t('role.tabRoles') },
  { value: 'permissions', label: t('role.tabMyPermissions') }
])
const roles = ref<any[]>([])
const permissions = ref<any[]>([])

// 权限类型筛选（语义单选）：''=全部，MENU/BUTTON/API 按 resource_type 过滤
const permissionType = ref<RadioValue>('')
const permissionTypeOptions = computed(() => [
  { value: '', label: t('role.typeAll') },
  { value: 'MENU', label: t('role.typeMenu') },
  { value: 'BUTTON', label: t('role.typeButton') },
  { value: 'API', label: t('role.typeApi') }
])
const filteredPermissions = computed(() => {
  const type = permissionType.value
  if (!type) return permissions.value
  return permissions.value.filter(p => String(p?.resource_type) === String(type))
})
const rolesLoading = ref(true)
const permissionsLoading = ref(true)
const rolesLoadError = ref('')
const permissionsLoadError = ref('')
const actionError = ref('')
let loadEpoch = 0

async function loadAll() {
  const myEpoch = ++loadEpoch
  try {
    rolesLoading.value = true
    const r = (await listRoles()) as any
    if (myEpoch !== loadEpoch) return
    roles.value = r
    rolesLoadError.value = ''
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    roles.value = []
    rolesLoadError.value = e?.message || t('role.rolesLoadFailed')
  } finally {
    if (myEpoch === loadEpoch) rolesLoading.value = false
  }
  try {
    permissionsLoading.value = true
    const p = (await listPermissions()) as any
    if (myEpoch !== loadEpoch) return
    permissions.value = p
    permissionsLoadError.value = ''
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    permissions.value = []
    permissionsLoadError.value = e?.message || t('role.permissionsLoadFailed')
  } finally {
    if (myEpoch === loadEpoch) permissionsLoading.value = false
  }
}

async function loadRolesOnly() {
  const myEpoch = ++loadEpoch
  try {
    const r = (await listRoles()) as any
    if (myEpoch !== loadEpoch) return
    roles.value = r
    rolesLoadError.value = ''
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    rolesLoadError.value = e?.message || t('role.rolesLoadFailed')
  }
}

// ===== 新建 / 编辑角色 =====
const formOpen = ref(false)
const savingRole = ref(false)
const formError = ref('')
const roleFormRef = ref<any>(null)
const roleForm = ref<any>({ id: null, role_code: '', role_name: '', remark: '' })

const roleRules = computed(() => ({
  role_code: [
    { required: true, message: () => t('role.codeRequired'), trigger: 'blur' },
    { pattern: /^ROLE_[A-Z0-9_]{2,40}$/, message: () => t('role.codePattern'), trigger: 'blur' }
  ],
  role_name: [
    { required: true, message: () => t('role.nameRequired'), trigger: 'blur' },
    { max: 50, message: () => t('role.nameTooLong'), trigger: 'blur' }
  ]
}))

function openCreate() {
  roleForm.value = { id: null, role_code: '', role_name: '', remark: '' }
  formError.value = ''
  formOpen.value = true
}

function openEdit(row: any) {
  roleForm.value = { id: row.id, role_code: row.role_code, role_name: row.role_name, remark: row.remark || '' }
  formError.value = ''
  formOpen.value = true
}

async function saveRole() {
  if (savingRole.value) return
  if (roleFormRef.value) {
    try { await roleFormRef.value.validate() } catch { return }
  }
  savingRole.value = true
  formError.value = ''
  try {
    if (roleForm.value.id) {
      await updateRole(roleForm.value.id, { role_name: roleForm.value.role_name, remark: roleForm.value.remark || undefined })
    } else {
      await createRole({ role_code: roleForm.value.role_code, role_name: roleForm.value.role_name, remark: roleForm.value.remark || undefined })
    }
    toast.success(t('role.saveSuccess'))
    formOpen.value = false
    await loadRolesOnly()
  } catch (e: any) {
    formError.value = e?.message || t('common.saveFailed')
  } finally {
    savingRole.value = false
  }
}

async function del(row: any) {
  actionError.value = ''
  try {
    await deleteRole(row.id)
    toast.success(t('role.deleteSuccess'))
    await loadRolesOnly()
  } catch (e: any) {
    actionError.value = e?.message || t('common.deleteFailed')
  }
}

// ===== 角色授权 =====
const grantOpen = ref(false)
const grantLoading = ref(false)
const savingGrant = ref(false)
const grantError = ref('')
const grantRole = ref<any>(null)
const grantRoleName = computed(() => grantRole.value?.role_name || grantRole.value?.role_code || '')
const allPermissions = ref<any[]>([])
const checked = ref<string[]>([])

// 按 resource 前缀（permission_code 中第一个 ':' 之前的部分）分组
const groupedPermissions = computed(() => {
  const map = new Map<string, any[]>()
  for (const p of allPermissions.value) {
    const prefix = String(p.permission_code || '').includes(':')
      ? String(p.permission_code).split(':')[0]
      : String(p.permission_code || 'OTHER')
    if (!map.has(prefix)) map.set(prefix, [])
    map.get(prefix)!.push(p)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, items]) => ({ prefix, items }))
})

function isGroupAll(g: { prefix: string; items: any[] }): boolean {
  return g.items.length > 0 && g.items.every(p => checked.value.includes(p.permission_code))
}
function isGroupIndeterminate(g: { prefix: string; items: any[] }): boolean {
  const n = g.items.filter(p => checked.value.includes(p.permission_code)).length
  return n > 0 && n < g.items.length
}
function toggleGroup(g: { prefix: string; items: any[] }, v: any) {
  const codes = g.items.map(p => p.permission_code)
  if (v) {
    checked.value = Array.from(new Set([...checked.value, ...codes]))
  } else {
    checked.value = checked.value.filter(c => !codes.includes(c))
  }
}
function checkAll() {
  checked.value = allPermissions.value.map(p => p.permission_code)
}
function checkNone() {
  checked.value = []
}

async function openGrant(row: any) {
  grantRole.value = row
  grantOpen.value = true
  grantLoading.value = true
  grantError.value = ''
  checked.value = []
  try {
    const [perms, rolePerms] = await Promise.all([
      listPermissions(),
      getRolePermissions(row.id)
    ])
    allPermissions.value = perms as any[]
    checked.value = [...((rolePerms as unknown) as string[])]
  } catch (e: any) {
    grantError.value = e?.message || t('role.permissionsLoadFailed')
  } finally {
    grantLoading.value = false
  }
}

async function saveGrant() {
  if (!grantRole.value) return
  if (savingGrant.value) return
  savingGrant.value = true
  grantError.value = ''
  try {
    // 提交全量权限列表
    await updateRolePermissions(grantRole.value.id, checked.value)
    toast.success(t('role.grantSuccess'))
    grantOpen.value = false
  } catch (e: any) {
    grantError.value = e?.message || t('common.saveFailed')
  } finally {
    savingGrant.value = false
  }
}

// ===== 角色成员管理（T4）=====
const memberOpen = ref(false)
const memberLoading = ref(false)
const savingMembers = ref(false)
const memberError = ref('')
const memberRole = ref<any>(null)
const memberRoleName = computed(() => memberRole.value?.role_name || memberRole.value?.role_code || '')
const allUsers = ref<any[]>([])
const memberIds = ref<string[]>([])

// /v1/users 是分页接口：全量分页聚合（按 total 翻页，带上限保护）
async function loadAllUsers(): Promise<any[]> {
  const pageSize = 100
  const out: any[] = []
  for (let page = 1; page <= 100; page++) {
    const r: any = await listUsers({ page, pageSize })
    const records = r?.records || []
    out.push(...records)
    const total = typeof r?.total === 'number' ? r.total : out.length
    if (!records.length || out.length >= total) break
  }
  return out
}

async function openMembers(row: any) {
  memberRole.value = row
  memberOpen.value = true
  memberLoading.value = true
  memberError.value = ''
  memberIds.value = []
  try {
    const [users, roleUsers] = await Promise.all([
      loadAllUsers(),
      listRoleUsers(row.id)
    ])
    allUsers.value = users as any[]
    // 回显已选成员
    memberIds.value = ((roleUsers as unknown) as Array<{ id: string }> | undefined)?.map(u => String(u.id)) || []
  } catch (e: any) {
    memberError.value = e?.message || t('role.membersLoadFailed')
  } finally {
    memberLoading.value = false
  }
}

function memberCheckAll() {
  memberIds.value = allUsers.value.map(u => String(u.id))
}

function memberCheckNone() {
  memberIds.value = []
}

async function saveMembers() {
  if (!memberRole.value) return
  if (savingMembers.value) return
  savingMembers.value = true
  memberError.value = ''
  try {
    // 全量提交当前选中成员
    await updateRoleUsers(memberRole.value.id, [...memberIds.value])
    toast.success(t('role.saveSuccess'))
    memberOpen.value = false
  } catch (e: any) {
    memberError.value = e?.message || t('common.saveFailed')
  } finally {
    savingMembers.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.action-error {
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
.roles-toolbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.permission-type-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.permission-type-filter__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}
.grant-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 8px;
}
.grant-count { margin-left: auto; font-size: 12px; color: var(--app-text-secondary); }
.grant-groups { max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.grant-group { border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); padding: 8px 12px; }
.grant-group-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.grant-group-title { font-size: 13px; font-weight: 600; color: var(--app-text-secondary); }
.grant-group-items { display: flex; flex-wrap: wrap; gap: 0 16px; }
.perm-name { margin-left: 4px; font-size: 12px; color: var(--app-text-secondary); }
.member-list { max-height: 46vh; overflow-y: auto; }
.member-items { display: flex; flex-direction: column; gap: 2px; }
</style>
