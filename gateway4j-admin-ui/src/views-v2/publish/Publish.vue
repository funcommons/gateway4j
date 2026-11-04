<!--
  S5-C：v2 发布与版本页（原型 prototype-v2/10-publish.html）。
  左：版本时间线（getRouteVersions 倒序渲染，最新行「当前」徽章）；右：发布表单（复用
  publishRoute(id, changeDescription)，canEdit('route') 控制）+ diff 卡（getRouteVersionDiff，
  from=前一版本）+ 影响面卡（fetchTrafficSummary 的 hits_24h + listRoutes 树 children 数）。

  灰度只读数据源声明（S5a）：后端无 GET conditions 端点、路由树节点不含 conditions，故灰度布局
  取【最新一条 RouteVersion.snapshot_data.conditions】。WEIGHT 条件形状同旧画布 Canvas.weight-edge：
  权重数字存 condition_key（'10'），互补分支 condition_value='residual'（key 空）；residual =
  100 − Σ显式权重。无 WEIGHT 条件整卡不渲染；卡内只读（无 input/button/slider），操作归 P2/S7。

  DOM 契约（data-testid，pub-*）见 __tests__/Publish.test.ts 头注释。
-->
<template>
  <div class="pub-page" data-testid="pub-page">
    <FcSection>
      <div v-if="versionsFailed" class="hint-banner is-error" data-testid="pub-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.publish.errorLoad') }}</span>
      </div>

      <div class="pub-head">
        <h1 class="pub-title">{{ t('v2.publish.title') }}</h1>
        <span class="pub-head-route">{{ routeId }}</span>
      </div>

      <div class="pub-grid">
        <!-- 左：版本时间线 / 空态 -->
        <div class="pub-side">
          <FcSectionCard v-if="versions.length" padding="sm" shadow="sm" data-testid="pub-timeline">
            <div class="pub-card-head"><b>{{ t('v2.publish.versionTimeline') }}</b></div>
            <div class="tl">
              <div
                v-for="(v, i) in versions"
                :key="v.id ?? v.config_version"
                class="tl-item"
                :class="{ 'is-cur': i === 0 }"
                :data-testid="`pub-version-row-${v.config_version}`"
              >
                <div class="tl-head">
                  <b class="pub-mono tl-ver">{{ v.config_version }}</b>
                  <span v-if="i === 0" class="pub-badge-current" data-testid="pub-badge-current">
                    {{ t('v2.publish.current') }}
                  </span>
                </div>
                <div class="tl-meta">
                  <span class="pub-actor">{{ v.actor || t('v2.routes.placeholder') }}</span>
                  <span class="pub-mono" :data-testid="`pub-time-${v.config_version}`">{{ formatTime(v.published_at) }}</span>
                  <span class="pub-type">{{ changeTypeLabel(v) }}</span>
                </div>
                <div v-if="v.change_description" class="tl-desc">{{ v.change_description }}</div>
                <div class="tl-actions">
                  <FcButton
                    variant="text"
                    size="sm"
                    :data-testid="`pub-diff-btn-${v.config_version}`"
                    :disabled="!prevVersionOf(i)"
                    @click="viewDiffAt(i)"
                  >
                    {{ t('v2.publish.viewDiff') }}
                  </FcButton>
                </div>
              </div>
            </div>
          </FcSectionCard>
          <div v-else-if="versionsLoaded" class="pub-empty" data-testid="pub-empty">
            <FcIcon name="ri-information-line" :size="22" />
            <span>{{ t('v2.publish.empty') }}</span>
          </div>
        </div>

        <!-- 右：发布表单 + diff/影响面 + 灰度只读 -->
        <div class="pub-main">
          <FcSectionCard v-if="canEdit('route')" padding="sm" shadow="sm" data-testid="pub-publish-form">
            <div class="pub-card-head"><b>{{ t('v2.publish.changeDescription') }}</b></div>
            <div class="pub-form-row">
              <FcInput
                v-model="desc"
                class="pub-desc"
                data-testid="pub-desc-input"
                :placeholder="t('v2.publish.descriptionPlaceholder')"
                :maxlength="200"
                :aria-label="t('v2.publish.changeDescription')"
              />
              <FcButton variant="primary" data-testid="pub-publish-btn" :disabled="publishing || !hasDesc" @click="onPublish">
                {{ t('v2.publish.publishNow') }}
              </FcButton>
            </div>
            <div v-if="publishFailed" class="hint-banner is-error" data-testid="pub-publish-error" role="alert">
              <FcIcon name="ri-error-warning-line" :size="14" />
              <span>{{ t('v2.publish.publishFailed') }}</span>
            </div>
          </FcSectionCard>

          <div class="pub-main-grid">
            <!-- diff 卡：点时间线「查看 diff」后出现；from = 前一版本 -->
            <FcSectionCard v-if="diff" padding="sm" shadow="sm" data-testid="pub-diff-card">
              <div class="pub-card-head">
                <b>{{ t('v2.publish.diffTitle') }}</b>
                <span class="pub-diff-range">
                  <span class="pub-diff-ver" data-testid="pub-diff-from">
                    {{ t('v2.publish.diffFrom') }} <b class="pub-mono">{{ diff.from }}</b>
                  </span>
                  <FcIcon name="ri-arrow-right-s-line" :size="13" />
                  <span class="pub-diff-ver" data-testid="pub-diff-to">
                    {{ t('v2.publish.diffTo') }} <b class="pub-mono">{{ diff.to }}</b>
                  </span>
                </span>
              </div>
              <div v-if="diff.rows.length" class="pub-diff-table" data-testid="pub-diff-table">
                <div
                  v-for="row in diff.rows"
                  :key="row.field"
                  class="pub-diff-row"
                  :class="{ 'is-changed': row.from !== row.to }"
                  :data-testid="`pub-diff-row-${row.field}`"
                  :data-changed="row.from !== row.to || undefined"
                >
                  <span class="pub-mono pub-diff-field">{{ row.field }}</span>
                  <span class="pub-mono pub-diff-val">{{ row.from }}</span>
                  <span class="pub-mono pub-diff-val">{{ row.to }}</span>
                </div>
              </div>
              <div v-else class="pub-diff-empty" data-testid="pub-diff-empty">{{ t('v2.publish.noDiff') }}</div>
            </FcSectionCard>

            <!-- 影响面卡：近 24h 真实流量 + 树 children 数；取数失败各自降级为占位 -->
            <FcSectionCard padding="sm" shadow="sm" data-testid="pub-impact">
              <div class="pub-card-head"><b>{{ t('v2.publish.affectedTitle') }}</b></div>
              <div class="pub-impact-list">
                <p class="pub-impact-line" data-testid="pub-impact-hits">
                  {{ t('v2.publish.impactHits', { n: formatHits(trafficHits) }) }}
                </p>
                <p class="pub-impact-line" data-testid="pub-impact-children">
                  {{ t('v2.publish.impactChildren', { n: formatCount(childCount) }) }}
                </p>
              </div>
            </FcSectionCard>
          </div>

          <!-- 灰度只读卡：数据源 = 最新版本 snapshot_data.conditions 的 WEIGHT 条件；无则整卡不渲染 -->
          <FcSectionCard v-if="grayLayout" padding="sm" shadow="sm" data-testid="pub-gray">
            <div class="pub-gray-bar" data-testid="pub-gray-bar">
              <div
                v-for="(seg, i) in grayLayout"
                :key="`${seg.target}-${i}`"
                class="pub-gray-seg"
                :class="{ 'is-residual': seg.residual }"
                :style="{ width: `${seg.pct}%` }"
              >
                <span class="pub-mono pub-gray-pct">{{ fmtPct(seg.pct) }}</span>
              </div>
            </div>
            <p class="pub-gray-hint">
              <FcIcon name="ri-lock-line" :size="13" />
              <span>{{ t('v2.publish.readonlyGray') }}</span>
            </p>
          </FcSectionCard>
        </div>
      </div>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { FcButton, FcIcon, FcInput, FcSection, FcSectionCard } from '@/components'
import { listRoutes, publishRoute, getRouteVersions, getRouteVersionDiff } from '@/api/routes'
import type { RouteNode, RouteVersionDto, RouteVersionDiffRow } from '@/api/routes'
import { fetchTrafficSummary } from '@/api/v2'
import { usePermission } from '@/composables/usePermission'

const { t } = useI18n()
const route = useRoute()
const { canEdit } = usePermission()

const routeId = computed(() => String(route.params.id ?? ''))

// —— 版本时间线 ——
const versions = ref<RouteVersionDto[]>([])
const versionsLoaded = ref(false)
const versionsFailed = ref(false)

// —— 影响面 ——
const trafficHits = ref<number | null>(null)
const childCount = ref<number | null>(null)

// —— 发布表单 ——
const desc = ref('')
const publishing = ref(false)
const publishFailed = ref(false)
const hasDesc = computed(() => desc.value.trim().length > 0)

// —— diff 视图 ——
const diff = ref<{ from: string; to: string; rows: RouteVersionDiffRow[] } | null>(null)

async function loadVersions() {
  versionsFailed.value = false
  try {
    const list = await getRouteVersions(routeId.value)
    versions.value = Array.isArray(list) ? list : []
    versionsLoaded.value = true
  } catch {
    versions.value = []
    versionsLoaded.value = false
    versionsFailed.value = true
  }
}

async function loadImpact() {
  try {
    const summary = await fetchTrafficSummary()
    const item = (Array.isArray(summary) ? summary : []).find((s) => s.route_id === routeId.value)
    trafficHits.value = item ? toNum(item.hits_24h) : null
  } catch {
    trafficHits.value = null
  }
  try {
    const tree = await listRoutes()
    const node = findNode(Array.isArray(tree) ? tree : [], routeId.value)
    childCount.value = node ? (node.children?.length ?? 0) : null
  } catch {
    childCount.value = null
  }
}

function findNode(nodes: RouteNode[], id: string): RouteNode | null {
  for (const n of nodes) {
    if (String(n.id) === id) return n
    const hit = findNode(n.children ?? [], id)
    if (hit) return hit
  }
  return null
}

onMounted(() => {
  void loadVersions()
  void loadImpact()
})

/** 灰度只读布局（最新版本 snapshot_data.conditions 的 WEIGHT 条件）；接口按 config_version 倒序，最新 = 首行 */
const grayLayout = computed<{ target: string; pct: number; residual: boolean }[] | null>(() => {
  const conditions = (versions.value[0]?.snapshot_data as { conditions?: unknown } | null | undefined)?.conditions
  if (!Array.isArray(conditions)) return null
  const segments: { target: string; pct: number; residual: boolean }[] = []
  let explicitSum = 0
  for (const raw of conditions) {
    if (!raw || (raw as { condition_type?: string }).condition_type !== 'WEIGHT') continue
    const cond = raw as { condition_key?: string; condition_value?: string; target_route_id?: string }
    if (cond.condition_value === 'residual') {
      segments.push({ target: String(cond.target_route_id ?? ''), pct: 0, residual: true })
      continue
    }
    const pct = Number(cond.condition_key)
    if (Number.isFinite(pct)) {
      explicitSum += pct
      segments.push({ target: String(cond.target_route_id ?? ''), pct, residual: false })
    }
  }
  if (!segments.length) return null
  const residual = Math.max(0, 100 - explicitSum)
  for (const seg of segments) {
    if (seg.residual) seg.pct = residual
  }
  return segments
})

function prevVersionOf(i: number): string | null {
  return versions.value[i + 1]?.config_version ?? null
}

async function viewDiffAt(i: number) {
  const to = versions.value[i]?.config_version
  const from = prevVersionOf(i)
  if (!to || !from) return
  try {
    const rows = await getRouteVersionDiff(routeId.value, from, to)
    diff.value = { from, to, rows: Array.isArray(rows) ? rows : [] }
  } catch {
    diff.value = null
  }
}

async function onPublish() {
  if (publishing.value || !hasDesc.value) return
  publishing.value = true
  publishFailed.value = false
  try {
    await publishRoute(routeId.value, desc.value.trim())
    ElMessage.success(t('v2.publish.published'))
    desc.value = ''
    await loadVersions()
  } catch {
    publishFailed.value = true
  } finally {
    publishing.value = false
  }
}

function changeTypeLabel(v: RouteVersionDto): string {
  if (v.change_type === 'CREATE') return t('v2.publish.changeCreate')
  if (v.change_type === 'PUBLISH') return t('v2.publish.changePublish')
  return String(v.change_type ?? '')
}

// —— 展示格式化（数字/时间缩写，语义同 List.vue；占位一律走 i18n，不造裸 '—'）——
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function formatHits(hits: unknown): string {
  const n = toNum(hits)
  if (!Number.isFinite(n)) return t('v2.routes.placeholder')
  if (n >= 1e9) return `${trimUnit(n / 1e9)}B`
  if (n >= 1e6) return `${trimUnit(n / 1e6)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

function trimUnit(v: number): string {
  const s = v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

function formatCount(n: number | null): string {
  return n == null ? t('v2.routes.placeholder') : String(n)
}

function formatTime(ms: unknown): string {
  const n = toNum(ms)
  if (!Number.isFinite(n)) return t('v2.routes.placeholder')
  const d = new Date(n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtPct(pct: number): string {
  return `${Number.isInteger(pct) ? String(pct) : pct.toFixed(1)}%`
}
</script>

<style scoped lang="scss">
$mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

/* 错误提示条（pub-error / pub-publish-error，同 List.vue hint-banner 模式） */
.hint-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);

  &.is-error {
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  }
}

/* 页头 + 两栏布局（时间线 | 主区；窄视口收单列，沿 S3 收口模式） */
.pub-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.pub-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--app-text); }
.pub-head-route {
  font-family: $mono;
  font-size: 12px;
  color: var(--app-text-secondary);
  padding: 2px 8px;
  border-radius: var(--app-radius-chip);
  background: var(--app-bg-muted);
}
.pub-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 14px; align-items: start; }
.pub-side,
.pub-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.pub-main-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 960px) {
  .pub-grid,
  .pub-main-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 卡头（FcSectionCard 无头插槽，head 自绘） */
.pub-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--app-text);

  b {
    font-weight: 600;
  }
}

.pub-mono { font-family: $mono; }

/* 版本时间线（.tl 模式：左轨 + 圆点，沿原型 10 / List 样式语言） */
.tl {
  position: relative;
  padding-left: 18px;

  &::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    background: var(--app-border-extra-light);
  }
}

.tl-item {
  position: relative;
  padding: 8px 0;

  &::before {
    content: '';
    position: absolute;
    left: -17px;
    top: 14px;
    width: 8px;
    height: 8px;
    border-radius: var(--app-radius-full);
    background: var(--app-text-quaternary);
  }

  &.is-cur::before {
    background: var(--app-primary);
  }

  & + .tl-item {
    border-top: 1px solid var(--app-border-extra-light);
  }
}

.tl-head { display: flex; align-items: center; gap: 8px; }
.tl-ver { font-size: 13px; font-weight: 700; color: var(--app-text); }
.pub-badge-current {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-accent-text-on-tint);
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-primary) 30%, transparent);
  border-radius: var(--app-radius-full);
  white-space: nowrap;
}
.tl-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
.pub-actor { font-weight: 600; }
.pub-type {
  padding: 1px 6px;
  font-size: 10.5px;
  border-radius: var(--app-radius-chip);
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  white-space: nowrap;
}
.tl-desc { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--app-text-secondary); }
.tl-actions { display: flex; gap: 6px; margin-top: 4px; }
.pub-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 12px;
  font-size: 12.5px;
  color: var(--app-text-secondary);
}

/* 发布表单 */
.pub-form-row { display: flex; align-items: flex-start; gap: 10px; }
.pub-desc { flex: 1; min-width: 0; }

/* diff 卡 */
.pub-diff-range {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-secondary);
}
.pub-diff-ver { white-space: nowrap; }
.pub-diff-table {
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-md);
  overflow: hidden;
  font-size: 12px;
}
.pub-diff-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--app-border-extra-light);

  &:last-child {
    border-bottom: none;
  }

  /* data-changed="true" 的行：主色淡底 + 左侧强调条 */
  &.is-changed {
    background: color-mix(in srgb, var(--app-primary) 6%, transparent);
    box-shadow: inset 2px 0 0 var(--app-primary);
  }
}
.pub-diff-field { font-weight: 600; color: var(--app-text); word-break: break-all; }
.pub-diff-val { color: var(--app-text-secondary); word-break: break-all; }
.pub-diff-empty {
  padding: 16px 10px;
  font-size: 12.5px;
  color: var(--app-text-secondary);
  text-align: center;
  border: 1px dashed var(--app-separator);
  border-radius: var(--app-radius-md);
}

/* 影响面卡 */
.pub-impact-list { display: flex; flex-direction: column; gap: 8px; }
.pub-impact-line { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--app-text); }

/* 灰度只读卡：纯形状权重条，无任何编辑控件 */
.pub-gray-bar {
  display: flex;
  height: 28px;
  overflow: hidden;
  border-radius: var(--app-radius-md);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light);
}
.pub-gray-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  background: color-mix(in srgb, var(--app-primary) 24%, transparent);

  & + .pub-gray-seg {
    border-left: 1px solid var(--app-bg-card);
  }

  &.is-residual {
    background: color-mix(in srgb, var(--app-text-quaternary) 24%, transparent);
  }
}
.pub-gray-pct { padding: 0 4px; font-size: 11px; color: var(--app-text); white-space: nowrap; }
.pub-gray-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-text-secondary);
}
</style>
