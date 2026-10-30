<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-export>
          <el-form label-width="100px">
            <!-- H7b：按环境导出（默认顶栏当前环境；环境功能降级时隐藏） -->
            <FcFormItem v-if="envReady" :label="t('env.switcherLabel')">
              <FcSelect
                v-model="exportEnv"
                :options="env.options"
                style="max-width: 280px"
                data-testid="export-env-select"
              />
            </FcFormItem>
            <FcFormItem :label="t('importExport.status')">
              <FcSelect v-model="status" :options="statusOpts" clearable :placeholder="t('common.search')" />
            </FcFormItem>
            <FcFormItem :label="t('route.name')">
              <FcInput v-model="routeKeyword" :placeholder="t('importExport.routeKeywordPlaceholder')" clearable style="margin-bottom: 8px" />
              <FcSkeleton v-if="routesLoading" variant="text" :rows="4" />
              <FcTable v-else :data="filteredRoutes" max-height="240" stripe @selection-change="onRouteSelect">
                <el-table-column type="selection" width="40" />
                <el-table-column prop="route_name" :label="t('route.name')" />
                <el-table-column :label="t('route.type')" width="100">
                  <template #default="{ row }">{{ row.route_type === 'DISPATCH' ? t('route.typeDispatch') : t('route.typeBackend') }}</template>
                </el-table-column>
              </FcTable>
            </FcFormItem>
            <FcFormItem>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="exporting" @click="onExport">{{ t('importExport.downloadPackage') }}</FcButton>
            </FcFormItem>
          </el-form>
        </template>

        <template #tab-import>
          <el-form label-width="100px">
            <FcFormItem :label="t('importExport.routePackage')">
              <FcInput v-model="jsonText" type="textarea" :rows="12" maxlength="100000" placeholder='{"version":"1.0","routes":[…]}' />
            </FcFormItem>
            <FcFormItem :label="t('importExport.strategy')">
              <FcSegmented v-model="strategy" :options="strategies" />
            </FcFormItem>
            <!-- H7b T1：导入目标环境（默认顶栏当前环境；环境功能降级时不渲染、不携带） -->
            <FcFormItem v-if="envReady" :label="t('importExport.targetEnv')">
              <FcSelect
                v-model="targetEnv"
                :options="env.options"
                style="max-width: 280px"
                data-testid="import-target-env"
              />
            </FcFormItem>
            <FcFormItem>
              <FcButton v-if="canEdit('route')" variant="secondary" :loading="validating" @click="onValidate">{{ t('importExport.preCheck') }}</FcButton>
              <FcButton v-if="canEdit('route')" variant="primary" :loading="importing" @click="onImport" style="margin-left: 8px">{{ t('importExport.doImport') }}</FcButton>
            </FcFormItem>
          </el-form>

          <FcEmpty v-if="!report" :title="t('importExport.preCheckHint')" />
          <div v-else class="report">
            <p>{{ report.is_valid ? t('importExport.reportValid') : t('importExport.reportInvalid') }}</p>
            <p v-if="report.reason" class="report-reason" data-testid="report-reason">{{ report.reason }}</p>
            <!-- H7b：预检/结果带 environment 与 package_environment（旧包 = default） -->
            <p v-if="report.environment" data-testid="report-environment">{{ t('importExport.reportEnvironment') }}：{{ report.environment }}</p>
            <p v-if="report.package_environment" data-testid="report-package-environment">{{ t('importExport.reportPackageEnvironment') }}：{{ report.package_environment }}</p>
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

        <!-- H7b T3：环境对比面板 -->
        <template #tab-diff>
          <div class="env-diff" data-testid="env-diff-panel">
            <!-- 环境功能降级（/v1/environments 404）→ 直接空态 + 服务不可用，不渲染选择器 -->
            <FcEmpty
              v-if="!envReady"
              :title="t('importExport.diffUnavailable')"
              data-testid="env-diff-unavailable"
            />
            <template v-else>
              <div class="env-diff__pickers">
                <FcSelect
                  v-model="diffFrom"
                  :options="env.options"
                  :placeholder="t('importExport.diffFrom')"
                  :disabled="diffLoading"
                  style="max-width: 200px"
                  data-testid="env-diff-from"
                />
                <span class="env-diff__arrow">→</span>
                <FcSelect
                  v-model="diffTo"
                  :options="env.options"
                  :placeholder="t('importExport.diffTo')"
                  :disabled="diffLoading"
                  style="max-width: 200px"
                  data-testid="env-diff-to"
                />
                <FcButton
                  variant="primary"
                  :loading="diffLoading"
                  :disabled="!diffInputsOk"
                  data-testid="env-diff-run"
                  @click="runEnvDiff"
                >{{ t('importExport.diffRun') }}</FcButton>
              </div>

              <!-- 对比请求 404 / 失败 → 空态 + 服务不可用 -->
              <FcEmpty
                v-if="diffState === 'unavailable'"
                :title="t('importExport.diffUnavailable')"
                data-testid="env-diff-unavailable"
              />
              <template v-else-if="diffState === 'ok' && diffResult">
                <div class="env-diff__section" data-testid="env-diff-only-from">
                  <div class="env-diff__title">
                    {{ t('importExport.diffOnlyInFrom', { env: diffResult.from }) }}（{{ diffOnlyFromLabels.length }}）
                  </div>
                  <p v-if="diffOnlyFromLabels.length === 0" class="env-diff__none">{{ t('common.empty') }}</p>
                  <ul v-else class="env-diff__list">
                    <li v-for="n in diffOnlyFromLabels" :key="n">{{ n }}</li>
                  </ul>
                </div>

                <div class="env-diff__section" data-testid="env-diff-only-to">
                  <div class="env-diff__title">
                    {{ t('importExport.diffOnlyInTo', { env: diffResult.to }) }}（{{ diffOnlyToLabels.length }}）
                  </div>
                  <p v-if="diffOnlyToLabels.length === 0" class="env-diff__none">{{ t('common.empty') }}</p>
                  <ul v-else class="env-diff__list">
                    <li v-for="n in diffOnlyToLabels" :key="n">{{ n }}</li>
                  </ul>
                </div>

                <div class="env-diff__section" data-testid="env-diff-changed">
                  <div class="env-diff__title">{{ t('importExport.diffChanged') }}（{{ diffResult.changed.length }}）</div>
                  <p v-if="diffResult.changed.length === 0" class="env-diff__none" data-testid="env-diff-no-changes">
                    {{ t('importExport.diffNoChanges') }}
                  </p>
                  <!-- 逐路由折叠面板：字段级 from→to 表格 -->
                  <el-collapse v-else class="env-diff__collapse">
                    <el-collapse-item
                      v-for="c in diffResult.changed"
                      :key="c.route_name"
                      :name="c.route_name"
                      :title="`${c.route_name}（${Object.keys(c.fields || {}).length}）`"
                    >
                      <FcTable :data="diffFieldRows(c) as any" stripe>
                        <el-table-column prop="field" :label="t('importExport.diffColField')" width="180" />
                        <el-table-column prop="from" :label="t('importExport.diffColFrom')" />
                        <el-table-column prop="to" :label="t('importExport.diffColTo')" />
                      </FcTable>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </template>
            </template>
          </div>
        </template>
      </FcTabsPanel>
    </FcSection>

    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  FcSection, FcTabsPanel, FcFormItem, FcInput, FcSelect, FcSegmented,
  FcButton, FcEmpty, FcTable, FcSkeleton, FcTag
} from '@/components'
import { exportRoutes, validateImport, importRoutes, listRoutes, createImportSnapshot } from '@/api/routes'
import { getEnvironmentDiff } from '@/api/environment'
import type { EnvDiffResult, EnvDiffChangedRoute } from '@/api/environment'
import { usePermission } from '@/composables/usePermission'
import { useEnvironments } from '@/store/environment'
import { envDiffRouteLabel } from '@/utils/environment'
import type { RouteNode } from '@/api/routes'

const { t } = useI18n()
const { canEdit } = usePermission()
// H7b：环境维度（顶栏共享；404 降级 → envReady=false，环境相关控件整体隐藏）
const env = useEnvironments()
const envReady = computed(() => env.available)

const tab = ref('import')
const tabs = computed(() => [
  { value: 'export', label: t('importExport.tabExport') },
  { value: 'import', label: t('importExport.tabImport') },
  { value: 'diff', label: t('importExport.tabEnvDiff') }
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
// H7b：导出/导入的环境选择（默认顶栏当前环境；降级时不携带）
const exportEnv = ref('default')
const targetEnv = ref('default')

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

// H7b T1：探测环境列表（404 → 降级：环境控件整体隐藏），并初始化环境默认选中
onMounted(async () => {
  await env.ensureLoaded()
  if (env.available) {
    exportEnv.value = env.current
    targetEnv.value = env.current
    // 环境对比默认选头两个不同环境（default 恒在首）
    diffFrom.value = 'default'
    diffTo.value = env.environments.find(e => e !== diffFrom.value) || ''
  }
})

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
    // H7b：环境功能可用时按当前选中环境导出（降级时与旧口径完全一致，不携带第三参）
    const pkg: any = await exportRoutes(
      selectedRouteIds.value.length > 0 ? selectedRouteIds.value : undefined,
      status.value || undefined,
      ...(envReady.value ? [exportEnv.value] as const : [])
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
    // H7b：环境功能可用时携带 target_environment（缺省 default；降级时不携带，保持旧 body 形状）
    result.value = await importRoutes(
      parsed,
      strategy.value,
      ...(envReady.value ? [targetEnv.value] as const : [])
    )
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

// ===== H7b T3：环境对比 =====
const diffFrom = ref('default')
const diffTo = ref('')
const diffLoading = ref(false)
const diffResult = ref<EnvDiffResult | null>(null)
/** idle=未对比 ok=有结果 unavailable=接口 404/失败（空态） */
const diffState = ref<'idle' | 'ok' | 'unavailable'>('idle')

const diffInputsOk = computed(() =>
  !!diffFrom.value && !!diffTo.value && diffFrom.value !== diffTo.value)

async function runEnvDiff() {
  // 只读对比：页面本身已由路由权限把关，这里不做写权限校验
  if (!diffInputsOk.value || diffLoading.value) return
  diffLoading.value = true
  try {
    diffResult.value = await getEnvironmentDiff(diffFrom.value, diffTo.value)
    diffState.value = 'ok'
  } catch {
    // 404 / 失败 → 空态 + 「环境对比服务不可用」
    diffResult.value = null
    diffState.value = 'unavailable'
  } finally {
    diffLoading.value = false
  }
}

const diffOnlyFromLabels = computed(() => (diffResult.value?.only_in_from || []).map(envDiffRouteLabel))
const diffOnlyToLabels = computed(() => (diffResult.value?.only_in_to || []).map(envDiffRouteLabel))

/** 字段级 from→to 表格行 */
function diffFieldRows(c: EnvDiffChangedRoute) {
  return Object.entries(c.fields || {}).map(([field, ch]) => ({
    field,
    from: formatDiffValue(ch?.from),
    to: formatDiffValue(ch?.to)
  }))
}

function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('from' in o || 'to' in o) return `${formatDiffValue(o.from)} → ${formatDiffValue(o.to)}`
    return JSON.stringify(v)
  }
  return String(v)
}
</script>

<style scoped>
.report { margin-top: 12px; padding: 12px; background: var(--app-bg-muted); border-radius: 6px; font-size: 13px; }
.report p { margin: 4px 0; }
.report .report-reason { color: var(--app-danger); word-break: break-word; }
.report .diff-table { margin-top: 10px; }
/* H7b T3：环境对比面板 */
.env-diff__pickers { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.env-diff__arrow { color: var(--app-text-secondary); }
.env-diff__section { margin-bottom: 16px; padding: 12px; background: var(--app-bg-muted); border-radius: 6px; }
.env-diff__title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary); }
.env-diff__none { margin: 0; font-size: 13px; color: var(--app-text-secondary); }
.env-diff__list { margin: 0; padding-left: 18px; font-size: 13px; }
.env-diff__list li { margin: 2px 0; }
.env-diff__collapse { width: 100%; }
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
