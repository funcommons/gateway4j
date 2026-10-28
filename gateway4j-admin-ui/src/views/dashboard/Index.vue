<template>
  <div class="app-page">
    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>

    <FcSection>
      <FcSkeleton v-if="loadingStatus" variant="card" :rows="5" />
      <div v-else class="stat-grid">
        <FcSectionCard v-for="s in stats" :key="s.label" class="stat">
          <div class="stat-label">{{ s.label }}</div>
          <div class="stat-value">{{ s.value }}</div>
        </FcSectionCard>
      </div>
    </FcSection>

    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-status>
          <div class="status-toolbar">
            <FcInput v-model="statusKeyword" :placeholder="t('route.searchPlaceholder')" clearable style="width: 200px" />
            <FcSegmented v-model="statusFilter" :options="statusFilterOptions" />
          </div>
          <FcTable :data="filteredStatuses" :loading="loadingStatus" stripe @row-click="onStatusRowClick">
            <el-table-column prop="route_name" :label="t('route.name')" />
            <el-table-column :label="t('monitor.status')" width="120">
              <template #default="{ row }">
                <FcStatusBadge
                  :tone="row.status === 'HEALTHY' ? 'success' : row.status === 'ERROR' ? 'error' : row.status === 'CIRCUIT_OPEN' ? 'neutral' : 'pending'"
                  :label="row.status === 'HEALTHY' ? t('monitor.healthy') : row.status === 'ERROR' ? t('monitor.errorRoute') : row.status === 'CIRCUIT_OPEN' ? t('monitor.circuitOpen') : row.status"
                  :dot="row.status === 'HEALTHY'"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('monitor.total')">
              <template #default="{ row }">{{ row.total_requests }}</template>
            </el-table-column>
            <el-table-column :label="t('monitor.errorRate')">
              <template #default="{ row }">{{ ((row.error_rate ?? 0) * 100).toFixed(2) }}%</template>
            </el-table-column>
          </FcTable>
        </template>

        <template #tab-metrics>
          <div class="metrics-toolbar">
            <FcSelect v-model="selectedRoute" :options="routeOptions" :placeholder="t('monitor.selectRoute')" style="width: 200px" />
            <FcSegmented v-model="timeRange" :options="timeRangeOptions" />
            <FcSegmented v-model="granularity" :options="granularityOptions" />
            <label class="auto-refresh-label"><FcSwitch v-model="autoRefresh" /> {{ t('monitor.autoRefresh') }}</label>
            <span v-if="lastRefresh" class="last-refresh">{{ t('monitor.lastRefresh') }}：{{ lastRefresh }}</span>
          </div>

          <div v-if="latestMetric" class="metric-cards">
            <FcSectionCard v-for="card in metricCards" :key="card.label" class="metric-card">
              <div class="metric-label">{{ card.label }}</div>
              <div class="metric-value">{{ card.value }}</div>
            </FcSectionCard>
          </div>

          <div ref="chartRef" class="trend-chart" />
        </template>

        <template #tab-topology>
          <FcSkeleton v-if="topoLoading" variant="card" :rows="4" />
          <div v-else class="topo-shell">
            <VueFlow
              :nodes="topoNodes"
              :edges="topoEdges"
              fit-view-on-init
              :nodes-draggable="false"
              :nodes-connectable="false"
              :elements-selectable="true"
            >
              <Background pattern-color="#aaa" :gap="16" />
              <MiniMap />
              <Controls />
            </VueFlow>
          </div>
        </template>
      </FcTabsPanel>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import * as echarts from 'echarts'
import {
  FcSection, FcSectionCard, FcTabsPanel, FcTable, FcStatusBadge,
  FcInput, FcSelect, FcSegmented, FcSwitch, FcSkeleton
} from '@/components'
import { listRouteStatus, getTopology, getRouteMetrics } from '@/api/misc'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()

const statusMap: Record<string, string> = {
  HEALTHY: 'monitor.healthy', ERROR: 'monitor.errorRoute', CIRCUIT_OPEN: 'monitor.circuitOpen'
}
function statusLabel(status: string) { return t(statusMap[status] || status) }

const tab = ref('metrics')
const tabs = computed(() => [
  { value: 'status', label: t('monitor.tabStatus') },
  { value: 'metrics', label: t('monitor.tabMetrics') },
  { value: 'topology', label: t('monitor.tabTopology') }
])
const statuses = ref<any[]>([])
const loadingStatus = ref(false)
const topoLoading = ref(true)
const statusKeyword = ref('')
const statusFilter = ref('ALL')
const statusFilterOptions = computed(() => [
  { value: 'ALL', label: t('route.statusAll') },
  { value: 'HEALTHY', label: t('monitor.healthy') },
  { value: 'ERROR', label: t('monitor.errorRoute') },
  { value: 'CIRCUIT_OPEN', label: t('monitor.circuitOpen') }
])

const filteredStatuses = computed(() => {
  let list = statuses.value
  if (statusFilter.value !== 'ALL') {
    list = list.filter((r) => r.status === statusFilter.value)
  }
  if (statusKeyword.value) {
    const kw = statusKeyword.value.toLowerCase()
    list = list.filter((r) => r.route_name?.toLowerCase().includes(kw))
  }
  return list
})
const topoNodes = ref<any[]>([])
const topoEdges = ref<any[]>([])
const loadError = ref('')

// Metrics state
const selectedRoute = ref('')
const timeRange = ref('1h')
const granularity = ref('1m')
const autoRefresh = ref(true)
const lastRefresh = ref('')
const metricsData = ref<any[]>([])
const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let loadEpoch = 0

const timeRangeOptions = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' }
]

const granularityOptions = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '1h', label: '1h' }
]

const routeOptions = computed(() =>
  statuses.value.map((s) => ({ value: s.route_id, label: s.route_name }))
)

const stats = computed(() => {
  const total = statuses.value.reduce((s, r) => s + (r.total_requests || 0), 0)
  const err = statuses.value.reduce((s, r) => s + (r.error_count || 0), 0)
  const rate = total > 0 ? ((err / total) * 100).toFixed(2) + '%' : '0%'
  const healthy = statuses.value.filter((r) => r.status === 'HEALTHY').length
  const circuitOpen = statuses.value.filter((r) => r.status === 'CIRCUIT_OPEN').length
  return [
    { label: t('monitor.routeTotal'), value: String(statuses.value.length) },
    { label: t('monitor.healthy'), value: String(healthy) },
    { label: t('monitor.circuitOpen'), value: String(circuitOpen) },
    { label: t('monitor.totalRequests'), value: String(total) },
    { label: t('monitor.errorRate'), value: rate }
  ]
})

const latestMetric = computed(() => {
  if (metricsData.value.length === 0) return null
  return metricsData.value[metricsData.value.length - 1]
})

const metricCards = computed(() => {
  const m = latestMetric.value
  if (!m) return []
  return [
    { label: t('monitor.qps'), value: String(m.total_requests) },
    { label: t('monitor.p50'), value: `${m.p50_latency_ms ?? m.avg_latency_ms ?? '-'}ms` },
    { label: t('monitor.p95'), value: `${m.p95_latency_ms ?? '-'}ms` },
    { label: t('monitor.p99'), value: `${m.p99_latency_ms ?? '-'}ms` }
  ]
})

async function load() {
  const myEpoch = ++loadEpoch
  loadingStatus.value = true
  topoLoading.value = true
  loadError.value = ''
  try {
    const data = await listRouteStatus()
    if (myEpoch !== loadEpoch) return
    statuses.value = data as any

    // Auto-select first route if none selected or selection gone
    if (statuses.value.length > 0) {
      const ids = statuses.value.map((s: any) => s.route_id)
      if (!selectedRoute.value || !ids.includes(selectedRoute.value)) {
        selectedRoute.value = statuses.value[0].route_id
      }
    } else {
      selectedRoute.value = ''
    }
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('common.loadFailed')
    statuses.value = []
  }

  try {
    const topo = (await getTopology()) as any
    if (myEpoch !== loadEpoch) return
    topoNodes.value = (topo.nodes || []).map((n: any, i: number) => ({
      id: n.id,
      position: { x: (i % 4) * 250, y: Math.floor(i / 4) * 150 },
      data: { label: `${n.name}\n[${n.type}] ${statusLabel(n.status)}` },
      style: {
        background: n.status === 'HEALTHY' ? '#f0f9eb' : n.status === 'ERROR' ? '#fef0f0' : n.status === 'CIRCUIT_OPEN' ? '#f4f4f5' : '#ffffff',
        border: `2px solid ${n.status === 'HEALTHY' ? '#67c23a' : n.status === 'ERROR' ? '#f56c6c' : n.status === 'CIRCUIT_OPEN' ? '#909399' : '#dcdfe6'}`
      }
    }))
    topoEdges.value = (topo.edges || []).map((e: any) => ({
      id: `${e.source_id}->${e.target_id}`,
      source: e.source_id,
      target: e.target_id,
      label: e.condition
    }))
    if (myEpoch === loadEpoch) topoLoading.value = false
  } catch {
    if (myEpoch !== loadEpoch) return
    topoNodes.value = []
    topoEdges.value = []
    topoLoading.value = false
  }

  await loadMetrics(myEpoch)
  if (myEpoch !== loadEpoch) return
  loadingStatus.value = false
}

async function loadMetrics(epoch = loadEpoch) {
  if (!selectedRoute.value) return
  try {
    const r: any = await getRouteMetrics(selectedRoute.value, timeRange.value, granularity.value)
    if (epoch !== loadEpoch) return
    metricsData.value = r.data_points || []
    lastRefresh.value = new Date().toLocaleTimeString()
  } catch {
    if (epoch !== loadEpoch) return
    metricsData.value = []
  }
  await nextTick()
  renderChart()
}

function renderChart() {
  if (!chartRef.value) return
  if (tab.value !== 'metrics') return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  if (metricsData.value.length === 0) {
    chartInstance.setOption({
      title: { text: t('monitor.chartNoData'), left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } },
      xAxis: { show: false },
      yAxis: { show: false },
      series: []
    }, true)
    return
  }
  const timestamps = metricsData.value.map((p: any) => new Date(p.timestamp).toLocaleTimeString())
  const requests = metricsData.value.map((p: any) => p.total_requests ?? 0)
  const p50 = metricsData.value.map((p: any) => p.p50_latency_ms ?? p.avg_latency_ms ?? 0)
  const p95 = metricsData.value.map((p: any) => p.p95_latency_ms ?? 0)
  const p99 = metricsData.value.map((p: any) => p.p99_latency_ms ?? 0)
  const errorRates = metricsData.value.map((p: any) => +((p.error_rate ?? 0) * 100).toFixed(2))

  chartInstance.setOption({
    title: { show: false },
    tooltip: { trigger: 'axis' },
    legend: { data: [t('monitor.chartRequests'), t('monitor.p50'), t('monitor.p95'), t('monitor.p99'), t('monitor.chartErrorRate')] },
    grid: { left: 60, right: 60, bottom: 40, top: 40 },
    xAxis: { type: 'category', data: timestamps },
    yAxis: [
      { type: 'value', name: t('monitor.chartRequests') },
      { type: 'value', name: t('monitor.latency') + '(ms)', position: 'right' }
    ],
    series: [
      { name: t('monitor.chartRequests'), type: 'bar', data: requests },
      { name: t('monitor.p50'), type: 'line', yAxisIndex: 1, data: p50, smooth: true },
      { name: t('monitor.p95'), type: 'line', yAxisIndex: 1, data: p95, smooth: true },
      { name: t('monitor.p99'), type: 'line', yAxisIndex: 1, data: p99, smooth: true },
      { name: t('monitor.chartErrorRate'), type: 'line', data: errorRates, smooth: true }
    ]
  }, true)
}

function setupAutoRefresh() {
  clearRefreshTimer()
  if (autoRefresh.value && selectedRoute.value) {
    refreshTimer = setInterval(() => loadMetrics(), 5000)
  }
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

watch([autoRefresh, selectedRoute], setupAutoRefresh)
watch([timeRange, granularity], () => loadMetrics())
watch(tab, (newTab) => {
  if (newTab === 'metrics') {
    nextTick(() => renderChart())
  }
})

function onResize() {
  chartInstance?.resize()
}

onMounted(async () => {
  await load()
  setupAutoRefresh()
  window.addEventListener('resize', onResize)
})

async function onStatusRowClick(row: any) {
  if (row?.route_id) await router.push(`/routes/${row.route_id}`)
}

onUnmounted(() => {
  clearRefreshTimer()
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.stat-label { color: var(--app-text-secondary); font-size: 13px; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--app-text); margin-top: 4px; }
.topo-shell { height: 600px; border: 1px solid var(--app-border); border-radius: 8px; }
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.metrics-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.auto-refresh-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--app-text-secondary); cursor: pointer; }
.last-refresh { font-size: 12px; color: var(--app-text-secondary); margin-left: auto; }
.metric-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.metric-label { color: var(--app-text-secondary); font-size: 12px; }
.metric-value { font-size: 20px; font-weight: 700; color: var(--app-text); margin-top: 4px; }
.trend-chart { height: 400px; border: 1px solid var(--app-border); border-radius: 8px; }
.status-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
</style>

