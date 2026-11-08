<template>
  <div class="imp-page" data-testid="imp-page">
    <!-- Read-only downgrade banner: shown when route:edit is absent (v2 ruling 4) -->
    <div v-if="!canEdit" class="imp-hint" data-testid="imp-readonly-hint">
      <i class="ri-lock-2-line" aria-hidden="true"></i>
      <span>{{ t('v2.importExport.readonlyHint') }}</span>
    </div>
    <!-- Load error bar: page-root level, visible on every tab; reload success clears it (v2 ruling 3) -->
    <div v-if="loadError" class="imp-hint is-danger" role="alert" data-testid="imp-load-error">
      <i class="ri-error-warning-line" aria-hidden="true"></i>
      <span>{{ loadError }}</span>
    </div>
    <!-- Action error bar: page-root level; every action clears it before running (v2 ruling 3) -->
    <div v-if="actionError" class="imp-hint is-danger" role="alert" data-testid="imp-action-error">
      <i class="ri-error-warning-line" aria-hidden="true"></i>
      <span>{{ actionError }}</span>
    </div>

    <FcTabsPanel v-model="tab" :tabs="tabs" data-testid="imp-tabs">
      <!-- ══ Export tab ═══════════════════════════════════════════════ -->
      <template #tab-export>
        <section class="imp-panel" data-testid="imp-export-panel">
          <div class="imp-filters">
            <label v-if="envReady" class="imp-field">
              <span class="imp-field-label">{{ t('v2.importExport.envLabel') }}</span>
              <FcSelect
                v-model="exportEnv"
                :options="envOptions"
                class="imp-select"
                data-testid="imp-env-select"
              />
            </label>
            <label class="imp-field">
              <span class="imp-field-label">{{ t('v2.importExport.status') }}</span>
              <FcSelect
                v-model="status"
                :options="statusOpts"
                clearable
                class="imp-select"
                data-testid="imp-f-status"
              />
            </label>
            <label class="imp-field imp-field--grow">
              <span class="imp-field-label">{{ t('v2.importExport.routeName') }}</span>
              <FcInput
                v-model="routeKeyword"
                :placeholder="t('v2.importExport.keywordPlaceholder')"
                clearable
                data-testid="imp-f-keyword"
              />
            </label>
          </div>
          <!-- Loading skeleton: table / empty all absent while pending (v2 ruling 3) -->
          <div v-if="routesLoading" class="imp-skeleton" data-testid="imp-skeleton">
            <FcSkeleton variant="text" :rows="6" />
          </div>
          <!-- Load error: skeleton/table/empty all leave; the bar itself sits at page root -->
          <template v-else-if="!loadError">
            <!-- Semantic table (v2 ruling 2): header select-all + name/type columns -->
            <table v-if="visibleRows.length > 0" class="imp-table" data-testid="imp-export-table">
            <thead>
              <tr>
                <th class="imp-col-check">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    :aria-label="t('v2.importExport.selectAll')"
                    data-testid="imp-select-all"
                    @change="onSelectAll"
                  />
                </th>
                <th>{{ t('v2.importExport.routeName') }}</th>
                <th>{{ t('v2.importExport.routeType') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.id" :data-testid="`imp-row-${row.id}`">
                <td class="imp-col-check">
                  <input
                    v-model="selectedRouteIds"
                    type="checkbox"
                    :value="row.id"
                    :aria-label="row.route_name"
                    :data-testid="`imp-row-check-${row.id}`"
                  />
                </td>
                <td :data-testid="`imp-row-name-${row.id}`">{{ row.route_name }}</td>
                <td :data-testid="`imp-row-type-${row.id}`">
                  {{ row.route_type === 'DISPATCH' ? t('v2.importExport.typeDispatch') : t('v2.importExport.typeBackend') }}
                </td>
              </tr>
            </tbody>
          </table>
          <!-- Empty state: zero rows after filtering, no error -->
          <FcEmpty
            v-else
            :title="t('v2.importExport.empty')"
            data-testid="imp-export-empty"
          />
          </template>
          <div class="imp-panel-footer">
            <FcButton
              v-if="canEdit"
              type="primary"
              :loading="exporting"
              data-testid="imp-export-btn"
              @click="onExport"
            >
              {{ t('v2.importExport.downloadPackage') }}
            </FcButton>
          </div>
        </section>
      </template>
      <!-- ══ Import tab ═══════════════════════════════════════════════ -->
      <template #tab-import>
        <section class="imp-panel" data-testid="imp-import-panel">
          <h3 class="imp-title">{{ t('v2.importExport.routePackage') }}</h3>
          <FcInput
            v-model="jsonText"
            type="textarea"
            :rows="12"
            :maxlength="100000"
            :placeholder="t('v2.importExport.routePackage')"
            class="imp-json"
            data-testid="imp-json-textarea"
          />
          <div class="imp-filters imp-filters--import">
            <label class="imp-field">
              <span class="imp-field-label">{{ t('v2.importExport.strategy') }}</span>
              <FcSegmented
                v-model="strategy"
                :options="strategyOpts"
                data-testid="imp-strategy"
              />
            </label>
            <label v-if="envReady" class="imp-field">
              <span class="imp-field-label">{{ t('v2.importExport.targetEnv') }}</span>
              <FcSelect
                v-model="targetEnv"
                :options="envOptions"
                class="imp-select"
                data-testid="imp-target-env"
              />
            </label>
          </div>
          <div class="imp-actions">
            <FcButton v-if="canEdit" data-testid="imp-precheck-btn" @click="onPrecheck">
              {{ t('v2.importExport.preCheck') }}
            </FcButton>
            <FcButton
              v-if="canEdit"
              type="primary"
              :loading="importing"
              data-testid="imp-import-btn"
              @click="onImport"
            >
              {{ t('v2.importExport.doImport') }}
            </FcButton>
          </div>
          <!-- Empty state before the first precheck report -->
          <FcEmpty
            v-if="!report"
            :title="t('v2.importExport.preCheckHint')"
            data-testid="imp-precheck-hint"
          />
          <!-- Precheck report (local D14 failures + backend report share this region) -->
          <div v-else class="imp-report" data-testid="imp-report">
            <p class="imp-report-verdict" :class="report.is_valid ? 'is-ok' : 'is-bad'">
              {{ report.is_valid ? t('v2.importExport.reportValid') : t('v2.importExport.reportInvalid') }}
            </p>
            <p v-if="report.reason" class="imp-report-reason" data-testid="imp-report-reason">
              {{ report.reason }}
            </p>
            <p v-if="report.environment" data-testid="imp-report-environment">
              {{ t('v2.importExport.reportEnvironment') }}: {{ report.environment }}
            </p>
            <p v-if="report.package_environment" data-testid="imp-report-package-environment">
              {{ t('v2.importExport.reportPackageEnvironment') }}: {{ report.package_environment }}
            </p>
            <p v-if="(report.conflicts?.length ?? 0) > 0" data-testid="imp-report-conflicts">
              {{ t('v2.importExport.reportConflicts') }}: {{ report.conflicts!.join(', ') }}
            </p>
            <p v-if="(report.missing_plugins?.length ?? 0) > 0" data-testid="imp-report-missing-plugins">
              {{ t('v2.importExport.reportMissingPlugins') }}: {{ report.missing_plugins!.join(', ') }}
            </p>
            <p v-if="(report.missing_targets?.length ?? 0) > 0" data-testid="imp-report-missing-targets">
              {{ t('v2.importExport.reportMissingTargets') }}: {{ report.missing_targets!.join(', ') }}
            </p>
            <p v-if="(report.cycle_warnings?.length ?? 0) > 0" data-testid="imp-report-cycle-warnings">
              {{ t('v2.importExport.reportCycleWarnings') }}: {{ report.cycle_warnings!.join('; ') }}
            </p>
            <!-- Precheck diff table: package rows + four problem rows; action flips with strategy -->
            <table v-if="importDiffRows.length > 0" class="imp-table" data-testid="imp-diff-table">
              <thead>
                <tr>
                  <th>{{ t('v2.importExport.diffColName') }}</th>
                  <th>{{ t('v2.importExport.diffColAction') }}</th>
                  <th>{{ t('v2.importExport.diffColDetail') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in importDiffRows" :key="`${r.name}-${i}`" data-testid="imp-diff-row">
                  <td>{{ r.name }}</td>
                  <td>{{ r.action }}</td>
                  <td>{{ r.detail }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Import result: per-error table; absent entirely when errors is empty (v2 ruling 5) -->
          <div v-if="result && result.errors.length > 0" class="imp-result" data-testid="imp-result-table">
            <table class="imp-table">
              <thead>
                <tr>
                  <th>{{ t('v2.importExport.routeName') }}</th>
                  <th>{{ t('v2.importExport.diffColDetail') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(e, i) in result.errors" :key="`${e.route_name}-${i}`" data-testid="imp-result-row">
                  <td>{{ e.route_name }}</td>
                  <td>{{ e.message }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
      <!-- ══ Env diff tab (read-only: no write-permission gate, v2 ruling 4) ══ -->
      <template #tab-envdiff>
        <section class="imp-panel" data-testid="imp-diff-panel">
          <!-- Env capability missing entirely, or diff API failed -->
          <FcEmpty
            v-if="!envReady || diffState === 'unavailable'"
            :title="t('v2.importExport.diffUnavailable')"
            data-testid="imp-diff-unavailable"
          />
          <template v-else>
            <div class="imp-filters">
              <label class="imp-field">
                <span class="imp-field-label">{{ t('v2.importExport.diffFrom') }}</span>
                <FcSelect v-model="diffFrom" :options="envOptions" class="imp-select" data-testid="imp-diff-from" />
              </label>
              <label class="imp-field">
                <span class="imp-field-label">{{ t('v2.importExport.diffTo') }}</span>
                <FcSelect v-model="diffTo" :options="envOptions" class="imp-select" data-testid="imp-diff-to" />
              </label>
              <FcButton
                type="primary"
                :disabled="!diffInputsOk"
                class="imp-diff-run"
                data-testid="imp-diff-run"
                @click="runEnvDiff"
              >
                {{ t('v2.importExport.diffRun') }}
              </FcButton>
            </div>
            <!-- Three zones render only after a successful diff -->
            <template v-if="diffState === 'ok' && diffResult">
              <div class="imp-diff-zone">
                <h4 class="imp-title">{{ t('v2.importExport.diffOnlyInFrom') }}</h4>
                <ul v-if="onlyInFromLabels.length > 0" class="imp-diff-list" data-testid="imp-diff-only-from">
                  <li v-for="label in onlyInFromLabels" :key="label">{{ label }}</li>
                </ul>
                <p v-else class="imp-diff-empty" data-testid="imp-diff-only-from">
                  {{ t('v2.importExport.empty') }}
                </p>
              </div>
              <div class="imp-diff-zone">
                <h4 class="imp-title">{{ t('v2.importExport.diffOnlyInTo') }}</h4>
                <ul v-if="onlyInToLabels.length > 0" class="imp-diff-list" data-testid="imp-diff-only-to">
                  <li v-for="label in onlyInToLabels" :key="label">{{ label }}</li>
                </ul>
                <p v-else class="imp-diff-empty" data-testid="imp-diff-only-to">
                  {{ t('v2.importExport.empty') }}
                </p>
              </div>
              <div class="imp-diff-zone" data-testid="imp-diff-changed">
                <h4 class="imp-title">{{ t('v2.importExport.diffChanged') }}</h4>
                <p v-if="diffResult!.changed.length === 0" class="imp-diff-empty" data-testid="imp-diff-no-changes">
                  {{ t('v2.importExport.diffNoChanges') }}
                </p>
                <FcCollapse v-else v-model="openedChanges">
                  <FcCollapseItem v-for="c in diffResult!.changed" :key="c.route_name" :name="c.route_name">
                    <template #title>
                      <span>{{ changedTitle(c) }}</span>
                    </template>
                    <!-- Lazy content: absent until the item is first expanded -->
                    <table v-if="expandedChanges.includes(c.route_name)" class="imp-table">
                      <thead>
                        <tr>
                          <th>{{ t('v2.importExport.diffColField') }}</th>
                          <th>{{ t('v2.importExport.diffColFrom') }}</th>
                          <th>{{ t('v2.importExport.diffColTo') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(f, k) in c.fields" :key="k" data-testid="imp-diff-field-row">
                          <td>{{ k }}</td>
                          <td>{{ formatDiffValue(f.from) }}</td>
                          <td>{{ formatDiffValue(f.to) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </FcCollapseItem>
                </FcCollapse>
              </div>
            </template>
          </template>
        </section>
      </template>
    </FcTabsPanel>
  </div>
</template>

<script setup lang="ts">
/**
 * ImportExport (v2) — route export / import / environment diff.
 *
 * v2 rulings carried over from the contract (docs/ui-v2/实施契约.md §4 P4c-1):
 * 1. all copy under the fresh v2.importExport.* tree (no legacy keys)
 * 2. semantic <table> markup (no table SDK component); select-all is a header checkbox
 * 3. two error bars: imp-load-error (listRoutes) vs imp-action-error (actions)
 * 4. permission downgrade: readonly banner + action buttons leave; diff stays usable
 * 5. import result errors table absent when errors is empty
 * 6. empty selection = full export (ids undefined), feedback via exportSuccess toast
 * 7. snapshot probe before import; 404/any failure skipped silently
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createImportSnapshot,
  exportRoutes,
  importRoutes,
  listRoutes,
  validateImport
} from '@/api/routes'
import type { ImportReport, ImportResult, RouteNode, RoutePackage } from '@/api/routes'
import { getEnvironmentDiff } from '@/api/environment'
import type { EnvDiffChangedRoute, EnvDiffResult } from '@/api/environment'
import { useEnvironmentStore } from '@/store/environment'
import { usePermission } from '@/composables/usePermission'
import { envDiffRouteLabel } from '@/utils/environment'
import {
  FcButton,
  FcCollapse,
  FcCollapseItem,
  FcEmpty,
  FcInput,
  FcSegmented,
  FcSelect,
  FcSkeleton,
  FcTabsPanel,
  toast
} from '@/components'

const { t } = useI18n()
const env = useEnvironmentStore()
const perm = usePermission()

const canEdit = computed(() => perm.canEdit('route'))
const envReady = computed(() => env.available && env.environments.length > 0)
const envOptions = computed(() => env.options)

// ── Tabs ────────────────────────────────────────────────────────────────
type TabValue = 'export' | 'import' | 'envdiff'
const tab = ref<TabValue>('import')
const tabs = computed(() => [
  { value: 'export', label: t('v2.importExport.tabExport') },
  { value: 'import', label: t('v2.importExport.tabImport') },
  { value: 'envdiff', label: t('v2.importExport.tabEnvDiff') }
])

// ── Export state ────────────────────────────────────────────────────────
const routesLoading = ref(false)
const loadError = ref('')
const actionError = ref('')
const allRoutes = ref<RouteNode[]>([])
const selectedRouteIds = ref<string[]>([])
const routeKeyword = ref('')
const status = ref('')
const exportEnv = ref('default')
const exporting = ref(false)
/** Race guard: stale listRoutes responses must not overwrite a fresh reload */
let loadEpoch = 0

const statusOpts = [
  { value: 'DRAFT', label: t('v2.importExport.statusDraft') },
  { value: 'PUBLISHED', label: t('v2.importExport.statusPublished') },
  { value: 'OFFLINE', label: t('v2.importExport.statusOffline') }
]

/** Flatten the route tree: parent + children rows share one table (v2 ruling 2) */
const flatRoutes = computed<RouteNode[]>(() =>
  allRoutes.value.flatMap((n) => flattenNode(n)),
)
function flattenNode(n: RouteNode): RouteNode[] {
  return [n, ...(n.children ?? []).flatMap((c) => flattenNode(c))]
}

/** Keyword filter: case-insensitive on route_name */
const visibleRows = computed(() => {
  const kw = routeKeyword.value.trim().toLowerCase()
  if (!kw) return flatRoutes.value
  return flatRoutes.value.filter((r) => r.route_name.toLowerCase().includes(kw))
})

const allSelected = computed(
  () => visibleRows.value.length > 0 && visibleRows.value.every((r) => selectedRouteIds.value.includes(r.id)),
)
function onSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  if (!checked) {
    selectedRouteIds.value = selectedRouteIds.value.filter((id) => !visibleRows.value.some((r) => r.id === id))
    return
  }
  const merged = new Set(selectedRouteIds.value)
  for (const r of visibleRows.value) merged.add(r.id)
  selectedRouteIds.value = [...merged]
}

// ── Import state ────────────────────────────────────────────────────────
const jsonText = ref('')
const strategy = ref<'SKIP' | 'OVERWRITE' | 'ERROR'>('SKIP')
const targetEnv = ref('default')
const report = ref<ImportReport | null>(null)
const result = ref<ImportResult | null>(null)
const importing = ref(false)

const strategyOpts = [
  { value: 'SKIP', label: t('v2.importExport.skip') },
  { value: 'OVERWRITE', label: t('v2.importExport.overwrite') },
  { value: 'ERROR', label: t('v2.importExport.error') }
]

// ── Env diff state ──────────────────────────────────────────────────────
const diffFrom = ref('default')
const diffTo = ref('')
const diffState = ref<'idle' | 'ok' | 'unavailable'>('idle')
const diffResult = ref<EnvDiffResult | null>(null)
const openedChanges = ref<string[]>([])
/** Ever-opened collapse items: EP hides collapsed content with v-show only,
 *  so the field table must be lazy-mounted to keep it out of the DOM until expanded */
const expandedChanges = ref<string[]>([])
watch(openedChanges, (names) => {
  for (const n of names) {
    if (!expandedChanges.value.includes(n)) expandedChanges.value.push(n)
  }
})

const diffInputsOk = computed(
  () => !!diffFrom.value && !!diffTo.value && diffFrom.value !== diffTo.value,
)

const onlyInFromLabels = computed(() =>
  (diffResult.value?.only_in_from ?? []).map((i) => envDiffRouteLabel(i)),
)
const onlyInToLabels = computed(() =>
  (diffResult.value?.only_in_to ?? []).map((i) => envDiffRouteLabel(i)),
)

/** Collapse item title: `route_name（N）` — N = changed field count (CJK parens in script only) */
function changedTitle(c: EnvDiffChangedRoute): string {
  const count = Object.keys(c.fields ?? {}).length
  return `${c.route_name}（${count}）`
}

/** Field cell renderer: null/'' → em dash; {from,to} pairs → 'a → b'; rest → String */
function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object' && v !== null && 'from' in (v as object) && 'to' in (v as object)) {
    const p = v as { from: unknown; to: unknown }
    return `${formatDiffValue(p.from)} → ${formatDiffValue(p.to)}`
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

onMounted(() => {
  env.ensureLoaded().then(() => {
    if (!envReady.value) return
    exportEnv.value = env.current
    targetEnv.value = env.current
    diffFrom.value = 'default'
    diffTo.value = env.environments.find((e) => e !== 'default') ?? ''
  })
  loadRoutes()
})

// ── Load routes (export tab data source) ────────────────────────────────
async function loadRoutes() {
  const myEpoch = ++loadEpoch
  routesLoading.value = true
  loadError.value = ''
  try {
    const rows = await listRoutes()
    if (myEpoch !== loadEpoch) return // a newer load superseded this one
    allRoutes.value = rows
  } catch (e) {
    if (myEpoch !== loadEpoch) return
    loadError.value = `${t('v2.importExport.loadFailed')}: ${(e as Error)?.message ?? ''}`.trimEnd()
    allRoutes.value = []
  } finally {
    if (myEpoch === loadEpoch) routesLoading.value = false
  }
}

// ── Export action ───────────────────────────────────────────────────────
async function onExport() {
  if (!canEdit.value || exporting.value) return
  actionError.value = ''
  exporting.value = true
  try {
    const ids = selectedRouteIds.value
    const routeIds = ids.length > 0 ? ids : undefined
    const pkg = envReady.value
      ? await exportRoutes(routeIds, status.value || undefined, exportEnv.value)
      : await exportRoutes(routeIds, status.value || undefined)
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `routes-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    // v2 ruling 6: empty-selection feedback is the exportSuccess toast itself
    toast.success(t('v2.importExport.exportSuccess'))
  } catch (e) {
    actionError.value = (e as Error)?.message || t('v2.importExport.exportFailed')
  } finally {
    exporting.value = false
  }
}

// ── Precheck diff table (package rows + four problem rows) ──────────────
interface DiffRow {
  name: string
  action: string
  detail: string
}

/** Collect route_name from a parsed package tree; [] when routes is not an array */
function packageRouteNames(parsed: unknown): string[] {
  const routes = (parsed as { routes?: unknown })?.routes
  if (!Array.isArray(routes)) return []
  const names: string[] = []
  const walk = (nodes: Array<{ route_name?: string; children?: unknown[] }>) => {
    for (const n of nodes) {
      if (typeof n?.route_name === 'string') names.push(n.route_name)
      if (Array.isArray(n?.children)) walk(n.children as Array<{ route_name?: string; children?: unknown[] }>)
    }
  }
  walk(routes as Array<{ route_name?: string; children?: unknown[] }>)
  return names
}

/** Conflict row action follows the strategy: SKIP→skip / OVERWRITE→overwrite / else→conflict */
function conflictAction(): string {
  if (strategy.value === 'OVERWRITE') return t('v2.importExport.overwrite')
  if (strategy.value === 'SKIP') return t('v2.importExport.skip')
  return t('v2.importExport.actionConflict')
}

/** v2 ruling: the four problem rows reuse the reportConflicts/... keys for the action column */
const importDiffRows = computed<DiffRow[]>(() => {
  if (!report.value || report.value.is_valid) return [] // clean report: no diff table at all
  const names = packageRouteNames(parsePackageJson())
  const conflicts = report.value.conflicts ?? []
  const rows: DiffRow[] = names.map((name) =>
    conflicts.includes(name)
      ? { name, action: conflictAction(), detail: t('v2.importExport.diffConflictDetail') }
      : { name, action: t('v2.importExport.actionCreate'), detail: t('v2.importExport.diffCreateDetail') },
  )
  for (const name of conflicts) {
    if (!names.includes(name)) rows.push({ name, action: conflictAction(), detail: t('v2.importExport.diffConflictDetail') })
  }
  for (const name of report.value.missing_plugins ?? []) {
    rows.push({ name, action: t('v2.importExport.reportMissingPlugins'), detail: t('v2.importExport.diffMissingPluginDetail') })
  }
  for (const name of report.value.missing_targets ?? []) {
    rows.push({ name, action: t('v2.importExport.reportMissingTargets'), detail: t('v2.importExport.diffMissingTargetDetail') })
  }
  for (const w of report.value.cycle_warnings ?? []) {
    rows.push({ name: '—', action: t('v2.importExport.reportCycleWarnings'), detail: w })
  }
  return rows
})

// ── Local precheck (D14): bad input never reaches the backend ───────────
function parsePackageJson(): RoutePackage | null {
  try {
    return JSON.parse(jsonText.value) as RoutePackage
  } catch {
    return null
  }
}

async function onPrecheck() {
  if (!canEdit.value) return
  if (!jsonText.value.trim()) return // empty text: keep the hint empty state
  let parsed: RoutePackage | null = null
  let reason = ''
  try {
    parsed = JSON.parse(jsonText.value) as RoutePackage
  } catch (pe) {
    reason = `JSON 解析失败：${(pe as Error)?.message || t('v2.importExport.jsonParseError')}`
  }
  if (!reason && !Array.isArray((parsed as { routes?: unknown } | null)?.routes)) {
    reason = '路由包结构无效：缺少 routes 数组'
  }
  if (reason) {
    // Local failures surface in the report region, never as an action error
    report.value = { is_valid: false, reason }
    return
  }
  try {
    report.value = await validateImport(parsed as RoutePackage)
  } catch (e) {
    // Backend precheck failure also lands in the report region (not action-error)
    report.value = {
      is_valid: false,
      reason: (e as Error)?.message || t('v2.importExport.validationFailed'),
    }
  }
}

// ── Auto snapshot probe (optional backend capability, v2 ruling 7) ──────
async function tryAutoSnapshot(): Promise<string | null> {
  try {
    const res = await createImportSnapshot()
    return res?.snapshot_id != null ? String(res.snapshot_id) : null
  } catch {
    return null // 404 / any failure → silent skip, import proceeds
  }
}

// ── Import action ───────────────────────────────────────────────────────
async function onImport() {
  if (!canEdit.value || importing.value) return
  actionError.value = ''
  if (!jsonText.value.trim()) return // nothing to import: no snapshot, no import call
  let parsed: RoutePackage
  try {
    parsed = JSON.parse(jsonText.value) as RoutePackage
  } catch {
    actionError.value = t('v2.importExport.jsonParseError')
    return
  }
  importing.value = true
  try {
    // snapshot strictly before import (contract: invocationCallOrder)
    const snapshotId = await tryAutoSnapshot()
    const res = envReady.value
      ? await importRoutes(parsed, strategy.value, targetEnv.value)
      : await importRoutes(parsed, strategy.value)
    result.value = res
    toast.success(t('v2.importExport.importSuccess'))
    if (snapshotId) {
      toast.success(t('v2.importExport.snapshotCreated', { id: snapshotId }))
    }
  } catch (e) {
    actionError.value = (e as Error)?.message || t('v2.importExport.importFailed')
    result.value = null
  } finally {
    importing.value = false
  }
}

// ── Environment diff (read-only: no write-permission gate, v2 ruling 4) ─
async function runEnvDiff() {
  if (!diffInputsOk.value) return
  try {
    diffResult.value = await getEnvironmentDiff(diffFrom.value, diffTo.value)
    diffState.value = 'ok'
    openedChanges.value = []
  } catch {
    // 404 / any failure → degraded empty state, three zones leave
    diffState.value = 'unavailable'
    diffResult.value = null
  }
}
</script>

<style scoped lang="scss">
.imp-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.imp-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
  font-size: 13px;

  &.is-danger {
    background: color-mix(in srgb, var(--app-danger) 8%, transparent);
    color: var(--app-danger);
    font-weight: 500;
  }
}

.imp-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.imp-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary);
}

.imp-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}

.imp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;

  &--grow {
    flex: 1;
    min-width: 220px;
  }
}

.imp-field-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.imp-select {
  width: 180px;
}

/* Semantic table: name/type columns + header select-all */
.imp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--app-bg-muted);
  }

  th {
    font-weight: 600;
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
  }

  td {
    color: var(--app-text-primary);
  }
}

.imp-col-check {
  width: 40px;
}

.imp-panel-footer {
  display: flex;
  justify-content: flex-end;
}

.imp-json {
  width: 100%;
}

.imp-actions {
  display: flex;
  gap: 10px;
}

.imp-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-muted);
  font-size: 13px;

  p {
    margin: 0;
    color: var(--app-text-primary);
  }
}

.imp-report-verdict {
  font-weight: 600;

  &.is-ok {
    color: var(--app-success, #52c41a);
  }

  &.is-bad {
    color: var(--app-danger);
  }
}

.imp-report-reason {
  color: var(--app-danger) !important;
}

.imp-result {
  margin-top: 4px;
}

.imp-diff-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.imp-diff-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--app-text-primary);
}

.imp-diff-empty {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.imp-diff-run {
  align-self: flex-end;
}
</style>
