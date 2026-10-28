<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-export>
          <el-form label-width="100px">
            <el-form-item :label="t('gateway.importExport.status')">
              <FcSelect v-model="status" :options="statusOpts" clearable :placeholder="t('gateway.common.search')" />
            </el-form-item>
            <el-form-item :label="t('gateway.route.name')">
              <FcInput v-model="routeKeyword" :placeholder="t('gateway.importExport.routeKeywordPlaceholder')" clearable style="margin-bottom: 8px" />
              <FcSkeleton v-if="routesLoading" variant="text" :rows="4" />
              <FcTable v-else :data="filteredRoutes" max-height="240" stripe @selection-change="onRouteSelect">
                <el-table-column type="selection" width="40" />
                <el-table-column prop="route_name" :label="t('gateway.route.name')" />
                <el-table-column :label="t('gateway.route.type')" width="100">
                  <template #default="{ row }">{{ row.route_type === 'DISPATCH' ? t('gateway.route.typeDispatch') : t('gateway.route.typeBackend') }}</template>
                </el-table-column>
              </FcTable>
            </el-form-item>
            <el-form-item>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="exporting" @click="onExport">{{ t('gateway.importExport.downloadPackage') }}</FcButton>
            </el-form-item>
          </el-form>
        </template>

        <template #tab-import>
          <el-form label-width="100px">
            <el-form-item :label="t('gateway.importExport.routePackage')">
              <el-input v-model="jsonText" type="textarea" :rows="12" maxlength="100000" placeholder='{"version":"1.0","routes":[…]}' />
            </el-form-item>
            <el-form-item :label="t('gateway.importExport.strategy')">
              <FcSegmented v-model="strategy" :options="strategies" />
            </el-form-item>
            <el-form-item>
              <FcButton v-if="canEdit('route')" variant="secondary" :loading="validating" @click="onValidate">{{ t('gateway.importExport.preCheck') }}</FcButton>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="importing" @click="onImport" style="margin-left: 8px">{{ t('gateway.importExport.doImport') }}</FcButton>
            </el-form-item>
          </el-form>

          <FcEmpty v-if="!report" :title="t('gateway.importExport.preCheckHint')" />
          <div v-else class="report">
            <p>{{ report.is_valid ? t('gateway.importExport.reportValid') : t('gateway.importExport.reportInvalid') }}</p>
            <p v-if="report.conflicts?.length">{{ t('gateway.importExport.reportConflicts') }}：{{ report.conflicts.join(', ') }}</p>
            <p v-if="report.missing_plugins?.length">{{ t('gateway.importExport.reportMissingPlugins') }}：{{ report.missing_plugins.join(', ') }}</p>
            <p v-if="report.missing_targets?.length">{{ t('gateway.importExport.reportMissingTargets') }}：{{ report.missing_targets.join(', ') }}</p>
            <p v-if="report.cycle_warnings?.length">{{ t('gateway.importExport.reportCycleWarnings') }}：{{ report.cycle_warnings.join('; ') }}</p>
          </div>

          <FcTable v-if="result" :data="result.errors || []" stripe>
            <el-table-column prop="route_name" :label="t('gateway.route.name')" />
            <el-table-column prop="message" :label="t('gateway.importExport.error')" />
          </FcTable>
        </template>
      </FcTabsPanel>
    </FcSection>

    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  FcSection, FcTabsPanel, FcInput, FcSelect, FcSegmented,
  FcButton, FcEmpty, FcTable, FcSkeleton
} from '@/components/sdk'
import { exportRoutes, validateImport, importRoutes, listRoutes } from '@/api/gateway/routes'
import { usePermission } from '@/composables/usePermission'
import type { RouteNode } from '@/api/gateway/routes'

const { t } = useI18n()
const { canEdit } = usePermission()

const tab = ref('import')
const tabs = computed(() => [
  { value: 'export', label: t('gateway.importExport.tabExport') },
  { value: 'import', label: t('gateway.importExport.tabImport') }
])
const status = ref<string>('')
const statusOpts = computed(() => [
  { value: 'DRAFT', label: t('gateway.route.statusDraft') },
  { value: 'PUBLISHED', label: t('gateway.route.statusPublished') },
  { value: 'OFFLINE', label: t('gateway.route.statusOffline') }
])
const exporting = ref(false)
const routesLoading = ref(true)
const jsonText = ref('')
const allRoutes = ref<RouteNode[]>([])
const selectedRouteIds = ref<string[]>([])
const routeKeyword = ref('')

const filteredRoutes = computed(() => {
  if (!routeKeyword.value) return allRoutes.value
  const kw = routeKeyword.value.toLowerCase()
  return allRoutes.value.filter(r => r.route_name?.toLowerCase().includes(kw))
})

function flattenRoutes(nodes: RouteNode[]): RouteNode[] {
  return nodes.flatMap(n => [n, ...flattenRoutes(n.children || [])])
}

let loadEpoch = 0

async function loadRoutes() {
  const myEpoch = ++loadEpoch
  routesLoading.value = true
  try {
    const tree = await listRoutes()
    if (myEpoch !== loadEpoch) return
    allRoutes.value = flattenRoutes(tree)
  } catch {
    if (myEpoch !== loadEpoch) return
    allRoutes.value = []
  } finally {
    if (myEpoch === loadEpoch) routesLoading.value = false
  }
}
loadRoutes()

function onRouteSelect(rows: RouteNode[]) {
  selectedRouteIds.value = rows.map(r => r.id)
}
const strategies = computed(() => [
  { value: 'SKIP', label: t('gateway.importExport.skip') },
  { value: 'OVERWRITE', label: t('gateway.importExport.overwrite') },
  { value: 'ERROR', label: t('gateway.importExport.error') }
])
const strategy = ref<'SKIP' | 'OVERWRITE' | 'ERROR'>('SKIP')
const validating = ref(false)
const importing = ref(false)
const report = ref<any>(null)
const result = ref<any>(null)
const actionError = ref('')

async function onExport() {
  if (!canEdit('route')) return
  if (exporting.value) return
  exporting.value = true
  actionError.value = ''
  try {
    const pkg: any = await exportRoutes(
      selectedRouteIds.value.length > 0 ? selectedRouteIds.value : undefined,
      status.value || undefined
    )
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `routes-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('gateway.importExport.exportSuccess'))
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.exportFailed')
  } finally {
    exporting.value = false
  }
}

async function onValidate() {
  if (!canEdit('route')) return
  if (!jsonText.value) return
  if (validating.value) return
  validating.value = true
  try {
    let parsed: any
    try {
      parsed = JSON.parse(jsonText.value)
    } catch {
      report.value = { is_valid: false, errors: [{ message: t('gateway.importExport.jsonParseError') }] }
      return
    }
    report.value = await validateImport(parsed)
  } catch (e: any) {
    report.value = { is_valid: false, errors: [{ message: e?.message || t('gateway.importExport.validationFailed') }] }
  } finally {
    validating.value = false
  }
}

async function onImport() {
  if (!canEdit('route')) return
  if (!jsonText.value) return
  if (importing.value) return
  importing.value = true
  actionError.value = ''
  try {
    let parsed: any
    try {
      parsed = JSON.parse(jsonText.value)
    } catch {
      actionError.value = t('gateway.importExport.jsonParseError')
      return
    }
    result.value = await importRoutes(parsed, strategy.value)
    ElMessage.success(t('gateway.importExport.importSuccess'))
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.importFailed')
    result.value = null
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.report { margin-top: 12px; padding: 12px; background: var(--app-bg-muted); border-radius: 6px; font-size: 13px; }
.report p { margin: 4px 0; }
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
