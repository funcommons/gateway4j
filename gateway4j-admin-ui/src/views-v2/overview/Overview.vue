<template>
  <div class="v2-overview">
    <FcSection>
      <!-- 快照兜底提示条：凡任一路由 source=snapshot 即提示（S6 契约比 S3 宽松，不等 quantile_fallback，勿回退） -->
      <div v-if="showSnapshotHint" class="hint-banner is-warn" data-testid="overview-source-hint" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.overview.snapshotHint') }}</span>
      </div>
      <!-- traffic-summary 加载失败：错误条 + KPI 全 —；拓扑/事件独立拉取互不拖垮 -->
      <div v-if="trafficFailed" class="hint-banner is-error" data-testid="overview-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.overview.loadFailed') }}</span>
      </div>

      <!-- KPI 4 卡：Σhits 缩写 / Σqps 取整 / 非 null P95 均值 / 上游可达占比 -->
      <div class="kpi-grid">
        <div v-for="k in kpiCards" :key="k.tid" class="kpi-card" :data-testid="k.tid">
          <span class="kpi-lb"><FcIcon :name="k.icon" :size="13" />{{ k.label }}</span>
          <span class="kpi-v">{{ k.value }}</span>
        </div>
      </div>

      <div class="ov-grid">
        <!-- 左：拓扑画布（testid 挂卡片根，标题/提示在容器内 —— S6-T 契约） -->
        <div class="ov-canvas-card" data-testid="topo-canvas">
          <div class="ov-card-h">
            <b>{{ t('v2.overview.canvasTitle') }}</b>
            <span class="ov-card-hint">{{ t('v2.overview.canvasHint') }}</span>
          </div>
          <div class="topo-scroll">
            <div class="topo-viewport" :style="{ height: `${canvasH}px`, minWidth: `${canvasW}px` }">
              <div class="topo-dots" aria-hidden="true"></div>
              <svg class="topo-edges" :width="canvasW" :height="canvasH" aria-hidden="true">
                <g v-for="e in edges" :key="e.key" class="topo-edge" :data-testid="e.key">
                  <path :d="e.d" />
                  <text v-if="e.label" :x="e.mx" :y="e.my - 7" text-anchor="middle" class="topo-edge-label">{{ e.label }}</text>
                </g>
              </svg>
              <div
                v-for="n in nodes"
                :key="n.key"
                class="topo-node"
                :class="[`is-${n.kind}`, { 'is-dim': n.kind === 'client' }]"
                :style="{ left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px` }"
                :data-testid="`topo-node-${n.key}`"
              >
                <div class="tn-title">
                  <FcIcon :name="n.icon" :size="13" />
                  <span class="tn-name">{{ n.name }}</span>
                  <span v-if="n.typeLabel" class="tn-type">{{ n.typeLabel }}</span>
                </div>
                <div v-if="n.meta" class="tn-meta">{{ n.meta }}</div>
                <div v-if="n.showStats" class="tn-stats">
                  <span>QPS <b data-testid="topo-qps">{{ n.qpsText }}</b></span>
                  <span>P95 <b data-testid="topo-p95">{{ n.p95Text }}</b></span>
                </div>
                <!-- 上游 chip：单上游端点语义（S2），upstream!=null 才渲染；健康点随 chip -->
                <div v-if="n.up" class="tn-up" :data-testid="`topo-up-${n.eid}`">
                  <span class="topo-dot" data-testid="topo-dot" :data-state="dotState(n.up)"></span>
                  <span>{{ t('v2.overview.nodeUpstream') }}</span>
                  <span v-if="upMs(n.up)" class="tn-up-ms">{{ upMs(n.up) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右 30%：待处理 / 实时事件 / 上游健康 -->
        <div class="ov-side">
          <div class="ov-card" data-testid="pending-card">
            <div class="ov-card-h">
              <b>{{ t('v2.overview.pendingTitle') }}</b>
              <span v-if="pendingTotal > 0" class="ov-badge" data-testid="pending-count">{{ pendingTotal }}</span>
            </div>
            <div class="ov-card-b" data-testid="pending-list">
              <template v-if="pendingTotal > 0">
                <div v-if="pendingPublish > 0" class="pending-item" data-testid="pending-publish">
                  <FcIcon name="ri-flag-line" :size="14" />
                  <span>{{ t('v2.overview.pendingPublish', { n: pendingPublish }) }}</span>
                </div>
                <div v-if="pendingUpstreamN > 0" class="pending-item is-bad" data-testid="pending-upstream">
                  <FcIcon name="ri-database-2-line" :size="14" />
                  <span>{{ t('v2.overview.pendingUpstream', { n: pendingUpstreamN }) }}</span>
                </div>
              </template>
              <span v-else class="ov-empty">{{ t('v2.overview.pendingEmpty') }}</span>
            </div>
          </div>

          <div class="ov-card" data-testid="events-card">
            <div class="ov-card-h"><b>{{ t('v2.overview.eventsTitle') }}</b></div>
            <div class="ov-card-b">
              <div v-for="ev in events" :key="ev.id" class="event-item" data-testid="event-item">
                <!-- action 英文码原文直出（S6-T：audit 无事件源映射文案） -->
                <span class="event-action">{{ ev.action }}</span>
                <span class="event-meta">{{ ev.actor }} · {{ fmtTime(ev.created_at) }}</span>
              </div>
              <span v-if="!events.length" class="ov-empty">{{ t('v2.overview.eventsEmpty') }}</span>
            </div>
          </div>

          <div class="ov-card" data-testid="upstream-card">
            <div class="ov-card-h">
              <b>{{ t('v2.overview.healthTitle') }}</b>
              <RouterLink class="ov-link" to="/v2/routes">{{ t('v2.overview.seeAll') }}</RouterLink>
            </div>
            <div class="ov-card-b">
              <div v-for="r in upstreamRows" :key="r.id" class="up-row" :data-testid="`upstream-row-${r.id}`">
                <span class="topo-dot" :data-state="r.state" aria-hidden="true"></span>
                <span class="up-name">{{ r.name }}</span>
                <span class="up-state" :class="{ 'is-bad': r.state === 'warn' }">{{ r.label }}</span>
              </div>
              <div v-if="upTotal > 0" class="pbar-track" aria-hidden="true">
                <i class="pbar-fill" data-testid="upstream-pbar" :style="{ width: upstreamPct }"></i>
              </div>
              <span v-if="!upstreamRows.length" class="ov-empty">{{ t('v2.routes.placeholder') }}</span>
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
import { FcIcon, FcSection } from '@/components'
import { fetchTrafficSummary, type RouteTrafficSummaryItem, type RouteTrafficUpstream } from '@/api/v2'
import { getTopology, listAuditLogs, type TopologyNode, type TopologyEdge, type AuditLogItem } from '@/api/misc'

/**
 * S6-C：v2 拓扑总览。数据三源独立降级（traffic-summary / topology / audit），任一失败不拖垮整页。
 * 连线为前端 derivation（后端 topology 无固定网关/客户端节点）：
 * client→gw 固定 1 条 + gw→每个无父节点（DISPATCH 根 / 无父 BACKEND）+ topology.edges 条件边。
 * 边标签优先 traffic-summary.path（S2 口径），无流量数据回退 edge.condition。
 */
const { t } = useI18n()

const traffic = ref<RouteTrafficSummaryItem[]>([])
const trafficFailed = ref(false)
const topoNodes = ref<TopologyNode[]>([])
const topoEdges = ref<TopologyEdge[]>([])
const events = ref<AuditLogItem[]>([])

onMounted(() => {
  void loadTraffic()
  void loadTopology()
  void loadEvents()
})

/** KPI/待处理/上游健康数据源；失败降级为全 — 而非整页报错 */
async function loadTraffic() {
  try {
    traffic.value = await fetchTrafficSummary()
    trafficFailed.value = false
  } catch {
    traffic.value = []
    trafficFailed.value = true
  }
}

/** 画布拓扑；失败降级为只剩固定 client/gateway 节点 */
async function loadTopology() {
  try {
    const res = await getTopology()
    topoNodes.value = res?.nodes ?? []
    topoEdges.value = res?.edges ?? []
  } catch {
    topoNodes.value = []
    topoEdges.value = []
  }
}

/** 实时事件：前端按 created_at 倒序取 5；失败 → eventsEmpty 不崩 */
async function loadEvents() {
  try {
    const page = await listAuditLogs({ page: 1, pageSize: 5 })
    events.value = [...(page?.records ?? [])].sort((a, b) => eventTs(b.created_at) - eventTs(a.created_at)).slice(0, 5)
  } catch {
    events.value = []
  }
}

/** Long→String 契约兜底：数值/数值字符串归一，null/undefined → NaN（展示为 —） */
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

const eventTs = (v: string | number): number => { const n = typeof v === 'number' ? v : Date.parse(String(v)); return Number.isFinite(n) ? n : 0 }

/** 命中量千分位缩写（同 S3 formatHits 口径）：<1k 原样；k 取整；M/B 一位小数去尾 0 */
function formatHits(hits: number): string {
  if (!Number.isFinite(hits)) return '—'
  if (hits >= 1e9) return `${trimUnit(hits / 1e9)}B`
  if (hits >= 1e6) return `${trimUnit(hits / 1e6)}M`
  if (hits >= 1e3) return `${Math.round(hits / 1e3)}k`
  return String(hits)
}

function trimUnit(v: number): string {
  const s = v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function formatMs(v: number): string {
  return Number.isFinite(v) ? `${v} ms` : '—'
}

// ── KPI 聚合 ─────────────────────────────────────────────────────────────
const sumHits = computed(() => traffic.value.reduce((acc, s) => acc + (toNum(s.hits_24h) || 0), 0))
const sumQps = computed(() => traffic.value.reduce((acc, s) => acc + (toNum(s.qps) || 0), 0))
const meanP95 = computed(() => {
  const vals = traffic.value.map((s) => toNum(s.p95_latency_ms)).filter(Number.isFinite)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN
})
const upTotal = computed(() => traffic.value.filter((s) => s.upstream != null).length)
const upOk = computed(() => traffic.value.filter((s) => s.upstream?.reachable === true).length)

const showSnapshotHint = computed(() => traffic.value.some((s) => s.source === 'snapshot'))

const kpiCards = computed(() => [
  { tid: 'kpi-requests', icon: 'ri-bar-chart-2-line', label: t('v2.overview.kpiRequests'), value: trafficFailed.value ? '—' : formatHits(sumHits.value) },
  { tid: 'kpi-qps', icon: 'ri-flashlight-line', label: t('v2.overview.kpiQps'), value: trafficFailed.value ? '—' : String(Math.round(sumQps.value)) },
  { tid: 'kpi-p95', icon: 'ri-timer-line', label: t('v2.overview.kpiP95'), value: trafficFailed.value ? '—' : formatMs(Math.round(meanP95.value)) },
  { tid: 'kpi-upstream', icon: 'ri-server-line', label: t('v2.overview.kpiUpstream'), value: trafficFailed.value || upTotal.value === 0 ? '—' : `${upOk.value}/${upTotal.value}` }
])

// ── 待处理 / 事件 / 上游健康行 ────────────────────────────────────────────
const pendingPublish = computed(() => traffic.value.filter((s) => s.status === 'DRAFT' || s.status === 'CHANGING').length)
const pendingUpstreamN = computed(() => traffic.value.filter((s) => s.upstream?.reachable === false).length)
const pendingTotal = computed(() => pendingPublish.value + pendingUpstreamN.value)

const upstreamRows = computed(() =>
  traffic.value
    .filter((s): s is RouteTrafficSummaryItem & { upstream: RouteTrafficUpstream } => s.upstream != null)
    .map((s) => ({ id: s.route_id, name: s.route_name, state: dotState(s.upstream), label: upstreamLabel(s.upstream) }))
)

const upstreamPct = computed(() => (upTotal.value ? `${Math.round((upOk.value / upTotal.value) * 100)}%` : '0%'))

function dotState(up: RouteTrafficUpstream): 'ok' | 'warn' {
  return up.reachable === false ? 'warn' : 'ok'
}

function upstreamLabel(up: RouteTrafficUpstream): string {
  const base = up.reachable === false ? t('v2.overview.upstreamBad') : t('v2.overview.upstreamOk')
  const ms = toNum(up.latency_ms)
  return Number.isFinite(ms) ? `${base} · ${ms} ms` : base
}

function upMs(up: RouteTrafficUpstream): string {
  const ms = toNum(up.latency_ms)
  return Number.isFinite(ms) ? `${ms} ms` : ''
}

function fmtTime(v: string | number): string {
  const n = eventTs(v)
  if (!n) return t('v2.routes.placeholder')
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── 拓扑布局：固定 client/gateway + 动态节点分层（列=拓扑深度，行=同层序号）──
interface LaidNode {
  key: string // 节点 testid 后缀：client / gateway / dispatch-<id> / backend-<id>
  eid: string // 边端点与上游 chip 名：client / gw / <routeId>（gw 与 gateway testid 故意不同名）
  kind: 'client' | 'gateway' | 'dispatch' | 'backend'
  name: string
  typeLabel: string
  icon: string
  meta: string
  showStats: boolean
  qpsText: string
  p95Text: string
  up: RouteTrafficUpstream | null
  x: number
  y: number
  w: number
  h: number
}

const ROW_PITCH = 136
const TOP_PAD = 20
/** 列横坐标：client 第 0 列 / gateway 第 1 列 / 动态根从第 2 列起逐层推进（嵌套最深 5 层可延展） */
const colX = (depth: number) => (depth === 0 ? 20 : depth === 1 ? 176 : 348 + (depth - 2) * 220)
const KIND_W: Record<LaidNode['kind'], number> = { client: 112, gateway: 148, dispatch: 168, backend: 188 }

const nodes = computed<LaidNode[]>(() => {
  const trafficById = new Map(traffic.value.map((s) => [s.route_id, s]))
  const parentOf = new Map<string, string>()
  for (const e of topoEdges.value) parentOf.set(e.target_id, e.source_id)

  // 深度 = 沿 parent 链逐跳 +1（无父 → 第 2 列；seen 防环）
  const depthOf = (id: string): number => {
    let d = 2
    let p = parentOf.get(id)
    const seen = new Set([id])
    while (p != null && !seen.has(p)) { seen.add(p); d += 1; p = parentOf.get(p) }
    return d
  }

  // 行号：client/gateway 先占第 0/1 层第 0 行，动态层独立计数，同层按 topology.nodes 原序
  const layerRows = new Map<number, number>()
  const nextRow = (depth: number) => { const r = layerRows.get(depth) ?? 0; layerRows.set(depth, r + 1); return r }
  nextRow(0)
  nextRow(1)

  // 固定节点缺省字段工厂
  const base = (p: Partial<LaidNode> & Pick<LaidNode, 'key' | 'eid' | 'kind' | 'name' | 'icon'>): LaidNode =>
    ({ typeLabel: '', meta: '', showStats: false, qpsText: '', p95Text: '', up: null, x: colX(0), y: TOP_PAD, w: KIND_W.client, h: 40, ...p })

  const laid: LaidNode[] = [
    base({ key: 'client', eid: 'client', kind: 'client', name: t('v2.overview.clientLabel'), icon: 'ri-global-line' }),
    base({
      key: 'gateway', eid: 'gw', kind: 'gateway', name: t('v2.overview.nodeGateway'), icon: 'ri-cpu-line',
      showStats: true, x: colX(1), w: KIND_W.gateway, h: 76,
      qpsText: trafficFailed.value ? '—' : String(Math.round(sumQps.value)),
      p95Text: trafficFailed.value ? '—' : formatMs(Math.round(meanP95.value))
    })
  ]

  for (const raw of topoNodes.value) {
    if (raw.type !== 'DISPATCH' && raw.type !== 'BACKEND') continue
    const isDispatch = raw.type === 'DISPATCH'
    const kind = isDispatch ? 'dispatch' : 'backend'
    const s = trafficById.get(raw.id)
    const up = s?.upstream ?? null
    laid.push({
      key: isDispatch ? `dispatch-${raw.id}` : `backend-${raw.id}`, eid: raw.id, kind,
      name: raw.name || s?.route_name || raw.id,
      typeLabel: isDispatch ? t('v2.overview.nodeDispatch') : t('v2.overview.nodeBackend'),
      icon: isDispatch ? 'ri-git-merge-line' : 'ri-git-branch-line',
      meta: s?.path || t('v2.routes.placeholder'),
      showStats: true,
      qpsText: formatQps(s),
      p95Text: formatMs(toNum(s?.p95_latency_ms)),
      up,
      x: colX(depthOf(raw.id)),
      y: TOP_PAD + nextRow(depthOf(raw.id)) * ROW_PITCH,
      w: KIND_W[kind],
      h: 84 + (up ? 34 : 0)
    })
  }
  return laid
})

function formatQps(s?: RouteTrafficSummaryItem): string {
  const n = toNum(s?.qps)
  return Number.isFinite(n) ? String(Math.round(n)) : '—'
}

const canvasH = computed(() => Math.max(480, nodes.value.reduce((m, n) => Math.max(m, n.y + n.h), 0) + TOP_PAD))
const canvasW = computed(() => Math.max(620, nodes.value.reduce((m, n) => Math.max(m, n.x + n.w), 0) + 24))

// ── 连线 derivation ──────────────────────────────────────────────────────
interface LaidEdge {
  key: string
  d: string
  mx: number
  my: number
  label: string
}

const edges = computed<LaidEdge[]>(() => {
  const nodeByEid = new Map(nodes.value.map((n) => [n.eid, n]))
  const trafficById = new Map(traffic.value.map((s) => [s.route_id, s]))
  const parented = new Set(topoEdges.value.map((e) => e.target_id))
  const out: LaidEdge[] = []

  // 水平贝塞尔：源右缘中点 → 目标左缘中点，控制点水平外推
  const push = (from: LaidNode, to: LaidNode, label: string) => {
    const sx = from.x + from.w
    const sy = from.y + from.h / 2
    const tx = to.x
    const ty = to.y + to.h / 2
    const dx = Math.max(36, (tx - sx) / 2)
    out.push({
      key: `topo-edge-${from.eid}-${to.eid}`,
      d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`,
      mx: (sx + tx) / 2,
      my: (sy + ty) / 2,
      label
    })
  }

  const client = nodeByEid.get('client')
  const gw = nodeByEid.get('gw')
  if (client && gw) push(client, gw, '')

  // gw → 每个根节点（无父的 DISPATCH / 无父直连 BACKEND）
  for (const n of nodes.value) {
    if (n.kind === 'client' || n.kind === 'gateway' || parented.has(n.eid)) continue
    if (gw) push(gw, n, trafficById.get(n.eid)?.path || '')
  }

  // 分发→后置条件边（嵌套分发同样按 edges 走），标签优先 traffic.path，回退 condition 原文
  for (const e of topoEdges.value) {
    const from = nodeByEid.get(e.source_id)
    const to = nodeByEid.get(e.target_id)
    if (!from || !to) continue
    push(from, to, trafficById.get(e.target_id)?.path || e.condition || '')
  }
  return out
})
</script>

<style scoped lang="scss">
.v2-overview {
  --ov-violet: #7c5cff;
  min-width: 0;
}

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

/* —— KPI 4 卡 —— */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.kpi-card {
  display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; min-width: 0;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
.kpi-lb {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--app-text-secondary);
}
.kpi-v {
  font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--app-text); font-variant-numeric: tabular-nums;
}

/* —— 主栅格：左画布 + 右 336px 侧栏 —— */
.ov-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 336px;
  gap: 14px;
  align-items: start;
}
.ov-canvas-card,
.ov-card {
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
.ov-canvas-card {
  min-width: 0;
}
.ov-side {
  display: flex; flex-direction: column; gap: 14px; min-width: 0;
}
.ov-card-h {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-extra-light);

  b {
    font-size: 13px; color: var(--app-text);
  }
}
.ov-card-hint {
  margin-left: auto; font-size: 11.5px; color: var(--app-text-tertiary);
}
.ov-card-b {
  display: flex; flex-direction: column; gap: 10px; padding: 12px 16px;
}
.ov-badge {
  min-width: 18px; height: 18px; padding: 0 6px; margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--app-color-warning-text-on-tint);
  background: color-mix(in srgb, var(--app-color-warning) 14%, transparent);
  border-radius: var(--app-radius-full);
}
.ov-link {
  margin-left: auto; font-size: 12px; color: var(--app-text-link); text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
.ov-empty {
  font-size: 12px; color: var(--app-text-tertiary);
}

/* —— 画布：点阵背景 + SVG 边 + 绝对定位节点 —— */
.topo-scroll {
  overflow-x: auto;
}
.topo-viewport {
  position: relative; min-height: 480px;
}
.topo-dots {
  position: absolute; inset: 0; pointer-events: none; background-size: 18px 18px;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--app-border-strong) 28%, transparent) 1px, transparent 1px);
}
.topo-edges {
  position: absolute; top: 0; left: 0;
}
.topo-edge path {
  fill: none;
  stroke: color-mix(in srgb, var(--app-border-strong) 55%, transparent);
  stroke-width: 1.6;
}
.topo-edge-label {
  font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  fill: var(--app-text-secondary);
  /* 文字描边用卡片底色，压住穿过的连线保证可读 */
  paint-order: stroke;
  stroke: var(--app-bg-card);
  stroke-width: 3px;
}

/* 节点卡：白底圆角 + 类型色边框（violet=分发 / warning 暖色=网关 / 绿系 chip=上游） */
.topo-node {
  position: absolute;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--app-bg-card);
  border: 1px solid color-mix(in srgb, var(--app-border-strong) 40%, transparent);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);

  &.is-dispatch {
    border-color: color-mix(in srgb, var(--ov-violet) 45%, transparent);
    background: color-mix(in srgb, var(--ov-violet) 4%, var(--app-bg-card));

    .tn-type {
      color: color-mix(in srgb, var(--ov-violet) 60%, var(--app-text));
      background: color-mix(in srgb, var(--ov-violet) 12%, transparent);
    }
  }
  &.is-gateway {
    border-color: color-mix(in srgb, var(--app-color-warning) 45%, transparent);
    background: color-mix(in srgb, var(--app-color-warning) 5%, var(--app-bg-card));
  }
  &.is-client {
    opacity: 0.6;
  }
}
.tn-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 600; color: var(--app-text); white-space: nowrap;

  .tn-name {
    min-width: 0; overflow: hidden; text-overflow: ellipsis;
  }
}
.tn-type {
  flex: none; padding: 1px 6px; font-size: 10px; font-weight: 500;
  color: var(--app-text-secondary); background: var(--app-bg-muted); border-radius: var(--app-radius-full);
}
.tn-meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-stats {
  display: flex; gap: 10px; margin-top: 6px; padding-top: 6px;
  font-size: 11px; color: var(--app-text-secondary);
  border-top: 1px dashed var(--app-border-extra-light);

  b {
    font-weight: 600; color: var(--app-text); font-variant-numeric: tabular-nums;
  }
}
.tn-up {
  display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 8px;
  font-size: 11px; color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-color-success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-success) 35%, transparent);
  border-radius: var(--app-radius-md);
}
.tn-up-ms {
  margin-left: auto; font-variant-numeric: tabular-nums;
}
.topo-dot {
  flex: none;
  width: 8px;
  height: 8px;
  background: var(--app-text-quaternary);
  border-radius: 50%;

  &[data-state='ok'] {
    background: var(--app-color-success);
  }
  &[data-state='warn'] {
    background: var(--app-color-warning);
  }
}

/* —— 右栏：待处理 / 事件 / 上游健康 —— */
.pending-item {
  display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--app-text);

  .fc-icon {
    flex: none;
    color: var(--app-primary);
  }
  &.is-bad .fc-icon {
    color: var(--app-color-warning);
  }
}
.event-item {
  display: flex; flex-direction: column; gap: 2px; padding-bottom: 10px;
  border-bottom: 1px dashed var(--app-border-extra-light);

  &:last-of-type {
    padding-bottom: 0;
    border-bottom: none;
  }

  .event-action {
    font-size: 12px; font-weight: 600; color: var(--app-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .event-meta {
    font-size: 11px; color: var(--app-text-tertiary);
  }
}
.up-row {
  display: flex; align-items: center; gap: 8px; font-size: 12.5px;
}
.up-name {
  flex: none; width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--app-text);
}
.up-state {
  margin-left: auto; font-size: 11.5px; color: var(--app-text-secondary); font-variant-numeric: tabular-nums;

  &.is-bad {
    color: var(--app-color-warning-text);
  }
}
.pbar-track {
  height: 6px; overflow: hidden; background: var(--app-bg-muted); border-radius: var(--app-radius-full);
}
.pbar-fill {
  display: block; height: 100%; background: var(--app-primary); border-radius: var(--app-radius-full);
}

/* 窄视口：右栏下沉、KPI 折两列（画布自身容器内横滚） */
@media (max-width: 1100px) {
  .ov-grid {
    grid-template-columns: 1fr;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
