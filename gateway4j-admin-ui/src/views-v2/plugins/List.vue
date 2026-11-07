<template>
  <div class="plg-page" data-testid="plg-page">
    <FcSection>
      <FcFilterBar>
        <FcInput
          v-model="keywordInput"
          :placeholder="t('v2.plugins.searchPlaceholder')"
          :aria-label="t('v2.plugins.searchPlaceholder')"
          clearable
          data-testid="plg-f-keyword"
          style="max-width: 240px"
        />
        <FcFilterBarDivider />
        <FcSegmented v-model="typeFilter" :options="typeOpts" size="sm" data-testid="plg-f-type" />
        <FcSegmented v-model="statusFilter" :options="statusOpts" size="sm" data-testid="plg-f-status" />
        <FcSegmented v-model="scopeFilter" :options="scopeOpts" size="sm" data-testid="plg-f-scope" />
        <template #actions>
          <FcButton variant="text" size="sm" data-testid="plg-view-toggle" @click="toggleView">
            {{ viewMode === 'table' ? t('v2.plugins.groupedView') : t('v2.plugins.tableView') }}
          </FcButton>
          <FcButton
            v-if="canEdit('plugin')"
            variant="primary"
            data-testid="plg-create"
            @click="router.push('/v2/plugins/editor/new')"
          >
            {{ t('v2.plugins.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <p v-if="!canEdit('plugin')" class="plg-readonly" data-testid="plg-readonly-hint" role="status">
        {{ t('v2.plugins.readonlyHint') }}
      </p>

      <FcSkeleton v-if="loading" variant="text" :rows="6" data-testid="plg-skeleton" />
      <!-- Load failed: error state replaces the table area entirely (no table, no empty state) -->
      <div v-else-if="loadError" class="hint-banner is-error" data-testid="plg-load-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.plugins.loadFailed') }}</span>
        <span class="plg-banner-msg">{{ loadError }}</span>
      </div>
      <template v-else>
        <!-- Row-level DOM contract: data-testid=plg-row-<id> must sit on the <tr>; el-table has no
             per-row attrs mount point, so this page uses a semantic <table> + Fc atoms (S9a branch) -->
        <div v-if="viewMode === 'table'" class="plg-table-scroll" data-testid="plg-table-view">
          <table class="plg-table">
            <thead>
              <tr>
                <th scope="col">{{ t('v2.plugins.colName') }}</th>
                <th scope="col">{{ t('v2.plugins.colId') }}</th>
                <th scope="col">{{ t('v2.plugins.colType') }}</th>
                <th scope="col">{{ t('v2.plugins.colPhase') }}</th>
                <th scope="col">{{ t('v2.plugins.colScope') }}</th>
                <th scope="col">{{ t('v2.plugins.colStatus') }}</th>
                <th scope="col" class="plg-col-actions">{{ t('v2.plugins.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id" class="plg-row" :data-testid="`plg-row-${row.id}`">
                <td class="plg-name" :data-testid="`plg-name-${row.id}`">{{ row.plugin_name }}</td>
                <td class="plg-mono" :data-testid="`plg-pid-${row.id}`">{{ row.plugin_id }}</td>
                <td>
                  <FcTag :color="typeColor(row.plugin_type)" size="sm" :data-testid="`plg-type-${row.id}`">
                    {{ typeLabel(row.plugin_type) }}
                  </FcTag>
                </td>
                <td :data-testid="`plg-phase-${row.id}`">{{ phaseLabel(row.plugin_phase) }}</td>
                <td :data-testid="`plg-scope-${row.id}`">{{ scopeLabel(row.scope) }}</td>
                <td>
                  <FcStatusBadge :data-testid="`plg-status-${row.id}`" v-bind="statusBadge(row)" />
                </td>
                <td class="plg-actions">
                  <template v-if="canEdit('plugin')">
                    <FcButton variant="text" size="sm" :data-testid="`plg-act-edit-${row.id}`" @click="onEdit(row)">
                      {{ t('v2.plugins.edit') }}
                    </FcButton>
                    <FcButton
                      v-if="row.status === 'DISABLED'"
                      variant="text"
                      size="sm"
                      :data-testid="`plg-act-enable-${row.id}`"
                      @click="onEnable(row)"
                    >
                      {{ t('v2.plugins.enable') }}
                    </FcButton>
                    <FcButton
                      v-if="row.status === 'ENABLED'"
                      variant="text"
                      size="sm"
                      :data-testid="`plg-act-disable-${row.id}`"
                      @click="onDisable(row)"
                    >
                      {{ t('v2.plugins.disable') }}
                    </FcButton>
                    <FcButton
                      v-if="row.status !== 'ENABLED'"
                      variant="text"
                      size="sm"
                      class="plg-danger"
                      :data-testid="`plg-act-delete-${row.id}`"
                      @click="onDelete(row)"
                    >
                      {{ t('v2.plugins.delete') }}
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
            class="plg-pagination"
            data-testid="plg-pagination"
          />
        </div>

        <div v-else class="plg-grouped" data-testid="plg-grouped-view">
          <div
            v-for="group in groupedRows"
            :key="group.type"
            class="plg-group"
            :data-testid="`plg-group-${group.type}`"
          >
            <div class="plg-group-head">
              <FcTag :color="typeColor(group.type)" size="sm">{{ typeLabel(group.type) }}</FcTag>
              <span class="plg-group-count" :data-testid="`plg-group-count-${group.type}`">{{ group.items.length }}</span>
            </div>
            <div class="plg-group-items">
              <div v-for="row in group.items" :key="row.id" class="plg-card" :data-testid="`plg-card-${row.id}`">
                <div class="plg-card-name">{{ row.plugin_name }}</div>
                <div class="plg-card-id plg-mono">{{ row.plugin_id }}</div>
                <FcStatusBadge v-bind="statusBadge(row)" />
                <div v-if="canEdit('plugin')" class="plg-card-actions">
                  <FcButton variant="text" size="sm" :data-testid="`plg-act-edit-${row.id}`" @click="onEdit(row)">
                    {{ t('v2.plugins.edit') }}
                  </FcButton>
                  <FcButton
                    v-if="row.status === 'DISABLED'"
                    variant="text"
                    size="sm"
                    :data-testid="`plg-act-enable-${row.id}`"
                    @click="onEnable(row)"
                  >
                    {{ t('v2.plugins.enable') }}
                  </FcButton>
                  <FcButton
                    v-if="row.status === 'ENABLED'"
                    variant="text"
                    size="sm"
                    :data-testid="`plg-act-disable-${row.id}`"
                    @click="onDisable(row)"
                  >
                    {{ t('v2.plugins.disable') }}
                  </FcButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <FcEmpty v-if="!rows.length" type="empty" :title="t('v2.plugins.empty')" data-testid="plg-empty" />
      </template>

      <!-- Action error banner: coexists with the list; a failed action never clears rows -->
      <div v-if="actionError" class="hint-banner is-error" data-testid="plg-action-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ actionError }}</span>
      </div>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDebounce } from '@/composables'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcFilterBar, FcFilterBarDivider, FcInput, FcSegmented, FcTag, FcStatusBadge,
  FcButton, FcIcon, FcPagination, FcEmpty, FcSkeleton, toast
} from '@/components'
import { listPlugins, enablePlugin, disablePlugin, deletePlugin, type PluginItem } from '@/api/plugins'

/** 列表行：PluginItem + 实例 id（启停删回退键）+ UNINSTALLED 态（旧 List.vue 等价口径） */
type PluginRow = Omit<PluginItem, 'status'> & {
  instance_id?: string
  status: PluginItem['status'] | 'UNINSTALLED'
}

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const router = useRouter()

const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<PluginRow[]>([])
const loading = ref(true)
const keywordInput = ref('')
// keyword 300ms 防抖（真实实现，List.keyword-debounce 语义随迁）
const keyword = useDebounce(keywordInput, 300)
// 'ALL' 哨兵 = 不过滤（对应 query 参数 undefined 不透传）
const typeFilter = ref('ALL')
const statusFilter = ref('ALL')
const scopeFilter = ref('ALL')
const viewMode = ref<'table' | 'grouped'>('table')
const loadError = ref('')
const actionError = ref('')

function toggleView() {
  viewMode.value = viewMode.value === 'table' ? 'grouped' : 'table'
}

const typeOpts = computed(() => [
  { value: 'ALL', label: t('v2.plugins.filterAll') },
  { value: 'BUILTIN', label: t('v2.plugins.typeBuiltin') },
  { value: 'JAR', label: t('v2.plugins.typeJar') },
  { value: 'GROOVY', label: t('v2.plugins.typeGroovy') },
  { value: 'GROUP', label: t('v2.plugins.typeGroup') }
])
const statusOpts = computed(() => [
  { value: 'ALL', label: t('v2.plugins.filterAll') },
  { value: 'ENABLED', label: t('v2.plugins.statusEnabled') },
  { value: 'DISABLED', label: t('v2.plugins.statusDisabled') },
  { value: 'UNINSTALLED', label: t('v2.plugins.statusUninstalled') }
])
const scopeOpts = computed(() => [
  { value: 'ALL', label: t('v2.plugins.filterAll') },
  { value: 'GLOBAL', label: t('v2.plugins.scopeGlobal') },
  { value: 'ROUTE', label: t('v2.plugins.scopeRoute') }
])

const TYPE_COLORS: Record<string, 'primary' | 'warning' | 'success' | 'brand'> = {
  BUILTIN: 'primary', JAR: 'warning', GROOVY: 'success', GROUP: 'brand'
}
function typeColor(type: string) {
  return TYPE_COLORS[type] ?? 'gray'
}
const TYPE_KEYS: Record<string, string> = {
  BUILTIN: 'v2.plugins.typeBuiltin', JAR: 'v2.plugins.typeJar',
  GROOVY: 'v2.plugins.typeGroovy', GROUP: 'v2.plugins.typeGroup'
}
function typeLabel(type: string) {
  return TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type
}
const PHASE_KEYS: Record<string, string> = { PRE: 'v2.plugins.phasePre', POST: 'v2.plugins.phasePost' }
function phaseLabel(phase: string) {
  return PHASE_KEYS[phase] ? t(PHASE_KEYS[phase]) : phase
}
const SCOPE_KEYS: Record<string, string> = { ROUTE: 'v2.plugins.scopeRoute', GLOBAL: 'v2.plugins.scopeGlobal' }
function scopeLabel(scope: string) {
  return SCOPE_KEYS[scope] ? t(SCOPE_KEYS[scope]) : scope
}

function statusBadge(row: PluginRow): { label: string; tone: 'success' | 'neutral' | 'pending'; dot?: boolean } {
  if (row.status === 'ENABLED') return { label: t('v2.plugins.statusEnabled'), tone: 'success', dot: true }
  if (row.status === 'UNINSTALLED') return { label: t('v2.plugins.statusUninstalled'), tone: 'pending' }
  return { label: t('v2.plugins.statusDisabled'), tone: 'neutral' }
}

/** 按 plugin_type 聚类（List.grouped 语义随迁；未知类型落 OTHER 组） */
const groupedRows = computed(() => {
  const map = new Map<string, PluginRow[]>()
  for (const r of rows.value) {
    const tp = r.plugin_type || 'OTHER'
    if (!map.has(tp)) map.set(tp, [])
    map.get(tp)!.push(r)
  }
  return Array.from(map.entries()).map(([type, items]) => ({ type, items }))
})

// —— 取数（loadEpoch 竞态守卫，List.load-epoch 随迁）——
let loadEpoch = 0
// 筛选/搜索路径的页码归 1 不再二次触发翻页重拉（sync 翻页 watcher 的一次性抑制位）
let suppressPageReload = false

function filterParams(withKeyword?: string) {
  return {
    page: page.value,
    pageSize: pageSize.value,
    keyword: withKeyword || undefined,
    pluginType: typeFilter.value === 'ALL' ? undefined : typeFilter.value,
    status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    scope: scopeFilter.value === 'ALL' ? undefined : scopeFilter.value
  }
}

async function reload(withKeyword?: string) {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const res = await listPlugins(filterParams(withKeyword))
    if (myEpoch !== loadEpoch) return
    rows.value = (res.records ?? []) as PluginRow[]
    total.value = res.total || 0
  } catch (e) {
    if (myEpoch !== loadEpoch) return
    loadError.value = (e as { message?: string } | undefined)?.message || t('v2.plugins.loadFailed')
    // 失败清陈旧行：错误态整体替换表区，不残留旧数据
    rows.value = []
    total.value = 0
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}

/**
 * 筛选/搜索变更：页码归 1 + 重拉。
 * keyword 只随搜索路径下发；翻页重拉不携带 keyword（挂起中的搜索词不随翻页发出
 * —— List.load-epoch「慢搜索挂起期间新加载先行生效」的语义前提），页码归 1 由
 * 抑制位保证只发一次请求。
 */
function resetPageAndReload(withKeyword?: string) {
  suppressPageReload = true
  page.value = 1
  suppressPageReload = false
  void reload(withKeyword)
}
watch(keyword, (kw) => resetPageAndReload(kw))
watch([typeFilter, statusFilter, scopeFilter], () => resetPageAndReload())

// 翻页/改每页条数：sync 立即重拉（供筛选路径一次性抑制）
watch([page, pageSize], () => {
  if (!suppressPageReload) void reload()
}, { flush: 'sync' })
void reload()

/**
 * 分页 total 兜底：服务端 total 是上一页快照，改每页条数瞬间 pageCount 可能缩到
 * 当前页之前，EP 会把超界页码 clamp 回 1 并多发一次请求；此处保证「当前页始终可达」
 * （total >= page*pageSize），响应回来后随 rows/total 自然收敛。
 */
const paginationTotal = computed(() => Math.max(total.value, page.value * pageSize.value))

// —— 行动作（可见性口径逐字随迁旧页；启停删 = instance_id || id 回退）——

function actionErrMsg(e: unknown): string {
  return (e as { message?: string } | undefined)?.message || t('v2.plugins.actionFailed')
}

/** 编辑直取行主键 id（编辑器 getPlugin 吃行主键，不走 instance_id 回退） */
async function onEdit(row: PluginRow) {
  if (!canEdit('plugin')) return
  await router.push(`/v2/plugins/editor/${row.id}`)
}

async function onEnable(row: PluginRow) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  try {
    await enablePlugin(row.instance_id || row.id)
    toast.success(t('v2.plugins.enableSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

async function onDisable(row: PluginRow) {
  if (!canEdit('plugin')) return
  if (!await confirm({ variant: 'danger', title: t('v2.plugins.confirmDisable') })) return
  actionError.value = ''
  try {
    await disablePlugin(row.instance_id || row.id)
    toast.success(t('v2.plugins.disableSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}

async function onDelete(row: PluginRow) {
  if (!canEdit('plugin')) return
  const ok = await confirm({
    variant: 'danger',
    title: t('v2.plugins.confirmDeleteTitle'),
    content: t('v2.plugins.confirmDelete')
  })
  if (!ok) return
  actionError.value = ''
  try {
    await deletePlugin(row.instance_id || row.id)
    toast.success(t('v2.plugins.deleteSuccess'))
    void reload()
  } catch (e) {
    actionError.value = actionErrMsg(e)
  }
}
</script>

<style scoped>
/* —— 只读提示条 —— */
.plg-readonly {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-sm);
}

/* —— 错误条（加载失败 / 动作失败，S9a hint-banner 同款配方，token only）—— */
.hint-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-top: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}
.plg-banner-msg {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* —— 语义化表格（token only；窄视口容器内横滚，P1-1b 同款收口）—— */
.plg-table-scroll {
  min-width: 0;
  overflow-x: auto;
}
.plg-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 13px;
}
.plg-table th {
  padding: 8px 12px; text-align: left;
  font-size: 12px; font-weight: 600;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-bottom: 1px solid var(--app-separator);
  white-space: nowrap;
}
.plg-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-extra-light);
  color: var(--app-text);
  vertical-align: middle;
}
.plg-row:hover {
  background: var(--app-bg-muted);
}
.plg-name {
  font-weight: 600;
}
.plg-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.plg-col-actions {
  text-align: right;
}
.plg-actions {
  text-align: right; white-space: nowrap;
}
.plg-actions .plg-danger {
  color: var(--app-color-danger);
}
.plg-pagination {
  margin-top: 12px; justify-content: flex-end;
}

/* —— 分组卡片视图 —— */
.plg-grouped {
  display: flex; flex-direction: column; gap: 16px;
}
.plg-group {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}
.plg-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--app-bg-muted);
  font-size: 14px; font-weight: 600;
}
.plg-group-count {
  font-size: 12px;
  color: var(--app-text-secondary);
  font-weight: 400;
}
.plg-group-items {
  display: flex; flex-wrap: wrap; gap: 12px;
  padding: 12px;
}
.plg-card {
  width: 200px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
}
.plg-card-name {
  font-size: 14px; font-weight: 500;
}
.plg-card-id {
  font-size: 12px;
  color: var(--app-text-secondary);
}
.plg-card-actions {
  display: flex; gap: 4px; margin-top: 4px;
}

/* 焦点环兜底：本页可聚焦元素统一 token 焦点环 */
.plg-page :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
</style>
