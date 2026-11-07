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
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcIcon, FcSection } from '@/components'
import { fetchTrafficSummary, type RouteTrafficSummaryItem } from '@/api/v2'
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

/* 窄视口：5 卡折列（CSS-only，S6 同弃 jsdom 实测）。
   1280 档：慢路由行 name/bar 轨道改 minmax(0,N) 可收缩（≥761px 任一宽度不横向溢出；
   20px 序号/70px 耗值保留定宽 —— 内容仅数字符，且定宽让各行 pbar 左缘对齐）。 */
@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .slow-row { grid-template-columns: 20px minmax(0, 140px) minmax(0, 1fr) 70px minmax(0, 140px); }
}
/* 760 档（手机）：上游行名称改弹性（ellipsis 让位给状态/耗时）；慢路由行藏 pbar、
   path 折到名称下方第二行 —— 375 视口五列单行放不下（实测 464px 溢出根因）。 */
@media (max-width: 760px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .up-name { flex: 1 1 auto; width: auto; min-width: 0; }
  .slow-row { grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px 8px; }
  .slow-bar { display: none; }
  .slow-path { grid-column: 2; grid-row: 2; }
}
</style>
