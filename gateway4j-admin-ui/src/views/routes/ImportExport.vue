<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-export>
          <el-form label-width="100px">
            <el-form-item :label="t('importExport.status')">
              <FcSelect v-model="status" :options="statusOpts" clearable :placeholder="t('common.search')" />
            </el-form-item>
            <el-form-item :label="t('route.name')">
              <FcInput v-model="routeKeyword" :placeholder="t('importExport.routeKeywordPlaceholder')" clearable style="margin-bottom: 8px" />
              <FcSkeleton v-if="routesLoading" variant="text" :rows="4" />
              <FcTable v-else :data="filteredRoutes" max-height="240" stripe @selection-change="onRouteSelect">
                <el-table-column type="selection" width="40" />
                <el-table-column prop="route_name" :label="t('route.name')" />
                <el-table-column :label="t('route.type')" width="100">
                  <template #default="{ row }">{{ row.route_type === 'DISPATCH' ? t('route.typeDispatch') : t('route.typeBackend') }}</template>
                </el-table-column>
              </FcTable>
            </el-form-item>
            <el-form-item>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="exporting" @click="onExport">{{ t('importExport.downloadPackage') }}</FcButton>
            </el-form-item>
          </el-form>
        </template>

        <template #tab-import>
          <el-form label-width="100px">
            <el-form-item :label="t('importExport.routePackage')">
              <el-input v-model="jsonText" type="textarea" :rows="12" maxlength="100000" placeholder='{"version":"1.0","routes":[…]}' />
            </el-form-item>
            <el-form-item :label="t('importExport.strategy')">
              <FcSegmented v-model="strategy" :options="strategies" />
            </el-form-item>
            <el-form-item>
              <FcButton v-if="canEdit('route')" variant="secondary" :loading="validating" @click="onValidate">{{ t('importExport.preCheck') }}</FcButton>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="importing" @click="onImport" style="margin-left: 8px">{{ t('importExport.doImport') }}</FcButton>
            </el-form-item>
          </el-form>

          <FcEmpty v-if="!report" :title="t('importExport.preCheckHint')" />
          <div v-else class="report">
            <p>{{ report.is_valid ? t('importExport.reportValid') : t('importExport.reportInvalid') }}</p>
            <p v-if="report.reason" class="report-reason" data-testid="report-reason">{{ report.reason }}</p>
            <p v-if="report.conflicts?.length">{{ t('importExport.reportConflicts') }}：{{ report.conflicts.join(', ') }}</p>
            <p v-if="report.missing_plugins?.length">{{ t('importExport.reportMissingPlugins') }}：{{ report.missing_plugins.join(', ') }}</p>
            <p v-if="report.missing_targets?.length">{{ t('importExport.reportMissingTargets') }}：{{ report.missing_targets.join(', ') }}</p>
            <p v-if="report.cycle_warnings?.length">{{ t('importExport.reportCycleWarnings') }}：{{ report.cycle_warnings.join('; ') }}</p>

            <div v-if="importDiffRows.length" class="diff-table" data-testid="import-diff-table">
              <FcTable :data="importDiffRows as any" stripe>
                <el-table-column prop="name" :label="t('importExport.diffColName')" />
                <el-table-column prop="action" :label="t('importExport.diffColAction')" width="120">
                  <template #default="{ row }">
                    <FcTag :color="(row as any).tone" size="sm">{{ (row as any).action }}</FcTag>
                  </template>
                </el-table-column>
                <el-table-column prop="detail" :label="t('importExport.diffColDetail')" />
              </FcTable>
            </div>
          </div>

          <FcTable v-if="result" :data="result.errors || []" stripe>
            <el-table-column prop="route_name" :label="t('route.name')" />
            <el-table-column prop="message" :label="t('importExport.error')" />
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
  FcButton, FcEmpty, FcTable, FcSkeleton, FcTag
} from '@/components'
import { exportRoutes, validateImport, importRoutes, listRoutes, createImportSnapshot } from '@/api/routes'
import { usePermission } from '@/composables/usePermission'
import type { RouteNode } from '@/api/routes'

const { t } = useI18n()
const { canEdit } = usePermission()

const tab = ref('import')
const tabs = computed(() => [
  { value: 'export', label: t('importExport.tabExport') },
  { value: 'import', label: t('importExport.tabImport') }
])
const status = ref<string>('')
const statusOpts = computed(() => [
  { value: 'DRAFT', label: t('route.statusDraft') },
  { value: 'PUBLISHED', label: t('route.statusPublished') },
  { value: 'OFFLINE', label: t('route.statusOffline') }
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
  { value: 'SKIP', label: t('importExport.skip') },
  { value: 'OVERWRITE', label: t('importExport.overwrite') },
  { value: 'ERROR', label: t('importExport.error') }
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
    ElMessage.success(t('importExport.exportSuccess'))
  } catch (e: any) {
    actionError.value = e?.message || t('common.exportFailed')
  } finally {
    exporting.value = false
  }
}

// ===== 预检 Diff 视图：把 validateImport 返回的四类问题 + 包内路由聚合成表格行 =====
interface ImportDiffRow {
  name: string
  action: string
  detail: string
  tone: 'success' | 'warning' | 'danger' | 'gray'
}

/** 从 jsonText 提取包内全部路由名（含 children 递归），解析失败返回 [] */
function packageRouteNames(): string[] {
  try {
    const parsed = JSON.parse(jsonText.value)
    const out: string[] = []
    function walk(list: any[]) {
      for (const r of list || []) {
        if (r?.route_name) out.push(r.route_name)
        if (Array.isArray(r?.children)) walk(r.children)
      }
    }
    walk(parsed?.routes)
    return out
  } catch {
    return []
  }
}

function conflictAction(): string {
  if (strategy.value === 'OVERWRITE') return t('importExport.overwrite')
  if (strategy.value === 'SKIP') return t('importExport.skip')
  return t('importExport.actionConflict')
}

const importDiffRows = computed<ImportDiffRow[]>(() => {
  if (!report.value) return []
  const rows: ImportDiffRow[] = []
  const conflicts: string[] = report.value.conflicts || []
  const conflictSet = new Set(conflicts)
  for (const name of packageRouteNames()) {
    if (conflictSet.has(name)) {
      rows.push({ name, action: conflictAction(), detail: t('importExport.diffConflictDetail'), tone: strategy.value === 'SKIP' ? 'gray' : 'warning' })
    } else {
      rows.push({ name, action: t('importExport.actionCreate'), detail: t('importExport.diffCreateDetail'), tone: 'success' })
    }
  }
  // 冲突名单里可能出现包内未匹配到的名字（后端归一化差异），补齐避免遗漏
  for (const c of conflicts) {
    if (!rows.some(r => r.name === c)) {
      rows.push({ name: c, action: conflictAction(), detail: t('importExport.diffConflictDetail'), tone: strategy.value === 'SKIP' ? 'gray' : 'warning' })
    }
  }
  for (const p of report.value.missing_plugins || []) {
    rows.push({ name: p, action: t('importExport.missingPlugins'), detail: t('importExport.diffMissingPluginDetail'), tone: 'danger' })
  }
  for (const m of report.value.missing_targets || []) {
    rows.push({ name: m, action: t('importExport.missingTargets'), detail: t('importExport.diffMissingTargetDetail'), tone: 'danger' })
  }
  for (const w of report.value.cycle_warnings || []) {
    rows.push({ name: '—', action: t('importExport.cycleWarnings'), detail: w, tone: 'warning' })
  }
  return rows
})

async function onValidate() {
  if (!canEdit('route')) return
  if (!jsonText.value) return
  if (validating.value) return
  validating.value = true
  try {
    // D14: precheck failures must carry a human-readable reason. Local problems
    // (JSON syntax / structure) are reported without calling the backend.
    let parsed: any
    try {
      parsed = JSON.parse(jsonText.value)
    } catch (pe: any) {
      report.value = { is_valid: false, reason: `JSON 解析失败：${pe?.message || t('importExport.jsonParseError')}` }
      return
    }
    if (!parsed || !Array.isArray(parsed.routes)) {
      report.value = { is_valid: false, reason: '路由包结构无效：缺少 routes 数组' }
      return
    }
    report.value = await validateImport(parsed)
  } catch (e: any) {
    report.value = { is_valid: false, reason: e?.message || t('importExport.validationFailed') }
  } finally {
    validating.value = false
  }
}

/**
 * 导入前自动快照（能力探测）：
 * - 接口存在且成功 → 返回 snapshot_id（该调用本身即创建了快照）
 * - 404（后端未实现快照能力）→ 静默跳过，不报错
 * - 其他错误 → 同样静默跳过，不能因快照失败阻塞导入
 */
async function tryAutoSnapshot(): Promise<string | null> {
  try {
    const res = await createImportSnapshot() as any
    return res?.snapshot_id != null ? String(res.snapshot_id) : null
  } catch {
    return null
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
      actionError.value = t('importExport.jsonParseError')
      return
    }
    const snapshotId = await tryAutoSnapshot()
    result.value = await importRoutes(parsed, strategy.value)
    ElMessage.success(t('importExport.importSuccess'))
    if (snapshotId) {
      ElMessage.success(t('importExport.snapshotCreated', { id: snapshotId }))
    }
  } catch (e: any) {
    actionError.value = e?.message || t('common.importFailed')
    result.value = null
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.report { margin-top: 12px; padding: 12px; background: var(--app-bg-muted); border-radius: 6px; font-size: 13px; }
.report p { margin: 4px 0; }
.report .report-reason { color: var(--app-danger); word-break: break-word; }
.report .diff-table { margin-top: 10px; }
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
