<!--
  S8-C：v2 路由详情页（原型 prototype-v2/07-route-detail.html + shots/07-route-detail.png）。
  分区：页头 / 请求链路（静态预览） / 四联图（SVG 自绘） / 变更历史（diff 懒加载） / 操作记录。
  裁决落点（契约 §4 S8）：① 页头 = listRoutes() 树递归 find，无 id 或 BusinessError(10601 主 /
  10400 兼容) → dtl-not-found（DecisionTree 口径）；② 链路 = 静态预览，dur 位一律 '—' 不造数，
  「N 实例」禁渲染（S2 单上游语义）；③ 四联图 = SVG 自绘，snapshot 提示只跟 timeseries source，
  页头不加第二处；状态码环走 fetchTrafficSummary 按 route_id find 的三桶；④ 历史 = getRouteVersions
  按返回序 + diff 懒加载 (id, 前一版本, 本版本)，changeType 全枚举映射；⑤ 命中日志是硬缺口 →
  卡如实降级「操作记录」= listAuditLogs({ target, page:1, pageSize:5 })，action/actor 原文直出；
  ⑥ 刷新 = 手动按钮，只重发 traffic + timeseries；⑦ canEdit=false 时发布/编辑动作不渲染。
  V14：五源 allSettled 并行、分区独立降级。OPT-6：页头加 per-route 同步角标（dtl-sync-badge，
  getRouteSyncStatus 挂载/手动刷新各查一次、独立 try/catch 不并入五源、失败/旧版404 → 不渲染）。
  DOM 契约（dtl-*）与 i18n 全表（v2.detail.* 31 key）
  见 __tests__/Detail.test.ts 头注释。
-->
<template>
  <div class="dtl-page" data-testid="dtl-page">
    <FcSection>
      <FcSkeleton v-if="loading" variant="text" :rows="8" />

      <!-- Route missing: BusinessError 10601 primary / 10400 compat, DecisionTree contract -->
      <FcEmpty v-else-if="notFound" data-testid="dtl-not-found" type="empty" :title="t('v2.detail.notFound')" />

      <!-- Tree load failed (non not-found): error bar only, the page never crashes -->
      <div v-else-if="loadFailed" class="hint-banner is-error" data-testid="dtl-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.detail.errorLoad') }}</span>
      </div>

      <!-- 375 viewport: horizontal scroll lives inside this container, the body is never stretched -->
      <div v-else class="dtl-scroll" data-testid="dtl-scroll">
        <!-- header -->
        <div class="dtl-header" data-testid="dtl-header">
          <div class="dtl-head-main">
            <div class="dtl-title-row">
              <h1 class="dtl-name" data-testid="dtl-name">{{ node?.route_name }}</h1>
              <!-- raw dictionary value on purpose (contract: no i18n mapping for dtl-status) -->
              <span class="dtl-status dtl-mono" data-testid="dtl-status">{{ node?.status }}</span>
              <span v-if="node?.environment" class="dtl-env dtl-mono" data-testid="dtl-environment">{{ node.environment }}</span>
              <!-- OPT-6 per-route sync badge: rendered only after a successful query
                   (hidden while querying / on failure / on legacy 404). No dedicated
                   retry button - re-check goes through the existing dtl-refresh. -->
              <span
                v-if="syncState"
                class="dtl-sync"
                :class="`is-${syncState}`"
                :data-state="syncState"
                data-testid="dtl-sync-badge"
                role="status"
              >
                <FcIcon :name="syncIcon" :size="12" />
                {{ syncLabel }}
              </span>
            </div>
            <div class="dtl-meta-row">
              <FcTag class="dtl-mono" data-testid="dtl-path" color="gray" size="sm">{{ node?.path || t('v2.routes.placeholder') }}</FcTag>
              <span class="dtl-chiplike" data-testid="dtl-plugin-count">{{ t('v2.detail.pluginCount', { n: sortedPlugins.length }) }}</span>
              <span class="dtl-plugins">
                <FcTag v-for="p in sortedPlugins" :key="p.plugin_id" color="gray" size="sm" :data-testid="`dtl-plugin-chip-${p.plugin_id}`">
                  {{ p.plugin_name }}
                </FcTag>
              </span>
              <span v-if="childCount > 0" class="dtl-chiplike" data-testid="dtl-child-count">{{ t('v2.detail.childCount', { n: childCount }) }}</span>
            </div>
            <div class="dtl-stat-row">
              <span class="dtl-stat" data-testid="dtl-hits">
                <FcIcon name="ri-bar-chart-2-line" :size="13" />
                {{ t('v2.detail.hitsLabel') }}
                <b>{{ hitsText }}</b>
              </span>
              <span class="dtl-stat" data-testid="dtl-qps">
                <FcIcon name="ri-flashlight-line" :size="13" />
                {{ t('v2.detail.qpsLabel') }}
                <b>{{ qpsText }}</b>
              </span>
            </div>
          </div>
          <div class="dtl-head-actions">
            <FcButton v-if="canEdit('route')" variant="primary" size="sm" data-testid="dtl-action-publish" @click="goPublish">
              <FcIcon name="ri-upload-2-line" :size="13" />
              {{ t('v2.routes.actPublish') }}
            </FcButton>
            <FcButton v-if="canEdit('route') && !editOpen" variant="secondary" size="sm" data-testid="dtl-action-edit" @click="openEdit">
              <FcIcon name="ri-edit-line" :size="13" />
              {{ t('common.edit') }}
            </FcButton>
            <FcButton variant="text" size="sm" data-testid="dtl-refresh" @click="refresh">
              <FcIcon name="ri-refresh-line" :size="13" />
              {{ t('v2.detail.refresh') }}
            </FcButton>
          </div>
        </div>

        <!-- P4c-2: in-page edit state. Mount point dtl-edit-panel hosts RouteEditForm;
             hidden while closed, re-openable; the edit button hides while editing so the
             form is never remounted (draft loss). saved = reload header data. -->
        <div v-if="editOpen" class="dtl-edit-panel" data-testid="dtl-edit-panel">
          <RouteEditForm :route-id="routeId" @saved="onEditSaved" @close="editOpen = false" />
        </div>

        <!-- request chain (static preview, node order = evaluation order) -->
        <div class="dtl-card" data-testid="dtl-chain">
          <div class="dtl-card-h"><b>{{ t('v2.detail.chainTitle') }}</b></div>
          <div class="dtl-chain-flow">
            <template v-for="(cn, i) in chainNodes" :key="cn.key">
              <span v-if="i > 0" class="dtl-chain-arrow" aria-hidden="true"><FcIcon name="ri-arrow-right-s-line" :size="13" /></span>
              <div class="dtl-chain-node" :data-testid="`dtl-chain-node-${cn.key}`">
                <span class="dtl-chain-chip" :class="cn.tone">
                  <FcIcon :name="cn.icon" :size="13" />
                  <span class="dtl-chain-label">{{ cn.label }}</span>
                  <span v-if="cn.sub" class="dtl-chain-sub dtl-mono">{{ cn.sub }}</span>
                </span>
                <span class="dtl-chain-meta">
                  <!-- segment durations have no data source: placeholder only, never fabricated -->
                  <span class="dtl-chain-dur dtl-mono" :data-testid="`dtl-chain-dur-${cn.key}`">{{ t('v2.routes.placeholder') }}</span>
                  <span v-if="cn.key === 'response' && responseP95" class="dtl-chain-extra">{{ responseP95 }}</span>
                </span>
              </div>
            </template>
          </div>
        </div>

        <!-- four charts (hand-drawn SVG, per-source independent degradation) -->
        <div class="dtl-charts" data-testid="dtl-charts">
          <div v-if="tsFailed" class="hint-banner is-error" data-testid="dtl-charts-error" role="alert">
            <FcIcon name="ri-error-warning-line" :size="14" />
            <span>{{ t('v2.detail.errorCharts') }}</span>
          </div>
          <!-- keyed on the timeseries source only (contract: header gets no second hint) -->
          <div v-if="showSnapshotHint" class="hint-banner is-warn" data-testid="dtl-snapshot-hint" role="status">
            <FcIcon name="ri-error-warning-line" :size="14" />
            <span>{{ t('v2.detail.snapshotHint') }}</span>
          </div>
          <div class="dtl-charts-row">
            <div class="dtl-card" data-testid="dtl-chart-qps">
              <div class="dtl-card-h"><b>{{ t('v2.detail.qpsTitle') }}</b></div>
              <svg v-if="qpsPoints" class="dtl-chart" viewBox="0 0 260 88" role="img" :aria-label="t('v2.detail.qpsTitle')">
                <line class="dtl-grid" x1="0" y1="21" x2="260" y2="21" />
                <line class="dtl-grid" x1="0" y1="44" x2="260" y2="44" />
                <line class="dtl-grid" x1="0" y1="67" x2="260" y2="67" />
                <polyline class="dtl-line is-primary" :points="qpsPoints" />
              </svg>
              <div v-else class="dtl-chart-empty">{{ t('v2.routes.placeholder') }}</div>
            </div>

            <div class="dtl-card" data-testid="dtl-chart-latency">
              <div class="dtl-card-h">
                <b>{{ t('v2.detail.latencyTitle') }}</b>
                <span class="dtl-legend">
                  <span v-if="hasP50" class="dtl-legend-item"><i class="dtl-legend-dot is-p50" aria-hidden="true"></i>{{ LEGEND_P50 }}</span>
                  <span v-if="hasP95" class="dtl-legend-item"><i class="dtl-legend-dot is-p95" aria-hidden="true"></i>{{ LEGEND_P95 }}</span>
                </span>
              </div>
              <svg v-if="hasP50 || hasP95" class="dtl-chart" viewBox="0 0 260 88" role="img" :aria-label="t('v2.detail.latencyTitle')">
                <line class="dtl-grid" x1="0" y1="21" x2="260" y2="21" />
                <line class="dtl-grid" x1="0" y1="44" x2="260" y2="44" />
                <line class="dtl-grid" x1="0" y1="67" x2="260" y2="67" />
                <!-- snapshot source lacks p50: the p95 line degrades to a single line -->
                <polyline v-if="hasP50" class="dtl-line is-secondary" :points="p50Points" />
                <polyline v-if="hasP95" class="dtl-line is-primary" :points="p95Points" />
              </svg>
              <div v-else class="dtl-chart-empty">{{ t('v2.routes.placeholder') }}</div>
            </div>

            <div class="dtl-card" data-testid="dtl-chart-error">
              <div class="dtl-card-h"><b>{{ t('v2.detail.errorRateTitle') }}</b></div>
              <svg v-if="errorBars.length" class="dtl-chart" viewBox="0 0 260 88" role="img" :aria-label="t('v2.detail.errorRateTitle')">
                <line class="dtl-grid" x1="0" y1="44" x2="260" y2="44" />
                <line class="dtl-grid" x1="0" y1="67" x2="260" y2="67" />
                <rect v-for="(bar, i) in errorBars" :key="i" class="dtl-bar" :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h" rx="2" />
              </svg>
              <div v-else class="dtl-chart-empty">{{ t('v2.routes.placeholder') }}</div>
            </div>

            <div class="dtl-card" data-testid="dtl-chart-status">
              <div class="dtl-card-h"><b>{{ t('v2.detail.statusCodeTitle') }}</b></div>
              <div v-if="statusView" class="dtl-status-body">
                <svg class="dtl-ring" viewBox="0 0 74 74" role="img" :aria-label="t('v2.detail.statusCodeTitle')">
                  <circle class="dtl-ring-track" cx="37" cy="37" r="30" />
                  <g transform="rotate(-90 37 37)">
                    <circle v-for="seg in statusView.segs" :key="seg.key" class="dtl-ring-seg" :class="`is-${seg.name}`" cx="37" cy="37" r="30" :stroke-dasharray="seg.dash" :stroke-dashoffset="seg.offset" />
                  </g>
                  <text class="dtl-ring-num" x="37" y="41" text-anchor="middle">{{ statusView.pct2 }}</text>
                </svg>
                <div class="dtl-buckets">
                  <div v-for="seg in statusView.segs" :key="seg.key" class="dtl-bucket" :data-testid="`dtl-bucket-${seg.key}`">
                    <i class="dtl-bucket-dot" :class="`is-${seg.name}`" aria-hidden="true"></i>
                    <span class="dtl-bucket-name dtl-mono">{{ seg.name }}</span>
                    <b class="dtl-bucket-val">{{ seg.hits }}</b>
                    <span class="dtl-bucket-pct">{{ seg.pct }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="dtl-status-empty" data-testid="dtl-status-empty">
                <FcIcon name="ri-inbox-line" :size="18" />
                <span>{{ t('v2.detail.statusEmpty') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- history + operation log + lazy diff -->
        <div class="dtl-bottom">
          <div class="dtl-card" data-testid="dtl-history">
            <div class="dtl-card-h"><b>{{ t('v2.detail.historyTitle') }}</b></div>
            <div v-if="versionsFailed" class="hint-banner is-error" data-testid="dtl-history-error" role="alert">
              <FcIcon name="ri-error-warning-line" :size="14" />
              <span>{{ t('v2.detail.errorHistory') }}</span>
            </div>
            <div v-else-if="versions.length" class="dtl-tl">
              <div
                v-for="(v, i) in versions"
                :key="v.id ?? v.config_version"
                class="dtl-tl-item"
                :class="{ 'is-cur': i === 0 }"
                :data-testid="`dtl-version-row-${v.config_version}`"
              >
                <div class="dtl-tl-head">
                  <b class="dtl-mono dtl-tl-ver">{{ v.config_version }}</b>
                  <span v-if="i === 0" class="dtl-badge-current" data-testid="dtl-badge-current">{{ t('v2.detail.current') }}</span>
                  <span class="dtl-type">{{ changeTypeLabel(v) }}</span>
                </div>
                <div class="dtl-tl-meta">
                  <span class="dtl-tl-actor">{{ v.actor || t('v2.routes.placeholder') }}</span>
                  <span class="dtl-mono" :data-testid="`dtl-time-${v.config_version}`">{{ formatTime(v.published_at) }}</span>
                </div>
                <div v-if="v.change_description" class="dtl-tl-desc">{{ v.change_description }}</div>
                <div class="dtl-tl-actions">
                  <FcButton
                    variant="text"
                    size="sm"
                    :disabled="!prevVersionOf(i)"
                    :data-testid="`dtl-diff-btn-${v.config_version}`"
                    @click="viewDiff(i)"
                  >
                    {{ t('v2.detail.viewDiff') }}
                  </FcButton>
                </div>
              </div>
            </div>
            <div v-else class="dtl-empty" data-testid="dtl-history-empty">
              <FcIcon name="ri-information-line" :size="20" />
              <span>{{ t('v2.detail.historyEmpty') }}</span>
            </div>
          </div>

          <!-- operation log: audit data source, labelled honestly (never poses as hit logs) -->
          <div class="dtl-card" data-testid="dtl-audit">
            <div class="dtl-card-h"><b>{{ t('v2.detail.auditTitle') }}</b></div>
            <div v-if="auditFailed" class="hint-banner is-error" data-testid="dtl-audit-error" role="alert">
              <FcIcon name="ri-error-warning-line" :size="14" />
              <span>{{ t('v2.detail.errorAudit') }}</span>
            </div>
            <template v-else>
              <div v-for="a in auditLogs" :key="a.id" class="dtl-audit-row" :data-testid="`dtl-audit-row-${a.id}`">
                <span class="dtl-mono dtl-audit-action">{{ a.action }}</span>
                <span class="dtl-audit-actor">{{ a.actor }}</span>
                <span class="dtl-mono dtl-audit-time" :data-testid="`dtl-audit-time-${a.id}`">{{ formatTime(a.created_at) }}</span>
              </div>
              <div v-if="!auditLogs.length" class="dtl-empty-line">{{ t('v2.routes.placeholder') }}</div>
            </template>
          </div>

          <!-- lazy diff card: only mounted after clicking a version's view-diff button -->
          <div v-if="diff" class="dtl-card dtl-span" data-testid="dtl-diff">
            <div class="dtl-card-h"><b>{{ t('v2.detail.diffTitle') }}</b></div>
            <div class="dtl-diff-table">
              <div
                v-for="row in diff.rows"
                :key="row.field"
                class="dtl-diff-row"
                :class="{ 'is-changed': row.from !== row.to }"
                :data-testid="`dtl-diff-row-${row.field}`"
              >
                <span class="dtl-mono dtl-diff-field">{{ row.field }}</span>
                <span class="dtl-mono dtl-diff-val">{{ row.from }}</span>
                <span class="dtl-mono dtl-diff-val">{{ row.to }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { FcButton, FcEmpty, FcIcon, FcSection, FcSkeleton, FcTag } from '@/components'
import { listRoutes, getRouteVersions, getRouteVersionDiff, getRouteSyncStatus } from '@/api/routes'
import type { RouteNode, RouteVersionDto, RouteVersionDiffRow, RouteSyncStatus } from '@/api/routes'
import RouteEditForm from './RouteEditForm.vue'
import { fetchTrafficSummary, fetchRouteTimeseries, type RouteTrafficSummaryItem } from '@/api/v2'
import { listAuditLogs, type AuditLogItem, type TimeseriesResponse } from '@/api/misc'
import { BusinessError } from '@/api/http'
import { usePermission } from '@/composables/usePermission'

/**
 * S8-C：v2 路由详情。五源并行、分区独立降级（V14）；只读为主，动作按钮仅导航。
 * - 页头 + 链路共用 listRoutes() 树上的节点（递归 find，V2b 嵌套命中）；
 * - 四联图全部 SVG 自绘（QPS polyline / 延迟双 polyline / 错误率 rect / 状态码 stroke-dasharray 环）；
 * - diff 与操作记录均为懒加载 / 独立分区，失败各自出错误条，互不拖垮。
 */

/** 路由不存在判定码：后端 ErrorCode.ROUTE_NOT_FOUND=10601 为主；10400（framework4j ApiCode.NOT_FOUND）兼容 */
const ROUTE_NOT_FOUND_CODES = [10601, 10400]
/** 操作记录固定取 5 条（管理审计语义，非请求命中日志） */
const AUDIT_PAGE_SIZE = 5
/** 四联图 viewBox（与原型 07 同款 260×88 级） */
const CHART_W = 260
const CHART_H = 88
const CHART_PAD = 8
/** 延迟图例分位标记（指标记法非文案，随 P4c-2 lint 清零从模板裸字改为常量插值） */
const LEGEND_P50 = 'P50'
const LEGEND_P95 = 'P95'
/** 状态码环几何（viewBox 74×74，r=30） */
const RING_R = 30
const RING_C = 2 * Math.PI * RING_R

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { canEdit } = usePermission()

const routeId = computed(() => String(route.params.id ?? ''))

// ── 页面状态（树为页头/链路唯一数据源，决定 not-found / error）───────────────
const loading = ref(true)
const loadFailed = ref(false)
const notFound = ref(false)
const node = ref<RouteNode | null>(null)

// ── 其余四源：各自独立的失败旗标（V14 分区独立）────────────────────────────
const trafficList = ref<RouteTrafficSummaryItem[]>([])
const ts = ref<TimeseriesResponse | null>(null)
const tsFailed = ref(false)
const versions = ref<RouteVersionDto[]>([])
const versionsFailed = ref(false)
const auditLogs = ref<AuditLogItem[]>([])
const auditFailed = ref(false)

// ── OPT-6 per-route 同步角标（一次性快照；查询中/失败/旧版后端404 → null = 隐藏）──
const syncStatus = ref<RouteSyncStatus | null>(null)

onMounted(() => {
  void loadAll()
  // 角标查询不并入 loadAll 的五源 allSettled（独立 try/catch，见下方 loadSyncBadge 注释）
  void loadSyncBadge()
})

/**
 * OPT-6：per-route 同步状态（GET /v1/routes/{id}/sync-status）查询一次。
 *
 * 【旧测试兼容铁律】必须放在本函数的独立 try/catch 里：
 * - 绝不并入 loadAll 的五源 allSettled 数组
 * - 旧 Detail.test.ts 的 @/api/routes mock 只有 listRoutes/getRouteVersions/
 *   getRouteVersionDiff 三个成员 → 新 import 的 getRouteSyncStatus 在其 mock 下是
 *   undefined，调用即抛 TypeError。必须被这里的 catch 吞掉：角标置 null（隐藏）、
 *   promise 正常 resolve（禁止浮动 rejection）。
 * - 查询失败不轮询、不重试，只等下一次 dtl-refresh 手动刷新。
 */
async function loadSyncBadge() {
  try {
    const st = await getRouteSyncStatus(routeId.value)
    syncStatus.value = st ?? null
  } catch {
    syncStatus.value = null
  }
}

/** 五源 Promise.allSettled 并行；树之外任何一源失败只降级自己的分区 */
async function loadAll() {
  loading.value = true
  loadFailed.value = false
  notFound.value = false
  const [treeRes, trafficRes, tsRes, verRes, auditRes] = await Promise.allSettled([
    listRoutes(),
    fetchTrafficSummary(),
    fetchRouteTimeseries(routeId.value, '24h', '1h'),
    getRouteVersions(routeId.value),
    listAuditLogs({ target: routeId.value, page: 1, pageSize: AUDIT_PAGE_SIZE })
  ])

  if (treeRes.status === 'fulfilled') {
    node.value = findNode(Array.isArray(treeRes.value) ? treeRes.value : [], routeId.value)
    if (!node.value) notFound.value = true
  } else if (isRouteNotFound(treeRes.reason)) {
    notFound.value = true
  } else {
    loadFailed.value = true
  }

  applyTraffic(trafficRes)
  applyTimeseries(tsRes)

  if (verRes.status === 'fulfilled') {
    versions.value = Array.isArray(verRes.value) ? verRes.value : []
    versionsFailed.value = false
  } else {
    versions.value = []
    versionsFailed.value = true
  }
  if (auditRes.status === 'fulfilled') {
    auditLogs.value = auditRes.value?.records ?? []
    auditFailed.value = false
  } else {
    auditLogs.value = []
    auditFailed.value = true
  }
  loading.value = false
}

/** 手动刷新（侦察结论 ⑥：不做轮询）：重发 traffic + timeseries 两源 + 同步角标再查一次 */
async function refresh() {
  void loadSyncBadge()
  const [trafficRes, tsRes] = await Promise.allSettled([
    fetchTrafficSummary(),
    fetchRouteTimeseries(routeId.value, '24h', '1h')
  ])
  applyTraffic(trafficRes)
  applyTimeseries(tsRes)
}

function applyTraffic(res: PromiseSettledResult<RouteTrafficSummaryItem[]>) {
  trafficList.value = res.status === 'fulfilled' && Array.isArray(res.value) ? res.value : []
}

function applyTimeseries(res: PromiseSettledResult<TimeseriesResponse>) {
  if (res.status === 'fulfilled') {
    ts.value = res.value ?? null
    tsFailed.value = false
  } else {
    ts.value = null
    tsFailed.value = true
  }
}

function isRouteNotFound(e: unknown): boolean {
  return e instanceof BusinessError && ROUTE_NOT_FOUND_CODES.includes(Number(e.code))
}

/** 树递归 find（V2b：嵌套 children 里的 id 也要命中） */
function findNode(nodes: RouteNode[], id: string): RouteNode | null {
  for (const n of nodes) {
    if (String(n.id) === id) return n
    const hit = findNode(n.children ?? [], id)
    if (hit) return hit
  }
  return null
}

// ── 动作导航（仅导航；canEdit=false 时按钮整体不渲染，V11）──────────────────
function goPublish() {
  void router.push(`/v2/publish/${routeId.value}`)
}

// ── P4c-2 页内编辑态（dtl-action-edit 改开 RouteEditForm，画布保持结构编辑定位）──
const editOpen = ref(false)

function openEdit() {
  editOpen.value = true
}

/** 编辑组件保存成功：页头与只读分区重拉（listRoutes 第二次调用） */
function onEditSaved() {
  void loadAll()
}

// ── 页头派生 ─────────────────────────────────────────────────────────────
const trafficItem = computed<RouteTrafficSummaryItem | null>(
  () => trafficList.value.find((s) => s.route_id === routeId.value) ?? null
)

const sortedPlugins = computed(() => {
  const list = [...(node.value?.plugins ?? [])]
  list.sort((a, b) => (toNum(a.sort_order) || 0) - (toNum(b.sort_order) || 0))
  return list
})

const childCount = computed(() => node.value?.children?.length ?? 0)

const hitsText = computed(() => (trafficItem.value ? formatHits(trafficItem.value.hits_24h) : '—'))

// ── OPT-6 同步角标派生（available=false 时诚实呈现「状态未知」，不摆假警报）──
/** null = 隐藏（未取得 / 查询失败）。data-state ∈ synced | delayed | unknown */
const syncState = computed<'synced' | 'delayed' | 'unknown' | null>(() => {
  const s = syncStatus.value
  if (!s) return null
  if (s.available === false) return 'unknown'
  return s.in_sync === true ? 'synced' : 'delayed'
})

const syncLabel = computed(() => {
  switch (syncState.value) {
    case 'synced': return t('v2.routes.syncSynced')
    case 'delayed': return t('v2.routes.syncDelayed')
    case 'unknown': return t('v2.routes.syncUnknown')
    default: return ''
  }
})

const syncIcon = computed(() => {
  switch (syncState.value) {
    case 'synced': return 'ri-check-line'
    case 'delayed': return 'ri-time-line'
    case 'unknown': return 'ri-question-line'
    default: return ''
  }
})

const qpsText = computed(() => {
  if (!trafficItem.value) return '—'
  const n = toNum(trafficItem.value.qps)
  return Number.isFinite(n) ? String(Math.round(n)) : '—'
})

/** 响应节点内嵌 p95（traffic-summary 有数据源，非造数）；无数据则不渲染 */
const responseP95 = computed(() => {
  const ms = toNum(trafficItem.value?.p95_latency_ms)
  return Number.isFinite(ms) ? `P95 ${ms} ms` : ''
})

// ── 链路时间线派生（静态预览，DOM 序 = 链路序，V4a）────────────────────────
/** tone 决定 chip 染色档（client/match/plugin/forward/upstream/response） */
interface ChainNodeView {
  key: string
  label: string
  sub: string
  icon: string
  tone: 'is-client' | 'is-match' | 'is-plugin' | 'is-forward' | 'is-upstream' | 'is-response'
}

const chainNodes = computed<ChainNodeView[]>(() => {
  const n = node.value
  if (!n) return []
  const list: ChainNodeView[] = [
    { key: 'client', label: t('v2.detail.chainClient'), sub: '', icon: 'ri-global-line', tone: 'is-client' },
    { key: 'match', label: t('v2.detail.chainMatch'), sub: n.path ?? '', icon: 'ri-filter-3-line', tone: 'is-match' }
  ]
  for (const p of sortedPlugins.value) {
    list.push({ key: `plugin-${p.plugin_id}`, label: p.plugin_name, sub: '', icon: 'ri-plug-line', tone: 'is-plugin' })
  }
  list.push({ key: 'forward', label: t('v2.detail.chainForward'), sub: '', icon: 'ri-arrow-right-up-line', tone: 'is-forward' })
  // DISPATCH 无 upstream_url：只留标签（侦察结论 ②，绝不渲染「N 实例」）
  list.push({
    key: 'upstream',
    label: t('v2.detail.chainUpstream'),
    sub: n.upstream_url ? upstreamHost(n.upstream_url) : '',
    icon: 'ri-server-line',
    tone: 'is-upstream'
  })
  list.push({ key: 'response', label: t('v2.detail.chainResponse'), sub: '', icon: 'ri-check-line', tone: 'is-response' })
  return list
})

// ── 四联图派生 ───────────────────────────────────────────────────────────
const tsPoints = computed(() => ts.value?.data_points ?? [])
const showSnapshotHint = computed(() => ts.value?.source === 'snapshot')

/** Long→String 契约兜底：数值/数值字符串归一，null/undefined → NaN（展示为 —） */
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 序列 → polyline points（viewBox 260×88，上下留 pad，最低可见 2px） */
function linePoints(values: number[]): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const stepX = values.length > 1 ? (CHART_W - CHART_PAD * 2) / (values.length - 1) : 0
  return values
    .map((v, i) => {
      const x = CHART_PAD + i * stepX
      const h = Math.max(2, (Math.max(0, v) / max) * (CHART_H - CHART_PAD * 2))
      return `${round2(x)},${round2(CHART_H - CHART_PAD - h)}`
    })
    .join(' ')
}

const qpsPoints = computed(() => linePoints(tsPoints.value.map((p) => Math.max(0, toNum(p.total_requests) || 0))))

/** p50/p95 任一点缺值即放弃该线（snapshot 口径：p50 缺 → 单 p95 线，V7b） */
function quantileSeries(key: 'p50_latency_ms' | 'p95_latency_ms') {
  return tsPoints.value.map((p) => toNum(p[key]))
}
const hasP50 = computed(() => tsPoints.value.length > 0 && quantileSeries('p50_latency_ms').every(Number.isFinite))
const hasP95 = computed(() => tsPoints.value.length > 0 && quantileSeries('p95_latency_ms').every(Number.isFinite))
const p50Points = computed(() => (hasP50.value ? linePoints(quantileSeries('p50_latency_ms').map((n) => Math.max(0, n))) : ''))
const p95Points = computed(() => (hasP95.value ? linePoints(quantileSeries('p95_latency_ms').map((n) => Math.max(0, n))) : ''))

/** 错误率序列（每点一根柱；负值/缺值归 0） */
const errorRates = computed(() =>
  tsPoints.value.map((p) => {
    const r = toNum(p.error_rate)
    return Number.isFinite(r) && r > 0 ? r : 0
  })
)

/** 每个数据点一根 rect 柱（相对最大错误率归一，最低 2px 保证可见） */
const errorBars = computed(() => {
  const rates = errorRates.value
  if (!rates.length) return []
  const max = Math.max(...rates, 1e-9)
  const slot = (CHART_W - CHART_PAD * 2) / rates.length
  const w = Math.max(4, Math.min(10, Math.round(slot * 0.6)))
  return rates.map((r, i) => {
    const h = Math.max(2, Math.round((r / max) * (CHART_H - CHART_PAD * 2)))
    return { x: round2(CHART_PAD + i * slot + (slot - w) / 2), y: round2(CHART_H - CHART_PAD - h), w, h }
  })
})

// ── 状态码三桶 + 环图几何（fetchTrafficSummary 按 route_id find，V8a）───────
/** key = 契约桶 id（c2xx/c4xx/c5xx，作 dtl-bucket-* testid）；name = 2xx 展示名（作染色类） */
interface StatusSeg {
  key: 'c2xx' | 'c4xx' | 'c5xx'
  name: '2xx' | '4xx' | '5xx'
  hits: string
  pct: string
  dash: string
  offset: number
}

interface StatusView {
  pct2: string
  segs: StatusSeg[]
}

function pctText(p: number): string {
  const r = Math.round(p * 10) / 10
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`
}

function dashFor(pct: number): string {
  const len = (Math.max(0, Math.min(100, pct)) / 100) * RING_C
  return `${round2(len)} ${round2(RING_C - len)}`
}

const statusView = computed<StatusView | null>(() => {
  const sc = trafficItem.value?.status_codes
  if (!sc) return null
  const counts = [sc.c2xx, sc.c4xx, sc.c5xx].map((v) => Math.max(0, toNum(v) || 0))
  const total = counts[0] + counts[1] + counts[2]
  if (total <= 0) return null
  const keys = ['c2xx', 'c4xx', 'c5xx'] as const
  const names = ['2xx', '4xx', '5xx'] as const
  let cumulative = 0
  const segs = counts.map((v, i) => {
    const pct = (v / total) * 100
    const seg: StatusSeg = {
      key: keys[i],
      name: names[i],
      hits: formatHits(v),
      pct: pctText(pct),
      dash: dashFor(pct),
      offset: round2(-(cumulative / 100) * RING_C)
    }
    cumulative += pct
    return seg
  })
  return { pct2: segs[0].pct, segs }
})

// ── 变更历史 + diff 懒加载（Publish.vue 同款：未点不调，from = 前一版本）──────
const diff = ref<{ rows: RouteVersionDiffRow[] } | null>(null)

function prevVersionOf(i: number): string | null {
  return versions.value[i + 1]?.config_version ?? null
}

async function viewDiff(i: number) {
  const to = versions.value[i]?.config_version
  const from = prevVersionOf(i)
  if (!to || !from) return
  try {
    const rows = await getRouteVersionDiff(routeId.value, from, to)
    diff.value = { rows: Array.isArray(rows) ? rows : [] }
  } catch {
    diff.value = null
  }
}

/** changeType 全枚举映射（CREATE/PUBLISH/OFFLINE），未知值原文直出 */
function changeTypeLabel(v: RouteVersionDto): string {
  if (v.change_type === 'CREATE') return t('v2.detail.changeCreate')
  if (v.change_type === 'PUBLISH') return t('v2.detail.changePublish')
  if (v.change_type === 'OFFLINE') return t('v2.detail.changeOffline')
  return String(v.change_type ?? '')
}

// ── 展示格式化（口径同 S3/S5/S6：hits 缩写 / 时间双兼容）────────────────────
/** 命中量千分位缩写：<1k 原样；k 取整；M/B 一位小数去尾 0（1500→2k、84000→84k） */
function formatHits(v: unknown): string {
  const n = toNum(v)
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

/** upstream_url → host（10.0.0.11:9001）；空/非法回退原文 */
function upstreamHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 时间展示：epoch ms（版本 published_at）与 ISO-8601（审计 created_at）双兼容；无值 → — */
function formatTime(v: string | number | null | undefined): string {
  const n = typeof v === 'number' ? v : v == null ? NaN : Date.parse(String(v))
  if (!Number.isFinite(n)) return t('v2.routes.placeholder')
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped lang="scss">
/* token only：violet 档收编全局第四色相档 --app-secondary（P3-e 建档，S7-1 收编；
   页内保留 --dtl-violet 别名，dark 下随 token 翻转为 #a38dff） */
.dtl-page {
  --dtl-violet: var(--app-secondary);
  min-width: 0;
}

/* 焦点环兜底：本页所有可聚焦元素统一 token 焦点环（无自绘动画，PRM 无需回退） */
.dtl-page :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* 提示条（四联图错误 / 快照提示 / 分区错误，同 S3/S6/S7 配方） */
.hint-banner {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 12px;
  font-size: 12px; border-radius: var(--app-radius-md);
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

/* 375 视口横滚容器：内容在容器内横滚，页面 body 不被撑开（V13） */
.dtl-scroll {
  min-width: 0;
  overflow-x: auto;
}
.dtl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* P4c-2 页内编辑态面板（内嵌 RouteEditForm，与只读分区同列宽） */
.dtl-edit-panel {
  min-width: 0; padding: 12px 16px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}

/* 卡片基底 */
.dtl-card {
  min-width: 0; padding: 12px 16px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
.dtl-card-h {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  b { font-size: 13px; font-weight: 600; color: var(--app-text); }
}

/* 页头 */
.dtl-header {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; padding: 14px 16px; margin-bottom: 14px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
/* flex-basis 240px：窄屏下 base 总和超出换行线，actions 落第二行，main 不再被压成 10px（V-S8 P2-1）；
   宽屏无溢出、grow 均摊自由空间，最终宽度与 flex:1 完全一致，桌面观感零变化 */
.dtl-head-main { flex: 1 1 240px; min-width: 0; }
.dtl-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dtl-name { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: var(--app-text); }
.dtl-status {
  padding: 1px 8px; font-size: 11px; font-weight: 600; color: var(--app-text-secondary);
  background: var(--app-bg-muted); border-radius: var(--app-radius-full);
}
.dtl-env {
  padding: 1px 8px; font-size: 11px; color: var(--app-text-secondary);
  border: 1px solid var(--app-separator); border-radius: var(--app-radius-full);
}
/* OPT-6 per-route 同步角标（页头 dtl-status 同排；synced=绿 / delayed=黄 / unknown=灰，
   配方同 hint-banner 与 .dtl-env，token only） */
.dtl-sync {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px;
  font-size: 11px; border-radius: var(--app-radius-full); white-space: nowrap;
  border: 1px solid transparent;
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
  &.is-unknown {
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
    border-color: var(--app-separator);
  }
}
.dtl-meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 8px; }
.dtl-plugins { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.dtl-chiplike { font-size: 12px; color: var(--app-text-secondary); }
.dtl-stat-row {
  display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed var(--app-border-extra-light);
}
.dtl-stat {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--app-text-secondary);
  b { color: var(--app-text); font-variant-numeric: tabular-nums; }
}
.dtl-head-actions { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 8px; }

/* 窄屏兜底：显式保留页头换行，配合 main 的 240px basis 让 actions 落到第二行（V-S8 P2-1） */
@media (max-width: 768px) {
  .dtl-header { flex-wrap: wrap; }
}

/* 链路时间线（静态预览：chip 染色区分段位，dur 位一律 —） */
.dtl-chain-flow { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px 4px; }
.dtl-chain-node { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dtl-chain-arrow {
  display: inline-flex; align-items: center; align-self: center;
  color: var(--app-text-quaternary);
}
.dtl-chain-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 12px;
  color: var(--app-text); background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-full);
  white-space: nowrap;
  &.is-match {
    color: color-mix(in srgb, var(--app-primary) 60%, var(--app-text));
    background: color-mix(in srgb, var(--app-primary) 10%, transparent);
    border-color: color-mix(in srgb, var(--app-primary) 30%, transparent);
  }
  &.is-plugin {
    color: color-mix(in srgb, var(--dtl-violet) 60%, var(--app-text));
    background: color-mix(in srgb, var(--dtl-violet) 12%, transparent);
    border-color: color-mix(in srgb, var(--dtl-violet) 30%, transparent);
  }
  &.is-upstream,
  &.is-response {
    color: color-mix(in srgb, var(--app-color-success) 60%, var(--app-text));
    background: color-mix(in srgb, var(--app-color-success) 10%, transparent);
    border-color: color-mix(in srgb, var(--app-color-success) 30%, transparent);
  }
}
.dtl-chain-sub {
  padding: 1px 8px; font-size: 11px; color: var(--app-text-secondary);
  background: var(--app-bg-card); border-radius: var(--app-radius-full);
}
.dtl-chain-meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; }

/* 分段耗时无数据源：占位符（contract：绝不造数） */
.dtl-chain-dur { color: var(--app-text-tertiary); font-variant-numeric: tabular-nums; }
.dtl-chain-extra { color: color-mix(in srgb, var(--app-color-success) 60%, var(--app-text)); font-variant-numeric: tabular-nums; }

/* 四联图行：窄视口在 dtl-scroll 容器内横滚 */
.dtl-charts { margin-bottom: 14px; }
.dtl-charts-row {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: start;
  /* 可读下限：容器窄于 720px 时容器内出横滚（同 List 表格收口模式） */
  min-width: 720px;
}
.dtl-chart { display: block; width: 100%; height: auto; }
.dtl-grid { stroke: var(--app-border-extra-light); stroke-width: 1; }
.dtl-line {
  fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  &.is-primary { stroke: var(--app-primary); }
  &.is-secondary { stroke: var(--app-text-quaternary); }
}
.dtl-bar { fill: color-mix(in srgb, var(--app-primary) 55%, transparent); }
.dtl-chart-empty { padding: 26px 0; font-size: 12px; color: var(--app-text-tertiary); text-align: center; }
.dtl-legend {
  display: inline-flex; align-items: center; gap: 10px; margin-left: auto;
  font-size: 11px; color: var(--app-text-secondary);
}
.dtl-legend-item { display: inline-flex; align-items: center; gap: 4px; }
.dtl-legend-dot {
  width: 8px; height: 8px; border-radius: 2px;
  &.is-p50 { background: var(--app-text-quaternary); }
  &.is-p95 { background: var(--app-primary); }
}

/* 状态码环 + 三桶 */
.dtl-status-body { display: flex; align-items: center; gap: 14px; }
.dtl-ring { flex: none; width: 74px; height: 74px; }
.dtl-ring-track { fill: none; stroke: var(--app-bg-muted); stroke-width: 10; }
.dtl-ring-seg {
  fill: none; stroke-width: 10;
  &.is-2xx { stroke: var(--app-color-success); }
  &.is-4xx { stroke: var(--app-color-warning); }
  &.is-5xx { stroke: var(--app-color-danger); }
}
.dtl-ring-num { font-size: 12px; font-weight: 600; fill: var(--app-text); font-variant-numeric: tabular-nums; }
.dtl-buckets { display: flex; flex: 1; flex-direction: column; gap: 6px; min-width: 0; }
.dtl-bucket {
  display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--app-text-secondary);
}
.dtl-bucket-dot {
  flex: none; width: 8px; height: 8px; border-radius: 2px;
  &.is-2xx { background: var(--app-color-success); }
  &.is-4xx { background: var(--app-color-warning); }
  &.is-5xx { background: var(--app-color-danger); }
}
.dtl-bucket-name { color: var(--app-text); }
.dtl-bucket-val { color: var(--app-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.dtl-bucket-pct { margin-left: auto; font-variant-numeric: tabular-nums; }
.dtl-status-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 8px;
  font-size: 12px; color: var(--app-text-tertiary);
}

/* 底部：历史 | 操作记录 | diff（跨两列） */
.dtl-bottom {
  display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start;
}
.dtl-span { grid-column: 1 / -1; }
@media (max-width: 900px) {
  .dtl-bottom { grid-template-columns: minmax(0, 1fr); }
}

/* 版本时间线（Publish.vue 同款 .tl 模式：左轨 + 圆点） */
.dtl-tl {
  position: relative; padding-left: 18px;
  &::before {
    content: ''; position: absolute; top: 6px; bottom: 6px; left: 5px; width: 2px;
    background: var(--app-border-extra-light);
  }
}
.dtl-tl-item {
  position: relative; padding: 8px 0;
  &::before {
    content: ''; position: absolute; top: 14px; left: -17px; width: 8px; height: 8px;
    border-radius: var(--app-radius-full); background: var(--app-text-quaternary);
  }
  &.is-cur::before { background: var(--app-primary); }
  & + .dtl-tl-item { border-top: 1px solid var(--app-border-extra-light); }
}
.dtl-tl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dtl-tl-ver { font-size: 13px; font-weight: 700; color: var(--app-text); }
.dtl-badge-current {
  display: inline-flex; align-items: center; height: 18px; padding: 0 8px;
  font-size: 11px; font-weight: 600; color: var(--app-accent-text-on-tint);
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-primary) 30%, transparent);
  border-radius: var(--app-radius-full); white-space: nowrap;
}
.dtl-type {
  padding: 1px 6px; font-size: 10.5px; color: var(--app-text-secondary);
  background: var(--app-bg-muted); border-radius: var(--app-radius-chip); white-space: nowrap;
}
.dtl-tl-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px;
  font-size: 11.5px; color: var(--app-text-secondary);
}
.dtl-tl-actor { font-weight: 600; }
.dtl-tl-desc { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--app-text-secondary); }
.dtl-tl-actions { display: flex; gap: 6px; margin-top: 4px; }
.dtl-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 12px;
  font-size: 12.5px; color: var(--app-text-secondary);
}
.dtl-empty-line { padding: 8px 0; font-size: 12px; color: var(--app-text-tertiary); }

/* 操作记录行（audit 原文直出：action/actor 不做映射） */
.dtl-audit-row {
  display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 12px;
  border-bottom: 1px dashed var(--app-border-extra-light);
  &:last-of-type { border-bottom: none; }
}
.dtl-audit-action { font-weight: 600; color: var(--app-text); word-break: break-all; }
.dtl-audit-actor { color: var(--app-text-secondary); }
.dtl-audit-time { margin-left: auto; flex: none; font-size: 11px; color: var(--app-text-tertiary); }

/* diff 表（Publish.vue 同款：field / from / to 三列，变更行淡底） */
.dtl-diff-table {
  overflow: hidden; font-size: 12px;
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-md);
}
.dtl-diff-row {
  display: grid; grid-template-columns: minmax(110px, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px;
  padding: 7px 10px; border-bottom: 1px solid var(--app-border-extra-light);
  &:last-child { border-bottom: none; }
  &.is-changed {
    background: color-mix(in srgb, var(--app-primary) 6%, transparent);
    box-shadow: inset 2px 0 0 var(--app-primary);
  }
}
.dtl-diff-field { font-weight: 600; color: var(--app-text); word-break: break-all; }
.dtl-diff-val { color: var(--app-text-secondary); word-break: break-all; }
</style>
