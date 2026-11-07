<template>
  <div class="v2-chain" :class="{ 'is-editable': canWrite }" data-testid="chn-page">
    <FcSection>
      <!-- Page head: title + scope tabs (data-active follows the active scope; five lanes are never unmounted) -->
      <div class="chain-head">
        <div class="chain-head-main">
          <h1>{{ t('v2.page.chain') }}</h1>
          <p class="chain-sub">{{ t('v2.chain.subtitle') }}</p>
        </div>
        <div class="scope-tabs" data-testid="chn-scope-tabs" role="tablist" :aria-label="t('v2.page.chain')">
          <button
            type="button"
            class="scope-tab"
            data-testid="chn-scope-global"
            :data-active="scope === 'global' ? 'true' : 'false'"
            role="tab"
            :aria-selected="scope === 'global'"
            @click="scope = 'global'"
          >
            <span>{{ t('v2.chain.scopeGlobal') }}</span>
            <span class="scope-n">{{ globalCount }}</span>
          </button>
          <button
            type="button"
            class="scope-tab"
            data-testid="chn-scope-route"
            :data-active="scope === 'route' ? 'true' : 'false'"
            role="tab"
            :aria-selected="scope === 'route'"
            @click="enterRouteScope"
          >
            <span>{{ t('v2.chain.scopeRoute') }}</span>
            <!-- S12-C5: honest count — renders only after the lazy listRoutes pull succeeded
                 (routesLoaded never rolls back on scope switch; unknown count renders nothing) -->
            <span v-if="routesLoaded" class="scope-n" data-testid="chn-scope-route-count">{{ routes.length }}</span>
          </button>
        </div>
      </div>

      <!-- No two-stage save: enable/disable + sort persist immediately and reach the gateway via config sync -->
      <p class="sync-hint" role="note">
        <FcIcon name="ri-information-line" :size="13" />
        <span>{{ t('v2.chain.syncHint') }}</span>
      </p>
      <!-- Route scope (S10b): picker (lazy first pull on scope entry) + unselected empty state + join semantics note -->
      <template v-if="scope === 'route'">
        <div class="route-picker" data-testid="chn-route-picker">
          <label class="rp-label" for="chn-route-search">{{ t('v2.chain.routePickerLabel') }}</label>
          <FcInput
            v-model="routeSearch"
            id="chn-route-search"
            data-testid="chn-route-search"
            size="small"
            :placeholder="t('v2.chain.routeSearchPlaceholder')"
          />
          <div class="rp-list">
            <button
              v-for="r in filteredRoutes"
              :key="r.id"
              type="button"
              class="rp-opt"
              :data-testid="`chn-route-opt-${r.id}`"
              :data-selected="selectedRouteId === r.id ? 'true' : 'false'"
              @click="selectRoute(r.id)"
            >
              <b class="rp-opt-name">{{ r.route_name }}</b>
              <span v-if="r.path" class="rp-opt-path">{{ r.path }}</span>
            </button>
          </div>
        </div>
        <p v-if="!selectedRouteId" class="route-empty" data-testid="chn-route-empty" role="status">{{ t('v2.chain.routeSelectEmpty') }}</p>
        <p class="join-hint" data-testid="chn-join-hint" role="note">
          <FcIcon name="ri-git-branch-line" :size="13" />
          <span>{{ t('v2.chain.routeJoinHint') }}</span>
        </p>
      </template>

      <!-- Load failed: banner + retry; retry stays clickable while a request is in flight (loadEpoch drops stale responses) -->
      <div v-if="failed" class="hint-banner is-error chain-error" data-testid="chn-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.chain.loadFailed') }}</span>
        <FcButton class="retry-btn" variant="secondary" size="sm" data-testid="chn-retry" @click="reload">
          <FcIcon name="ri-refresh-line" :size="13" />
          <span>{{ t('v2.chain.retry') }}</span>
        </FcButton>
      </div>

      <!-- enable/disable / sort / install failure bar (message passthrough) -->
      <div v-if="actionError" class="hint-banner is-error" data-testid="chn-action-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ actionError }}</span>
      </div>

      <FcSkeleton v-if="loading && !rowsLoaded" variant="text" :rows="6" />

      <!-- Five lanes: DOM order = execution order; horizontal-scroll container absorbs overflow at 375 -->
      <div v-if="rowsLoaded" class="chain-scroll" data-testid="chn-scroll">
        <div class="chain-grid">
          <template v-for="lane in laneViews" :key="lane.key">
            <!-- Forward lane: static gateway core, not pluggable, no count / no cards / no market slot -->
            <section v-if="lane.key === 'forward'" class="lane lane-forward" data-testid="chn-lane-forward">
              <header class="lane-h"><b>{{ t(lane.labelKey) }}</b></header>
              <div class="lane-b lane-b-forward">
                <div class="forward-card" data-testid="chn-forward-card">
                  <span class="forward-ring" aria-hidden="true"><FcIcon name="ri-arrow-right-line" :size="22" /></span>
                  <b class="forward-name">{{ t('v2.chain.forwardCore') }}</b>
                  <p class="forward-note">{{ t('v2.chain.forwardNotPluggable') }}</p>
                </div>
              </div>
            </section>

            <!-- Pluggable lane: header count includes disabled cards; global lanes bucket disabled to the tail,
                 binding lanes keep binding sort_order as-is (disabled never sink) -->
            <section v-else class="lane" :data-testid="`chn-lane-${lane.key}`">
              <header class="lane-h">
                <b>{{ t(lane.labelKey) }}</b>
                <span class="lane-count">×{{ lane.cards.length }}</span>
              </header>
              <div class="lane-b">
                <article
                  v-for="(card, i) in lane.cards"
                  :key="card.key"
                  class="pg"
                  :class="{ 'is-disabled': card.status === 'DISABLED' }"
                  :data-state="card.status === 'DISABLED' ? 'disabled' : 'enabled'"
                  :data-testid="`chn-card-${card.id}`"
                  :draggable="canWrite ? 'true' : 'false'"
                  @dragstart="onDragStart(i, lane.key)"
                  @dragover.prevent
                  @drop="onDrop(i, lane.key)"
                  @dragend="onDragEnd"
                >
                  <div class="pg-top">
                    <span v-if="canWrite" class="pg-grip" aria-hidden="true">⠿</span>
                    <b class="pg-name" :title="card.name">{{ card.name }}</b>
                    <FcTag color="gray" size="sm">{{ card.kind === 'global' ? t('v2.chain.badgeGlobal') : t('v2.chain.badgeRoute') }}</FcTag>
                    <FcTag v-if="card.status === 'DISABLED'" color="warning" size="sm">{{ t('v2.chain.disabledLabel') }}</FcTag>
                    <FcTag
                      v-if="runtimeBadge(card) === 'wired'"
                      color="success"
                      size="sm"
                      :data-testid="`chn-runtime-${card.id}`"
                    >{{ t('v2.chain.runtimeWired') }}</FcTag>
                    <FcTag
                      v-else-if="runtimeBadge(card) === 'unwired'"
                      color="warning"
                      size="sm"
                      :data-testid="`chn-runtime-${card.id}`"
                    >{{ t('v2.chain.runtimeUnwired') }}</FcTag>
                    <!-- FcSwitch drops attrs (inheritAttrs:false): testid + click live on this wrapper span -->
                    <span v-if="canWrite" class="pg-switch" :data-testid="`chn-switch-${card.id}`" @click="toggleCard(card)">
                      <FcSwitch :model-value="card.status !== 'DISABLED'" size="small" />
                    </span>
                  </div>
                  <p v-if="statsText(card)" class="pg-stats" :data-testid="`chn-stats-${card.id}`">{{ statsText(card) }}</p>
                </article>
                <div class="lane-add" :data-testid="`chn-add-${lane.key}`">
                  <FcIcon name="ri-add-line" :size="13" />
                  <span>{{ t('v2.chain.addFromMarket') }}</span>
                </div>
              </div>
            </section>
          </template>
        </div>
      </div>
    </FcSection>

    <!-- Market: builtin types grouped by category (server category first, id-map fallback) + custom gw_plugin rows -->
    <section class="market" data-testid="chn-market">
      <header class="market-h">
        <b>{{ t('v2.chain.marketTitle') }}</b>
        <!-- S12-C1: shortcuts to the legacy single creation entry (/plugins/new; the plugin
             type is chosen inside the legacy editor) — read-only navigation, always rendered -->
        <span class="market-actions">
          <FcButton variant="secondary" size="sm" data-testid="chn-market-upload-jar" @click="newPluginEntry">
            <FcIcon name="ri-upload-2-line" :size="13" />
            <span>{{ t('v2.chain.marketUploadJar') }}</span>
          </FcButton>
          <FcButton variant="secondary" size="sm" data-testid="chn-market-new-groovy" @click="newPluginEntry">
            <FcIcon name="ri-code-s-slash-line" :size="13" />
            <span>{{ t('v2.chain.marketNewGroovy') }}</span>
          </FcButton>
        </span>
      </header>
      <div v-if="marketGroups.length || customRows.length" class="market-grid">
        <div v-for="g in marketGroups" :key="g.key" class="market-cat" :data-testid="`chn-market-cat-${g.key}`">
          <h4 class="market-cat-h">{{ t(CAT_LABEL_KEYS[g.key]) }}</h4>
          <div v-for="item in g.items" :key="item.plugin_id" class="mkt-card" :data-testid="`chn-mkt-${item.plugin_id}`">
            <div class="mkt-top">
              <b class="mkt-name" :title="item.plugin_name">{{ item.plugin_name }}</b>
              <FcTag color="gray" size="sm">{{ t('v2.chain.marketBuiltin') }}</FcTag>
            </div>
            <p v-if="item.description" class="mkt-desc">{{ item.description }}</p>
            <div v-if="canWrite" class="mkt-act">
              <FcButton
                variant="secondary"
                size="sm"
                :disabled="isInstalled(item.plugin_id)"
                :data-testid="`chn-mkt-install-${item.plugin_id}`"
                @click="installBuiltin(item)"
              >
                {{ isInstalled(item.plugin_id) ? t('v2.chain.marketInstalled') : t('v2.chain.marketInstall') }}
              </FcButton>
            </div>
          </div>
        </div>
        <div v-if="customRows.length" class="market-cat" data-testid="chn-market-custom">
          <h4 class="market-cat-h">{{ t('v2.chain.marketCustom') }}</h4>
          <div v-for="p in customRows" :key="p.id" class="mkt-card" :data-testid="`chn-mkt-${p.plugin_id}`">
            <div class="mkt-top">
              <b class="mkt-name" :title="p.plugin_name">{{ p.plugin_name }}</b>
              <FcTag color="brand" size="sm">{{ p.plugin_type }}</FcTag>
            </div>
            <p v-if="p.remark" class="mkt-desc">{{ p.remark }}</p>
            <!-- Read-only navigation to the legacy editor: kept regardless of canEdit -->
            <div class="mkt-act">
              <FcButton
                variant="secondary"
                size="sm"
                :data-testid="`chn-mkt-manage-${p.plugin_id}`"
                @click="managePlugin(p)"
              >{{ t('v2.chain.marketManage') }}</FcButton>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="market-empty">{{ t('v2.routes.placeholder') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { FcButton, FcIcon, FcInput, FcSection, FcSkeleton, FcSwitch, FcTag } from '@/components'
import {
  listPlugins, listBuiltinTypes, enablePlugin, disablePlugin, sortGlobalPlugins, createPlugin, getRuntimeStatus,
  type PluginItem, type BuiltinTypeMeta
} from '@/api/plugins'
import { listRoutes, listBindings, sortRoutePlugins, type RouteNode } from '@/api/routes'
import { getBuiltinCategory, BUILTIN_CATEGORIES, type BuiltinCategoryKey } from '@/views/plugins/builtinCategories'

/**
 * S10a-C：v2 插件链（全局 scope 五泳道 + 启停 + 排序 + 市场区 + runtime 徽标）。
 * - 泳道 = 前端派生（引擎 PluginPhase 只有 PRE/POST，PluginExecutionFilter 为序权威）：
 *   lane1=GLOBAL+PRE、lane2=路由绑定+PRE（S10b）、lane3=静态转发卡、lane4=绑定+POST（S10b）、
 *   lane5=GLOBAL+POST；DISABLED 置灰排尾（状态分桶，非 sort_order 数值序）。
 * - 全局泳道取数 = listPlugins({ scope:'GLOBAL' })（全状态含 DISABLED；不用 listGlobalPlugins）。
 * - 缺口不造数：p95/泳道耗时/合计开销/QPS/命中率/实例数一律不渲染；stats 仅引擎上报的
 *   executed/skipped/error 计数，Long→String 契约下按字符串原样直出（不做千分位）。
 * - 无「保存编排」两段式：enable/disable + sortGlobalPlugins 即时落库并经配置同步生效。
 * - 启停 = FcSwitch（disable 需 confirm({ variant:'danger' })，enable 直接）；排序 = 手写
 *   HTML5 DnD（同 lane reorder → sortGlobalPlugins(phase, ids) 全量提交，失败 reload 回滚）；
 *   竞态防护 = loadEpoch（丢弃过期响应，retry 在请求挂起期间保持可点）。
 * - 市场区 = listBuiltinTypes()（按 builtinCategories 分组，server category 优先、
 *   getBuiltinCategory 兜底）∪ listPlugins 的 JAR/GROOVY/GROUP 行；已装判定 = gw_plugin
 *   行 plugin_id 比对 → 安装钮 disabled；安装 = createPlugin({ plugin_id, scope:'GLOBAL' })
 *   成功后 reload；管理 = 跳旧路由 /plugins/:id/edit（只读导航，不受 canEdit 限制）。
 * - runtime 徽标 = getRuntimeStatus()（items 按 plugin_id 接线；available=false 或接口异常
 *   静默降级无徽标不崩）；仅 BUILTIN 卡渲染（JAR/GROOVY/GROUP 与数据面接线无关）。
 *
 * S10b-C：路由级 scope（路由选择器 / 绑定泳道 / 绑定启停 / 绑定排序 / join 提示）。
 * - 惰性取数：进入路由级 scope 才拉 listRoutes()；选中路由才发 listBindings(routeId) +
 *   不带 scope 的 listPlugins()（第二取数，join 解析绑定卡底层 gw_plugin 行启停状态）。
 * - 绑定泳道卡序 = binding sort_order 升序、停用卡【不】沉尾（listBindings orderByAsc 即权威序，
 *   状态分桶会与 sortRoutePlugins 全量提交打架）——与全局泳道状态分桶规则刻意相反。
 * - 绑定启停 = enablePlugin/disablePlugin(底层行主键 binding.plugin_id)，testid 用 binding_id
 *   （两者刻意错位防传错）；disable 需 confirm({ variant:'danger' })；成功重拉绑定。
 * - 绑定排序 = sortRoutePlugins(routeId, phase, bindingIds) 全量提交；POST 相序 = 绑定先、
 *   全局后（PluginExecutionFilter.compose 权威），由 chn-join-hint 文案钉住 join 语义。
 * - scope 往返五泳道不卸载；routeScopeWip 占位退场（key 留在 locale 供既有用例）。
 */

type ChainLaneKey = 'pre-global' | 'pre-route' | 'post-route' | 'post-global'
type LaneDefKey = ChainLaneKey | 'forward'

/**
 * 泳道卡视图模型（global / binding 两类卡共用一套渲染）：
 * - global：testid key = gw_plugin 行 id，targetId = 同一行 id（启停参数）。
 * - binding：testid key = binding_id，targetId = binding.plugin_id（底层 gw_plugin 行主键，
 *   启停参数）—— 两者刻意错位，传错即红。
 */
type LaneCard = {
  key: string
  /** testid key：global = 插件行 id；binding = binding_id */
  id: string
  name: string
  status: 'ENABLED' | 'DISABLED'
  kind: 'global' | 'binding'
  /** 启停 API 参数：底层 gw_plugin 行主键 */
  targetId: string
  /** global 卡回引用（runtime 徽标 / stats）；binding 行不带接线数据 → 无（缺口不造数） */
  plugin: PluginItem | null
}

/** listBindings 实际返回行（RouteBindingService；BindingDto 类型未覆盖 plugin_name/plugin_phase） */
type BindingRow = {
  binding_id: string
  route_id?: string
  plugin_id: string
  plugin_name?: string
  plugin_phase?: string
  sort_order?: number | string
  binding_config?: string
}

const { t } = useI18n()
const router = useRouter()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()

/** 泳道定义（DOM 顺序 = 执行顺序：全局前置 → 路由前置 → 转发 → 路由后置 → 全局后置） */
const LANE_DEFS: Array<{ key: LaneDefKey; labelKey: string }> = [
  { key: 'pre-global', labelKey: 'v2.chain.lanePreGlobal' },
  { key: 'pre-route', labelKey: 'v2.chain.lanePreRoute' },
  { key: 'forward', labelKey: 'v2.chain.laneForward' },
  { key: 'post-route', labelKey: 'v2.chain.lanePostRoute' },
  { key: 'post-global', labelKey: 'v2.chain.lanePostGlobal' }
]

/** 市场内置分组头 → v2.chain.cat* key（不引用 plugin.category* 旧树，契约 ⑨） */
const CAT_LABEL_KEYS: Record<BuiltinCategoryKey, string> = {
  security: 'v2.chain.catSecurity',
  'rate-limit': 'v2.chain.catRateLimit',
  'traffic-rewrite': 'v2.chain.catTrafficRewrite',
  observability: 'v2.chain.catObservability',
  'traffic-control': 'v2.chain.catTrafficControl',
  response: 'v2.chain.catResponse',
  other: 'v2.chain.catOther'
}

const canWrite = computed(() => canEdit('plugin'))

// ── 数据态 ────────────────────────────────────────────────────────────────
const loading = ref(false)
const failed = ref(false)
const rowsLoaded = ref(false)
const actionError = ref('')

const rows = ref<PluginItem[]>([])
const lanes = ref<Record<ChainLaneKey, LaneCard[]>>({ 'pre-global': [], 'pre-route': [], 'post-route': [], 'post-global': [] })
const builtinTypes = ref<BuiltinTypeMeta[]>([])

// ── S10b 路由级 scope 状态（惰性取数：进 scope 才拉路由清单，选中路由才拉绑定 + join 行）──
const scope = ref<'global' | 'route'>('global')
const routesLoaded = ref(false)
const routes = ref<RouteNode[]>([])
const routeSearch = ref('')
const selectedRouteId = ref('')
const bindings = ref<BindingRow[]>([])
/** 绑定卡启停状态 join 源：listPlugins 不带 scope 的全量行（plugin 行主键 → status） */
const routeRows = ref<PluginItem[]>([])

let loadEpoch = 0
let dragFrom = -1
let dragLane: ChainLaneKey | '' = ''

onMounted(() => {
  void reload()
  void loadRuntimeStatus()
  void loadBuiltinTypes()
})

/** 取数：分页形状 records/total；失败 → 错误条 + 泳道不渲染；loadEpoch 防陈旧覆盖 */
async function reload() {
  const my = ++loadEpoch
  loading.value = true
  try {
    const page = await listPlugins({ page: 1, pageSize: 200, scope: 'GLOBAL' })
    if (my !== loadEpoch) return
    applyRows((page?.records ?? []).filter((p) => p.scope === 'GLOBAL'))
    failed.value = false
    rowsLoaded.value = true
  } catch {
    if (my !== loadEpoch) return
    failed.value = true
    rows.value = []
    lanes.value = { 'pre-global': [], 'pre-route': [], 'post-route': [], 'post-global': [] }
  } finally {
    if (my === loadEpoch) loading.value = false
  }
}

function applyRows(list: PluginItem[]) {
  rows.value = list
  rebuildLanes()
}

/**
 * 泳道重建（全局 + 绑定两路数据汇齐后统一派生）：
 * - lane1/lane5（GLOBAL）：ENABLED 按 sort_order 升序在前，DISABLED 置灰排尾；
 * - lane2/lane4（绑定）：binding sort_order 升序即权威序，停用卡【不】沉尾
 *   （绑定 sort_order 是每路由泳道的持久化序，状态分桶会与 sortRoutePlugins 全量提交打架）。
 */
function rebuildLanes() {
  const rowStatus = new Map(routeRows.value.map((r) => [r.id, r.status]))
  const toGlobalCard = (p: PluginItem): LaneCard => ({
    key: `g-${p.id}`,
    id: p.id,
    name: p.plugin_name,
    status: p.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
    kind: 'global',
    targetId: p.id,
    plugin: p
  })
  const bindingRank = (b: BindingRow) => (Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0)
  const bindingCards = (phase: 'PRE' | 'POST'): LaneCard[] =>
    bindings.value
      .filter((b) => (b.plugin_phase ?? 'PRE') === phase)
      .sort((a, b) => bindingRank(a) - bindingRank(b))
      .map((b) => ({
        key: `b-${b.binding_id}`,
        id: b.binding_id,
        name: b.plugin_name ?? b.plugin_id,
        status: rowStatus.get(b.plugin_id) === 'DISABLED' ? 'DISABLED' : 'ENABLED',
        kind: 'binding' as const,
        targetId: b.plugin_id,
        plugin: null
      }))
  lanes.value = {
    'pre-global': orderLane(rows.value.filter((p) => p.plugin_phase === 'PRE')).map(toGlobalCard),
    'pre-route': bindingCards('PRE'),
    'post-route': bindingCards('POST'),
    'post-global': orderLane(rows.value.filter((p) => p.plugin_phase === 'POST')).map(toGlobalCard)
  }
}

// ── S10b：路由选择器（惰性首拉 + 客户端子串过滤）─────────────────────────
const filteredRoutes = computed(() => {
  const q = routeSearch.value.trim().toLowerCase()
  if (!q) return routes.value
  return routes.value.filter((r) => r.route_name?.toLowerCase().includes(q) || r.path?.toLowerCase().includes(q))
})

/** 进入路由级 scope：路由清单只在首次进入时拉取（全局 scope 不发请求） */
async function enterRouteScope() {
  if (scope.value === 'route') return
  scope.value = 'route'
  if (routesLoaded.value) return
  try {
    routes.value = (await listRoutes()) ?? []
    routesLoaded.value = true
  } catch {
    routes.value = []
  }
}

/** 选中路由：拉绑定泳道 + join 全量插件行（解析绑定卡底层行启停状态） */
async function selectRoute(id: string) {
  selectedRouteId.value = id
  actionError.value = ''
  await refreshRouteData()
}

async function reloadBindings() {
  if (!selectedRouteId.value) return
  try {
    bindings.value = ((await listBindings(selectedRouteId.value)) ?? []) as BindingRow[]
    rebuildLanes()
  } catch (e: any) {
    actionError.value = e?.message || t('v2.chain.actionFailed')
  }
}

async function loadRouteRows() {
  try {
    const page = await listPlugins({ page: 1, pageSize: 200 })
    routeRows.value = page?.records ?? []
    rebuildLanes()
  } catch {
    // 状态未知：保留上次 join 结果，不造数
  }
}

async function refreshRouteData() {
  await Promise.all([reloadBindings(), loadRouteRows()])
}

/** 泳道序：ENABLED 按 sort_order 升序在前，DISABLED 置灰排尾（两桶各自按 sort_order 升序） */
function orderLane(list: PluginItem[]): PluginItem[] {
  const rank = (p: PluginItem) => (Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0)
  const enabled = list.filter((p) => p.status !== 'DISABLED').sort((a, b) => rank(a) - rank(b))
  const disabled = list.filter((p) => p.status === 'DISABLED').sort((a, b) => rank(a) - rank(b))
  return [...enabled, ...disabled]
}

// ── 模板泳道视图（forward 为标记位，v-else 分支的 key 已收窄为 ChainLaneKey）──
const laneViews = computed(() =>
  LANE_DEFS.map((d) => {
    if (d.key === 'forward') return { key: d.key, labelKey: d.labelKey, cards: [] as PluginItem[] }
    return { key: d.key, labelKey: d.labelKey, cards: lanes.value[d.key] }
  })
)

const globalCount = computed(() => lanes.value['pre-global'].length + lanes.value['post-global'].length)

// ── 数据面接线状态（engine reload 后写入 Redis；available=false / 接口异常 → 静默降级）──
type RuntimeEntry = { registered: boolean; stats?: Record<string, unknown> }
const runtimeMap = ref<Record<string, RuntimeEntry>>({})
const runtimeAvailable = ref(false)

async function loadRuntimeStatus() {
  runtimeAvailable.value = false
  runtimeMap.value = {}
  try {
    const res = await getRuntimeStatus()
    if (!res || res.available !== true) return
    const map: Record<string, RuntimeEntry> = {}
    for (const it of res.items ?? []) {
      if (it && it.plugin_id) {
        map[it.plugin_id] = { registered: !!it.registered, stats: it.stats as Record<string, unknown> | undefined }
      }
    }
    runtimeMap.value = map
    runtimeAvailable.value = true
  } catch {
    // 接口异常按状态未知处理：无徽标无计数，不打扰用户
  }
}

/** 数据面徽标：仅 global BUILTIN 卡与接线有关（绑定行不带接线数据）；未知 → 未接线（Builtin.vue 先例） */
function runtimeBadge(card: LaneCard): 'wired' | 'unwired' | 'none' {
  if (card.kind !== 'global' || !card.plugin) return 'none'
  if (card.plugin.plugin_type !== 'BUILTIN') return 'none'
  if (!runtimeAvailable.value) return 'none'
  return runtimeMap.value[card.plugin.plugin_id]?.registered ? 'wired' : 'unwired'
}

/** 执行计数：Long→String 契约下按字符串原样直出（不千分位）；引擎未上报 → 不渲染 */
function statsText(card: LaneCard): string | null {
  if (card.kind !== 'global' || !card.plugin) return null
  if (!runtimeAvailable.value) return null
  const s = runtimeMap.value[card.plugin.plugin_id]?.stats
  if (!s || typeof s !== 'object') return null
  const { executed, skipped, error } = s
  if (executed == null && skipped == null && error == null) return null
  return t('v2.chain.statsLabel', { executed: countText(executed), skipped: countText(skipped), error: countText(error) })
}

function countText(v: unknown): string {
  return v == null ? '—' : String(v)
}

// ── 市场区：内置按 category 分组 + 自定义行 ────────────────────────────────
/** 内置类型清单；失败降级为空（市场只剩自定义行，不拖垮泳道） */
async function loadBuiltinTypes() {
  try {
    builtinTypes.value = (await listBuiltinTypes()) ?? []
  } catch {
    builtinTypes.value = []
  }
}

const CATEGORY_KEYS = new Set<string>(BUILTIN_CATEGORIES.map((c) => c.key))

const marketGroups = computed(() => {
  const grouped = new Map<BuiltinCategoryKey, BuiltinTypeMeta[]>()
  for (const item of builtinTypes.value) {
    const serverCat = item.category
    const cat: BuiltinCategoryKey = serverCat && CATEGORY_KEYS.has(serverCat)
      ? serverCat as BuiltinCategoryKey
      : getBuiltinCategory(item.plugin_id)
    const bucket = grouped.get(cat) ?? []
    bucket.push(item)
    grouped.set(cat, bucket)
  }
  return BUILTIN_CATEGORIES.filter((c) => grouped.has(c.key)).map((c) => ({ key: c.key, items: grouped.get(c.key)! }))
})

/** 自定义行 = gw_plugin 的 JAR/GROOVY/GROUP（BUILTIN 之外），与泳道共用一次取数 */
const customRows = computed(() => rows.value.filter((p) => p.plugin_type && p.plugin_type !== 'BUILTIN'))

const installedIds = computed(() => new Set(rows.value.map((p) => p.plugin_id)))
const isInstalled = (pluginId: string) => installedIds.value.has(pluginId)

// ── 写操作：启停 / 安装 / 排序 ────────────────────────────────────────────
/**
 * 启停（全局卡 / 绑定卡共用）：disable 需 confirm(danger)，enable 直接；失败 → action-error。
 * 参数 = card.targetId（底层 gw_plugin 行主键；绑定卡 = binding.plugin_id，非 binding_id）。
 * 成功后按卡类型重拉：绑定卡重拉绑定 + join 行，全局卡重拉全局泳道。
 */
async function toggleCard(card: LaneCard) {
  if (!canEdit('plugin')) return
  const isDisabled = card.status === 'DISABLED'
  if (!isDisabled) {
    const ok = await confirm({ title: t('common.confirmDisablePlugin'), variant: 'danger' })
    if (!ok) return
  }
  actionError.value = ''
  try {
    if (isDisabled) await enablePlugin(card.targetId)
    else await disablePlugin(card.targetId)
    if (card.kind === 'binding') await refreshRouteData()
    else await reload()
  } catch (e: any) {
    actionError.value = e?.message || t('v2.chain.actionFailed')
  }
}

/** 市场安装：payload 至少含 plugin_id + scope:'GLOBAL'，其余按内置行补齐；成功后 reload 落泳道 */
async function installBuiltin(item: BuiltinTypeMeta) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  try {
    await createPlugin({
      plugin_id: item.plugin_id,
      plugin_name: item.plugin_name,
      plugin_type: 'BUILTIN',
      plugin_phase: item.plugin_phase === 'POST' ? 'POST' : 'PRE',
      scope: 'GLOBAL',
      status: 'ENABLED',
      config: '{}'
    })
    await reload()
  } catch (e: any) {
    actionError.value = e?.message || t('v2.chain.actionFailed')
  }
}

/** 全局泳道同 lane reorder → sortGlobalPlugins(phase, 全 lane ids 含停用)；失败 reload 回滚 + 错误条 */
async function saveSort(laneKey: ChainLaneKey, ids: string[]) {
  if (!canEdit('plugin')) return
  actionError.value = ''
  const phase = laneKey === 'pre-global' ? 'PRE' : 'POST'
  try {
    await sortGlobalPlugins(phase, ids)
    await reload()
  } catch (e: any) {
    const msg = e?.message || t('v2.chain.actionFailed')
    await reload()
    actionError.value = msg
  }
}

/** 绑定泳道同 lane reorder → sortRoutePlugins(routeId, phase, binding_ids 全量)；失败重拉回滚 + 错误条 */
async function saveBindingSort(laneKey: ChainLaneKey, bindingIds: string[]) {
  if (!canEdit('plugin') || !selectedRouteId.value) return
  actionError.value = ''
  const phase = laneKey === 'pre-route' ? 'PRE' : 'POST'
  try {
    await sortRoutePlugins(selectedRouteId.value, phase, bindingIds)
    await reloadBindings()
  } catch (e: any) {
    const msg = e?.message || t('v2.chain.actionFailed')
    await reloadBindings()
    actionError.value = msg
  }
}

// ── 手写 HTML5 DnD（搬 Global.vue:152-179；jsdom 无坐标/无 dataTransfer，全部容错）──
function onDragStart(index: number, laneKey: ChainLaneKey) {
  if (!canEdit('plugin')) return
  dragFrom = index
  dragLane = laneKey
}

function onDrop(index: number, laneKey: ChainLaneKey) {
  if (!canEdit('plugin') || dragLane !== laneKey || dragFrom === -1 || dragFrom === index) {
    dragFrom = -1
    dragLane = ''
    return
  }
  const list = [...lanes.value[laneKey]]
  const [moved] = list.splice(dragFrom, 1)
  list.splice(index, 0, moved)
  lanes.value = { ...lanes.value, [laneKey]: list }
  dragFrom = -1
  dragLane = ''
  if (laneKey === 'pre-route' || laneKey === 'post-route') {
    void saveBindingSort(laneKey, list.map((c) => c.id))
  } else {
    void saveSort(laneKey, list.map((c) => c.targetId))
  }
}

function onDragEnd() {
  dragFrom = -1
  dragLane = ''
}

/** 管理 = 只读跳旧路由 /plugins/:id/edit（导航不改动） */
function managePlugin(p: PluginItem) {
  void router.push(`/plugins/${p.plugin_id}/edit`)
}

/** S12-C1：市场头直达钮 = 旧 UI 建插件唯一入口 /plugins/new（JAR/GROOVY 由旧 Editor 页内选择） */
function newPluginEntry() {
  void router.push('/plugins/new')
}
</script>

<style scoped lang="scss">
/* 页面作用域：无自绘动画（悬停仅描边瞬时变色）；焦点环统一 token 兜底 */
.v2-chain {
  min-width: 0;
}

.v2-chain :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* —— 页头 —— */
.chain-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 10px;
}

.chain-head-main {
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--app-text);
  }
}

.chain-sub {
  margin: 3px 0 0;
  max-width: 560px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-tertiary);
}

/* —— 作用域 tab（chips 配方，data-active 驱动激活态；S10a 恒激活全局）—— */
.scope-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-full);
}

.scope-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: none;
  background: transparent;
  border-radius: var(--app-radius-full);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-secondary);

  &:hover {
    color: var(--app-text);
  }

  &[data-active='true'] {
    color: var(--app-text);
    background: var(--app-bg-card);
    box-shadow: inset 0 0 0 1px var(--app-border-strong);
    font-weight: 600;
  }
}

.scope-n {
  padding: 0 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-full);
  font-variant-numeric: tabular-nums;
}

/* —— 同步语义提示 / 路由级占位提示 —— */
.sync-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}

/* —— S10b 路由级 scope：选择器 + 未选空态 + join 提示 —— */
.route-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
}

.rp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
}

.rp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.rp-opt {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-md);
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--app-bg-muted);
  }

  &[data-selected='true'] {
    background: color-mix(in srgb, var(--app-primary) 10%, var(--app-bg-card));
    border-color: color-mix(in srgb, var(--app-primary) 35%, transparent);
  }
}

.rp-opt-name {
  flex: none;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}

.rp-opt-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}

.route-empty {
  margin: 0 0 12px;
  padding: 14px;
  font-size: 12px;
  color: var(--app-text-tertiary);
  text-align: center;
  background: var(--app-bg-muted);
  border: 1px dashed var(--app-border-strong);
  border-radius: var(--app-radius-md);
}

.join-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}

/* —— 提示条（加载失败 / 操作失败，同 v2 页配方）—— */
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

.chain-error {
  padding: 14px 16px;
  font-size: 13px;
}

.retry-btn {
  margin-left: auto;
}

/* —— 五泳道：容器内横滚（375 下 body 不被撑开），grid 固定五列 1fr 1fr 200px 1fr 1fr —— */
.chain-scroll {
  min-width: 0;
  overflow-x: auto;
}

.chain-grid {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(200px, 1fr) 200px minmax(200px, 1fr) minmax(200px, 1fr);
  gap: 10px;
  align-items: stretch;
  min-width: 880px;
}

.lane {
  display: flex;
  flex-direction: column;
  min-height: 300px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}

.lane-h {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-extra-light);

  b {
    font-size: 12.5px;
    color: var(--app-text);
  }
}

.lane-count {
  padding: 1px 7px;
  font-size: 10.5px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-full);
  font-variant-numeric: tabular-nums;
}

.lane-b {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  padding: 10px;
}

.lane-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
  border: 1px dashed var(--app-border-strong);
  border-radius: var(--app-radius-md);
}

/* —— 插件卡：停用置灰排尾（视觉 + data-state 双通道）—— */
.pg {
  padding: 9px 10px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-md);
}

.is-editable .pg {
  cursor: grab;

  &:hover {
    border-color: color-mix(in srgb, var(--app-primary) 40%, var(--app-border));
  }
}

.pg.is-disabled {
  opacity: 0.6;
  background: color-mix(in srgb, var(--app-bg-muted) 55%, var(--app-bg-card));
  border-style: dashed;
}

.pg-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pg-grip {
  flex: none;
  color: var(--app-text-tertiary);
  font-size: 13px;
  cursor: grab;
  user-select: none;
}

.pg-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}

.pg-switch {
  flex: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.pg-stats {
  margin: 7px 0 0;
  padding-top: 7px;
  border-top: 1px dashed var(--app-border-extra-light);
  font-size: 11px;
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* —— 转发泳道：暖色底静态卡（网关核心，不可插拔）—— */
.lane-forward {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--app-color-warning) 5%, var(--app-bg-card)),
    color-mix(in srgb, var(--app-color-warning) 11%, var(--app-bg-card))
  );
}

.lane-b-forward {
  align-items: center;
  justify-content: center;
}

.forward-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px;
  text-align: center;
}

.forward-ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  color: var(--app-primary);
  background: var(--app-bg-card);
  border: 2px solid var(--app-primary);
  border-radius: 50%;
  box-shadow: var(--app-shadow-sm);
}

.forward-name {
  font-size: 13px;
  color: var(--app-text);
}

.forward-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--app-text-tertiary);
}

/* —— 市场区：内置分组 + 自定义（JAR/GROOVY/GROUP）—— */
.market {
  margin-top: 16px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}

.market-h {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border-extra-light);

  b {
    font-size: 13px;
    color: var(--app-text);
  }
}

/* S12-C1：市场头直达钮（右对齐，b 的 margin 由 flex 自然分列） */
.market-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  padding: 12px 16px;
}

.market-cat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.market-cat-h {
  margin: 0 0 2px;
  padding-bottom: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border-extra-light);
}

.mkt-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-md);
}

.mkt-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mkt-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
}

.mkt-desc {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--app-text-secondary);
}

.mkt-act {
  display: flex;
  margin-top: 2px;
}

.market-empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/* 窄视口：五泳道纵向堆叠（chn-scroll 仍兜住更小宽度的溢出） */
@media (max-width: 768px) {
  .chain-grid {
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .lane-forward {
    min-height: 160px;
  }
}
</style>
