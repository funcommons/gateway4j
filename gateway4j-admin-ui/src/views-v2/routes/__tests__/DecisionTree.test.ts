/**
 * S7-T：v2 分发决策树视图测试（契约 §1 V2DecisionTree /v2/routes/tree/:id permission route:read
 * + §4 S7 + S7a 后端契约；视觉参照 prototype-v2/05-decision-tree.html 与 shots/05-decision-tree.png）。
 * 先红是预期：页面由 S7-C 实现（当前为 V2PagePlaceholder 占位）。
 *
 * ── API 封装（C-agent 在 src/api/v2.ts 新增，本文件 mock 之）───────────────────
 * fetchDecisionTree(id: string | number) → GET /v1/v2/routes/{id}/decision-tree → envelope 解包。
 * 注意：vi.mock('@/api/v2') 只导出 fetchDecisionTree —— 页面不得从 @/api/v2 import 其他成员
 * （payload 自包含：totals + 各分支指标 + source 都在响应里，无需 fetchTrafficSummary 兜底）。
 *
 * ── 后端 payload 契约（S7a 已固化，前端按此消费）────────────────────────────
 * data = { route_id(字符串雪花，Long→String), route_name, route_type('DISPATCH'|'BACKEND'), path,
 *   upstream_url, status, environment, max_depth:5, source:'prometheus'|'snapshot',
 *   totals:{hits_24h:number, qps:number},
 *   children:[{ target_route_id, target_route_name, target_route_type, target_path,
 *     target_upstream_url, target_resolvable:boolean, is_nested:boolean, priority:number,
 *     condition:{condition_type,operator,condition_key,condition_value}|null, weight:number|null,
 *     hits_24h:number|null, qps:number|null, p95_latency_ms:number|null, hit_ratio:number,
 *     children:[...] }] }
 *
 * ── T 定死的派生口径（C 照做）───────────────────────────────────────────────
 * - 占比文本 = Math.round(hit_ratio*100)+'%'（Math.round 吸浮点尾：1−0.7=0.30000000000000004 → 30%）。
 * - 未命中兜底 = Math.round((1−Σ本层 hit_ratio)*100)+'%'（服务端不造数，前端推导，S7a ④）；
 *   Σ≥1 时兜底节点【隐藏或显示 0%】两种实现都合规（断言二选一，勿回退成只认一种）。
 * - hits 缩写复用 S3/S6 formatHits 口径（<1k 原样 / k 取整 / M、B 一位小数去尾 0：1,720,000→1.7M）；
 *   qps Math.round（473.6→474）；p95 `${n} ms`，null → '—'。
 * - WEIGHT 分支：渲染权重 chip（weightLabel + 数字），不渲染条件文案（tree-cond 缺席）——
 *   权重数字在 weight 字段（S7a：仅 WEIGHT 下发，非法→null），不走 condition 四元组。
 * - condition:null 的分支 → tree-cond-<id> 渲染 defaultBranch（「默认分支」chip，对齐原型）。
 * - 条件人类可读化 = i18n 类型标签（condHeader/condPath/condQuery）+ condition_key/value 原文拼接，
 *   EQ 算子显示 '='；CONTAINS/REGEX 等其余算子的符号/文案留给 C（断言只查类型标签与 key/value 原文）。
 *   佐证：gw_route_condition 注释——condition_type ∈ HEADER/PATH/QUERY/BODY/GROOVY（无 REGEX 型），
 *   operator ∈ EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT；seed 全部为 PATH+CONTAINS。故「REGEX 断言一种」
 *   = HEADER 型 + REGEX 算子的边。
 * - target_resolvable=false（include_unpublished 默认 true 时 DRAFT/OFFLINE 目标）：分支卡挂
 *   data-resolvable="false"（置灰样式钩子）+ unresolvable 警示文案 + 不渲染指标位。
 * - not-found 判定：err instanceof BusinessError && code∈{10601（后端 ErrorCode.ROUTE_NOT_FOUND，主）,10400（兼容）}
 *   → tree-not-found 空态；其余异常 → tree-error + tree-retry，点击重发 fetchDecisionTree（重试成功恢复树）。
 * - snapshot 提示：凡 source==='snapshot' 即提示（S6 同款宽松口径，不等 quantile_fallback，勿回退）。
 * - 分支按 priority 升序渲染（S7a：priority 升序=求值序）。
 *
 * ── i18n key 全表（v2.tree.*，zh/en 同步加，铁律 6；14 个）──────────────────
 * typeDispatch / condHeader / condPath / condQuery / weightLabel / defaultBranch / missNode /
 * totalsHits / totalsQps / unresolvable / snapshotHint / loadFailed / retry / notFound
 * （condition_type 为数据驱动枚举，BODY/GROOVY 等其余类型标签 C 可自行增补，不在断言最小集）
 *
 * ── testid 全表 ──────────────────────────────────────────────────────────
 * tree-scroll（375 视口横滚容器，overflow-x:auto，包住整棵树）；tree-root（根节点：route_name +
 * typeDispatch 徽章 + path）；tree-totals（totals 条：totalsHits + hits 缩写 + totalsQps + qps 取整）；
 * tree-branch-<target_route_id>（分支卡，priority 升序；不可解析时带 data-resolvable="false"）；
 * tree-weight-<id>（WEIGHT 权重 chip）；tree-cond-<id>（条件/默认分支文案，WEIGHT 分支不渲染）；
 * tree-ratio-<id>（占比条：百分比文本 + style 宽度可视化）；tree-qps-<id> / tree-p95-<id>
 * （指标位，null → '—'，不可解析分支不渲染）；tree-miss（兜底节点：missNode + (1−Σ)%）；
 * tree-source-hint / tree-error / tree-retry / tree-not-found / tree-back（→ /v2/routes）
 *
 * ── 布局与权限声明 ────────────────────────────────────────────────────────
 * - 条件分支竖向列表 + 嵌套子层缩进（对齐原型 05 精神：条件 + 占比可视化 + 兜底；不追求像素级复刻，
 *   原型的 SVG 画布/环图/条件库拖拽归 P2，S7 只读呈现）。
 * - 只读页：无任何 act-* 写操作 testid（usePermission 仅按 S3/S6 惯例 mock 防实现引用，不断言按钮显隐）。
 * - 返回入口 tree-back 由页面渲染；面包屑由 LayoutV2 提供，页面不管。
 * - SDK-only（铁律 2）：源码禁 <el- 直用（源码 grep 断言）；模板禁裸中文（文案一律 t()，源码 grep
 *   断言 template 块无 CJK——中文注释只允许出现在 script 块）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { BusinessError } from '@/api/http'

const mocks = vi.hoisted(() => ({
  fetchDecisionTree: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/v2', () => ({
  fetchDecisionTree: mocks.fetchDecisionTree
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import DecisionTree from '@/views-v2/routes/DecisionTree.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 Overview.test.ts / List.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../DecisionTree.vue'), 'utf-8')
}

// ── fixtures（S7a payload 原形状，snake_case）─────────────────────────────────

function makeCondition(over: Record<string, unknown> = {}) {
  return { condition_type: 'HEADER', operator: 'EQ', condition_key: 'X-Channel', condition_value: 'vip', ...over }
}

function makeBranch(targetRouteId: string, over: Record<string, unknown> = {}) {
  return {
    target_route_id: targetRouteId,
    target_route_name: `${targetRouteId}_svc`,
    target_route_type: 'BACKEND',
    target_path: `/api/${targetRouteId}/**`,
    target_upstream_url: 'http://10.0.0.11:9001',
    target_resolvable: true,
    is_nested: false,
    priority: 1,
    condition: null,
    weight: null,
    hits_24h: 100000,
    qps: 30,
    p95_latency_ms: 40,
    hit_ratio: 0.5,
    children: [],
    ...over
  }
}

/** 默认树：WEIGHT 灰度分支 20% + HEADER 条件分支 80%（Σ=1 → 兜底 0）；totals 1,720,000 / 473.6 */
function defaultTree(over: Record<string, unknown> = {}) {
  return {
    route_id: 'r1',
    route_name: 'api_gateway',
    route_type: 'DISPATCH',
    path: '/api/**',
    upstream_url: '',
    status: 'PUBLISHED',
    environment: 'default',
    max_depth: 5,
    source: 'prometheus',
    totals: { hits_24h: 1720000, qps: 473.6 },
    children: [
      makeBranch('c1', {
        target_route_name: 'canary_user', priority: 1, weight: 20,
        hit_ratio: 0.2, hits_24h: 344000, qps: 38.9, p95_latency_ms: 41
      }),
      makeBranch('c2', {
        target_route_name: 'user_service', priority: 2, condition: makeCondition(),
        hit_ratio: 0.8, hits_24h: 1376000, qps: 95.4, p95_latency_ms: 47
      })
    ],
    ...over
  }
}

/** U3：四类条件边（HEADER+EQ / PATH+CONTAINS（key 空）/ QUERY+EQ / HEADER+REGEX） */
function conditionEdgesTree() {
  return defaultTree({
    children: [
      makeBranch('h1', { priority: 1, condition: makeCondition() }),
      makeBranch('p1', { priority: 2, condition: makeCondition({ condition_type: 'PATH', operator: 'CONTAINS', condition_key: '', condition_value: '/api/pay/**' }) }),
      makeBranch('q1', { priority: 3, condition: makeCondition({ condition_type: 'QUERY', operator: 'EQ', condition_key: 'beta', condition_value: 'on' }) }),
      makeBranch('x1', { priority: 4, condition: makeCondition({ operator: 'REGEX', condition_key: 'X-Tag', condition_value: '^vip-' }) })
    ]
  })
}

/** U4：c2 为嵌套 DISPATCH（is_nested=true），子层 g1（QUERY 条件 75%）+ g2（默认 25%） */
function nestedTree() {
  return defaultTree({
    children: [
      makeBranch('c2', {
        target_route_name: 'canary_checkout', target_route_type: 'DISPATCH',
        priority: 1, condition: makeCondition(), is_nested: true, hit_ratio: 0.8,
        children: [
          makeBranch('g1', { priority: 1, condition: makeCondition({ condition_type: 'QUERY', operator: 'EQ', condition_key: 'beta', condition_value: 'on' }), hit_ratio: 0.75, qps: 71 }),
          makeBranch('g2', { priority: 2, condition: null, hit_ratio: 0.25, qps: 24 })
        ]
      }),
      makeBranch('c1', { priority: 2, weight: 20, hit_ratio: 0.2 })
    ]
  })
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/tree/:id', component: DecisionTree as any },
      { path: '/v2/routes', component: stub }
    ]
  })
  await router.push('/v2/routes/tree/r1')
  await router.isReady()
  const wrapper = mount(DecisionTree, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchDecisionTree.mockReset().mockResolvedValue(defaultTree())
  mocks.canEdit.mockReturnValue(true)
})

const KEYS = ['typeDispatch', 'condHeader', 'condPath', 'condQuery', 'weightLabel', 'defaultBranch',
  'missNode', 'totalsHits', 'totalsQps', 'unresolvable', 'snapshotHint', 'loadFailed', 'retry', 'notFound']
  .map((k) => `v2.tree.${k}`)

describe('v2 tree — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('U1 — 挂载即取数与根信息', () => {
  it('fetchDecisionTree(route.params.id) 调一次；tree-root 渲染 route_name / DISPATCH 徽章 / path', async () => {
    const { wrapper } = await factory()
    expect(mocks.fetchDecisionTree).toHaveBeenCalledTimes(1)
    expect(mocks.fetchDecisionTree).toHaveBeenCalledWith('r1')
    const root = one(wrapper, 'tree-root')
    expect(root.exists()).toBe(true)
    expect(root.text()).toContain('api_gateway')
    expect(root.text()).toContain(t('v2.tree.typeDispatch'))
    expect(root.text()).toContain('/api/**')
  })
})

describe('U2 — WEIGHT 分支（权重 + 占比可视化）', () => {
  it('权重 chip（weightLabel + 20）+ 占比条 20% 文本与 style 宽度；不渲染条件文案', async () => {
    const { wrapper } = await factory()
    const weight = one(wrapper, 'tree-weight-c1')
    expect(weight.exists()).toBe(true)
    expect(weight.text()).toContain(t('v2.tree.weightLabel'))
    expect(weight.text()).toContain('20')
    const ratio = one(wrapper, 'tree-ratio-c1')
    expect(ratio.exists()).toBe(true)
    expect(ratio.text()).toMatch(/20(\.0)?\s*%/)
    const bar = [ratio, ...ratio.findAll('*')].find((el) => (el.attributes('style') ?? '').includes('20%'))
    expect(bar, '占比条自身或内部元素需以 style 宽度呈现 20% 可视化（bar/ring 均可）').toBeTruthy()
    expect(one(wrapper, 'tree-cond-c1').exists()).toBe(false)
  })
})

describe('U3 — 非 WEIGHT 条件边人类可读化（i18n 标签 + key/value 原文）', () => {
  it('HEADER/PATH/QUERY/REGEX 四种边各渲染 tree-cond-<id>：EQ 显示 =，类型标签走 t()', async () => {
    mocks.fetchDecisionTree.mockResolvedValue(conditionEdgesTree())
    const { wrapper } = await factory()
    const cond = (id: string) => one(wrapper, `tree-cond-${id}`)
    // HEADER + EQ + X-Channel + vip → 「Header X-Channel = vip」类文案
    expect(cond('h1').exists()).toBe(true)
    expect(cond('h1').text()).toContain(t('v2.tree.condHeader'))
    expect(cond('h1').text()).toContain('X-Channel')
    expect(cond('h1').text()).toContain('vip')
    expect(cond('h1').text()).toContain('=')
    // PATH + CONTAINS（key 空，seed 同款形状）→ 类型标签 + 路径原文
    expect(cond('p1').text()).toContain(t('v2.tree.condPath'))
    expect(cond('p1').text()).toContain('/api/pay/**')
    // QUERY + EQ → 类型标签 + key/value + =
    expect(cond('q1').text()).toContain(t('v2.tree.condQuery'))
    expect(cond('q1').text()).toContain('beta')
    expect(cond('q1').text()).toContain('on')
    expect(cond('q1').text()).toContain('=')
    // REGEX 是 operator（非 condition_type）：HEADER + REGEX 边同样类型标签 + 原文
    expect(cond('x1').text()).toContain(t('v2.tree.condHeader'))
    expect(cond('x1').text()).toContain('X-Tag')
    expect(cond('x1').text()).toContain('^vip-')
  })
})

describe('U4 — 嵌套 DISPATCH（is_nested=true 递归子层）', () => {
  it('子分支渲染在父分支容器内部：子层条件（QUERY beta on）与占比 75% 可见', async () => {
    mocks.fetchDecisionTree.mockResolvedValue(nestedTree())
    const { wrapper } = await factory()
    const parent = one(wrapper, 'tree-branch-c2')
    expect(parent.exists()).toBe(true)
    const child = parent.find('[data-testid="tree-branch-g1"]')
    expect(child.exists(), '嵌套子分支应渲染在父分支容器内部（递归缩进/嵌套容器）').toBe(true)
    expect(child.text()).toContain(t('v2.tree.condQuery'))
    expect(child.text()).toContain('beta')
    expect(child.text()).toMatch(/75(\.0)?\s*%/)
    expect(one(wrapper, 'tree-branch-g2').exists()).toBe(true)
  })
})

describe('U5 — 未命中兜底（1−Σ 本层 hit_ratio，前端推导）', () => {
  it('Σ=1（0.2+0.8）→ 兜底隐藏或显示 0%（两种实现都合规）', async () => {
    const { wrapper } = await factory()
    const miss = one(wrapper, 'tree-miss')
    expect(!miss.exists() || /0(\.0)?\s*%/.test(miss.text()), 'Σ=1 时兜底应隐藏或显示 0%').toBe(true)
  })

  it('Σ=0.7（仅默认分支）→ tree-miss 显示 30% + missNode 文案；条件空分支显示 defaultBranch', async () => {
    mocks.fetchDecisionTree.mockResolvedValue(defaultTree({
      children: [makeBranch('d1', { priority: 1, condition: null, hit_ratio: 0.7, qps: 332, p95_latency_ms: 45 })]
    }))
    const { wrapper } = await factory()
    const miss = one(wrapper, 'tree-miss')
    expect(miss.exists()).toBe(true)
    expect(miss.text()).toContain(t('v2.tree.missNode'))
    expect(miss.text()).toMatch(/30(\.0)?\s*%/)
    expect(one(wrapper, 'tree-cond-d1').text()).toContain(t('v2.tree.defaultBranch'))
  })
})

describe('U6 — totals 渲染', () => {
  it('totals 条：近 24h 命中 1.7M（formatHits 口径）+ QPS 474（四舍五入），标签走 i18n', async () => {
    const { wrapper } = await factory()
    const totals = one(wrapper, 'tree-totals')
    expect(totals.exists()).toBe(true)
    expect(totals.text()).toContain(t('v2.tree.totalsHits'))
    expect(totals.text()).toMatch(/1\.7\s*M/)
    expect(totals.text()).toContain(t('v2.tree.totalsQps'))
    expect(totals.text()).toMatch(/474/)
  })
})

describe('U7 — target_resolvable=false（未发布目标，include_unpublished 默认 true）', () => {
  it('分支置灰钩子 data-resolvable="false" + unresolvable 警示 + 不渲染指标位', async () => {
    mocks.fetchDecisionTree.mockResolvedValue(defaultTree({
      children: [
        makeBranch('c1', { priority: 1, weight: 20, hit_ratio: 0.2 }),
        makeBranch('u9', {
          priority: 2, target_resolvable: false, hit_ratio: 0.1,
          condition: makeCondition({ condition_type: 'PATH', operator: 'CONTAINS', condition_key: '', condition_value: '/api/beta/**' }),
          hits_24h: null, qps: null, p95_latency_ms: null
        })
      ]
    }))
    const { wrapper } = await factory()
    const branch = one(wrapper, 'tree-branch-u9')
    expect(branch.exists()).toBe(true)
    expect(branch.attributes('data-resolvable')).toBe('false')
    expect(branch.text()).toContain(t('v2.tree.unresolvable'))
    expect(branch.find('[data-testid="tree-qps-u9"]').exists()).toBe(false)
    expect(branch.find('[data-testid="tree-p95-u9"]').exists()).toBe(false)
  })
})

describe('U8 — 分支指标位（null → —）', () => {
  it('有指标：qps 95.4 → 95（取整）、p95 → 47 ms', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'tree-qps-c2').text()).toMatch(/95/)
    expect(one(wrapper, 'tree-p95-c2').text()).toMatch(/47\s*ms/)
  })

  it('summary 无行（指标全 null）→ qps/p95 指标位显示 —，分支仍渲染', async () => {
    mocks.fetchDecisionTree.mockResolvedValue(defaultTree({
      children: [makeBranch('n1', {
        condition: makeCondition({ condition_type: 'PATH', operator: 'CONTAINS', condition_key: '', condition_value: '/api/legacy/**' }),
        hit_ratio: 0.3, hits_24h: null, qps: null, p95_latency_ms: null
      })]
    }))
    const { wrapper } = await factory()
    expect(one(wrapper, 'tree-branch-n1').exists()).toBe(true)
    expect(one(wrapper, 'tree-qps-n1').text()).toContain('—')
    expect(one(wrapper, 'tree-p95-n1').text()).toContain('—')
  })
})

describe('U9 — snapshot 提示条（凡 snapshot 即提示，同 S6 宽松口径）', () => {
  it("source='snapshot' → tree-source-hint 出现", async () => {
    mocks.fetchDecisionTree.mockResolvedValue(defaultTree({ source: 'snapshot' }))
    const { wrapper } = await factory()
    const hint = one(wrapper, 'tree-source-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.tree.snapshotHint'))
  })

  it("source='prometheus' → 不出现提示条", async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'tree-source-hint').exists()).toBe(false)
  })
})

describe('U10 — 加载失败与重试', () => {
  it('fetch reject → tree-error（loadFailed + retry 按钮）+ 树不渲染；点重试重发请求成功后恢复', async () => {
    mocks.fetchDecisionTree.mockRejectedValueOnce(new Error('prometheus down'))
    const { wrapper } = await factory()
    const err = one(wrapper, 'tree-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.tree.loadFailed'))
    expect(one(wrapper, 'tree-retry').text()).toContain(t('v2.tree.retry'))
    expect(one(wrapper, 'tree-root').exists()).toBe(false)
    await one(wrapper, 'tree-retry').trigger('click')
    await flushPromises()
    expect(mocks.fetchDecisionTree).toHaveBeenCalledTimes(2)
    expect(one(wrapper, 'tree-root').exists()).toBe(true)
    expect(one(wrapper, 'tree-error').exists()).toBe(false)
  })
})

describe('U11 — 路由不存在（BusinessError 10601 → http 层 reject）', () => {
  it('code=10601 → tree-not-found 空态，不落入通用错误态', async () => {
    mocks.fetchDecisionTree.mockRejectedValue(new BusinessError(10601, '目标资源不存在或已被删除'))
    const { wrapper } = await factory()
    const nf = one(wrapper, 'tree-not-found')
    expect(nf.exists()).toBe(true)
    expect(nf.text()).toContain(t('v2.tree.notFound'))
    expect(one(wrapper, 'tree-error').exists()).toBe(false)
    expect(one(wrapper, 'tree-root').exists()).toBe(false)
  })
})

describe('U12 — 只读权限（route:read）', () => {
  it('页面无任何 act-* 写操作 testid（canEdit=true 也不渲染写操作）', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="act-"]').length).toBe(0)
  })
})

describe('U13 — 模板无裸文案（源码 grep）', () => {
  it('template 块无 CJK（文案一律 t()；中文注释仅允许出现在 script 块）', () => {
    const template = readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    expect(template).not.toMatch(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff5e]/)
  })
})

describe('U14 — 375 视口横滚容器', () => {
  it('tree-scroll 容器包住整棵树 + 源码 overflow-x:auto（jsdom 无法实测 scrollWidth，断言容器与样式）', async () => {
    const { wrapper } = await factory()
    const scroller = one(wrapper, 'tree-scroll')
    expect(scroller.exists()).toBe(true)
    expect(scroller.find('[data-testid="tree-root"]').exists()).toBe(true)
    expect(readSource()).toMatch(/overflow-x:\s*auto/)
  })
})

describe('U15 — testid 约定与 SDK-only', () => {
  it('分支卡按 priority 升序渲染（tree-branch-<target_route_id>）', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="tree-branch-"]').map((b) => b.attributes('data-testid')))
      .toEqual(['tree-branch-c1', 'tree-branch-c2'])
  })

  it('tree-back 返回链接存在，点击回 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    const back = one(wrapper, 'tree-back')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })

  it('SDK-only：源码无 <el- 直用（铁律 2）', () => {
    expect(readSource()).not.toMatch(/<el-/)
  })
})
