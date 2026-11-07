<template>
  <div class="v2-monitor" data-testid="mon-page">
    <FcSection>
      <!-- Page head: main title reuses v2.page.monitor + monitor-specific subtitle -->
      <div class="mon-head">
        <h1>{{ t('v2.page.monitor') }}</h1>
        <p class="mon-head-sub">{{ t('v2.monitor.subtitle') }}</p>
      </div>
      <!-- Snapshot fallback hint: shown whenever ANY row reports source=snapshot (S3/S6 lenient rule) -->
      <div v-if="showSnapshotHint" class="hint-banner is-warn" data-testid="mon-source-hint" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.monitor.snapshotHint') }}</span>
      </div>
      <!-- Traffic metrics load failure: global banner; traffic-fed zones degrade, upstream zone stays live -->
      <div v-if="trafficFailed" class="hint-banner is-error" data-testid="mon-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.monitor.loadFailed') }}</span>
      </div>

      <!-- KPI row: 5 aggregate cards -->
      <div class="kpi-grid">
        <div v-for="k in kpiCards" :key="k.tid" class="kpi-card" :data-testid='k.tid'>
          <span class="kpi-lb"><FcIcon :name="k.icon" :size="13" />{{ k.label }}</span>
          <span class="kpi-v">{{ k.value }}</span>
        </div>
      </div>

      <!-- Upstream health: single-upstream semantics, Overview up-row shape (no instance matrix) -->
      <div class="mon-card" data-testid="mon-upstream-card">
        <div class="mon-card-h"><b>{{ t('v2.monitor.upstreamTitle') }}</b></div>
        <div class="mon-card-b">
          <div v-if="statusFailed" class="hint-banner is-error" data-testid="mon-upstream-error" role="alert">
            <FcIcon name="ri-error-warning-line" :size="14" />
            <span>{{ t('v2.monitor.upstreamFailed') }}</span>
          </div>
          <template v-else>
            <div v-for="r in upRows" :key="r.id" class="up-row" :data-testid='"mon-up-row-" + r.id'>
              <span class="mon-dot" :data-state="r.state" aria-hidden="true"></span>
              <span class="up-name">{{ r.name }}</span>
              <span class="up-state" :class="{ 'is-bad': r.state === 'warn' }">{{ r.label }}</span>
              <span v-if="r.ms" class="up-ms">{{ r.ms }}</span>
            </div>
            <div v-if="upBadN > 0" class="up-bad" data-testid="mon-up-bad">
              <FcIcon name="ri-error-warning-line" :size="13" />
              <span>{{ t('v2.monitor.upBadCount', { n: upBadN }) }}</span>
            </div>
            <div v-if="upRows.length" class="pbar-track" aria-hidden="true">
              <i class="pbar-fill" data-testid="mon-up-pbar" :style="{ width: upPct }"></i>
            </div>
            <span v-if="!upRows.length" class="mon-empty" data-testid="mon-upstream-empty">{{ t('v2.monitor.upstreamEmpty') }}</span>
          </template>
        </div>
      </div>

      <!-- Slow routes Top5: p95 desc; bar width relative to list max; hot >= 300ms / warm < 300ms; null = no bar -->
      <div class="mon-card" data-testid="mon-slow-card">
        <div class="mon-card-h">
          <b>{{ t('v2.monitor.slowTitle') }}</b>
          <span class="mon-card-hint">{{ t('v2.monitor.slowHint') }}</span>
        </div>
        <div class="mon-card-b">
          <div v-for="(r, i) in slowRows" :key="r.id" class="slow-row" :data-testid='"mon-slow-row-" + r.id'>
            <span class="slow-rank">{{ i + 1 }}</span>
            <span class="slow-name">{{ r.name }}</span>
            <span class="slow-path">{{ r.path }}</span>
            <span class="slow-val" :data-testid='"mon-slow-val-" + r.id'>{{ r.val }}</span>
            <span class="slow-bar" aria-hidden="true">
              <i v-if="r.barPct" class="slow-bar-fill" :class="r.cls" :data-testid='"mon-slow-pbar-" + r.id' :style="{ width: r.barPct }"></i>
            </span>
          </div>
          <span v-if="!slowRows.length" class="mon-empty" data-testid="mon-slow-empty">{{ t('v2.monitor.slowEmpty') }}</span>
        </div>
      </div>

      <!-- Status code donut: SVG stroke-dasharray ring (Detail.vue dtl-ring precedent), three aggregate buckets -->
      <div class="mon-card" data-testid="mon-donut">
        <div class="mon-card-h">
          <b>{{ t('v2.monitor.donutTitle') }}</b>
          <span class="mon-card-hint">{{ t('v2.monitor.donutHint') }}</span>
        </div>
        <div class="mon-card-b">
          <div v-if="donut" class="donut-body">
            <svg class="mon-ring" viewBox="0 0 74 74" role="img" :aria-label="t('v2.monitor.donutTitle')" data-testid="mon-ring">
              <circle class="mon-ring-track" cx="37" cy="37" r="30" />
              <g transform="rotate(-90 37 37)">
                <circle v-for="seg in donut.segs" :key="seg.key" class="mon-ring-seg" :class="seg.cls" cx="37" cy="37" r="30" :stroke-dasharray="seg.dash" :stroke-dashoffset="seg.offset" />
              </g>
              <text class="mon-ring-num" x="37" y="41" text-anchor="middle" data-testid="mon-ring-total">{{ donut.totalText }}</text>
            </svg>
            <div class="donut-buckets">
              <div v-for="seg in donut.segs" :key="seg.key" class="bucket" :data-testid='"mon-bucket-" + seg.key'>
                <i class="bucket-dot" :class="seg.cls" aria-hidden="true"></i>
                <span class="bucket-name">{{ seg.name }}</span>
                <b class="bucket-val">{{ seg.hits }}</b>
                <span class="bucket-pct">{{ seg.pct }}</span>
              </div>
            </div>
          </div>
          <span v-else class="mon-empty" data-testid="mon-donut-empty">{{ t('v2.monitor.donutEmpty') }}</span>
        </div>
      </div>

      <!-- Gateway timeseries zone (P4b-2b): range seg + peak KPI + two hand-drawn SVG charts.
           Gateway level has NO legacy route-scoped endpoint to fall back to — failure is a
           banner + empty charts + peak dash, no hybrid legacy source. -->
      <div class="ts-zone">
        <div v-if="tsFailed" class="hint-banner is-error" data-testid="mon-ts-error" role="alert">
          <FcIcon name="ri-error-warning-line" :size="14" />
          <span>{{ t('v2.monitor.tsLoadFailed') }}</span>
        </div>
        <div v-if="tsQuantileFallback" class="hint-banner is-warn" data-testid="mon-quantile-fallback" role="status">
          <FcIcon name="ri-error-warning-line" :size="14" />
          <span>{{ t('v2.monitor.quantileFallbackHint') }}</span>
        </div>
        <div class="ts-toolbar">
          <span class="ts-range-label">{{ t('v2.monitor.rangeLabel') }}</span>
          <FcSegmented v-model="timeRange" :options="rangeOpts" size="sm" data-testid="mon-range-seg" @change="loadTimeseries" />
          <span v-if="tsSource" class="ts-source" data-testid="mon-ts-source" :data-state="tsSource">
            {{ tsSource === 'snapshot' ? t('v2.monitor.sourceSnapshot') : t('v2.monitor.sourcePrometheus') }}
          </span>
        </div>
        <div class="kpi-card ts-peak" data-testid="mon-kpi-peak">
          <span class="kpi-lb"><FcIcon name="ri-arrow-up-line" :size="13" />{{ t('v2.monitor.peakQps') }}</span>
          <span class="kpi-v">{{ peakText }}</span>
        </div>
        <div class="ts-charts">
          <!-- QPS area chart: gateway total series, SINGLE line (upstream side of the prototype
               dual-line has no endpoint — no fabricated series) + closed area path (prototype 08) -->
          <div class="mon-card" data-testid="mon-chart-qps">
            <div class="mon-card-h">
              <b>{{ t('v2.monitor.chartQpsTitle') }}</b>
              <span class="mon-card-hint">{{ t('v2.monitor.chartQpsHint') }}</span>
            </div>
            <div class="mon-card-b">
              <svg v-if="qpsValues.length" class="ts-chart" viewBox="0 0 320 120" role="img" :aria-label="t('v2.monitor.chartQpsTitle')">
                <line class="ts-grid" x1="0" y1="30" x2="320" y2="30" />
                <line class="ts-grid" x1="0" y1="60" x2="320" y2="60" />
                <line class="ts-grid" x1="0" y1="90" x2="320" y2="90" />
                <path class="ts-area" :d="qpsArea" fill="currentColor" />
                <polyline class="ts-line is-primary" :points="qpsPointsStr" />
              </svg>
              <span v-else class="mon-empty">{{ t('v2.monitor.chartEmpty') }}</span>
            </div>
          </div>
          <!-- Latency quantile chart: p50/p95/p99 three lines (Detail scaling precedent);
               quantile_fallback=true means avg-degraded values (drawable, not null placeholders) -->
          <div class="mon-card" data-testid="mon-chart-latency">
            <div class="mon-card-h">
              <b>{{ t('v2.monitor.chartLatencyTitle') }}</b>
              <span class="mon-card-hint">{{ t('v2.monitor.chartLatencyHint') }}</span>
              <span v-if="quantileLines.length" class="ts-legend">
                <span v-for="q in quantileLines" :key="q.attr" class="ts-legend-item">
                  <i class="ts-legend-dot" :class="q.cls" aria-hidden="true"></i>{{ q.label }}
                </span>
              </span>
            </div>
            <div class="mon-card-b">
              <svg v-if="quantileLines.length" class="ts-chart" viewBox="0 0 320 120" role="img" :aria-label="t('v2.monitor.chartLatencyTitle')">
                <line class="ts-grid" x1="0" y1="30" x2="320" y2="30" />
                <line class="ts-grid" x1="0" y1="60" x2="320" y2="60" />
                <line class="ts-grid" x1="0" y1="90" x2="320" y2="90" />
                <polyline v-for="q in quantileLines" :key="q.attr" class="ts-line" :class="q.cls" :data-quantile="q.attr" :points="q.points" />
              </svg>
              <span v-else class="mon-empty">{{ t('v2.monitor.chartEmpty') }}</span>
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
import { FcIcon, FcSection, FcSegmented } from '@/components'
import {
  fetchTrafficSummary, fetchGatewayTimeseries,
  type RouteTrafficSummaryItem, type GatewayTimeseriesPoint
} from '@/api/v2'
import { listRouteStatus, type RouteStatusItem } from '@/api/misc'

/**
 * P4b-1C：v2 监控大盘静态版（契约 docs/ui-v2/实施契约.md §4 P4b 行 P4b-1；视觉参照原型 08）。
 * 两源两区独立降级（Overview 先例）：fetchTrafficSummary（KPI 四卡 + 慢路由 Top5 + donut）与
 * listRouteStatus（上游健康卡 + Σactive_connections）互不拖垮；砍除项（告警/环境/delta/实例矩阵）缺口不造数。
 */
const { t } = useI18n()

const traffic = ref<RouteTrafficSummaryItem[]>([])
const trafficFailed = ref(false)
const statuses = ref<RouteStatusItem[]>([])
const statusFailed = ref(false)

onMounted(() => {
  void loadTraffic()
  void loadStatus()
  void loadTimeseries()
})

/** KPI/Top5/donut 数据源；失败降级为全 — 而非整页报错 */
async function loadTraffic() {
  try {
    traffic.value = await fetchTrafficSummary()
    trafficFailed.value = false
  } catch {
    traffic.value = []
    trafficFailed.value = true
  }
}

/** 上游健康 + 连接数数据源；失败只降级上游卡与连接数卡，traffic 区不被污染 */
async function loadStatus() {
  try {
    statuses.value = await listRouteStatus()
    statusFailed.value = false
  } catch {
    statuses.value = []
    statusFailed.value = true
  }
}

/** Long→String 契约兜底：数值/数值字符串归一，null/undefined → NaN（展示为 — 或按 0 求和） */
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** 命中量千分位缩写（Overview formatHits 同口径）：k 取整；M/B 一位小数去尾 0 */
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

// ── KPI 五卡 ─────────────────────────────────────────────────────────────
const sumHits = computed(() => traffic.value.reduce((acc, s) => acc + (toNum(s.hits_24h) || 0), 0))
const sumQps = computed(() => traffic.value.reduce((acc, s) => acc + (toNum(s.qps) || 0), 0))
const meanP95 = computed(() => {
  const vals = traffic.value.map((s) => toNum(s.p95_latency_ms)).filter(Number.isFinite)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN
})
/** 错误率 = Σ(c4xx+c5xx) ÷ Σhits × 100（status_codes 两桶推导，不造新字段）；Σhits=0 → — */
const sumErrors = computed(() => traffic.value.reduce((acc, s) => {
  const sc = s.status_codes
  if (!sc) return acc
  return acc + (toNum(sc.c4xx) || 0) + (toNum(sc.c5xx) || 0)
}, 0))
const sumConn = computed(() => statuses.value.reduce((acc, s) => acc + (toNum(s.active_connections) || 0), 0))

interface KpiCard { tid: string; icon: string; label: string; value: string }

const kpiCards = computed<KpiCard[]>(() => [
  { tid: 'mon-kpi-hits', icon: 'ri-bar-chart-2-line', label: t('v2.monitor.kpiHits'), value: trafficFailed.value ? '—' : formatHits(sumHits.value) },
  { tid: 'mon-kpi-qps', icon: 'ri-flashlight-line', label: t('v2.monitor.kpiQps'), value: trafficFailed.value ? '—' : String(Math.round(sumQps.value)) },
  { tid: 'mon-kpi-p95', icon: 'ri-timer-line', label: t('v2.monitor.kpiP95'), value: trafficFailed.value || !Number.isFinite(meanP95.value) ? '—' : `${Math.round(meanP95.value)} ms` },
  { tid: 'mon-kpi-error', icon: 'ri-error-warning-line', label: t('v2.monitor.kpiErrorRate'), value: trafficFailed.value || !(sumHits.value > 0) ? '—' : `${((sumErrors.value / sumHits.value) * 100).toFixed(2)}%` },
  { tid: 'mon-kpi-connections', icon: 'ri-server-line', label: t('v2.monitor.kpiConnections'), value: statusFailed.value ? '—' : String(sumConn.value) }
])

// ── 快照提示（宽松口径：凡 snapshot 即显，不等 quantile_fallback）────────────
const showSnapshotHint = computed(() => traffic.value.some((s) => s.source === 'snapshot'))

// ── 上游健康（单上游降维；upstream!=null 才入行）────────────────────────────
type UpstreamHealth = NonNullable<RouteStatusItem['upstream']>
interface UpRow { id: string; name: string; state: 'ok' | 'warn'; label: string; ms: string }

const upRows = computed<UpRow[]>(() =>
  statuses.value
    .filter((s): s is RouteStatusItem & { upstream: UpstreamHealth } => s.upstream != null)
    .map((s) => {
      const ms = toNum(s.upstream.latency_ms)
      const bad = s.upstream.reachable === false
      return {
        id: s.route_id, name: s.route_name,
        state: bad ? 'warn' as const : 'ok' as const,
        label: bad ? t('v2.monitor.upBad') : t('v2.monitor.upOk'),
        ms: Number.isFinite(ms) ? `${ms} ms` : ''
      }
    })
)
const upBadN = computed(() => upRows.value.filter((r) => r.state === 'warn').length)
const upPct = computed(() => {
  const all = upRows.value.length
  return all ? `${Math.round(((all - upBadN.value) / all) * 100)}%` : '0%'
})

// ── 慢路由 Top5（p95 降序取 5；null 排后仍可入榜但无 bar 无值；宽度 ∝ 榜内最大）─
interface SlowRow { id: string; name: string; path: string; val: string; barPct: string; cls: string }

const SLOW_HOT_MS = 300

const slowRows = computed<SlowRow[]>(() => {
  if (trafficFailed.value) return []
  const ranked = traffic.value
    .map((s) => ({ id: s.route_id, name: s.route_name, path: s.path, p95: toNum(s.p95_latency_ms) }))
    // null (NaN) 排榜尾；NaN 之间比较器恒 0，稳定排序保留原相对顺序
    .sort((a, b) => (Number.isFinite(b.p95) ? b.p95 : -1) - (Number.isFinite(a.p95) ? a.p95 : -1))
    .slice(0, 5)
  const max = Math.max(...ranked.filter((r) => Number.isFinite(r.p95)).map((r) => r.p95), 0)
  return ranked.map((r) => {
    const has = Number.isFinite(r.p95)
    return {
      id: r.id, name: r.name, path: r.path,
      val: has ? `${r.p95} ms` : '—',
      barPct: has && max > 0 ? `${Math.round((r.p95 / max) * 100)}%` : '',
      cls: has && r.p95 >= SLOW_HOT_MS ? 'is-hot' : 'is-warm'
    }
  })
})

// ── 状态码 donut（Σstatus_codes 三桶；Detail.vue dtl-ring 先例）──────────────
const RING_R = 30
const RING_C = 2 * Math.PI * RING_R
const round2 = (v: number): number => Math.round(v * 100) / 100
/** 占比一位小数（Math.round(p*10)/10），整数不带小数点（Detail pctText 同款） */
function pctText(p: number): string {
  const r = Math.round(p * 10) / 10
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`
}

interface RingSeg { key: 'c2xx' | 'c4xx' | 'c5xx'; name: string; cls: string; hits: string; pct: string; dash: string; offset: number }

const donut = computed<{ totalText: string; segs: RingSeg[] } | null>(() => {
  const counts = traffic.value.reduce<number[]>((acc, s) => {
    const sc = s.status_codes
    if (!sc) return acc
    return [acc[0] + (toNum(sc.c2xx) || 0), acc[1] + (toNum(sc.c4xx) || 0), acc[2] + (toNum(sc.c5xx) || 0)]
  }, [0, 0, 0])
  const total = counts[0] + counts[1] + counts[2]
  if (total <= 0) return null
  const keys = ['c2xx', 'c4xx', 'c5xx'] as const
  const names = ['2xx', '4xx', '5xx']
  const clss = ['is-2xx', 'is-4xx', 'is-5xx']
  let cumulative = 0
  const segs = counts.map((v, i): RingSeg => {
    const pct = (v / total) * 100
    const len = (Math.max(0, Math.min(100, pct)) / 100) * RING_C
    const seg: RingSeg = {
      key: keys[i], name: names[i], cls: clss[i],
      hits: formatHits(v), pct: pctText(pct),
      dash: `${round2(len)} ${round2(RING_C - len)}`,
      offset: round2(-(cumulative / 100) * RING_C)
    }
    cumulative += pct
    return seg
  })
  return { totalText: formatHits(total), segs }
})

// ── 网关级时序区（P4b-2b）：时间范围 seg → 聚合时序 → 峰值/双图卡 ────────────
const tsPoints = ref<GatewayTimeseriesPoint[]>([])
const tsSource = ref<'prometheus' | 'snapshot' | ''>('')
const tsQuantileFallback = ref(false)
const tsFailed = ref(false)
const timeRange = ref('24h')

/** 时间范围 → (time_range, granularity) 双参显式映射（后端既有档位，均 ≤ 500 点上限） */
const RANGE_PARAMS: Record<string, [string, string]> = {
  '1h': ['1h', '1m'],
  '24h': ['24h', '1h'],
  '7d': ['7d', '1h']
}

const rangeOpts = computed(() => [
  { value: '1h', label: t('v2.monitor.range1h') },
  { value: '24h', label: t('v2.monitor.range24h') },
  { value: '7d', label: t('v2.monitor.range7d') }
])

/** loadEpoch 竞态守卫（plugins List.load-epoch 随迁）：慢请求挂起切档先返回者胜，
 * 陈旧响应后到不覆盖、不闪空 */
let tsEpoch = 0

async function loadTimeseries() {
  const myEpoch = ++tsEpoch
  const [range, granularity] = RANGE_PARAMS[timeRange.value] ?? ['24h', '1h']
  try {
    const res = await fetchGatewayTimeseries(range, granularity)
    if (myEpoch !== tsEpoch) return
    tsPoints.value = res.data_points ?? []
    tsSource.value = res.source
    tsQuantileFallback.value = res.quantile_fallback === true
    tsFailed.value = false
  } catch {
    if (myEpoch !== tsEpoch) return
    // 网关级无旧端点可回退：失败 = 错误条 + 图区空态 + 峰值 —，不混布旧路由级数据
    tsPoints.value = []
    tsSource.value = ''
    tsQuantileFallback.value = false
    tsFailed.value = true
  }
}

// ── 图形几何（Detail 四联图缩放先例：viewBox 内留 pad，最低可见 2px）─────────
const TS_CHART_W = 320
const TS_CHART_H = 120
const TS_CHART_PAD = 10

function roundTs(v: number): number {
  return Math.round(v * 100) / 100
}

/** 序列 → polyline points（x,y 坐标对空格分隔；单点退化为水平短线） */
function tsLinePoints(values: number[]): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const stepX = values.length > 1 ? (TS_CHART_W - TS_CHART_PAD * 2) / (values.length - 1) : 0
  return values
    .map((v, i) => {
      const x = TS_CHART_PAD + i * stepX
      const h = Math.max(2, (Math.max(0, v) / max) * (TS_CHART_H - TS_CHART_PAD * 2))
      return `${roundTs(x)},${roundTs(TS_CHART_H - TS_CHART_PAD - h)}`
    })
    .join(' ')
}

const qpsValues = computed(() => tsPoints.value.map((p) => Math.max(0, toNum(p.total_requests) || 0)))
const qpsPointsStr = computed(() => tsLinePoints(qpsValues.value))

/** QPS 面积 path：同序列闭包沿底线（y=H-PAD）回封、Z 收口（原型 08 形态） */
const qpsArea = computed(() => {
  const pairs = qpsPointsStr.value.split(' ').filter(Boolean)
  if (!pairs.length) return ''
  const baseY = roundTs(TS_CHART_H - TS_CHART_PAD)
  const firstX = pairs[0]?.split(',')[0] ?? ''
  const lastX = pairs[pairs.length - 1]?.split(',')[0] ?? ''
  return `M${pairs.join(' L')} L${lastX},${baseY} L${firstX},${baseY} Z`
})

/** 延迟分位三线：任一点缺值即放弃该线（Detail quantile 先例）。quantile_fallback=true
 * 时后端已按 avg 退化填充（有值，非 null 占位）→ 三线照画，语义见 mon-quantile-fallback */
const QUANTILE_DEFS = [
  { key: 'p50_latency_ms', attr: 'p50', label: 'P50', cls: 'is-q50' },
  { key: 'p95_latency_ms', attr: 'p95', label: 'P95', cls: 'is-q95' },
  { key: 'p99_latency_ms', attr: 'p99', label: 'P99', cls: 'is-q99' }
] as const

const quantileLines = computed(() => {
  if (!tsPoints.value.length) return []
  const lines: Array<{ attr: string; label: string; cls: string; points: string }> = []
  for (const def of QUANTILE_DEFS) {
    const series = tsPoints.value.map((p) => toNum(p[def.key]))
    if (!series.every(Number.isFinite)) continue
    lines.push({ attr: def.attr, label: def.label, cls: def.cls, points: tsLinePoints(series.map((n) => Math.max(0, n))) })
  }
  return lines
})

// ── 峰值 @ 时刻（序列 max 真实推导，非造数；并列取首个稳定）──────────────────
/** 同日 HH:mm / 跨天 MM-DD HH:mm（旧大盘 chart-axis「跨天带日期」口径随迁，精度到分） */
function tsPeakTime(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hm}`
}

const peakText = computed(() => {
  if (tsFailed.value) return '—'
  let best: { v: number; d: Date } | null = null
  for (const p of tsPoints.value) {
    const v = toNum(p.total_requests)
    const d = new Date(p.timestamp)
    // timestamp 解析失败 / 值缺失的点不参与峰值
    if (!Number.isFinite(v) || Number.isNaN(d.getTime())) continue
    if (!best || v > best.v) best = { v, d }
  }
  return best ? `${formatHits(best.v)} @ ${tsPeakTime(best.d)}` : '—'
})
</script>

<style scoped lang="scss">
.v2-monitor { min-width: 0; }

/* —— 页头 —— */
.mon-head {
  margin-bottom: 14px;

  h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: var(--app-text); }
}
.mon-head-sub { margin: 4px 0 0; font-size: 12px; color: var(--app-text-tertiary); }

/* —— 提示条（快照兜底 / 流量加载失败 / 上游卡局部失败）—— */
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

/* —— KPI 5 卡 —— */
.kpi-grid {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px;
}
.kpi-card {
  display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; min-width: 0;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
.kpi-lb { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--app-text-secondary); }
.kpi-v { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--app-text); font-variant-numeric: tabular-nums; }

/* —— 卡片通用（上游健康 / 慢路由 / donut）—— */
.mon-card {
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);

  & + .mon-card { margin-top: 14px; }
}
.mon-card-h {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-extra-light);

  b { font-size: 13px; color: var(--app-text); }
}
.mon-card-hint { margin-left: auto; font-size: 11.5px; color: var(--app-text-tertiary); }
.mon-card-b { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
.mon-empty { font-size: 12px; color: var(--app-text-tertiary); }

/* —— 上游健康：Overview up-row 同形态 —— */
.up-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.mon-dot {
  flex: none; width: 8px; height: 8px; background: var(--app-text-quaternary); border-radius: 50%;

  &[data-state='ok'] { background: var(--app-color-success); }
  &[data-state='warn'] { background: var(--app-color-warning); }
}
.up-name { flex: none; width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--app-text); }
.up-state {
  margin-left: auto; white-space: nowrap; font-size: 11.5px; color: var(--app-text-secondary); font-variant-numeric: tabular-nums;

  &.is-bad { color: var(--app-color-warning-text); }
}
.up-ms { flex: none; min-width: 52px; text-align: right; font-size: 11.5px; color: var(--app-text-tertiary); font-variant-numeric: tabular-nums; }
.up-bad { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--app-color-warning-text); }
.pbar-track { height: 6px; overflow: hidden; background: var(--app-bg-muted); border-radius: var(--app-radius-full); }
.pbar-fill { display: block; height: 100%; background: var(--app-primary); border-radius: var(--app-radius-full); }

/* —— 慢路由 Top5 —— */
.slow-row {
  display: grid; grid-template-columns: 20px 170px minmax(0, 1fr) 70px 200px;
  align-items: center; gap: 10px; font-size: 12.5px;
}
.slow-rank { font-size: 11px; color: var(--app-text-tertiary); font-variant-numeric: tabular-nums; }
.slow-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--app-text); font-weight: 500; }
.slow-path {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.slow-val { text-align: right; color: var(--app-text); font-variant-numeric: tabular-nums; }
.slow-bar { height: 6px; overflow: hidden; background: var(--app-bg-muted); border-radius: var(--app-radius-full); }
.slow-bar-fill {
  display: block; height: 100%; border-radius: var(--app-radius-full);

  &.is-hot { background: var(--app-color-danger); }
  &.is-warm { background: var(--app-color-warning); }
}

/* —— 状态码 donut：Detail dtl-ring 同款 SVG 环 + 三桶行 —— */
.donut-body { display: flex; align-items: center; gap: 14px; }
.mon-ring { flex: none; width: 74px; height: 74px; }
.mon-ring-track { fill: none; stroke: var(--app-bg-muted); stroke-width: 10; }
.mon-ring-seg {
  fill: none; stroke-width: 10;

  &.is-2xx { stroke: var(--app-color-success); }
  &.is-4xx { stroke: var(--app-color-warning); }
  &.is-5xx { stroke: var(--app-color-danger); }
}
.mon-ring-num { font-size: 12px; font-weight: 600; fill: var(--app-text); font-variant-numeric: tabular-nums; }
.donut-buckets { display: flex; flex: 1; flex-direction: column; gap: 6px; min-width: 0; }
.bucket { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--app-text-secondary); }
.bucket-dot {
  flex: none; width: 8px; height: 8px; border-radius: 2px;

  &.is-2xx { background: var(--app-color-success); }
  &.is-4xx { background: var(--app-color-warning); }
  &.is-5xx { background: var(--app-color-danger); }
}
.bucket-name { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.bucket-val { margin-left: auto; color: var(--app-text); font-variant-numeric: tabular-nums; }
.bucket-pct { flex: none; min-width: 44px; text-align: right; color: var(--app-text-tertiary); font-variant-numeric: tabular-nums; }

/* —— 网关级时序区（P4b-2b：seg 工具行 + 峰值卡 + 双图卡）—— */
.ts-zone { margin-top: 14px; }
.ts-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.ts-range-label { font-size: 12px; color: var(--app-text-secondary); }
.ts-source {
  display: inline-flex; align-items: center; gap: 6px; margin-left: auto; padding: 3px 10px;
  font-size: 11.5px; border-radius: var(--app-radius-full); font-variant-numeric: tabular-nums;
  color: var(--app-text-secondary); background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light);

  &[data-state='prometheus'] {
    color: var(--app-color-success-text);
    background: color-mix(in srgb, var(--app-color-success) 10%, transparent);
    border-color: color-mix(in srgb, var(--app-color-success) 28%, transparent);
  }
  &[data-state='snapshot'] {
    color: var(--app-color-warning-text);
    background: color-mix(in srgb, var(--app-color-warning) 10%, transparent);
    border-color: color-mix(in srgb, var(--app-color-warning) 28%, transparent);
  }
}
.ts-peak { margin-bottom: 14px; }
.ts-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ts-chart { display: block; width: 100%; height: auto; }
.ts-grid { stroke: var(--app-border-extra-light); stroke-width: 1; }
.ts-line {
  fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;

  &.is-primary { stroke: var(--app-primary); }
  &.is-q50 { stroke: var(--app-text-quaternary); }
  &.is-q95 { stroke: var(--app-primary); }
  &.is-q99 { stroke: color-mix(in srgb, var(--app-color-warning) 80%, transparent); }
}
.ts-area { color: var(--app-primary); fill: currentColor; opacity: 0.08; }
.ts-legend { display: inline-flex; align-items: center; gap: 10px; }
.ts-legend-item {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px;
  color: var(--app-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ts-legend-dot {
  width: 8px; height: 8px; border-radius: 2px;

  &.is-q50 { background: var(--app-text-quaternary); }
  &.is-q95 { background: var(--app-primary); }
  &.is-q99 { background: color-mix(in srgb, var(--app-color-warning) 80%, transparent); }
}

/* 窄视口：5 卡折列（CSS-only，S6 同弃 jsdom 实测）。
   1280 档：慢路由行 name/bar 轨道改 minmax(0,N) 可收缩（≥761px 任一宽度不横向溢出；
   20px 序号/70px 耗值保留定宽 —— 内容仅数字符，且定宽让各行 pbar 左缘对齐）。 */
@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .slow-row { grid-template-columns: 20px minmax(0, 140px) minmax(0, 1fr) 70px minmax(0, 140px); }
}
/* 760 档（手机）：上游行名称改弹性（ellipsis 让位给状态/耗时）；慢路由行藏 pbar、
   path 折到名称下方第二行 —— 375 视口五列单行放不下（实测 464px 溢出根因）。
   时序区：图卡满宽单列、工具行换行（P4b-2b 随 P4b-1 响应式模式）。 */
@media (max-width: 760px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .up-name { flex: 1 1 auto; width: auto; min-width: 0; }
  .slow-row { grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px 8px; }
  .slow-bar { display: none; }
  .slow-path { grid-column: 2; grid-row: 2; }
  .ts-charts { grid-template-columns: minmax(0, 1fr); }
  .ts-toolbar { flex-wrap: wrap; }
  .ts-source { margin-left: 0; }
}
</style>
