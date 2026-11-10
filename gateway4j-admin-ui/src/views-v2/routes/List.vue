<template>
  <div class="v2-route-list">
    <FcSection>
      <!-- 快照兜底提示条：任一 summary source=snapshot 且 quantile_fallback 时出现 -->
      <div v-if="showFallbackHint" class="hint-banner is-warn" data-testid="summary-source-hint" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.routes.snapshotFallback') }}</span>
      </div>
      <!-- 流量指标加载失败：错误条出现，路由行仍渲染，流量列 — -->
      <div v-if="summaryFailed" class="hint-banner is-error" data-testid="traffic-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.routes.trafficLoadFailed') }}</span>
      </div>

      <FcFilterBar>
        <FcSegmented v-model="statusFilter" :options="segOptions" size="sm" />
        <FcFilterBarDivider />
        <FcInput v-model="keyword" :placeholder="t('v2.routes.searchPlaceholder')" :aria-label="t('v2.routes.searchPlaceholder')" clearable style="max-width: 240px" />
        <!-- OPT-6 全局同步 chip：整页恰一枚（不随行渲染）。挂载即 start()（常态首发即 synced
             = 等效查一次）；批量发布收尾 okCount>0 时重启一轮。delayed 时出重试钮。 -->
        <span
          v-if="syncPhase !== 'idle'"
          class="lst-sync"
          :class="`is-${syncPhase}`"
          :data-phase="syncPhase"
          data-testid="lst-sync-chip"
          role="status"
        >
          <FcIcon :name="syncIcon" :size="12" />
          <span>{{ syncLabel }}</span>
          <FcButton
            v-if="syncPhase === 'delayed'"
            class="lst-sync-retry"
            variant="text"
            size="sm"
            data-testid="lst-sync-retry"
            @click="sync.retry()"
          >
            {{ t('v2.routes.syncRetry') }}
          </FcButton>
        </span>
        <template #actions>
          <FcButton v-if="canEdit('route')" variant="primary" data-testid="route-create" :icon="Plus" @click="goCreate">
            {{ t('v2.routes.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <!-- OPT-3 批量条：选中 ≥1 渲染；门禁矩阵（下线=含 ≥1 PUBLISHED；删除/发布=含 ≥1 DRAFT|OFFLINE）
           + 混合态不可操作计数提示；执行中三钮 disabled 防重复点击；flex-wrap 保证 375 宽不溢出 -->
      <div v-if="selectedIds.size > 0" class="bat-bar" data-testid="bat-bar">
        <span class="bat-count" data-testid="bat-count">{{ t('v2.routes.batSelected', { n: selectedIds.size }) }}</span>
        <FcButton v-if="canEdit('route')" variant="secondary" size="sm" data-testid="bat-offline" :disabled="batchRunning || !batHasPublished" @click="runBatchAction('offline')">
          {{ t('v2.routes.batOffline') }}
        </FcButton>
        <FcButton v-if="canEdit('route')" variant="danger" size="sm" data-testid="bat-delete" :disabled="batchRunning || !batHasRepub" @click="runBatchAction('delete')">
          {{ t('v2.routes.batDelete') }}
        </FcButton>
        <FcButton v-if="canEdit('route')" variant="secondary" size="sm" data-testid="bat-publish" :disabled="batchRunning || !batHasRepub" @click="runBatchAction('publish')">
          {{ t('v2.routes.batPublish') }}
        </FcButton>
        <FcButton variant="text" size="sm" data-testid="bat-clear" @click="clearSelection">
          {{ t('v2.routes.batClear') }}
        </FcButton>
        <!-- 混合态不可操作计数：仅在按钮可用且存在不合格项时出现（门禁跳过项执行时不进失败明细） -->
        <span v-if="batHasPublished && batIneligibleOffline > 0" class="bat-hint" data-testid="bat-hint-offline">
          {{ t('v2.routes.batHintOffline', { n: batIneligibleOffline }) }}
        </span>
        <span v-if="batHasRepub && batIneligibleDelete > 0" class="bat-hint" data-testid="bat-hint-delete">
          {{ t('v2.routes.batHintDelete', { n: batIneligibleDelete }) }}
        </span>
        <span v-if="batHasRepub && batIneligiblePublish > 0" class="bat-hint" data-testid="bat-hint-publish">
          {{ t('v2.routes.batHintPublish', { n: batIneligiblePublish }) }}
        </span>
        <span v-if="batchRunning" class="bat-progress" data-testid="bat-progress" role="status">
          {{ t('v2.routes.batProgress', { done: batchDone, total: batchTotal }) }}
        </span>
      </div>

      <FcSkeleton v-if="loading" variant="text" :rows="8" />
      <!--
        行级 DOM 契约（S3-T）：data-testid=route-row-<id> 必须包裹该行全部单元格 testid，
        el-table 无行级 attrs 挂载点，故本页用语义化 <table> + Fc 原子组件（SDK 惯例分支），
        颜色/圆角/阴影全部走 token。
      -->
      <!-- P1-1b: 表格包进固定横滚容器（overflow-x:auto + min-width:0）—— 375 宽下 body 不再被撑开，仅容器内横滚 -->
      <div v-else-if="filteredRows.length" class="rt-table-scroll">
        <table class="rt-table">
          <thead>
            <tr>
              <!-- OPT-3 全选列：checked=可见可勾选行全选；indeterminate=部分选中；
                   change 仅作用可见行（merge 语义，筛选外已选保留） -->
              <th scope="col" class="col-check">
                <input
                  type="checkbox"
                  class="bat-check"
                  :checked="selAllChecked"
                  :indeterminate="selAllIndeterminate"
                  :aria-label="t('v2.routes.selectAll')"
                  data-testid="sel-all"
                  @change="onSelAll"
                />
              </th>
              <th scope="col" class="col-name">{{ t('v2.routes.colName') }}</th>
              <th scope="col">{{ t('v2.routes.colPath') }}</th>
              <th scope="col">{{ t('v2.routes.colFlow') }}</th>
              <th scope="col">{{ t('v2.routes.colStatus') }}</th>
              <th scope="col" class="col-num">{{ t('v2.routes.colHits') }}</th>
              <th scope="col" class="col-num">{{ t('v2.routes.colP95') }}</th>
              <th scope="col">{{ t('v2.routes.colHealth') }}</th>
            </tr>
          </thead>
          <!-- 每行一个 tbody（合法 HTML）：route-row-<id> 锚点同时覆盖主行与展开行（含 card-actions），
               供行内作用域定位（单测 cell() / e2e filter({ hasText })）。点击处理仍在主行 tr，行为不变。
               OPT-3：v-for 走 keywordRows（keyword 维度唯一卸行）；状态维度行 v-show 隐藏保持挂载，
               全选 merge 仅作用 filteredRows（可见行），筛选外选择框不被波及 -->
          <tbody v-for="row in keywordRows" :key="row.id" v-show="rowVisible(row)" :data-testid="`route-row-${row.id}`">
              <tr class="rt-row" :class="{ 'is-open': isOpen(row.id) }" @click="onRowClick(row, $event)">
                <!-- OPT-3 行选择：原生 checkbox（aria-label=route_name）；CHANGING 行禁选
                     （三动作全不适用，与单条 act-offline/act-delete 两钮均无同一口径） -->
                <td class="col-check">
                  <input
                    type="checkbox"
                    class="bat-check"
                    :checked="selectedIds.has(row.id)"
                    :disabled="row.status === 'CHANGING'"
                    :aria-label="row.route_name"
                    :data-testid="`sel-row-${row.id}`"
                    @change="onRowCheck(row, $event)"
                  />
                </td>
                <td class="col-name">
                  <FcButton class="rt-toggle" :class="{ 'is-open': isOpen(row.id) }" variant="text" size="sm" circle :aria-expanded="isOpen(row.id)" :aria-label="row.route_name" :data-testid="`route-expand-${row.id}`" @click.stop="toggleRow(row.id)">
                    <FcIcon name="ri-arrow-down-s-line" :size="14" />
                  </FcButton>
                  <span class="rt-name" :style="{ paddingLeft: `${row.depth * 16}px` }">{{ row.route_name }}</span>
                </td>
                <td><FcTag data-testid="route-path" color="gray" size="sm" class="rt-path">{{ row.path || '—' }}</FcTag></td>
                <td>
                  <div class="rt-flow" data-testid="route-flow">
                    <template v-for="(chip, i) in flowChips(row)" :key="`${row.id}-${i}`">
                      <span v-if="i > 0" class="rt-arrow" aria-hidden="true"><FcIcon name="ri-arrow-right-s-line" :size="12" /></span>
                      <FcTag :color="chip.color" :class="chip.cls" size="sm" data-testid="flow-chip">{{ chip.text }}</FcTag>
                    </template>
                  </div>
                </td>
                <td><span data-testid="route-status"><FcStatusBadge v-bind="statusBadge(row)" /></span></td>
                <td class="col-num" data-testid="route-hits"><span class="rt-num">{{ formatHits(summaryOf(row.id)?.hits_24h) }}</span></td>
                <td class="col-num" data-testid="route-p95"><span class="rt-num">{{ formatMs(summaryOf(row.id)?.p95_latency_ms) }}</span></td>
                <td data-testid="route-health"><FcStatusBadge v-bind="healthBadge(row)" /></td>
              </tr>
              <!-- 展开行：懒加载时序 spark + 三卡片 -->
              <tr v-if="isOpen(row.id)" class="rt-detail-row">
                <td :colspan="8">
                  <div class="rt-detail" :data-testid="`route-detail-${row.id}`">
                    <div class="rt-spark-wrap">
                      <FcSkeleton v-if="sparkOf(row.id)?.status === 'loading'" variant="text" :rows="1" />
                      <!-- P3-1: 时序拉取失败 → 弱文案占位（收起再展开可重试） -->
                      <div v-else-if="sparkOf(row.id)?.status === 'error'" class="rt-spark-err" :data-testid="`route-spark-err-${row.id}`">
                        <FcIcon name="ri-error-warning-line" :size="13" />
                        <span>{{ t('v2.routes.sparkUnavailable') }}</span>
                      </div>
                      <div v-else class="rt-spark" :data-testid="`route-spark-${row.id}`">
                        <div v-if="sparkPoints(row.id).length" class="rt-spark-bars" aria-hidden="true">
                          <span v-for="(p, i) in sparkPoints(row.id)" :key="i" class="rt-spark-bar" :style="{ height: barHeight(p, row.id) }" />
                        </div>
                        <span v-else class="rt-num">{{ t('v2.routes.placeholder') }}</span>
                      </div>
                    </div>
                    <div class="rt-cards">
                      <FcSectionCard padding="sm" shadow="sm" class="rt-card" data-testid="card-upstream">
                        <p class="rt-card-title">{{ t('v2.routes.cardUpstream') }}</p>
                        <div class="rt-card-body">
                          <span class="rt-mono">{{ upstreamHost(row.upstream_url) }}</span>
                          <FcStatusBadge :label="upstreamLatencyLabel(row)" :tone="healthBadge(row).tone" />
                        </div>
                      </FcSectionCard>
                      <FcSectionCard padding="sm" shadow="sm" class="rt-card" data-testid="card-plugins">
                        <p class="rt-card-title">{{ t('v2.routes.cardPlugins') }}</p>
                        <div class="rt-card-body rt-wrap">
                          <template v-if="sortedPlugins(row).length">
                            <FcTag v-for="p in sortedPlugins(row)" :key="p.plugin_id" color="gray" size="sm">{{ p.plugin_name }}</FcTag>
                          </template>
                          <span v-else class="rt-num">{{ t('v2.routes.placeholder') }}</span>
                        </div>
                      </FcSectionCard>
                      <FcSectionCard padding="sm" shadow="sm" class="rt-card" data-testid="card-actions">
                        <p class="rt-card-title">{{ t('v2.routes.cardActions') }}</p>
                        <div class="rt-card-body rt-wrap">
                          <!-- S8 顺带：详情入口（v2 详情页），只增不改既有元素 -->
                          <FcButton variant="secondary" size="sm" data-testid="act-detail" @click="router.push(`/v2/routes/${row.id}/detail`)">
                            <FcIcon name="ri-file-list-3-line" :size="13" />
                            {{ t('v2.routes.actDetail') }}
                          </FcButton>
                          <FcButton variant="secondary" size="sm" data-testid="act-debug" @click="router.push('/v2/debug')">
                            <FcIcon name="ri-terminal-line" :size="13" />
                            {{ t('v2.routes.actDebug') }}
                          </FcButton>
                          <FcButton variant="secondary" size="sm" data-testid="act-canvas" @click="router.push(`/v2/routes/canvas/${row.id}`)">
                            <FcIcon name="ri-edit-line" :size="13" />
                            {{ t('v2.routes.actCanvas') }}
                          </FcButton>
                          <FcButton variant="secondary" size="sm" data-testid="act-publish" @click="router.push(`/v2/publish/${row.id}`)">
                            <FcIcon name="ri-upload-2-line" :size="13" />
                            {{ t('v2.routes.actPublish') }}
                          </FcButton>
                          <FcButton variant="secondary" size="sm" data-testid="act-copy" @click="onCopy(row)">
                            <FcIcon name="ri-clipboard-line" :size="13" />
                            {{ t('v2.routes.actCopy') }}
                          </FcButton>
                          <!-- P4f 前置票①：下线/删除写操作（门禁照旧页 src/views/routes/List.vue L452-460 +
                               后端 RouteService：offline 仅 PUBLISHED；delete 仅 DRAFT|OFFLINE，PUBLISHED 拒删；
                               CHANGING 两钮都不显——「放弃变更」走 offline 命令后端必拒，不迁死钮） -->
                          <FcButton v-if="canEdit('route') && row.status === 'PUBLISHED'" variant="secondary" size="sm" data-testid="act-offline" @click="onOffline(row)">
                            <FcIcon name="ri-arrow-go-back-line" :size="13" />
                            {{ t('v2.routes.actOffline') }}
                          </FcButton>
                          <FcButton v-if="canEdit('route') && (row.status === 'DRAFT' || row.status === 'OFFLINE')" variant="secondary" size="sm" data-testid="act-delete" @click="onDelete(row)">
                            <FcIcon name="ri-delete-bin-line" :size="13" />
                            {{ t('v2.routes.actDelete') }}
                          </FcButton>
                        </div>
                      </FcSectionCard>
                    </div>
                  </div>
                </td>
              </tr>
          </tbody>
        </table>
      </div>
      <FcEmpty v-else data-testid="route-empty" type="empty" :title="t('v2.routes.empty')" />
    </FcSection>

    <!-- OPT-3 批量失败明细：页根级（不随批量条/选择清空退场），只收后端拒绝项，保留到下次批量启动 -->
    <div v-if="batchFails.length" class="hint-banner is-error bat-fail" data-testid="bat-fail-detail" role="alert">
      <FcIcon name="ri-error-warning-line" :size="14" />
      <div class="bat-fail-body">
        <p class="bat-fail-title">{{ t('v2.routes.batFailTitle') }}</p>
        <ul class="bat-fail-list">
          <li v-for="f in batchFails" :key="f.id" :data-testid="`bat-fail-${f.id}`">
            <span class="rt-name">{{ f.name }}</span>
            <span class="bat-fail-reason">{{ f.reason }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import {
  FcButton,
  FcEmpty,
  FcFilterBar,
  FcFilterBarDivider,
  FcIcon,
  FcInput,
  FcSection,
  FcSectionCard,
  FcSegmented,
  FcSkeleton,
  FcStatusBadge,
  FcTag,
  toast
} from '@/components'
import { deleteRoute, duplicateRoute, listRoutes, offlineRoute, publishRoute, type RouteNode } from '@/api/routes'
import { envelope } from '@/api/http'
import { fetchRouteTimeseries, fetchTrafficSummary, type RouteTrafficSummaryItem } from '@/api/v2'
import { usePermission } from '@/composables/usePermission'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePublishSync } from '@/composables/usePublishSync'

type DisplayRow = RouteNode & { depth: number }
/** OPT-3 批量动作种类（后端无批量端点，执行 = 客户端逐条循环单条端点） */
type BatchAction = 'offline' | 'delete' | 'publish'
/** 批量失败明细项（bat-fail-<id>：route_name + 后端拒绝原因；门禁跳过项不进明细） */
interface BatchFail {
  id: string
  name: string
  reason: string
}
/** 展开行时序状态：loading/ok 即缓存（收起再展开不重复请求），error 允许重试 */
type SparkState =
  | { status: 'loading' }
  | { status: 'ok'; points: { total_requests: number }[] }
  | { status: 'error' }
type BadgeTone = 'success' | 'processing' | 'error' | 'pending' | 'neutral'

const { t } = useI18n()
const router = useRouter()
const { canEdit } = usePermission()
const { confirm: fcConfirm } = useFcConfirm()
// OPT-6 全局同步轮询：整页一个实例（usePublishSync 注释铁律「一个页面实例一个轮询，不要每行一个」）。
// 挂载即 start()（常态首发查询即 synced 终止 = 等效查一次）；批量发布收尾 okCount>0 时重启一轮。
const sync = usePublishSync()

const loading = ref(true)
const rows = ref<DisplayRow[]>([])
const summaries = ref<RouteTrafficSummaryItem[]>([])
const summaryFailed = ref(false)
const statusFilter = ref<string>('ALL')
const keyword = ref('')
const expanded = reactive(new Set<string>())
const sparks = reactive<Record<string, SparkState>>({})
// OPT-3 批量：选择集（Set 跨筛选/展开/单条重拉存活）+ 执行态 + 失败明细（保留到下次批量启动）
const selectedIds = reactive(new Set<string>())
const batchRunning = ref(false)
const batchDone = ref(0)
const batchTotal = ref(0)
const batchFails = ref<BatchFail[]>([])

const summaryById = computed(() => new Map(summaries.value.map((s) => [s.route_id, s])))
const showFallbackHint = computed(() =>
  summaries.value.some((s) => s.source === 'snapshot' && s.quantile_fallback)
)

const segOptions = computed(() => [
  { value: 'ALL', label: t('v2.routes.filterAll') },
  { value: 'PUBLISHED', label: t('v2.routes.statusPublished') },
  { value: 'DRAFT', label: t('v2.routes.statusDraft') },
  { value: 'OFFLINE', label: t('v2.routes.statusOffline') }
])

/** keyword 维度：唯一把行从 DOM 移除的筛选（行移除后选择框随之卸载，选择集本身在状态里存活） */
const keywordRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return rows.value
  return rows.value.filter(
    (r) => r.route_name.toLowerCase().includes(kw) || (r.path ?? '').toLowerCase().includes(kw)
  )
})
/** 可见行 = keyword ∩ 状态（全选 merge 语义 / 全选读数 / 空态分支的作用域） */
const filteredRows = computed(
  () => keywordRows.value.filter((r) => statusFilter.value === 'ALL' || r.status === statusFilter.value)
)
/** 状态维度：行保持挂载仅视觉隐藏（v-show）——筛选外已选可继续读数/保留 */
function rowVisible(row: DisplayRow): boolean {
  return statusFilter.value === 'ALL' || row.status === statusFilter.value
}

/** RouteNode 树平铺（children 下沉一行，带层级缩进） */
function flattenTree(nodes: RouteNode[], depth = 0): DisplayRow[] {
  const out: DisplayRow[] = []
  for (const n of nodes ?? []) {
    out.push({ ...n, depth })
    if (n.children?.length) out.push(...flattenTree(n.children, depth + 1))
  }
  return out
}

// ——— OPT-3 选择态 / 门禁矩阵 ———
/** 可勾选行 = 可见行剔除 CHANGING（三动作均不适用，与单条 act-offline/act-delete 两钮均无同一口径） */
const selectableRows = computed(() => filteredRows.value.filter((r) => r.status !== 'CHANGING'))
/** 表头全选读数：checked=可见可勾选行全选；indeterminate=部分选中 */
const selAllChecked = computed(
  () => selectableRows.value.length > 0 && selectableRows.value.every((r) => selectedIds.has(r.id))
)
const selAllIndeterminate = computed(
  () => !selAllChecked.value && selectableRows.value.some((r) => selectedIds.has(r.id))
)
/** 选中项状态（按全量行集合取——跨筛选/keyword 存活；已消失 id 视为不合格） */
const selectedStatuses = computed(() => {
  const statusById = new Map(rows.value.map((r) => [r.id, r.status]))
  return [...selectedIds].map((id) => statusById.get(id))
})
/** 批量门禁矩阵（照单条口径 + 后端 RouteService）：下线=含 ≥1 PUBLISHED；删除/发布=含 ≥1 DRAFT|OFFLINE */
const batHasPublished = computed(() => selectedStatuses.value.includes('PUBLISHED'))
const batHasRepub = computed(() => selectedStatuses.value.some((s) => s === 'DRAFT' || s === 'OFFLINE'))
/** 混合态不可操作计数（按钮可用且 >0 时出「{n} 项不可X」提示） */
const batIneligibleOffline = computed(() => selectedStatuses.value.filter((s) => s !== 'PUBLISHED').length)
const batIneligibleDelete = computed(
  () => selectedStatuses.value.filter((s) => s !== 'DRAFT' && s !== 'OFFLINE').length
)
const batIneligiblePublish = batIneligibleDelete // 同一门禁（DRAFT|OFFLINE）

onMounted(() => {
  void reload()
  // reload 与同步轮询并行（reload 内不 start——批量下线/删除后的 reload 不得重启轮询）
  sync.start()
})

// —— OPT-6 同步 chip 派生（phase 语义同 usePublishSync 终态原样）——
const syncPhase = computed(() => sync.phase.value)

const syncLabel = computed(() => {
  switch (syncPhase.value) {
    case 'polling': return t('v2.routes.syncSyncing')
    case 'synced': return t('v2.routes.syncSynced')
    case 'delayed': return t('v2.routes.syncDelayed')
    default: return ''
  }
})

const syncIcon = computed(() => {
  switch (syncPhase.value) {
    case 'synced': return 'ri-check-line'
    case 'delayed': return 'ri-error-warning-line'
    default: return 'ri-time-line'
  }
})

/** 路由树与流量聚合并行加载；任一失败互不拖垮（降级：空态 / 错误条 + 流量列 —） */
async function reload() {
  loading.value = true
  const [routeRes, trafficRes] = await Promise.allSettled([listRoutes(), fetchTrafficSummary()])
  rows.value = routeRes.status === 'fulfilled' ? flattenTree(routeRes.value) : []
  if (trafficRes.status === 'fulfilled') {
    summaries.value = trafficRes.value
    summaryFailed.value = false
  } else {
    summaries.value = []
    summaryFailed.value = true
  }
  loading.value = false
}

function goCreate() {
  void router.push('/v2/routes/wizard')
}

function summaryOf(id: string): RouteTrafficSummaryItem | undefined {
  return summaryById.value.get(id)
}

function isOpen(id: string): boolean {
  return expanded.has(id)
}

function toggleRow(id: string) {
  if (expanded.has(id)) {
    expanded.delete(id)
    return
  }
  expanded.add(id)
  void ensureSpark(id)
}

/** 行点击展开：按钮/链接等交互元素冒泡时不触发 */
function onRowClick(row: DisplayRow, event: Event) {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, input')) return
  toggleRow(row.id)
}

/** 懒加载 + 按行缓存：ok/loading 期间直接返回，仅 error 允许重试 */
async function ensureSpark(id: string) {
  const cur = sparks[id]
  if (cur && (cur.status === 'ok' || cur.status === 'loading')) return
  sparks[id] = { status: 'loading' }
  try {
    const res = await fetchRouteTimeseries(id, '24h', '1h')
    sparks[id] = {
      status: 'ok',
      points: (res.data_points ?? []).map((p) => ({ total_requests: toNum(p.total_requests) || 0 }))
    }
  } catch {
    sparks[id] = { status: 'error' }
  }
}

function sparkOf(id: string): SparkState | undefined {
  return sparks[id]
}

function sparkPoints(id: string): { total_requests: number }[] {
  const s = sparks[id]
  return s?.status === 'ok' ? s.points : []
}

/** 迷你条形图高度：相对最大值归一，最低 8% 保证可见 */
function barHeight(p: { total_requests: number }, id: string): string {
  const pts = sparkPoints(id)
  const max = Math.max(...pts.map((x) => x.total_requests), 1)
  return `${Math.max(8, Math.round((p.total_requests / max) * 100))}%`
}

/** Long→String 契约兜底：数值/数值字符串归一，null/undefined → NaN（展示为 —） */
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** 命中量千分位缩写：<1k 原样；k 取整；M/B 保留一位小数去尾 0（312000→312k，1.2M） */
function formatHits(hits: unknown): string {
  const n = toNum(hits)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e9) return `${trimUnit(n / 1e9)}B`
  if (n >= 1e6) return `${trimUnit(n / 1e6)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

function trimUnit(v: number): string {
  const s = v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function formatMs(v: unknown): string {
  const n = toNum(v)
  return Number.isFinite(n) ? `${n} ms` : '—'
}

/** upstream_url → host（10.0.0.11:9001）；空/非法回退原文或 — */
function upstreamHost(url?: string): string {
  if (!url) return '—'
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

interface FlowChip {
  text: string
  /** FcTag 色板：primary=蓝(info 系) / success=绿(ok 系) / brand / gray */
  color: 'primary' | 'gray' | 'success' | 'brand'
  /** FcTag 色板没有的色相（violet 系）挂此类，由页面局部 token 覆写 --tag-color/--tag-ink */
  cls?: string
}

/**
 * 行内链路 chips（P3-2 三段分色）：匹配=info 系 / 插件=violet 系 / 上游=ok 系；
 * 分发路由：匹配 → 决策树 → 分支数（决策树保持 brand、分支数为中性元数据）。
 */
function flowChips(row: DisplayRow): FlowChip[] {
  if (row.route_type === 'DISPATCH') {
    return [
      { text: t('v2.routes.flowMatch'), color: 'primary' },
      { text: t('v2.routes.decisionTree'), color: 'brand' },
      { text: t('v2.routes.branchCount', { n: row.children?.length ?? 0 }), color: 'gray' }
    ]
  }
  return [
    { text: t('v2.routes.flowMatch'), color: 'primary' },
    { text: t('v2.routes.pluginCount', { n: row.plugins?.length ?? 0 }), color: 'primary', cls: 'rt-chip-violet' },
    { text: upstreamHost(row.upstream_url), color: 'success' }
  ]
}

/** 状态徽章：上游不可达优先于枚举状态显示 */
function statusBadge(row: DisplayRow): { label: string; tone: BadgeTone } {
  const up = summaryOf(row.id)?.upstream
  if (up && up.reachable === false) {
    return { label: t('v2.routes.upstreamUnreachable'), tone: 'pending' }
  }
  switch (row.status) {
    case 'PUBLISHED':
      return { label: t('v2.routes.statusPublished'), tone: 'success' }
    case 'CHANGING':
      return { label: t('v2.routes.statusChanging'), tone: 'processing' }
    case 'OFFLINE':
      return { label: t('v2.routes.statusOffline'), tone: 'neutral' }
    default:
      return { label: t('v2.routes.statusDraft'), tone: 'neutral' }
  }
}

/** 健康列：summary.upstream 缺失 → 未知；reachable=false → 不可达；否则正常 */
function healthBadge(row: DisplayRow): { label: string; tone: BadgeTone } {
  const up = summaryOf(row.id)?.upstream
  if (!up) return { label: t('v2.routes.healthUnknown'), tone: 'neutral' }
  return up.reachable === false
    ? { label: t('v2.routes.healthBad'), tone: 'error' }
    : { label: t('v2.routes.healthOk'), tone: 'success' }
}

/** 上游卡片标签：健康态 + 探测时延（正常 · 8 ms） */
function upstreamLatencyLabel(row: DisplayRow): string {
  const up = summaryOf(row.id)?.upstream
  if (!up) return t('v2.routes.healthUnknown')
  const base = up.reachable === false ? t('v2.routes.healthBad') : t('v2.routes.healthOk')
  const ms = toNum(up.latency_ms)
  return Number.isFinite(ms) ? `${base} · ${ms} ms` : base
}

/** 插件链卡片：按 sort_order 排序 */
function sortedPlugins(row: DisplayRow) {
  return [...(row.plugins ?? [])].sort((a, b) => a.sort_order - b.sort_order)
}

async function onCopy(row: DisplayRow) {
  try {
    await duplicateRoute(row.id)
    toast.success(t('v2.routes.copySuccess'))
  } catch (e) {
    toast.error(e instanceof Error && e.message ? e.message : t('v2.routes.copyFailed'))
  }
}

/**
 * 单条命令端点信封归一：offline/delete/publish 三个控制器返回裸实体（非 ApiResponse），
 * 而业务拒绝走 AdminGlobalExceptionHandler → HTTP 200 + 失败信封（code≠0）。
 * 裸 http 调用会把失败信封当成功 resolve（成功 toast / 批量计成功）——必须过
 * envelope()：code≠0 抛 BusinessError（进 catch → 错误 toast / 批量失败明细），
 * 成功裸实体或空体（delete 返回 void）原样透传。
 */
function execCommand(p: Promise<unknown>): Promise<unknown> {
  return envelope(p)
}

/** 下线（语义照旧树 src/views/routes/List.vue L363-374）：confirm(danger) → offlineRoute → toast + 重拉；失败不重拉 */
async function onOffline(row: DisplayRow) {
  const ok = await fcConfirm({ title: t('v2.routes.confirmOffline'), variant: 'danger' })
  if (!ok) return
  try {
    await execCommand(offlineRoute(row.id))
    toast.success(t('v2.routes.offlineSuccess'))
    await reload()
    pruneSelection()
  } catch (e) {
    toast.error(e instanceof Error && e.message ? e.message : t('v2.routes.offlineFailed'))
  }
}

/** 删除（照旧页 L375-385 + L490-495，删除确认升 danger）：confirm → deleteRoute → 行消失 + toast + 重拉；失败不重拉 */
async function onDelete(row: DisplayRow) {
  const ok = await fcConfirm({
    title: t('v2.routes.confirmDeleteTitle'),
    content: t('v2.routes.confirmDelete'),
    variant: 'danger'
  })
  if (!ok) return
  try {
    await execCommand(deleteRoute(row.id))
    toast.success(t('v2.routes.deleteSuccess'))
    await reload()
    pruneSelection()
  } catch (e) {
    toast.error(e instanceof Error && e.message ? e.message : t('v2.routes.deleteFailed'))
  }
}

// ═══════════ OPT-3 批量操作（v2 优化建议 #2，对标 APISIX）═══════════
// 后端零改动：执行 = 客户端逐条顺序 await 单条端点（进度只有逐条才有；bulk* 端点为 P3 未来切换候选）。
// 门禁矩阵照单条口径（offline 仅 PUBLISHED；delete/publish 仅 DRAFT|OFFLINE）；
// 收尾矩阵：全成 → success + 重拉一次 + 清空；部分失败 → warning + 明细 + 重拉 + 清空；
// 全败 → error + 明细 + 不重拉（单条「失败不重拉」口径的批量延伸）。

/**
 * 批量执行纯函数：逐条顺序 await（非并行——进度可见、后端压力可控），
 * 单条失败不中断后续（逐条尝试不因单条失败中断）；只收集「后端拒绝项」，
 * 门禁跳过项由调用方先过滤，不经过本函数、不进明细。
 */
async function runBatch(
  ids: string[],
  exec: (id: string) => Promise<unknown>,
  onProgress?: (done: number) => void
): Promise<{ fails: Array<{ id: string; reason: string }> }> {
  const fails: Array<{ id: string; reason: string }> = []
  let done = 0
  for (const id of ids) {
    try {
      await exec(id)
    } catch (e) {
      fails.push({ id, reason: e instanceof Error && e.message ? e.message : String(e) })
    }
    done += 1
    onProgress?.(done)
  }
  return { fails }
}

/** 批量 confirm / 成功 / 全败 toast 的 i18n key（v2.routes.* 树） */
const BATCH_T: Record<BatchAction, { confirm: string; success: string; failed: string }> = {
  offline: { confirm: 'batOfflineConfirm', success: 'batOfflineSuccess', failed: 'batOfflineFailed' },
  delete: { confirm: 'batDeleteConfirm', success: 'batDeleteSuccess', failed: 'batDeleteFailed' },
  publish: { confirm: 'batPublishConfirm', success: 'batPublishSuccess', failed: 'batPublishFailed' }
}

/** 执行前门禁过滤：仅合格项调用 API，不合格项跳过（不计入失败明细） */
function batchQualified(action: BatchAction, status: RouteNode['status']): boolean {
  if (action === 'offline') return status === 'PUBLISHED'
  return status === 'DRAFT' || status === 'OFFLINE'
}

/** 单条端点分发（批量发布不传 changeDescription，保持无 body 兼容契约）；信封归一见 execCommand */
function batchExec(action: BatchAction, id: string): Promise<unknown> {
  if (action === 'offline') return execCommand(offlineRoute(id))
  if (action === 'delete') return execCommand(deleteRoute(id))
  return execCommand(publishRoute(id))
}

/** 行勾选：CHANGING 行禁选兜底回拨（真浏览器 disabled 拦得住，jsdom 激活仍派发，双保险） */
function onRowCheck(row: DisplayRow, e: Event) {
  const input = e.target as HTMLInputElement
  if (row.status === 'CHANGING') {
    input.checked = false
    return
  }
  if (input.checked) selectedIds.add(row.id)
  else selectedIds.delete(row.id)
}

/** 表头全选（merge 语义照 ImportExport）：仅把可见可勾选行并入/移出，筛选外已选保留 */
function onSelAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  for (const r of selectableRows.value) {
    if (checked) selectedIds.add(r.id)
    else selectedIds.delete(r.id)
  }
}

function clearSelection() {
  selectedIds.clear()
}

/** 单条写操作成功重拉后，选择集剔除已消失 id（幽灵计数防护） */
function pruneSelection() {
  const alive = new Set(rows.value.map((r) => r.id))
  for (const id of [...selectedIds]) {
    if (!alive.has(id)) selectedIds.delete(id)
  }
}

/** 批量入口：confirm(danger, {n=合格项数}) → 门禁过滤 → runBatch 逐条 → 收尾矩阵 */
async function runBatchAction(action: BatchAction) {
  if (batchRunning.value) return
  const qualified = rows.value
    .filter((r) => selectedIds.has(r.id) && batchQualified(action, r.status))
    .map((r) => r.id)
  if (!qualified.length) return
  const agreed = await fcConfirm({
    variant: 'danger',
    title: t(`v2.routes.${BATCH_T[action].confirm}`, { n: qualified.length })
  })
  if (!agreed) return
  batchFails.value = [] // 明细保留到下次批量启动：启动时清上一轮（confirm 取消不算启动）
  batchRunning.value = true
  batchDone.value = 0
  batchTotal.value = qualified.length
  const nameById = new Map(rows.value.map((r) => [r.id, r.route_name]))
  const { fails } = await runBatch(
    qualified,
    (id) => batchExec(action, id),
    (done) => { batchDone.value = done }
  )
  batchRunning.value = false
  const okCount = qualified.length - fails.length
  if (fails.length) {
    batchFails.value = fails.map((f) => ({ ...f, name: nameById.get(f.id) ?? f.id }))
  }
  if (!fails.length) {
    // 全部成功 → success + 同步轮询重启（仅发布；配置真变了）+ 重拉一次 + 清空选择
    toast.success(t(`v2.routes.${BATCH_T[action].success}`, { n: okCount }))
    if (action === 'publish') sync.start()
    await reload()
    selectedIds.clear()
  } else if (okCount > 0) {
    // 部分失败 → warning({ok} 成 {fail} 败) + 明细 + 同步轮询重启（仅发布）+ 重拉一次 + 清空选择
    toast.warning(t('v2.routes.batPartial', { ok: okCount, fail: fails.length }))
    if (action === 'publish') sync.start()
    await reload()
    selectedIds.clear()
  } else {
    // 全部失败 → error + 明细 + 不重拉 + 不重启同步轮询 + 保留选择（便于修正后重试）
    toast.error(t(`v2.routes.${BATCH_T[action].failed}`))
  }
}
</script>

<style scoped lang="scss">
/* —— 提示条（快照兜底 / 流量加载失败）—— */
.hint-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);

  &.is-warn {
    color: var(--app-color-warning-text-on-tint);
    background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-warning) 30%, transparent);
  }

  &.is-error {
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  }
}

/* —— P1-1b: 窄视口横向溢出收口 —— 表格在自身容器内横滚，页面 body 不再被撑开。
   min-width:0 允许容器在 flex/grid 祖先里收缩到可用宽度以下再出滚动条。 */
.rt-table-scroll {
  min-width: 0;
  overflow-x: auto;
}

/* —— 语义化表格（token only）—— */
.rt-table {
  width: 100%;
  /* 可读下限：容器窄于 720px 时容器内出横滚，而不是把 7 列压扁 */
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;

  th {
    padding: 8px 12px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
    border-bottom: 1px solid var(--app-separator);
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--app-border-extra-light);
    color: var(--app-text);
    vertical-align: middle;
  }
}

.col-name {
  white-space: nowrap;
}

/* —— OPT-3 选择列 —— */
.col-check {
  width: 36px;
  white-space: nowrap;
}

/* 列表头居中需压过 .rt-table th 的左对齐（同 th.col-num 手法：同级特异性，靠源顺序在后生效） */
th.col-check {
  text-align: center;
}

td.col-check {
  text-align: center;
}

.bat-check {
  width: 14px;
  height: 14px;
  margin: 0;
  vertical-align: middle;
  accent-color: var(--app-primary);
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
  }
}

/* —— OPT-3 批量条（跟随页面工具条视觉，token only）——
   flex-wrap：375 宽下按钮/提示换行，不横向溢出 */
.bat-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-separator);
}

.bat-count {
  font-weight: 600;
  color: var(--app-text);
}

.bat-hint {
  color: var(--app-text-tertiary);
}

.bat-progress {
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* —— OPT-6 全局同步 chip（工具条区，route-create 同区；整页恰一枚不随行渲染。
   三态染色 token only，配方同 .hint-banner；flex-wrap 防止 375 溢出）—— */
.lst-sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  border-radius: var(--app-radius-full);
  border: 1px solid transparent;
  white-space: nowrap;

  &.is-polling {
    color: var(--app-accent-text-on-tint);
    background: color-mix(in srgb, var(--app-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-primary) 30%, transparent);
  }

  &.is-synced {
    color: var(--app-color-success-text-on-tint);
    background: color-mix(in srgb, var(--app-color-success) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-success) 30%, transparent);
  }

  &.is-delayed {
    color: var(--app-color-warning-text-on-tint);
    background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
    border-color: color-mix(in srgb, var(--app-color-warning) 30%, transparent);
  }
}

.lst-sync-retry {
  height: 20px;
  padding: 0 6px;
}

/* —— OPT-3 批量失败明细（页根级告警条；复用 .hint-banner is-error 底版）—— */
.bat-fail {
  align-items: flex-start;
}

.bat-fail-body {
  min-width: 0;
}

.bat-fail-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.bat-fail-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bat-fail-list .rt-name {
  margin-right: 8px;
}

.bat-fail-reason {
  color: color-mix(in srgb, var(--app-color-danger) 70%, var(--app-text));
}

.col-num {
  text-align: right;
}

/* 数字列表头右对齐需压过 .rt-table th 的左对齐（同级特异性，靠源顺序在后生效） */
th.col-num {
  text-align: right;
}

.col-num .rt-num {
  display: inline-block;
  min-width: 3em;
  font-variant-numeric: tabular-nums;
}

.rt-row {
  cursor: pointer;

  &:hover,
  &.is-open {
    background: var(--app-bg-muted);
  }
}

/* 展开态箭头朝下，收起朝右（旋转过渡，PRM 兜底） */
.rt-toggle {
  margin-right: 4px;
  vertical-align: middle;

  .fc-icon {
    transition: transform 0.15s ease;
    transform: rotate(-90deg);
  }

  &.is-open .fc-icon {
    transform: rotate(0deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rt-toggle .fc-icon {
    transition: none;
  }
}

.rt-name {
  font-weight: 600;
}

.rt-path,
.rt-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* —— 行内链路 chips —— */
/* P3-2 三段分色：匹配=info 系（FcTag primary，蓝）· 插件=violet 系 · 上游=ok 系（FcTag success）。
   violet 系在全局语义 token（success/warning/danger/primary）里没有对应档，
   就近定义页面作用域 token（字面值只出现在 token 定义层，等价 app-aliases 模式）；
   规则本体一律走 token —— 墨色向 --app-text 混，light/dark 自动翻转，不按主题写死。 */
.v2-route-list {
  --rt-violet: #7c5cff;
}

.rt-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

/* 覆写 FcTag 内部的色调/墨色变量：底 = 12% violet 染色底（与 FcTag 各色档同一配方），
   墨 = 60% violet + 40% 主题前景（浅色主题得深 violet、深色主题得浅 violet，均过 4.5:1） */
.rt-flow :deep(.rt-chip-violet) {
  --tag-color: var(--rt-violet);
  --tag-ink: color-mix(in srgb, var(--rt-violet) 60%, var(--app-text));
}

.rt-arrow {
  display: inline-flex;
  color: var(--app-text-quaternary);
}

/* —— 展开行：spark + 三卡片 —— */
.rt-detail-row td {
  padding: 0;
}

.rt-detail {
  padding: 14px 16px;
  background: color-mix(in srgb, var(--app-primary) 4%, var(--app-bg-card));
}

.rt-spark-wrap {
  margin-bottom: 12px;
}

/* P3-1: 时序不可用占位 —— 弱文案（三级灰），不用警示红（加载失败已有 traffic-error 全局条） */
.rt-spark-err {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.rt-spark-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 28px;
}

.rt-spark-bar {
  flex: 0 0 auto;
  width: 5px;
  border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--app-primary) 55%, transparent);
}

.rt-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .rt-cards {
    grid-template-columns: 1fr;
  }
}

.rt-card-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.rt-card-body {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.rt-wrap {
  flex-wrap: wrap;
}

/* 焦点环兜底：本页内所有可聚焦元素统一 token 焦点环 */
.v2-route-list :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
</style>
