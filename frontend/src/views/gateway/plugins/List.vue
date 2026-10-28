<template>
  <div class="app-page">
    <FcSection>
      <FcFilterBar>
        <FcInput v-model="keyword" :placeholder="t('gateway.plugin.searchPlaceholder')" clearable @enter="reload" />
        <FcSelect
          v-model="type"
          :options="typeOpts"
          :placeholder="t('gateway.plugin.typePlaceholder')"
          clearable
          style="width: 140px"
        />
        <FcSelect
          v-model="status"
          :options="statusOpts"
          :placeholder="t('gateway.plugin.statusPlaceholder')"
          clearable
          style="width: 120px"
        />
        <FcButton
          variant="text"
          size="sm"
          data-testid="view-toggle"
          @click="viewMode = viewMode === 'table' ? 'grouped' : 'table'"
        >
          {{ viewMode === 'table' ? t('gateway.plugin.groupedView') : t('gateway.plugin.tableView') }}
        </FcButton>
      </FcFilterBar>

      <FcSkeleton v-if="loading" variant="text" :rows="6" />
      <template v-else>
      <div v-if="viewMode === 'table'" data-testid="table-view">
        <FcTable :data="rows" stripe>
          <el-table-column prop="plugin_name" :label="t('gateway.plugin.name')" />
          <el-table-column prop="plugin_id" :label="t('gateway.plugin.id')" />
          <el-table-column :label="t('gateway.plugin.type')">
            <template #default="{ row }">
              <FcTag :color="typeColor(row.plugin_type)" size="sm">{{ pluginTypeLabel(row.plugin_type) }}</FcTag>
            </template>
          </el-table-column>
          <el-table-column :label="t('gateway.plugin.phase')" width="80">
            <template #default="{ row }">{{ phaseLabel(row.plugin_phase) }}</template>
          </el-table-column>
          <el-table-column :label="t('gateway.plugin.scope')" width="100">
            <template #default="{ row }">{{ scopeLabel(row.scope) }}</template>
          </el-table-column>
          <el-table-column :label="t('gateway.plugin.status')" width="100">
            <template #default="{ row }">
              <FcStatusBadge
                :tone="row.status === 'ENABLED' ? 'success' : row.status === 'UNINSTALLED' ? 'warning' : 'neutral'"
                :label="row.status === 'ENABLED' ? t('gateway.plugin.statusEnabled') : row.status === 'UNINSTALLED' ? t('gateway.plugin.statusUninstalled') : t('gateway.plugin.statusDisabled')"
                :dot="row.status === 'ENABLED'"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('gateway.common.more')" width="280" fixed="right">
            <template #default="{ row }">
              <FcButton v-if="canEdit('plugin')" variant="text" size="sm" @click="onEdit(row)">{{ t('gateway.common.edit') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && row.status === 'DISABLED'" variant="text" size="sm" @click="enable(row)">{{ t('gateway.common.enable') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && row.status === 'ENABLED'" variant="text" size="sm" @click="disable(row)">{{ t('gateway.common.disable') }}</FcButton>
              <FcConfirm v-if="canEdit('plugin') && row.status !== 'ENABLED'" :content="t('gateway.plugin.confirmDelete')" @confirm="del(row)">
                <FcButton variant="text" size="sm" type="danger">{{ t('gateway.common.delete') }}</FcButton>
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
                :tone="item.status === 'ENABLED' ? 'success' : item.status === 'UNINSTALLED' ? 'warning' : 'neutral'"
                :label="item.status === 'ENABLED' ? t('gateway.plugin.statusEnabled') : item.status === 'UNINSTALLED' ? t('gateway.plugin.statusUninstalled') : t('gateway.plugin.statusDisabled')"
              />
              <div class="card-actions">
                <FcButton v-if="canEdit('plugin')" variant="text" size="sm" @click="onEdit(item)">{{ t('gateway.common.edit') }}</FcButton>
                      <FcButton v-if="canEdit('plugin') && item.status === 'DISABLED'" variant="text" size="sm" @click="enable(item)">{{ t('gateway.common.enable') }}</FcButton>
                <FcButton v-if="canEdit('plugin') && item.status === 'ENABLED'" variant="text" size="sm" @click="disable(item)">{{ t('gateway.common.disable') }}</FcButton>
              </div>
            </div>
          </div>
        </div>
        <FcEmpty v-if="!groupedPlugins.length" :title="t('gateway.common.empty')" />
      </div>
      </template>
    </FcSection>

    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
  </div>
</template>

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
.grouped-view { display: flex; flex-direction: column; gap: 16px; }
.plugin-group { border: 1px solid var(--app-border); border-radius: 8px; overflow: hidden; }
.group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: var(--app-bg-secondary, #f5f7fa);
  font-size: 14px; font-weight: 600;
}
.group-count { font-size: 12px; color: var(--app-text-secondary); font-weight: 400; }
.group-items { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; }
.plugin-card {
  width: 200px; padding: 12px; border: 1px solid var(--app-border);
  border-radius: 6px; display: flex; flex-direction: column; gap: 6px;
}
.card-name { font-size: 14px; font-weight: 500; }
.card-id { font-size: 12px; color: var(--app-text-secondary); }
.card-actions { display: flex; gap: 4px; margin-top: 4px; }
</style>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { useRouter } from 'vue-router'
import { useDebounce } from '@/composables/useDebounce'
import {
  FcSection, FcFilterBar, FcInput, FcSelect, FcTable, FcTag,
  FcStatusBadge, FcButton, FcConfirm, FcPagination, FcEmpty, FcSkeleton
} from '@/components/sdk'
import {
  listPlugins, enablePlugin, disablePlugin, deletePlugin
} from '@/api/gateway/plugins'

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
  { value: 'BUILTIN', label: t('gateway.plugin.typeBuiltin') },
  { value: 'JAR', label: t('gateway.plugin.typeJar') },
  { value: 'GROOVY', label: t('gateway.plugin.typeGroovy') },
  { value: 'GROUP', label: t('gateway.plugin.typeGroup') }
])
const statusOpts = computed(() => [
  { value: 'ENABLED', label: t('gateway.plugin.statusEnabled') },
  { value: 'DISABLED', label: t('gateway.plugin.statusDisabled') },
  { value: 'UNINSTALLED', label: t('gateway.plugin.statusUninstalled') }
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
    loadError.value = e?.message || t('gateway.common.loadFailed')
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
    ElMessage.success(t('gateway.plugin.enableSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}
async function disable(r: any) {
  if (!canEdit('plugin')) return
  if (!await confirm({ title: t('gateway.common.confirmDisablePlugin'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await disablePlugin(r.instance_id || r.id)
    ElMessage.success(t('gateway.plugin.disableSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}
async function del(r: any) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  try {
    await deletePlugin(r.instance_id || r.id)
    ElMessage.success(t('gateway.plugin.deleteSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}

async function onEdit(r: any) {
  if (!canEdit('plugin')) return
  await router.push(`/plugins/${r.id}/edit`)
}
</script>
