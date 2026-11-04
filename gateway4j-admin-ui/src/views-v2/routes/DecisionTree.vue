<template>
  <div class="v2-tree">
    <FcSection>
      <!-- Page head: back entry + title (breadcrumb comes from LayoutV2, page only owns the back button) -->
      <div class="tree-head">
        <FcButton
          class="tree-back"
          variant="text"
          size="sm"
          circle
          data-testid="tree-back"
          :aria-label="t('common.back')"
          @click="router.push('/v2/routes')"
        >
          <FcIcon name="ri-arrow-left-s-line" :size="16" />
        </FcButton>
        <div class="tree-head-main">
          <h1>{{ t('v2.page.tree') }}</h1>
          <p v-if="tree?.route_name" class="tree-head-sub">{{ tree.route_name }}</p>
        </div>
      </div>

      <!-- Snapshot fallback hint: shown whenever source=snapshot (same loose rule as S6) -->
      <div v-if="tree?.source === 'snapshot'" class="hint-banner is-warn" data-testid="tree-source-hint" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.tree.snapshotHint') }}</span>
      </div>

      <FcSkeleton v-if="loading" variant="text" :rows="8" />

      <!-- Route missing (backend ErrorCode.ROUTE_NOT_FOUND=10601 mapped by the http envelope layer) -->
      <FcEmpty v-else-if="notFound" data-testid="tree-not-found" type="empty" :title="t('v2.tree.notFound')" />

      <!-- Load failed: error bar + retry; retry re-sends fetchDecisionTree and restores the tree -->
      <div v-else-if="failed" class="hint-banner is-error tree-error" data-testid="tree-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.tree.loadFailed') }}</span>
        <FcButton class="tree-retry-btn" variant="secondary" size="sm" data-testid="tree-retry" @click="reload">
          <FcIcon name="ri-refresh-line" :size="13" />
          {{ t('v2.tree.retry') }}
        </FcButton>
      </div>

      <!-- Tree body: horizontal-scroll container wraps the whole tree (no page-level overflow at 375) -->
      <div v-else-if="tree" class="tree-scroll" data-testid="tree-scroll">
        <div class="tree-body">
          <!-- Root: route_name + dispatch badge + path -->
          <div class="tree-root" data-testid="tree-root">
            <span class="tr-icon"><FcIcon name="ri-git-merge-line" :size="15" /></span>
            <span class="tr-name">{{ tree.route_name }}</span>
            <span class="tr-type">{{ rootTypeLabel }}</span>
            <span class="tr-path">{{ tree.path || '—' }}</span>
          </div>

          <!-- Totals bar: 24h hits (abbreviated) + current QPS (rounded) -->
          <div class="tree-totals" data-testid="tree-totals">
            <span class="tt-item">
              <FcIcon name="ri-bar-chart-2-line" :size="13" />
              {{ t('v2.tree.totalsHits') }}
              <b>{{ formatHits(tree.totals?.hits_24h) }}</b>
            </span>
            <span class="tt-item">
              <FcIcon name="ri-flashlight-line" :size="13" />
              {{ t('v2.tree.totalsQps') }}
              <b>{{ formatQps(tree.totals?.qps) }}</b>
            </span>
          </div>

          <!-- Branch levels: priority ascending (= evaluation order) + miss fallback (1 - sum, derived here) -->
          <div class="tree-branches">
            <BranchNode v-for="b in rootBranches" :key="b.target_route_id" :node="b" />
            <MissNode v-if="rootMissPct > 0" :pct="rootMissPct" />
          </div>

          <p v-if="!rootBranches.length" class="tree-empty">{{ t('v2.routes.placeholder') }}</p>
        </div>
      </div>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, type PropType, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { FcButton, FcEmpty, FcIcon, FcSection, FcSkeleton } from '@/components'
import { fetchDecisionTree } from '@/api/v2'
import type { DecisionTreeBranch, DecisionTreeCondition, DecisionTreePayload } from '@/api/v2'
import { BusinessError } from '@/api/http'

/**
 * S7-C：v2 分发决策树（只读呈现，无任何写操作）。
 * - 数据自包含：只从 @/api/v2 引 fetchDecisionTree（totals + 各分支指标 + source 均在响应里）；
 * - 分支按 priority 升序渲染（S7a：priority 升序 = 求值序）；
 * - 嵌套 DISPATCH 用递归组件 BranchNode（h() 渲染函数）展开，子分支 DOM 必须嵌在父分支容器内；
 * - 未命中兜底 = Math.round((1−Σ 本层 hit_ratio)·100)%，服务端不造数前端推导，Σ≥1 → 隐藏；
 * - WEIGHT 分支只渲染权重 chip（不走条件四元组）；condition:null → 「默认分支」chip；
 * - target_resolvable=false：分支置灰（data-resolvable="false"）+ 警示文案 + 不渲染指标位。
 */
/** 路由不存在判定码：后端 ErrorCode.ROUTE_NOT_FOUND=10601（gateway4j-common）为主；10400（framework4j ApiCode.NOT_FOUND）保留兼容 */
const ROUTE_NOT_FOUND_CODES = [10601, 10400]

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const failed = ref(false)
const notFound = ref(false)
const tree = ref<DecisionTreePayload | null>(null)

const routeId = computed(() => String(route.params.id ?? ''))

onMounted(() => {
  void reload()
})

/** 取数：10601（ROUTE_NOT_FOUND）→ not-found 空态；其余异常 → 错误条 + 重试；重试成功后恢复树 */
async function reload() {
  loading.value = true
  failed.value = false
  notFound.value = false
  tree.value = null
  try {
    tree.value = await fetchDecisionTree(routeId.value)
  } catch (e) {
    tree.value = null
    if (e instanceof BusinessError && ROUTE_NOT_FOUND_CODES.includes(Number(e.code))) notFound.value = true
    else failed.value = true
  } finally {
    loading.value = false
  }
}

// ── 数值归一与格式化（口径与 S3/S6 一致：formatHits 缩写 / qps 取整 / p95 带 ms 单位）──
/** Long→String 契约兜底：数值/数值字符串归一，null/undefined → NaN（展示为 —） */
function toNum(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** 命中量千分位缩写：<1k 原样；k 取整；M/B 一位小数去尾 0（1,720,000 → 1.7M） */
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

/** qps 四舍五入取整（473.6 → 474）；无数据 → — */
function formatQps(v: unknown): string {
  const n = toNum(v)
  return Number.isFinite(n) ? String(Math.round(n)) : '—'
}

/** p95 → `${n} ms`；无数据 → — */
function formatMs(v: unknown): string {
  const n = toNum(v)
  return Number.isFinite(n) ? `${n} ms` : '—'
}

// ── 树派生 ───────────────────────────────────────────────────────────────
const rootBranches = computed(() => sortBranches(tree.value?.children ?? []))
const rootMissPct = computed(() => missPctOf(tree.value?.children ?? []))

/** 根类型徽章：DISPATCH 走 i18n；其余（BACKEND 等）数据驱动原文直出（无对应标签 key） */
const rootTypeLabel = computed(() =>
  tree.value?.route_type === 'DISPATCH' ? t('v2.tree.typeDispatch') : tree.value?.route_type ?? ''
)

function sortBranches(list: DecisionTreeBranch[]): DecisionTreeBranch[] {
  return [...(list ?? [])].sort((a, b) => (toNum(a.priority) || 0) - (toNum(b.priority) || 0))
}

/** 未命中占比 = Math.round((1−Σ本层 hit_ratio)·100)（Math.round 吸浮点尾；Σ≥1 → ≤0 → 隐藏） */
function missPctOf(list: DecisionTreeBranch[]): number {
  const sum = (list ?? []).reduce((acc, b) => acc + (toNum(b.hit_ratio) || 0), 0)
  return Math.round((1 - sum) * 100)
}

/** 占比百分比文本（占比条文本与 style 宽度同源，保证 U2 精确宽度字符串断言成立） */
function ratioPct(b: DecisionTreeBranch): string {
  return `${Math.round((toNum(b.hit_ratio) || 0) * 100)}%`
}

/** 热分支（≥50% 命中）占比条用暖色，对齐原型「热分支」语义 */
function hotRatio(b: DecisionTreeBranch): boolean {
  return (toNum(b.hit_ratio) || 0) >= 0.5
}

// ── 条件人类可读化：i18n 类型标签 + condition_key/value 原文拼接 ────────────
// condition_type 为数据驱动枚举，最小断言集外的类型（BODY/GROOVY 等）回退原文直出，不造新 key；
// 算子词表复用旧 UI route.operator*（EQ 按契约固定显示 '='）。
const COND_TYPE_KEYS: Record<string, string> = {
  HEADER: 'v2.tree.condHeader',
  PATH: 'v2.tree.condPath',
  QUERY: 'v2.tree.condQuery'
}

const OPERATOR_KEYS: Record<string, string> = {
  NE: 'route.operatorNe',
  CONTAINS: 'route.operatorContains',
  REGEX: 'route.operatorRegex',
  EXISTS: 'route.operatorExists',
  GT: 'route.operatorGt',
  LT: 'route.operatorLt'
}

function operatorText(op: string): string {
  if (op === 'EQ') return '='
  const key = OPERATOR_KEYS[op]
  return key ? t(key) : op
}

/** PATH 型（key 空，seed 同款形状）只展示类型标签 + 路径原文；其余 key + 算子 + value */
function condText(c: DecisionTreeCondition): string {
  const typeKey = COND_TYPE_KEYS[c.condition_type]
  const typeLabel = typeKey ? t(typeKey) : String(c.condition_type ?? '').toUpperCase()
  const key = String(c.condition_key ?? '').trim()
  const value = String(c.condition_value ?? '')
  return key ? `${typeLabel} ${key} ${operatorText(String(c.operator ?? ''))} ${value}` : `${typeLabel} ${value}`
}

/** 条件文案：有 condition → 人类可读化；无 → 「默认分支」chip（对齐原型） */
function condInner(b: DecisionTreeBranch): string {
  return b.condition ? condText(b.condition) : t('v2.tree.defaultBranch')
}

// ── 递归分支组件（h() 渲染函数）───────────────────────────────────────────
// script setup 模板无法在单 SFC 内做模板级递归，故子层用渲染函数组件实现：
// 样式从带作用域的 .tree-branches 容器以 :deep() 收口（不泄漏到页面外）。

/** 未命中兜底节点（pct ≤ 0 时调用方不挂载 —— Σ=1 的层不渲染兜底） */
const MissNode = defineComponent({
  name: 'TreeMissNode',
  props: {
    pct: { type: Number, required: true }
  },
  setup(props) {
    return () =>
      h('div', { class: 'tb-miss', 'data-testid': 'tree-miss' }, [
        h(FcIcon, { name: 'ri-corner-down-right-line', size: 13 }),
        h('span', { class: 'tb-miss-label' }, t('v2.tree.missNode')),
        h('b', { class: 'tb-miss-pct' }, `${props.pct}%`)
      ])
  }
})

/** 分支卡：WEIGHT 权重 chip / 条件文案 + 占比条 + 目标行 + 指标位 + 嵌套子层 */
const BranchNode = defineComponent({
  name: 'TreeBranchNode',
  props: {
    node: { type: Object as PropType<DecisionTreeBranch>, required: true }
  },
  setup(props) {
    return () => renderBranch(props.node)
  }
})

function renderBranch(b: DecisionTreeBranch): VNode {
  const id = b.target_route_id
  const kids = sortBranches(b.children ?? [])
  const kidsMissPct = missPctOf(b.children ?? [])
  const unresolvable = b.target_resolvable === false
  return h(
    'div',
    {
      class: ['tb-card', { 'is-unresolvable': unresolvable }],
      'data-testid': `tree-branch-${id}`,
      'data-resolvable': unresolvable ? 'false' : 'true'
    },
    [
      // 头行：权重 chip（WEIGHT 不渲染条件文案）或条件/默认分支文案 + 占比可视化
      h('div', { class: 'tb-top' }, [
        b.weight != null
          ? h('span', { class: 'tb-weight', 'data-testid': `tree-weight-${id}` }, [
              h('span', { class: 'tb-weight-label' }, t('v2.tree.weightLabel')),
              h('b', { class: 'tb-weight-num' }, String(toNum(b.weight)))
            ])
          : h(
              'span',
              { class: ['tb-cond', { 'is-default': !b.condition }], 'data-testid': `tree-cond-${id}` },
              condInner(b)
            ),
        h('span', { class: 'tb-ratio', 'data-testid': `tree-ratio-${id}` }, [
          h('i', { class: 'tb-ratio-track', 'aria-hidden': 'true' }, [
            h('i', { class: ['tb-ratio-fill', { 'is-hot': hotRatio(b) }], style: { width: ratioPct(b) } })
          ]),
          h('b', { class: 'tb-ratio-num' }, ratioPct(b))
        ])
      ]),
      // 目标行：名称 + 路径 + 上游端点（嵌套分发用分发图标）
      h('div', { class: 'tb-target' }, [
        h('span', { class: 'tb-name' }, [
          h(FcIcon, { name: b.is_nested ? 'ri-git-merge-line' : 'ri-git-branch-line', size: 13 }),
          h('span', b.target_route_name || id)
        ]),
        b.target_path ? h('span', { class: 'tb-mono' }, b.target_path) : null,
        b.target_upstream_url ? h('span', { class: 'tb-mono tb-up' }, b.target_upstream_url) : null
      ]),
      // 指标位 / 不可解析警示（未发布目标不渲染 qps/p95）
      unresolvable
        ? h('div', { class: 'tb-warn' }, [
            h(FcIcon, { name: 'ri-error-warning-line', size: 13 }),
            h('span', t('v2.tree.unresolvable'))
          ])
        : h('div', { class: 'tb-metrics' }, [
            h('span', { class: 'tb-metric', 'data-testid': `tree-qps-${id}` }, ['QPS ', h('b', formatQps(b.qps))]),
            h('span', { class: 'tb-metric', 'data-testid': `tree-p95-${id}` }, ['P95 ', h('b', formatMs(b.p95_latency_ms))])
          ]),
      // 嵌套子层（priority 升序）+ 本层未命中兜底
      kids.length
        ? h('div', { class: 'tb-children' }, [
            ...kids.map((k) => h(BranchNode, { key: k.target_route_id, node: k })),
            kidsMissPct > 0 ? h(MissNode, { pct: kidsMissPct }) : null
          ])
        : null
    ]
  )
}
</script>

<style scoped lang="scss">
/* 页面作用域 token：violet 系在全局语义 token 无对应档，就近定义
   （字面值只出现在 token 定义层，同 List/Overview 先例；规则本体一律走 token） */
.v2-tree {
  --tr-violet: #7c5cff;
  min-width: 0;
}

/* 焦点环兜底：本页所有可聚焦元素统一 token 焦点环（无自绘动画，PRM 无需回退） */
.v2-tree :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* —— 页头 —— */
.tree-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.tree-head-main {
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--app-text);
  }
}

.tree-head-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* —— 提示条（快照兜底 / 加载失败，同 S3/S6 配方）—— */
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

.tree-error {
  padding: 14px 16px;
  font-size: 13px;
}

.tree-retry-btn {
  margin-left: auto;
}

/* —— 树体卡片 + 横滚容器：375 视口容器内横滚，页面 body 不被撑开（同 .topo-scroll 惯例）—— */
.tree-scroll {
  min-width: 0;
  overflow-x: auto;
}

.tree-body {
  min-width: 480px;
  padding: 16px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-sm);
}

/* —— 根节点：violet 染色（分发语义，同拓扑节点）—— */
.tree-root {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--tr-violet) 5%, var(--app-bg-card));
  border: 1px solid color-mix(in srgb, var(--tr-violet) 45%, transparent);
  border-radius: var(--app-radius-md);
}

.tr-icon {
  display: inline-flex;
  color: color-mix(in srgb, var(--tr-violet) 70%, var(--app-text));
}

.tr-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-text);
}

.tr-type {
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--tr-violet) 60%, var(--app-text));
  background: color-mix(in srgb, var(--tr-violet) 12%, transparent);
  border-radius: var(--app-radius-full);
}

.tr-path {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--app-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* —— totals 条 —— */
.tree-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 10px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-md);

  .tt-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  b {
    color: var(--app-text);
    font-variant-numeric: tabular-nums;
  }
}

/* —— 分支层 —— */
.tree-branches {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.tree-empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/*
 * BranchNode / MissNode 由 h() 渲染函数递归生成，元素不带本页 scoped 属性，
 * 从带作用域的 .tree-branches 容器用 :deep() 收口（选择器落在容器子树内，不外泄）。
 */
.tree-branches {
  :deep(.tb-card) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--app-bg-card);
    border: 1px solid var(--app-border-extra-light);
    border-radius: var(--app-radius-md);
    box-shadow: var(--app-shadow-sm);

    /* 未发布目标：置灰 + 虚线警示边（data-resolvable="false" 的样式钩子） */
    &.is-unresolvable {
      opacity: 0.72;
      background: color-mix(in srgb, var(--app-color-warning) 4%, var(--app-bg-card));
      border-style: dashed;
      border-color: color-mix(in srgb, var(--app-color-warning) 45%, transparent);
    }
  }

  :deep(.tb-top) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  /* WEIGHT 权重 chip：violet 系 */
  :deep(.tb-weight) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    font-size: 11.5px;
    color: color-mix(in srgb, var(--tr-violet) 60%, var(--app-text));
    background: color-mix(in srgb, var(--tr-violet) 12%, transparent);
    border-radius: var(--app-radius-full);
  }

  :deep(.tb-weight-num) {
    font-variant-numeric: tabular-nums;
  }

  /* 条件文案 chip：key/value 原文走等宽字体 */
  :deep(.tb-cond) {
    padding: 2px 9px;
    font-size: 11.5px;
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
    border-radius: var(--app-radius-full);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

    &.is-default {
      color: color-mix(in srgb, var(--app-color-warning) 70%, var(--app-text));
      background: color-mix(in srgb, var(--app-color-warning) 12%, transparent);
      font-family: inherit;
    }
  }

  /* 占比可视化：条宽 style 绑定 Math.round(ratio*100)+'%'，右侧同源百分比文本 */
  :deep(.tb-ratio) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 132px;
    margin-left: auto;
  }

  :deep(.tb-ratio-track) {
    display: block;
    flex: 1;
    height: 6px;
    overflow: hidden;
    background: var(--app-bg-muted);
    border-radius: var(--app-radius-full);
  }

  :deep(.tb-ratio-fill) {
    display: block;
    height: 100%;
    background: var(--app-primary);
    border-radius: var(--app-radius-full);

    /* 热分支（≥50%）：暖色，对齐原型「热分支」 */
    &.is-hot {
      background: color-mix(in srgb, var(--app-color-warning) 65%, var(--app-color-danger));
    }
  }

  :deep(.tb-ratio-num) {
    min-width: 3em;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-text);
    font-variant-numeric: tabular-nums;
  }

  /* 目标行 */
  :deep(.tb-target) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    font-size: 13px;
  }

  :deep(.tb-name) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--app-text);
  }

  :deep(.tb-mono) {
    font-size: 11.5px;
    color: var(--app-text-tertiary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  :deep(.tb-up) {
    padding: 1px 8px;
    color: var(--app-text-secondary);
    background: var(--app-bg-muted);
    border-radius: var(--app-radius-full);
  }

  /* 指标位 / 不可解析警示 */
  :deep(.tb-metrics) {
    display: flex;
    gap: 16px;
    padding-top: 8px;
    font-size: 11.5px;
    color: var(--app-text-secondary);
    border-top: 1px dashed var(--app-border-extra-light);
  }

  :deep(.tb-metric b) {
    font-weight: 600;
    color: var(--app-text);
    font-variant-numeric: tabular-nums;
  }

  :deep(.tb-warn) {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 8px;
    font-size: 11.5px;
    color: var(--app-color-warning-text);
    border-top: 1px dashed var(--app-border-extra-light);
  }

  /* 嵌套子层：缩进 + 左侧引导线（子分支 DOM 嵌在父分支容器内） */
  :deep(.tb-children) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
    margin-left: 10px;
    padding-left: 14px;
    border-left: 2px solid color-mix(in srgb, var(--app-border-strong) 45%, transparent);
  }

  /* 未命中兜底：danger 染色 + 虚线（作为所在容器的一行，不额外缩进） */
  :deep(.tb-miss) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    font-size: 12px;
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 8%, transparent);
    border: 1px dashed color-mix(in srgb, var(--app-color-danger) 35%, transparent);
    border-radius: var(--app-radius-md);
  }

  :deep(.tb-miss-label) {
    font-weight: 600;
  }

  :deep(.tb-miss-pct) {
    margin-left: auto;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}
</style>
