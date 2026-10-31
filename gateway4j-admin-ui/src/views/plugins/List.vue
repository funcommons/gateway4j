<template>
  <div class="app-page">
    <FcSection>
      <FcFilterBar>
        <FcInput v-model="keyword" :placeholder="t('plugin.searchPlaceholder')" clearable @enter="reload" />
        <FcSelect
          v-model="type"
          :options="typeOpts"
          :placeholder="t('plugin.typePlaceholder')"
          clearable
          style="width: 140px"
        />
        <FcSelect
          v-model="status"
          :options="statusOpts"
          :placeholder="t('plugin.statusPlaceholder')"
          clearable
          style="width: 120px"
        />
        <FcButton
          variant="text"
          size="sm"
          data-testid="view-toggle"
          @click="viewMode = viewMode === 'table' ? 'grouped' : 'table'"
        >
          {{ viewMode === 'table' ? t('plugin.groupedView') : t('plugin.tableView') }}
        </FcButton>
        <template v-if="canEdit('plugin')" #actions>
          <FcButton variant="primary" data-testid="create-plugin" @click="router.push('/plugins/new')">
            {{ t('common.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <p v-if="!canEdit('plugin')" class="readonly-hint" data-testid="readonly-hint">当前账号为只读权限，如需操作请联系管理员</p>

      <FcSkeleton v-if="loading" variant="text" :rows="6" />
      <template v-else>
      <div v-if="viewMode === 'table'" data-testid="table-view">
        <FcTable :data="rows" stripe>
          <el-table-column prop="plugin_name" :label="t('plugin.name')" />
          <el-table-column prop="plugin_id" :label="t('plugin.id')" />
          <el-table-column :label="t('plugin.type')">
            <template #default="{ row }">
              <FcTag :color="typeColor(row.plugin_type)" size="sm">{{ pluginTypeLabel(row.plugin_type) }}</FcTag>
            </template>
          </el-table-column>
          <el-table-column :label="t('plugin.phase')" width="80">
            <template #default="{ row }">{{ phaseLabel(row.plugin_phase) }}</template>
          </el-table-column>
          <el-table-column :label="t('plugin.scope')" width="100">
            <template #default="{ row }">{{ scopeLabel(row.scope) }}</template>
          </el-table-column>
          <el-table-column :label="t('plugin.status')" width="100">
            <template #default="{ row }">
              <FcStatusBadge
                :tone="row.status === 'ENABLED' ? 'success' : row.status === 'UNINSTALLED' ? 'pending' : 'neutral'"
                :label="row.status === 'ENABLED' ? t('plugin.statusEnabled') : row.status === 'UNINSTALLED' ? t('plugin.statusUninstalled') : t('plugin.statusDisabled')"
                :dot="row.status === 'ENABLED'"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.more')" width="280" fixed="right">
            <template #default="{ row }">
              <FcButton v-if="canEdit('plugin')" variant="text" size="sm" @click="onEdit(row)">{{ t('common.edit') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && row.status === 'DISABLED'" variant="text" size="sm" @click="enable(row)">{{ t('common.enable') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && row.status === 'ENABLED'" variant="text" size="sm" @click="disable(row)">{{ t('common.disable') }}</FcButton>
              <FcConfirm v-if="canEdit('plugin') && row.status !== 'ENABLED'" :content="t('plugin.confirmDelete')" @confirm="del(row)">
                <FcButton variant="text" size="sm" type="danger">{{ t('common.delete') }}</FcButton>
              </FcConfirm>
            </template>
          </el-table-column>
        </FcTable>

        <FcPagination
          v-model:current-page="page" v-model:page-size="pageSize" :total="total"
          style="margin-top: 12px; justify-content: flex-end"
        />
      </div>

      <div v-else class="grouped-view" data-testid="grouped-view">
        <div v-for="group in groupedPlugins" :key="group.type" class="plugin-group" data-testid="plugin-group">
          <div class="group-header">
            <FcTag :color="typeColor(group.type)" size="sm">{{ pluginTypeLabel(group.type) }}</FcTag>
            <span class="group-count">{{ group.items.length }}</span>
          </div>
          <div class="group-items">
            <div v-for="item in group.items" :key="item.id" class="plugin-card">
              <div class="card-name">{{ item.plugin_name }}</div>
              <div class="card-id">{{ item.plugin_id }}</div>
              <FcStatusBadge
                :tone="item.status === 'ENABLED' ? 'success' : item.status === 'UNINSTALLED' ? 'pending' : 'neutral'"
                :label="item.status === 'ENABLED' ? t('plugin.statusEnabled') : item.status === 'UNINSTALLED' ? t('plugin.statusUninstalled') : t('plugin.statusDisabled')"
              />
              <div class="card-actions">
                <FcButton v-if="canEdit('plugin')" variant="text" size="sm" @click="onEdit(item)">{{ t('common.edit') }}</FcButton>
	                <FcButton v-if="canEdit('plugin') && item.status === 'DISABLED'" variant="text" size="sm" @click="enable(item)">{{ t('common.enable') }}</FcButton>
                <FcButton v-if="canEdit('plugin') && item.status === 'ENABLED'" variant="text" size="sm" @click="disable(item)">{{ t('common.disable') }}</FcButton>
              </div>
            </div>
          </div>
        </div>
        <FcEmpty v-if="!groupedPlugins.length" :title="t('common.empty')" />
      </div>
      </template>
    </FcSection>

    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
  </div>
</template>

<style scoped>
.readonly-hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted);
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
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.grouped-view { display: flex; flex-direction: column; gap: 16px; }
.plugin-group { border: 1px solid var(--app-border); border-radius: var(--app-radius-md); overflow: hidden; }
.group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: var(--app-bg-muted);
  font-size: 14px; font-weight: 600;
}
.group-count { font-size: 12px; color: var(--app-text-secondary); font-weight: 400; }
.group-items { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; }
.plugin-card {
  width: 200px; padding: 12px; border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm); display: flex; flex-direction: column; gap: 6px;
}
.card-name { font-size: 14px; font-weight: 500; }
.card-id { font-size: 12px; color: var(--app-text-secondary); }
.card-actions { display: flex; gap: 4px; margin-top: 4px; }
</style>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { useRouter } from 'vue-router'
import { useDebounce } from '@/composables'
import {
  FcSection, FcFilterBar, FcInput, FcSelect, FcTable, FcTag, FcStatusBadge, FcButton, FcConfirm,
  FcPagination, FcEmpty, FcSkeleton, toast
} from '@/components'
import {
  listPlugins, enablePlugin, disablePlugin, deletePlugin
} from '@/api/plugins'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const router = useRouter()
const page = ref(1); const pageSize = ref(20)
const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)
const keyword = ref('')
const debouncedKeyword = useDebounce(keyword, 300)
const type = ref<string>('')
const status = ref<string>('')
const viewMode = ref<'table' | 'grouped'>('table')

const typeOpts = computed(() => [
  { value: 'BUILTIN', label: t('plugin.typeBuiltin') },
  { value: 'JAR', label: t('plugin.typeJar') },
  { value: 'GROOVY', label: t('plugin.typeGroovy') },
  { value: 'GROUP', label: t('plugin.typeGroup') }
])
const statusOpts = computed(() => [
  { value: 'ENABLED', label: t('plugin.statusEnabled') },
  { value: 'DISABLED', label: t('plugin.statusDisabled') },
  { value: 'UNINSTALLED', label: t('plugin.statusUninstalled') }
])

function typeColor(t: string) {
  return ({ BUILTIN: 'primary', JAR: 'warning', GROOVY: 'success', GROUP: 'info' } as any)[t] ?? 'gray'
}

const pluginTypeMap: Record<string, string> = {
  BUILTIN: 'plugin.typeBuiltin', JAR: 'plugin.typeJar', GROOVY: 'plugin.typeGroovy', GROUP: 'plugin.typeGroup'
}
function pluginTypeLabel(type: string) { return t(pluginTypeMap[type] || type) }

const phaseMap: Record<string, string> = { PRE: 'plugin.phasePre', POST: 'plugin.phasePost' }
function phaseLabel(phase: string) { return t(phaseMap[phase] || phase) }

const scopeMap: Record<string, string> = { ROUTE: 'plugin.scopeRoute', GLOBAL: 'plugin.scopeGlobal' }
function scopeLabel(scope: string) { return t(scopeMap[scope] || scope) }

const groupedPlugins = computed(() => {
  const map = new Map<string, any[]>()
  for (const r of rows.value) {
    const tp = r.plugin_type || 'OTHER'
    if (!map.has(tp)) map.set(tp, [])
    map.get(tp)!.push(r)
  }
  return Array.from(map.entries()).map(([type, items]) => ({ type, items }))
})

const loadError = ref('')
let loadEpoch = 0

async function reload() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const r = await listPlugins({
      page: page.value,
      pageSize: pageSize.value,
      keyword: debouncedKeyword.value || undefined,
      pluginType: type.value || undefined,
      status: status.value || undefined
    }) as any
    if (myEpoch !== loadEpoch) return
    rows.value = r.records || []
    total.value = r.total || 0
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('common.loadFailed')
    rows.value = []
    total.value = 0
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}
watch([type, status, debouncedKeyword], () => { page.value = 1; reload() })
watch([page, pageSize], reload)
reload()

const actionError = ref('')

async function enable(r: any) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  try {
    await enablePlugin(r.instance_id || r.id)
    toast.success(t('plugin.enableSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}
async function disable(r: any) {
  if (!canEdit('plugin')) return
  if (!await confirm({ title: t('common.confirmDisablePlugin'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await disablePlugin(r.instance_id || r.id)
    toast.success(t('plugin.disableSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}
async function del(r: any) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  try {
    await deletePlugin(r.instance_id || r.id)
    toast.success(t('plugin.deleteSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}

async function onEdit(r: any) {
  if (!canEdit('plugin')) return
  await router.push(`/plugins/${r.id}/edit`)
}
</script>
