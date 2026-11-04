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
        <template #actions>
          <FcButton v-if="canEdit('route')" variant="primary" data-testid="route-create" :icon="Plus" @click="goCreate">
            {{ t('v2.routes.create') }}
          </FcButton>
        </template>
      </FcFilterBar>

      <FcSkeleton v-if="loading" variant="text" :rows="8" />
      <!--
        行级 DOM 契约（S3-T）：data-testid=route-row-<id> 必须包裹该行全部单元格 testid，
        el-table 无行级 attrs 挂载点，故本页用语义化 <table> + Fc 原子组件（SDK 惯例分支），
        颜色/圆角/阴影全部走 token。
      -->
      <table v-else-if="filteredRows.length" class="rt-table">
        <thead>
          <tr>
            <th scope="col" class="col-name">{{ t('v2.routes.colName') }}</th>
            <th scope="col">{{ t('v2.routes.colPath') }}</th>
            <th scope="col">{{ t('v2.routes.colFlow') }}</th>
            <th scope="col">{{ t('v2.routes.colStatus') }}</th>
            <th scope="col" class="col-num">{{ t('v2.routes.colHits') }}</th>
            <th scope="col" class="col-num">{{ t('v2.routes.colP95') }}</th>
            <th scope="col">{{ t('v2.routes.colHealth') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in filteredRows" :key="row.id">
            <tr class="rt-row" :class="{ 'is-open': isOpen(row.id) }" :data-testid="`route-row-${row.id}`" @click="onRowClick(row, $event)">
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
                    <FcTag :color="chip.color" size="sm" data-testid="flow-chip">{{ chip.text }}</FcTag>
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
              <td :colspan="7">
                <div class="rt-detail" :data-testid="`route-detail-${row.id}`">
                  <div class="rt-spark-wrap">
                    <FcSkeleton v-if="sparkOf(row.id)?.status === 'loading'" variant="text" :rows="1" />
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
                      </div>
                    </FcSectionCard>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <FcEmpty v-else data-testid="route-empty" type="empty" :title="t('v2.routes.empty')" />
    </FcSection>
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
import { duplicateRoute, listRoutes, type RouteNode } from '@/api/routes'
import { fetchRouteTimeseries, fetchTrafficSummary, type RouteTrafficSummaryItem } from '@/api/v2'
import { usePermission } from '@/composables/usePermission'

type DisplayRow = RouteNode & { depth: number }
/** 展开行时序状态：loading/ok 即缓存（收起再展开不重复请求），error 允许重试 */
type SparkState =
  | { status: 'loading' }
  | { status: 'ok'; points: { total_requests: number }[] }
  | { status: 'error' }
type BadgeTone = 'success' | 'processing' | 'error' | 'pending' | 'neutral'

const { t } = useI18n()
const router = useRouter()
const { canEdit } = usePermission()

const loading = ref(true)
const rows = ref<DisplayRow[]>([])
const summaries = ref<RouteTrafficSummaryItem[]>([])
const summaryFailed = ref(false)
const statusFilter = ref<string>('ALL')
const keyword = ref('')
const expanded = reactive(new Set<string>())
const sparks = reactive<Record<string, SparkState>>({})

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

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (statusFilter.value !== 'ALL' && r.status !== statusFilter.value) return false
    if (!kw) return true
    return r.route_name.toLowerCase().includes(kw) || (r.path ?? '').toLowerCase().includes(kw)
  })
})

/** RouteNode 树平铺（children 下沉一行，带层级缩进） */
function flattenTree(nodes: RouteNode[], depth = 0): DisplayRow[] {
  const out: DisplayRow[] = []
  for (const n of nodes ?? []) {
    out.push({ ...n, depth })
    if (n.children?.length) out.push(...flattenTree(n.children, depth + 1))
  }
  return out
}

onMounted(() => {
  void reload()
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
  color: 'primary' | 'gray' | 'brand'
}

/** 行内链路 chips：匹配 → N 插件 / 决策树 → 上游 host / 分支数（arrow 分隔） */
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
    { text: t('v2.routes.pluginCount', { n: row.plugins?.length ?? 0 }), color: 'gray' },
    { text: upstreamHost(row.upstream_url), color: 'gray' }
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

/* —— 语义化表格（token only）—— */
.rt-table {
  width: 100%;
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
.rt-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
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
