<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-roles>
          <p v-if="rolesLoadError" class="load-error" data-testid="roles-load-error">{{ rolesLoadError }}</p>
          <FcTable v-else :data="roles" :loading="rolesLoading" stripe>
            <el-table-column prop="role_code" :label="t('gateway.role.code')" width="160" />
            <el-table-column prop="role_name" :label="t('gateway.role.name')" />
          </FcTable>
        </template>
        <template #tab-permissions>
          <p v-if="permissionsLoadError" class="load-error" data-testid="permissions-load-error">{{ permissionsLoadError }}</p>
          <template v-else>
            <FcTable :data="permissions" :loading="permissionsLoading" stripe>
              <el-table-column prop="permission_code" :label="t('gateway.role.permission')" width="200" />
              <el-table-column prop="permission_name" :label="t('gateway.role.name')" />
              <el-table-column :label="t('gateway.role.type')" width="120">
                <template #default="{ row }">{{ resourceTypeLabel(row.resource_type) }}</template>
              </el-table-column>
            </FcTable>
            <FcEmpty v-if="!permissions.length" :title="t('gateway.role.noPermissions')" />
          </template>
        </template>
      </FcTabsPanel>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FcSection, FcTabsPanel, FcTable, FcEmpty
} from '@/components/sdk'
import { listRoles, listPermissions } from '@/api/gateway/auth'

const { t } = useI18n()

const resourceTypeMap: Record<string, string> = { MENU: 'role.typeMenu', BUTTON: 'role.typeButton', API: 'role.typeApi' }
function resourceTypeLabel(type: string) { return t(resourceTypeMap[type] || type) }
const tab = ref('roles')
const tabs = computed(() => [
  { value: 'roles', label: t('gateway.role.tabRoles') },
  { value: 'permissions', label: t('gateway.role.tabMyPermissions') }
])
const roles = ref<any[]>([])
const permissions = ref<any[]>([])
const rolesLoading = ref(true)
const permissionsLoading = ref(true)
const rolesLoadError = ref('')
const permissionsLoadError = ref('')
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
    rolesLoadError.value = e?.message || t('gateway.role.rolesLoadFailed')
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
    permissionsLoadError.value = e?.message || t('gateway.role.permissionsLoadFailed')
  } finally {
    if (myEpoch === loadEpoch) permissionsLoading.value = false
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
</style>
