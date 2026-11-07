<template>
  <div class="v2-debug" data-testid="dbg-page">
    <!-- 只读门禁：canEdit('route')=false → 表单/警示/历史全退场，仅留只读提示 -->
    <FcSection v-if="!canWrite">
      <p class="dbg-readonly" data-testid="dbg-readonly" role="note">
        <FcIcon name="ri-lock-line" :size="14" />
        <span>{{ t('v2.debug.readonly') }}</span>
      </p>
    </FcSection>

    <template v-else>
      <!-- 副作用警示横幅：进页即渲染（先于任何发送），常驻不可关 -->
      <div class="dbg-warning" data-testid="dbg-warning" role="alert">
        <FcIcon name="ri-alert-line" :size="15" />
        <b>{{ t('v2.debug.warningTitle') }}</b>
        <span>{{ t('v2.debug.warning') }}</span>
      </div>

      <!-- 请求构造卡 -->
      <FcSection>
        <div class="dbg-form" data-testid="dbg-form">
          <h2 class="dbg-card-title">{{ t('v2.debug.formTitle') }}</h2>
          <div class="dbg-line">
            <select v-model="method" class="dbg-method" data-testid="dbg-method" :aria-label="t('v2.debug.method')">
              <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
            </select>
            <div class="dbg-path-wrap">
              <FcInput v-model="path" data-testid="dbg-path" size="small" :placeholder="t('v2.debug.pathPlaceholder')"
                :error="pathError || undefined" :aria-label="t('v2.debug.path')" />
              <p v-if="pathError" class="dbg-path-error" data-testid="dbg-path-error" role="alert">{{ pathError }}</p>
            </div>
          </div>

          <!-- 路由选择器：辅助回填 path，与手动输入并存；清除只清选中态不清 path -->
          <div class="dbg-route-picker" data-testid="dbg-route-picker">
            <div class="dbg-kv-head">
              <label class="dbg-rp-label" for="dbg-route-search">{{ t('v2.debug.routePickerLabel') }}</label>
              <FcButton v-if="selectedRouteId" variant="text" size="sm" data-testid="dbg-route-clear" @click="clearRoute">
                <FcIcon name="ri-close-line" :size="13" />
                <span>{{ t('v2.debug.routeClear') }}</span>
              </FcButton>
            </div>
            <FcInput v-model="routeSearch" id="dbg-route-search" data-testid="dbg-route-search" size="small"
              :placeholder="t('v2.debug.routeSearchPlaceholder')" />
            <div class="dbg-rp-list">
              <button v-for="r in filteredRoutes" :key="r.id" type="button" class="dbg-rp-opt"
                :data-testid="`dbg-route-opt-${r.id}`" :data-selected="selectedRouteId === r.id ? 'true' : 'false'"
                @click="selectRoute(r.id)">
                <b class="dbg-rp-name">{{ r.route_name }}</b>
                <span v-if="r.path" class="dbg-rp-path">{{ r.path }}</span>
              </button>
              <p v-if="routesFailed" class="dbg-rp-note" role="alert">{{ t('v2.debug.routeLoadFailed') }}</p>
              <p v-else-if="!selectedRouteId" class="dbg-rp-note" data-testid="dbg-route-empty" role="status">
                {{ t('v2.debug.routeSelectEmpty') }}
              </p>
            </div>
          </div>

          <!-- headers / query KV 行（键 trim 非空才收，值允许空串） -->
          <div class="dbg-kv" data-testid="dbg-headers">
            <div class="dbg-kv-head">
              <b>{{ t('v2.debug.headers') }}</b>
              <FcButton variant="text" size="sm" data-testid="dbg-header-add" @click="addKvRow(headerRows)">
                <FcIcon name="ri-add-line" :size="13" />
                <span>{{ t('v2.debug.addRow') }}</span>
              </FcButton>
            </div>
            <div v-for="(row, i) in headerRows" :key="`h-${i}`" class="dbg-kv-row">
              <FcInput v-model="row.key" :data-testid="`dbg-header-key-${i}`" size="small"
                :placeholder="t('v2.debug.keyPlaceholder')" />
              <FcInput v-model="row.value" :data-testid="`dbg-header-value-${i}`" size="small"
                :placeholder="t('v2.debug.valuePlaceholder')" />
              <FcButton variant="text" size="sm" :data-testid="`dbg-header-del-${i}`" :aria-label="t('common.delete')"
                @click="delKvRow(headerRows, i)">
                <FcIcon name="ri-delete-bin-line" :size="14" />
              </FcButton>
            </div>
          </div>
          <div class="dbg-kv" data-testid="dbg-query">
            <div class="dbg-kv-head">
              <b>{{ t('v2.debug.query') }}</b>
              <FcButton variant="text" size="sm" data-testid="dbg-query-add" @click="addKvRow(queryRows)">
                <FcIcon name="ri-add-line" :size="13" />
                <span>{{ t('v2.debug.addRow') }}</span>
              </FcButton>
            </div>
            <div v-for="(row, i) in queryRows" :key="`q-${i}`" class="dbg-kv-row">
              <FcInput v-model="row.key" :data-testid="`dbg-query-key-${i}`" size="small"
                :placeholder="t('v2.debug.keyPlaceholder')" />
              <FcInput v-model="row.value" :data-testid="`dbg-query-value-${i}`" size="small"
                :placeholder="t('v2.debug.valuePlaceholder')" />
              <FcButton variant="text" size="sm" :data-testid="`dbg-query-del-${i}`" :aria-label="t('common.delete')"
                @click="delKvRow(queryRows, i)">
                <FcIcon name="ri-delete-bin-line" :size="14" />
              </FcButton>
            </div>
          </div>

          <div class="dbg-body-wrap">
            <b class="dbg-kv-label">{{ t('v2.debug.body') }}</b>
            <FcInput v-model="body" type="textarea" :rows="4" data-testid="dbg-body"
              :placeholder="t('v2.debug.bodyPlaceholder')" :aria-label="t('v2.debug.body')" />
          </div>
          <div class="dbg-actions">
            <FcButton data-testid="dbg-send" :disabled="sending" @click="sendReplay">
              <FcIcon name="ri-send-plane-line" :size="14" />
              <span>{{ sending ? t('v2.debug.sending') : t('v2.debug.send') }}</span>
            </FcButton>
            <!-- S12-C4: copy-as-curl, built from the same form state as the send payload -->
            <FcButton variant="secondary" size="sm" data-testid="dbg-copy-curl" @click="copyCurl">
              <FcIcon name="ri-file-copy-line" :size="14" />
              <span>{{ t('v2.debug.copyCurl') }}</span>
            </FcButton>
          </div>
        </div>
      </FcSection>

      <!-- 失败错误条：按业务码分支文案 + 相同实参重试 -->
      <div v-if="errorState" class="dbg-error" data-testid="dbg-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ errorText }}</span>
        <FcButton variant="secondary" size="sm" data-testid="dbg-retry" @click="retryLast">
          <FcIcon name="ri-refresh-line" :size="13" />
          <span>{{ t('v2.debug.retry') }}</span>
        </FcButton>
      </div>

      <!-- 命中预测卡（simulate 预测段；明细不展开，只呈现命中结果与三段计数） -->
      <FcSection v-if="sim">
        <div class="dbg-simulate" data-testid="dbg-simulate">
          <h2 class="dbg-card-title">{{ t('v2.debug.simulateTitle') }}</h2>
          <template v-if="simMatched">
            <p><span class="dbg-badge is-band-2xx">{{ t('v2.debug.simMatched') }}</span></p>
            <p class="dbg-sim-route-name" data-testid="dbg-sim-route-name">{{ sim?.route?.route_name }}</p>
            <p class="dbg-sim-route-path" data-testid="dbg-sim-route-path">{{ sim?.route?.path || '—' }}</p>
          </template>
          <p v-else class="dbg-sim-unmatched" data-testid="dbg-sim-unmatched" role="status">
            {{ t('v2.debug.simUnmatched') }}
          </p>
          <p class="dbg-sim-plugins" data-testid="dbg-sim-plugins">
            <span>{{ t('v2.debug.simPlugins') }}</span>
            <span class="dbg-sim-counts">{{ simCounts }}</span>
          </p>
        </div>
      </FcSection>

      <!-- 响应查看器（首次成功后渲染） -->
      <FcSection v-if="result">
        <div data-testid="dbg-result">
          <h2 class="dbg-card-title">{{ t('v2.debug.responseTitle') }}</h2>
          <div class="dbg-resp-meta">
            <span class="dbg-badge" :class="bandClass" data-testid="dbg-status-badge" :data-band="bandOf(result?.status)">
              {{ result?.status ?? '—' }}
            </span>
            <span class="dbg-latency" data-testid="dbg-latency">
              {{ t('v2.debug.latency') }} <b>{{ result?.latency_ms ?? '—' }} ms</b>
            </span>
          </div>
          <div class="dbg-resp-headers" data-testid="dbg-resp-headers">
            <b class="dbg-kv-label">{{ t('v2.debug.respHeaders') }}</b>
            <p v-if="respHeaderRows.length === 0" class="dbg-empty-line">—</p>
            <div v-for="h in respHeaderRows" :key="h.name" class="dbg-resp-hdr-row" data-testid="dbg-resp-hdr-row">
              <code>{{ h.name }}</code>
              <span>{{ h.value }}</span>
            </div>
          </div>
          <div class="dbg-resp-body-wrap">
            <b class="dbg-kv-label">{{ t('v2.debug.respBody') }}</b>
            <p v-if="isTruncated" class="dbg-truncated" data-testid="dbg-truncated" role="note">
              <FcIcon name="ri-scissors-cut-line" :size="13" />
              <span>{{ t('v2.debug.truncated') }}</span>
            </p>
            <pre v-if="result?.body != null" class="dbg-resp-body" data-testid="dbg-resp-body">{{ result?.body }}</pre>
            <p v-else class="dbg-resp-body is-empty" data-testid="dbg-resp-body">{{ t('v2.debug.emptyBody') }}</p>
          </div>
        </div>
      </FcSection>

      <!-- 两段阶段时间线（预测段无耗时数字，转发段墙钟 = latency_ms） -->
      <FcSection v-if="result">
        <div data-testid="dbg-timeline">
          <h2 class="dbg-card-title">{{ t('v2.debug.timelineTitle') }}</h2>
          <div class="dbg-phases">
            <div class="dbg-phase" data-testid="dbg-phase-sim">
              <b>{{ t('v2.debug.phaseSimulate') }}</b>
              <p>{{ t('v2.debug.phaseSimHint') }}</p>
            </div>
            <div class="dbg-phase" data-testid="dbg-phase-fwd">
              <b>{{ t('v2.debug.phaseForward') }}</b>
              <p>{{ t('v2.debug.phaseForwardHint') }}</p>
              <span class="dbg-phase-ms">{{ result?.latency_ms ?? '—' }} ms</span>
            </div>
          </div>
        </div>
      </FcSection>

      <!-- 调试历史：仅内存最近 10 条，FIFO，点击全量回填表单 -->
      <FcSection>
        <div data-testid="dbg-history">
          <div class="dbg-kv-head">
            <h2 class="dbg-card-title">{{ t('v2.debug.historyTitle') }}</h2>
            <p class="dbg-history-hint">{{ t('v2.debug.historyHint') }}</p>
            <!-- S12-C4: in-memory session is low risk — default confirm variant -->
            <FcButton variant="text" size="sm" data-testid="dbg-clear-history" @click="clearHistory">
              <FcIcon name="ri-delete-bin-line" :size="13" />
              <span>{{ t('v2.debug.clearHistory') }}</span>
            </FcButton>
          </div>
          <p v-if="history.length === 0" class="dbg-history-empty" data-testid="dbg-history-empty" role="status">
            {{ t('v2.debug.historyEmpty') }}
          </p>
          <ul v-else class="dbg-history-list">
            <li v-for="h in history" :key="h.seq">
              <button type="button" class="dbg-history-item" :data-testid="`dbg-history-item-${h.seq}`"
                @click="restoreHistory(h)">
                <span class="dbg-h-method">{{ h.method }}</span>
                <span class="dbg-h-path">{{ h.path }}</span>
                <span class="dbg-badge" :class="`is-band-${bandOf(h.status)}`">{{ h.status }}</span>
              </button>
            </li>
          </ul>
        </div>
      </FcSection>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * S11b：调试台（契约 docs/ui-v2/实施契约.md §4 S11 行 S11b，裁决 ⑦~⑩）。
 * 影子回放真实触达上游（S11a baa8bc7）——副作用靠常驻警示横幅声明，不做二次确认；
 * 影子请求跳过统计 → 无逐插件耗时数据源，缺口不造数，时间线只呈现「预测段 + 转发墙钟」两段。
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcButton, FcIcon, FcInput, FcSection, toast } from '@/components'
import { debugReplay, type DebugReplayPayload, type DebugReplayResult, type DebugSimulate } from '@/api/debug'
import { listRoutes, type RouteNode } from '@/api/routes'
import { BusinessError } from '@/api/http'
import { usePermission } from '@/composables/usePermission'
import { useFcConfirm } from '@/composables/useFcConfirm'

const { t } = useI18n()
const { canEdit } = usePermission()
const { confirm } = useFcConfirm()
const canWrite = computed(() => canEdit('route'))

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const

// ── 表单态 ────────────────────────────────────────────────────────────────
interface KvRow { key: string; value: string }
const method = ref<string>('GET')
const path = ref('')
const pathError = ref('')
const body = ref('')
const headerRows = ref<KvRow[]>([{ key: '', value: '' }])
const queryRows = ref<KvRow[]>([{ key: '', value: '' }])

function addKvRow(rows: KvRow[]) {
  rows.push({ key: '', value: '' })
}
function delKvRow(rows: KvRow[], i: number) {
  rows.splice(i, 1)
  if (rows.length === 0) rows.push({ key: '', value: '' })
}
/** 键 trim 后非空才收（值允许空串）；行序即键序 */
function collectKv(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (k !== '') out[k] = r.value
  }
  return out
}
function rowsFromMap(m?: Record<string, string> | null): KvRow[] {
  const rows = Object.entries(m ?? {}).map(([key, value]) => ({ key, value: String(value ?? '') }))
  return rows.length > 0 ? rows : [{ key: '', value: '' }]
}

// ── 路由选择器（裁决⑩：回填 path 一次，不锁输入；回填剥尾部 glob）──────────
const routeList = ref<RouteNode[]>([])
const routesFailed = ref(false)
const routeSearch = ref('')
const selectedRouteId = ref<string | null>(null)

onMounted(() => {
  if (canWrite.value) void loadRoutes()
})

async function loadRoutes() {
  routesFailed.value = false
  try {
    routeList.value = (await listRoutes()) ?? []
  } catch {
    routesFailed.value = true
    routeList.value = []
  }
}

const filteredRoutes = computed(() => {
  const q = routeSearch.value.trim().toLowerCase()
  if (!q) return routeList.value
  return routeList.value.filter((r) => r.route_name?.toLowerCase().includes(q) || r.path?.toLowerCase().includes(q))
})

/** 路由 path 尾部 glob 段（1~2 个星号）是网关匹配谓词，不是可发送 URL —— 回填前剥掉，
 *  glob 前的 '/' 保留，方便直接续写尾段（V 轮实播评审缺陷②：'/e2e/x/**' 字面上行致网关
 *  500）。仅剥结尾处，无 glob 的精确 path 原样回填；回填仍只是辅助起点，用户可手改。 */
function stripTrailingGlob(routePath: string): string {
  return routePath.replace(/\*{1,2}$/, '')
}

function selectRoute(id: string) {
  selectedRouteId.value = id
  const node = routeList.value.find((r) => r.id === id)
  if (node?.path) path.value = stripTrailingGlob(node.path)
}
/** 只清选中态（route_id 回 null），不清已回填/手改的 path */
function clearRoute() {
  selectedRouteId.value = null
}

// ── 发送 / 重试 ──────────────────────────────────────────────────────────
const sending = ref(false)
const errorState = ref<ErrorState | null>(null)
const result = ref<DebugReplayResult | null>(null)
/** 上次发送的完整实参（重试复用，实参完全相同） */
let lastRequest: { routeId: string | null; payload: DebugReplayPayload } | null = null

interface ErrorState { kind: 'route' | 'gateway' | 'generic'; message: string }

function toErrorState(e: unknown): ErrorState {
  if (e instanceof BusinessError) {
    if (e.code === 10601) return { kind: 'route', message: e.message }
    if (e.code === 10607) return { kind: 'gateway', message: e.message }
  }
  return { kind: 'generic', message: e instanceof Error ? e.message : String(e) }
}

const errorText = computed(() => {
  const e = errorState.value
  if (!e) return ''
  if (e.kind === 'route') return t('v2.debug.errRouteNotPublished')
  if (e.kind === 'gateway') return t('v2.debug.errGatewayUnreachable')
  return `${t('v2.debug.errGeneric')}：${e.message}`
})

function buildPayload(): DebugReplayPayload {
  return {
    path: path.value,
    method: method.value,
    headers: collectKv(headerRows.value),
    query: collectKv(queryRows.value),
    body: body.value.trim() === '' ? null : body.value
  }
}

async function execute(routeId: string | null, payload: DebugReplayPayload) {
  lastRequest = { routeId, payload }
  sending.value = true
  errorState.value = null
  try {
    const data = await debugReplay(routeId, payload)
    result.value = data
    pushHistory(payload, data.status)
  } catch (e) {
    errorState.value = toErrorState(e)
  } finally {
    sending.value = false
  }
}

async function sendReplay() {
  if (sending.value) return
  if (path.value.trim() === '') {
    pathError.value = t('v2.debug.pathRequired')
    return
  }
  pathError.value = ''
  await execute(selectedRouteId.value || null, buildPayload())
}

/** 以上次完全相同的实参重发 */
async function retryLast() {
  if (sending.value || !lastRequest) return
  await execute(lastRequest.routeId, lastRequest.payload)
}

// ── S12-C4：复制为 curl（恒带 -X；query encodeURIComponent '&' 连接；-H 每头一行；
//    --data 仅 body 非空。头/query 与发送 payload 同源同序 = collectKv）──────────
function buildCurl(): string {
  const parts: string[] = [`curl -X ${method.value}`]
  const query = Object.entries(collectKv(queryRows.value))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  parts.push(`'http://localhost:9300${path.value}${query === '' ? '' : `?${query}`}'`)
  for (const [k, v] of Object.entries(collectKv(headerRows.value))) {
    parts.push(`-H '${k}: ${v}'`)
  }
  if (body.value.trim() !== '') parts.push(`--data '${body.value}'`)
  return parts.join(' ')
}

/** 写剪贴板 + 成功 toast；降级（API 缺失 / writeText 拒绝）→ 静默不抛、无成功 toast */
async function copyCurl() {
  try {
    if (!navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(buildCurl())
    toast.success(t('v2.debug.curlCopied'))
  } catch {
    // 降级路径：不抛、不 toast（curlCopyFailed 文案备位）
  }
}

// ── 响应查看器 ───────────────────────────────────────────────────────────
const respHeaderRows = computed(() =>
  Object.entries(result.value?.headers ?? {}).map(([name, value]) => ({ name, value: String(value ?? '') }))
)
/** 截断唯一诚实信号 = body 长度（后端 >64KB 截为 65536 字符前缀，无截断标记字段） */
const isTruncated = computed(() => typeof result.value?.body === 'string' && result.value.body.length >= 65536)

function bandOf(status: unknown): string {
  const n = typeof status === 'number' ? status : Number(status)
  if (!Number.isFinite(n)) return 'other'
  if (n >= 200 && n < 300) return '2xx'
  if (n >= 400 && n < 500) return '4xx'
  if (n >= 500 && n < 600) return '5xx'
  return 'other'
}
const bandClass = computed(() => `is-band-${bandOf(result.value?.status)}`)

// ── 命中预测卡（simulate 段映射；matched=false 时命中字段退场）──────────────
const sim = computed<DebugSimulate | null>(() => result.value?.simulate ?? null)
const simMatched = computed(() => !!(sim.value && sim.value.matched && sim.value.route))
const simCounts = computed(() => {
  const p = sim.value?.plugins
  const n = (x: unknown) => (Array.isArray(x) ? x.length : 0)
  return `${n(p?.global_pre)}·${n(p?.route)}·${n(p?.global_post)}`
})

// ── 调试历史（裁决⑨：仅内存，最近 10 条 FIFO；失败不进）─────────────────────
interface HistoryEntry {
  seq: number
  method: string
  path: string
  status: unknown
  payload: DebugReplayPayload
}
const history = ref<HistoryEntry[]>([])
let historySeq = 0

function pushHistory(payload: DebugReplayPayload, status: unknown) {
  historySeq += 1
  history.value = [{ seq: historySeq, method: payload.method, path: payload.path, status, payload }, ...history.value]
  if (history.value.length > 10) history.value = history.value.slice(0, 10)
}

/** 点击历史行全量回填表单（method/path/headers/query/body） */
function restoreHistory(entry: HistoryEntry) {
  method.value = entry.payload.method
  path.value = entry.payload.path
  body.value = entry.payload.body ?? ''
  headerRows.value = rowsFromMap(entry.payload.headers)
  queryRows.value = rowsFromMap(entry.payload.query)
  pathError.value = ''
}

/** S12-C4：清空调试历史（仅内存低风险，confirm 默认变体；取消则原样保留） */
async function clearHistory() {
  const ok = await confirm({ title: t('v2.debug.clearHistoryConfirm') })
  if (ok) history.value = []
}
</script>

<style scoped lang="scss">
/* token-only 配色；焦点环统一兜底；无自绘动画（PRM 降级见文件尾） */
.v2-debug {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.v2-debug :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* —— 副作用警示横幅（常驻） —— */
.dbg-warning {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--app-color-warning) 45%, var(--app-border-extra-light));
  border-radius: var(--app-radius-md);
  background: color-mix(in srgb, var(--app-color-warning) 10%, var(--app-bg-card));
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.55;
  b { color: var(--app-color-warning-text); font-weight: 600; white-space: nowrap; }
}

/* —— 卡内标题 / 行布局 —— */
.dbg-card-title { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: var(--app-text); }
.dbg-form, .dbg-simulate { display: flex; flex-direction: column; gap: 12px; }
.dbg-line { display: flex; align-items: flex-start; gap: 8px; }
.dbg-path-wrap { flex: 1; min-width: 0; }
.dbg-path-error, .dbg-rp-note { margin: 4px 0 0; font-size: 12px; color: var(--app-text-secondary); }
.dbg-path-error { color: var(--app-color-danger-text); }

/* —— method 原生 select（el-select 弹层 jsdom/自动化不可驱动，钉原生） —— */
.dbg-method {
  min-width: 96px; padding: 5px 8px; cursor: pointer;
  border: 1px solid var(--app-border); border-radius: var(--app-radius-sm);
  background: var(--app-bg-card); color: var(--app-text); font-size: 13px; font-weight: 500;
}

/* —— 路由选择器 —— */
.dbg-route-picker {
  display: flex; flex-direction: column; gap: 6px; padding: 10px;
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-md);
  background: var(--app-bg-muted);
}
.dbg-rp-label { font-size: 12px; font-weight: 600; color: var(--app-text-secondary); }
.dbg-rp-list { display: flex; flex-direction: column; gap: 4px; max-height: 168px; overflow-y: auto; }
.dbg-rp-opt {
  display: flex; align-items: baseline; gap: 8px; padding: 6px 10px; cursor: pointer;
  border: 1px solid transparent; border-radius: var(--app-radius-sm); background: var(--app-bg-card);
  text-align: left; font-size: 12px; color: var(--app-text-secondary);
  &:hover { border-color: var(--app-border-strong); }
  &[data-selected='true'] { border-color: var(--app-primary); color: var(--app-text); }
}
.dbg-rp-name { font-weight: 600; color: inherit; }
.dbg-rp-path { font-family: var(--app-font-mono, monospace); font-size: 11.5px; color: var(--app-text-tertiary); }

/* —— KV 行 —— */
.dbg-kv, .dbg-body-wrap, .dbg-resp-headers, .dbg-resp-body-wrap { display: flex; flex-direction: column; gap: 6px; }
.dbg-kv-head, .dbg-actions { display: flex; align-items: center; gap: 8px; }
.dbg-kv-head b, .dbg-kv-label { font-size: 12px; font-weight: 600; color: var(--app-text-secondary); }
.dbg-kv-head :first-child { margin-right: auto; }
.dbg-kv-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px; align-items: center; }
.dbg-actions { margin-top: 2px; }
.dbg-actions :first-child { margin-left: auto; }

/* —— 状态徽标（data-band 徽色契约；文本色走 token 保证 ≥4.5 对比） —— */
.dbg-badge {
  display: inline-flex; align-items: center; padding: 1px 8px; font-size: 11.5px; font-weight: 600;
  border: 1px solid var(--app-border); border-radius: var(--app-radius-full);
  background: var(--app-bg-muted); color: var(--app-text-secondary); font-variant-numeric: tabular-nums;
  &.is-band-2xx {
    border-color: color-mix(in srgb, var(--app-color-success) 40%, var(--app-border));
    background: color-mix(in srgb, var(--app-color-success) 12%, var(--app-bg-card));
    color: var(--app-color-success-text); }
  &.is-band-4xx {
    border-color: color-mix(in srgb, var(--app-color-warning) 45%, var(--app-border));
    background: color-mix(in srgb, var(--app-color-warning) 12%, var(--app-bg-card));
    color: var(--app-color-warning-text); }
  &.is-band-5xx, &.is-band-other {
    border-color: color-mix(in srgb, var(--app-color-danger) 40%, var(--app-border));
    background: color-mix(in srgb, var(--app-color-danger) 10%, var(--app-bg-card));
    color: var(--app-color-danger-text); }
}

/* —— 错误条 —— */
.dbg-error {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 13px; color: var(--app-text);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 40%, var(--app-border-extra-light));
  border-radius: var(--app-radius-md);
  background: color-mix(in srgb, var(--app-color-danger) 8%, var(--app-bg-card));
  span:first-of-type { flex: 1; min-width: 0; }
}

/* —— 响应查看器 —— */
.dbg-resp-meta { display: flex; align-items: center; gap: 14px; font-size: 13px; color: var(--app-text-secondary); }
.dbg-latency b { color: var(--app-text); font-variant-numeric: tabular-nums; }
.dbg-resp-hdr-row {
  display: flex; align-items: baseline; gap: 10px; padding: 3px 0; font-size: 12px;
  border-bottom: 1px dashed var(--app-border-extra-light);
  code { color: var(--app-text); font-size: 11.5px; }
  span { color: var(--app-text-secondary); word-break: break-all; }
}
.dbg-empty-line { margin: 0; color: var(--app-text-tertiary); font-size: 12px; }
.dbg-truncated { display: flex; align-items: baseline; gap: 6px; margin: 0; font-size: 12px; color: var(--app-color-warning-text); }
.dbg-resp-body {
  margin: 0; padding: 10px; max-height: 320px; overflow: auto; font-size: 12px; line-height: 1.6;
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-sm);
  background: var(--app-bg-muted); color: var(--app-text);
  white-space: pre-wrap; word-break: break-all; font-family: var(--app-font-mono, monospace);
  &.is-empty { color: var(--app-text-tertiary); }
}

/* —— 两段阶段时间线（预测段 + 转发墙钟） —— */
.dbg-phases { display: flex; flex-direction: column; gap: 8px; }
.dbg-phase {
  display: flex; align-items: baseline; gap: 10px; padding: 8px 12px; font-size: 13px;
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-md);
  background: var(--app-bg-muted);
  b { color: var(--app-text); font-weight: 600; }
  p { margin: 0; flex: 1; font-size: 12px; color: var(--app-text-tertiary); }
}
.dbg-phase-ms { font-size: 12.5px; font-weight: 600; color: var(--app-text); font-variant-numeric: tabular-nums; }

/* —— 历史 —— */
.dbg-history-hint {
  margin: 0; flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; color: var(--app-text-tertiary);
}
.dbg-history-empty { margin: 4px 0 0; font-size: 12px; color: var(--app-text-tertiary); }
.dbg-history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dbg-history-item {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; cursor: pointer;
  border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-sm);
  background: var(--app-bg-card); font-size: 12px; color: var(--app-text-secondary); text-align: left;
  &:hover { border-color: var(--app-border-strong); }
}
.dbg-h-method {
  padding: 0 6px; font-weight: 600; font-size: 11px;
  border-radius: var(--app-radius-chip); background: var(--app-bg-muted); color: var(--app-text);
}
.dbg-h-path {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--app-font-mono, monospace);
}

/* —— 只读态 —— */
.dbg-readonly { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 13px; color: var(--app-text-secondary); }

/* —— 动效降级（PRM） —— */
@media (prefers-reduced-motion: reduce) {
  .v2-debug :deep(*) { transition: none !important; }
}
</style>
