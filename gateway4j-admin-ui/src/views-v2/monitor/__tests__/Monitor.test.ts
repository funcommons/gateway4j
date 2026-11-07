/**
 * P4b-1T：v2 监控大盘静态版测试（契约 docs/ui-v2/实施契约.md §4 P4b 行 P4b-1；视觉参照
 * prototype-v2/shots/08-monitoring.png）。先红是预期：页面由 P4b-1C 实现（当前 Monitor.vue 为
 * 10 行 V2PagePlaceholder 占位 stub，原地替换，路由/侧栏已挂 V2Monitor 不动表）。
 *
 * ── 数据源与 mock（两源两区，真实封装位置已侦察，不需要新封装）──────────────────
 * - fetchTrafficSummary()（@/api/v2）：KPI 四卡（hits/qps/p95/错误率）+ 慢路由 Top5 + 状态码 donut
 * - listRouteStatus()（@/api/misc 已有封装）：Σactive_connections + 上游健康卡（单上游降维）
 *   ⚠ misc.ts RouteStatusItem 未声明 active_connections，但后端实际下发
 *   （MonitorController.java buildStatus L168：status.put("active_connections", metrics.active())，
 *   P1-1 在途请求数 gauge）；C 步需为接口补可选字段 `active_connections?: number | string`
 *   （Long→String 契约，纯 type 层变更）。本测试 mock 按后端实际形状下发。
 * - mock 工厂只导出上述两成员：页面若越界 import 其它成员 = undefined → TypeError 自曝；
 *   fetchRouteTimeseries / fetchDecisionTree（P4b-2 才引入）/ getRouteTimeseries 等由 import 面
 *   源码断言双重拦截（见「只读与 SDK-only 源码契约」组）。
 * - 契约原文「三源独立降级」在本步实为两源两区（fetchTrafficSummary 区 + listRouteStatus 区，
 *   P4b-2 时序端点是第三源但未在本步范围）：降级语义按区隔离、两方向对称 —— T 裁决钉死：
 *   ① fetchTrafficSummary 败 → mon-error + traffic 喂的四张 KPI 卡全 — + Top5/donut 空态；
 *      上游健康卡与 mon-kpi-connections 照常（同源 listRouteStatus，不陪葬 —— 数据流诚实口径，
 *      任务提示「KPI 全 —」按源收窄为「traffic 四卡全 —」）。
 *   ② listRouteStatus 败 → mon-upstream-error（卡内局部错误条，Detail.vue dtl-history-error 先例）
 *      + mon-kpi-connections — + 上游行清空；traffic 四卡/Top5/donut 不被污染。
 *
 * ── 口径裁决（T 定死，C 照做）────────────────────────────────────────────────
 * - KPI 五卡：kpiHits=Σhits_24h（formatHits 口径随 Overview kpi-requests：k 取整、M/B 一位小数去尾 0，
 *   Long→String 以字符串到达的数值 Number() 归一）；kpiQps=Σqps Math.round；kpiP95=非 null
 *   p95_latency_ms 均值 Math.round + ms（全 null → —）；kpiError=Σerrors÷Σhits×100 保留两位小数
 *   toFixed(2)+'%'（Σerrors=Σ(c4xx+c5xx)——RouteTrafficSummaryItem 无扁平 errors 字段，从
 *   status_codes 两桶推导，不造新字段；Σhits=0 → —）；kpiConnections=Σactive_connections
 *   （listRouteStatus 求和，字符串数值归一，缺字段按 0）。
 * - 上游健康（单上游降维）：复用 Overview upstream-card 形态语义 —— 行=mon-up-row-<route_id>
 *   （upstream!=null 才入行：点 data-state ok/warn + 名称 + 可达/不可达文案 + latency ms），
 *   mon-up-bad=不可达计数行（>0 才渲染，文案 '{n} 个上游不可达'），mon-up-pbar=可达占比
 *   Math.round(ok/all*100)+'%'（all=upstream!=null 行数，all=0 → 无 pbar + upstreamEmpty）。
 *   【禁实例矩阵】S2 单上游端点语义：无「N 实例」、无 01/02/03 槽位列（源码+i18n 双断言拦截）。
 * - 慢路由 Top5：traffic-summary 按 p95 降序取 5（p95 null 排后仍可入榜但无 bar 无值）；
 *   pbar 宽度 ∝ 相对榜内最大 p95：Math.round(p95/max*100)+'%'（榜首恒 100%）；
 *   【红橙分级阈值】p95 ≥ 300ms → is-hot（--app-color-danger 红），p95 < 300ms → is-warm
 *   （--app-color-warning 橙）——两档制随契约「红橙分级」，300 边界锚定原型 412ms 红/96ms 橙
 *   （仓库无既有延迟分档先例，S8 亦未定义，此为 T 首钉，C 勿改阈值）；p95 null → 值 '—' 无 pbar。
 * - 状态码 donut：复用 Detail.vue dtl-ring 先例（SVG stroke-dasharray 自绘，is-2xx/is-4xx/is-5xx
 *   = success/warning/danger 三色），非 conic-gradient（可断言 DOM 属性）；桶=Σstatus_codes 三桶
 *   （逐行 toNum 归一、缺 status_codes 按 0），桶行 mon-bucket-c2xx/c4xx/c5xx = formatHits 计数 +
 *   pctText 占比（Math.round(p*10)/10，整数不带小数，Detail 同款）；中心 mon-ring-total =
 *   formatHits(Σ三桶)；Σ三桶=0 → mon-donut-empty（无环无中心）。
 * - snapshot 提示条：凡任一行 source==='snapshot' 即显 mon-source-hint（S6/S3 宽松口径，
 *   不等 quantile_fallback，勿回退）。
 * - 375/骨架不带测：S6 Overview 先例无骨架屏（onMounted 一次拉取 + 失败降级即终态），窄屏 5 卡
 *   折列走 CSS media query（jsdom 无法实测宽度，S6 同弃）。
 *
 * ── 砍除项（P4b 契约钉除，缺口不造数；源码+i18n+渲染三重拦截）──────────────────
 * - 告警表（无 alerting 后端）：禁 alert* testid / 「告警」文案
 * - 环境 tabs（监控接口无 environment 参数）：禁 env* testid / 「环境」文案
 * - KPI delta▲%（无历史对比端点）：禁 delta/peak testid / ▲▼峰值 文案（峰值@时刻归 P4b-2 序列推导）
 * - 实例矩阵（S2 单上游）：禁 instance/inst-* testid / 「实例」文案
 *
 * ── i18n key 全表（v2.monitor.* 新树，zh/en 同步加，铁律 6；20 个）───────────────
 * subtitle('网关级与路由级指标聚合 · Prometheus 采集') / kpiHits / kpiQps / kpiP95 / kpiErrorRate /
 * kpiConnections / upstreamTitle / upOk / upBad / upBadCount('{n} 个上游不可达') / upstreamEmpty /
 * upstreamFailed / slowTitle / slowHint / slowEmpty / donutTitle / donutHint / donutEmpty /
 * snapshotHint / loadFailed
 * （页头主标题复用既有 v2.page.monitor，不新设 key；桶名 2xx/4xx/5xx 为字面量不进 i18n，Detail 先例）
 *
 * ── testid 全表（前缀 mon-*）────────────────────────────────────────────────
 * mon-page（根，任何状态都在）；mon-error（traffic 失败全局错误条 role=alert）；mon-source-hint
 * （snapshot 提示条 role=status）；mon-kpi-hits / mon-kpi-qps / mon-kpi-p95 / mon-kpi-error /
 * mon-kpi-connections（5 KPI 卡，卡内 label+value）；mon-upstream-card；mon-upstream-error（卡内
 * 局部错误条）；mon-up-bad（不可达计数行，>0 才渲染）；mon-up-row-<route_id>（内含 data-state 点）；
 * mon-up-pbar（可达占比 fill，style 宽 %）；mon-upstream-empty；mon-slow-card；mon-slow-row-<route_id>
 * （p95 降序前 5）；mon-slow-val-<route_id>（'412 ms' / '—'）；mon-slow-pbar-<route_id>（fill，
 * style 宽 % + is-hot/is-warm，null 无此元素）；mon-slow-empty；mon-donut；mon-ring（stroke-dasharray
 * SVG）；mon-ring-total（中心总量）；mon-bucket-c2xx / mon-bucket-c4xx / mon-bucket-c5xx；mon-donut-empty
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  fetchTrafficSummary: vi.fn(),
  listRouteStatus: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary
}))
vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import Monitor from '@/views-v2/monitor/Monitor.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 Overview.test.ts / plugins List.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))
const tv = (key: string, n: number | string) => t(key).replace('{n}', String(n))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Monitor.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}
function staticTestids(): string[] {
  return [...readTemplate().matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
}
function collectValues(v: unknown): string[] {
  if (v == null) return []
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap((x) => collectValues(x))
  return [String(v)]
}
function collectKeys(v: unknown, prefix = ''): string[] {
  if (v == null || typeof v !== 'object') return prefix ? [prefix] : []
  return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => collectKeys(x, prefix ? `${prefix}.${k}` : k))
}

// ── fixtures（真实 API 形状，snake_case 原样透传）────────────────────────────

function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 312000, qps: 118, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
    upstream: null, source: 'prometheus', quantile_fallback: false, ...over
  }
}

/** 默认 5 路由。预置聚合值（C 实现后逐一落卡）：
 * Σhits=1,200,000+312,000+121,000+84,000+3,000=1,720,000 → '1.7M'（s4 故意用字符串 '3000' 钉 Long→String 归一）
 * Σqps=221+118+85+49.4+1=474.4 → '474'
 * 非 null p95=[412,112,37] → 均值 187 → '187 ms'（d1/s4 null 不参与）
 * 错误率=Σ(c4xx+c5xx)÷Σhits×100=(12000+3000+1000)÷1,720,000×100 → '0.93%'（s4 无 status_codes 按 0）
 * donut：Σc2xx=1,701,000('99.1%') / Σc4xx=11,800('12k','0.7%') / Σc5xx=4,200('4k','0.2%')，中心 1,717,000 → '1.7M'
 * 慢路由 Top5 降序：s1(412,红) → s2(112,橙) → s3(37,橙) → d1(null,'—') → s4(null,'—')；宽度 100%/27%/9%
 * s3 source='snapshot' → snapshot 提示条显 */
function defaultTraffic() {
  return [
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', hits_24h: 1200000, qps: 221, p95_latency_ms: null, status_codes: { c2xx: 1200000, c4xx: 0, c5xx: 0 } }),
    makeTraffic('s1', { route_name: 'checkout_service', path: '/api/pay/checkout/**', p95_latency_ms: 412 }),
    makeTraffic('s2', { route_name: 'order_service', path: '/api/order/**', hits_24h: 121000, qps: 85, p95_latency_ms: 112, status_codes: { c2xx: 118000, c4xx: 2000, c5xx: 1000 } }),
    makeTraffic('s3', { route_name: 'report_service', path: '/api/report/**', hits_24h: 84000, qps: 49.4, p95_latency_ms: 37, status_codes: { c2xx: 83000, c4xx: 800, c5xx: 200 }, source: 'snapshot' }),
    makeTraffic('s4', { route_name: 'tiny_service', path: '/api/tiny/**', hits_24h: '3000', qps: 1, p95_latency_ms: null, status_codes: undefined })
  ]
}

/** listRouteStatus 默认 4 行（与 traffic 同批路由 id）。预置值：
 * Σactive_connections=143+57+200+0=400 → '400'（s2 故意用字符串 '57' 钉 Long→String 归一）
 * 上游行=[s1,s2,s3]（d1 upstream=null 不入行）；可达 2/3 → pbar 67%；不可达 1 → '{n} 个上游不可达' */
function defaultStatus() {
  return [
    { route_id: 's1', route_name: 'checkout_service', status: 'HEALTHY', active_connections: 143, upstream: { reachable: true, latency_ms: 8 } },
    { route_id: 's2', route_name: 'order_service', status: 'ERROR', active_connections: '57', upstream: { reachable: false, latency_ms: null } },
    { route_id: 's3', route_name: 'report_service', status: 'HEALTHY', active_connections: 200, upstream: { reachable: true, latency_ms: 12 } },
    { route_id: 'd1', route_name: 'api_gateway', status: 'HEALTHY', active_connections: 0, upstream: null }
  ]
}

/** 慢路由切片 fixture：7 行 p95=[900,600,500,400,300,250,null]，期望榜内只有前 5（250 起被 slice 掉）；
 * sE p95=300 恰在红档下边界（≥300 → is-hot，钉边界） */
function slicedTraffic() {
  const spec: Array<[string, number | null]> = [
    ['sA', 900], ['sB', 600], ['sC', 500], ['sD', 400], ['sE', 300], ['sF', 250], ['sG', null]
  ]
  return spec.map(([id, p95], i) => makeTraffic(id, {
    route_name: `svc_${id.toLowerCase()}`, hits_24h: 100000 + i, qps: 10 + i, p95_latency_ms: p95
  }))
}

async function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/v2/monitor', component: Monitor as any }]
  })
  await router.push('/v2/monitor')
  await router.isReady()
  const wrapper = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.listRouteStatus.mockReset().mockResolvedValue(defaultStatus())
})

const KEYS = ['subtitle', 'kpiHits', 'kpiQps', 'kpiP95', 'kpiErrorRate', 'kpiConnections',
  'upstreamTitle', 'upOk', 'upBad', 'upBadCount', 'upstreamEmpty', 'upstreamFailed',
  'slowTitle', 'slowHint', 'slowEmpty', 'donutTitle', 'donutHint', 'donutEmpty',
  'snapshotHint', 'loadFailed'].map((k) => `v2.monitor.${k}`)

describe('v2 monitor — i18n key 全表双语存在（铁律 6，v2.monitor.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 monitor — 页头（标题复用 v2.page.monitor + 新 subtitle）', () => {
  it('mon-page 存在，含主标题与副标题文案', async () => {
    const { wrapper } = await factory()
    const page = one(wrapper, 'mon-page')
    expect(page.exists()).toBe(true)
    expect(page.text()).toContain(t('v2.page.monitor'))
    expect(page.text()).toContain(t('v2.monitor.subtitle'))
  })
})

describe('v2 monitor — KPI 5 卡（Σhits / Σqps / 均值P95 / 错误率 / Σ连接数）', () => {
  it('默认数据：1.7M / 474 / 187 ms / 0.93% / 400，五卡 label 来自 i18n（含字符串数值归一）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain(t('v2.monitor.kpiHits'))
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain(t('v2.monitor.kpiQps'))
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('474')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain(t('v2.monitor.kpiP95'))
    expect(one(wrapper, 'mon-kpi-p95').text()).toMatch(/187\s*ms/)
    expect(one(wrapper, 'mon-kpi-error').text()).toContain(t('v2.monitor.kpiErrorRate'))
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('0.93%')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain(t('v2.monitor.kpiConnections'))
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
  })

  it('p95 全为 null → 平均 P95 卡显示 —（null 不参与均值）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, p95_latency_ms: null })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
  })

  it('traffic-summary 空数组 → hits/qps 为 0，p95/错误率为 —（分母 0），连接数 400 不受牵连', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('0')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('0')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
    expect(one(wrapper, 'mon-slow-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
  })

  it('status_codes 全 0 → 错误率 0.00%（Σerrors=0 分母有值）+ donut 空态（Σ三桶=0）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({
      ...r, status_codes: { c2xx: 0, c4xx: 0, c5xx: 0 }
    })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('0.00%')
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring').exists()).toBe(false)
    expect(one(wrapper, 'mon-ring-total').exists()).toBe(false)
  })
})

describe('v2 monitor — snapshot 提示条（凡 source=snapshot 即显，宽松口径勿回退）', () => {
  it('s3 source=snapshot → mon-source-hint 出现', async () => {
    const { wrapper } = await factory()
    const hint = one(wrapper, 'mon-source-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.monitor.snapshotHint'))
  })

  it('全部 source=prometheus → 不出现提示条', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, source: 'prometheus' })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-source-hint').exists()).toBe(false)
  })
})

describe('v2 monitor — 上游健康（单上游降维，listRouteStatus 源；禁实例矩阵）', () => {
  it('行渲染：s1 可达·8ms / s2 不可达 / s3 可达·12ms / d1 无探测不入行；data-state ok/warn；不可达计数 1', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-upstream-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain(t('v2.monitor.upstreamTitle'))
    const r1 = one(wrapper, 'mon-up-row-s1')
    expect(r1.text()).toContain(t('v2.monitor.upOk'))
    expect(r1.text()).toMatch(/8\s*ms/)
    expect(r1.text()).not.toContain(t('v2.monitor.upBad'))
    expect(r1.find('[data-state="ok"]').exists()).toBe(true)
    const r2 = one(wrapper, 'mon-up-row-s2')
    expect(r2.text()).toContain(t('v2.monitor.upBad'))
    expect(r2.find('[data-state="warn"]').exists()).toBe(true)
    expect(one(wrapper, 'mon-up-row-s3').text()).toMatch(/12\s*ms/)
    expect(one(wrapper, 'mon-up-row-d1').exists()).toBe(false)
    expect(one(wrapper, 'mon-up-bad').text()).toContain(tv('v2.monitor.upBadCount', 1))
  })

  it('可达占比 pbar 宽 67%（2/3）；listRouteStatus reject → mon-upstream-error + 行清空 + 连接数 —，traffic 区不被污染', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-up-pbar').attributes('style')).toContain('67%')

    mocks.listRouteStatus.mockRejectedValue(new Error('route status down'))
    const router2 = createRouter({ history: createMemoryHistory(), routes: [{ path: '/v2/monitor', component: Monitor as any }] })
    await router2.push('/v2/monitor')
    await router2.isReady()
    const w2 = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router2] } })
    await flushPromises()
    const err = one(w2, 'mon-upstream-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.monitor.upstreamFailed'))
    expect(one(w2, 'mon-up-row-s1').exists()).toBe(false)
    expect(one(w2, 'mon-up-pbar').exists()).toBe(false)
    expect(one(w2, 'mon-up-bad').exists()).toBe(false)
    expect(one(w2, 'mon-kpi-connections').text()).toContain('—')
    // traffic 区不污染（Overview 先例：分区独立降级）
    expect(one(w2, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(w2, 'mon-slow-row-s1').exists()).toBe(true)
    expect(one(w2, 'mon-bucket-c2xx').exists()).toBe(true)
    expect(one(w2, 'mon-error').exists()).toBe(false)
  })
})

describe('v2 monitor — 慢路由 Top5（p95 降序取 5 + 宽度 ∝ max + 红≥300/橙<300 两档）', () => {
  it('默认榜：s1(412ms,is-hot) → s2(112ms,is-warm) → s3(37ms,is-warm) → d1/s4（null → 值 — 无 pbar）', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-slow-card')
    expect(card.text()).toContain(t('v2.monitor.slowTitle'))
    expect(card.text()).toContain(t('v2.monitor.slowHint'))
    const rows = wrapper.findAll('[data-testid^="mon-slow-row-"]')
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'mon-slow-row-s1', 'mon-slow-row-s2', 'mon-slow-row-s3', 'mon-slow-row-d1', 'mon-slow-row-s4'
    ])
    expect(one(wrapper, 'mon-slow-val-s1').text()).toMatch(/412\s*ms/)
    expect(one(wrapper, 'mon-slow-pbar-s1').classes()).toContain('is-hot')
    expect(one(wrapper, 'mon-slow-val-s2').text()).toMatch(/112\s*ms/)
    expect(one(wrapper, 'mon-slow-pbar-s2').classes()).toContain('is-warm')
    expect(one(wrapper, 'mon-slow-pbar-s3').classes()).toContain('is-warm')
    expect(one(wrapper, 'mon-slow-val-d1').text()).toContain('—')
    expect(one(wrapper, 'mon-slow-pbar-d1').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-pbar-s4').exists()).toBe(false)
  })

  it('pbar 宽度 ∝ 榜内最大 p95：100% / 27%（112/412）/ 9%（37/412）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-slow-pbar-s1').attributes('style')).toContain('100%')
    expect(one(wrapper, 'mon-slow-pbar-s2').attributes('style')).toContain('27%')
    expect(one(wrapper, 'mon-slow-pbar-s3').attributes('style')).toContain('9%')
  })

  it('7 行数据只取前 5：sA→sE 入榜（sE p95=300 恰在红档下边界 → is-hot），sF(250)/sG(null) 被 slice', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(slicedTraffic())
    const { wrapper } = await factory()
    const rows = wrapper.findAll('[data-testid^="mon-slow-row-"]')
    expect(rows.length).toBe(5)
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'mon-slow-row-sA', 'mon-slow-row-sB', 'mon-slow-row-sC', 'mon-slow-row-sD', 'mon-slow-row-sE'
    ])
    expect(one(wrapper, 'mon-slow-row-sF').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-row-sG').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-pbar-sE').classes()).toContain('is-hot')
    expect(one(wrapper, 'mon-slow-pbar-sE').attributes('style')).toContain('33%')
  })
})

describe('v2 monitor — 状态码 donut（Σstatus_codes 三桶，dtl-ring SVG 自绘先例）', () => {
  it('中心总量 1.7M；三桶计数/占比（99.1% / 0.7% / 0.2%）；环图元素带 stroke-dasharray', async () => {
    const { wrapper } = await factory()
    const donut = one(wrapper, 'mon-donut')
    expect(donut.exists()).toBe(true)
    expect(donut.text()).toContain(t('v2.monitor.donutTitle'))
    expect(donut.text()).toContain(t('v2.monitor.donutHint'))
    const ring = one(wrapper, 'mon-ring')
    expect(ring.exists()).toBe(true)
    expect(ring.find('[stroke-dasharray]').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring-total').text()).toContain('1.7M')
    const b2 = one(wrapper, 'mon-bucket-c2xx')
    const b4 = one(wrapper, 'mon-bucket-c4xx')
    const b5 = one(wrapper, 'mon-bucket-c5xx')
    expect(b2.text()).toContain('1.7M')
    expect(b2.text()).toMatch(/99\.1\s*%/)
    expect(b4.text()).toMatch(/12\s*k/)
    expect(b4.text()).toMatch(/0\.7\s*%/)
    expect(b5.text()).toMatch(/4\s*k/)
    expect(b5.text()).toMatch(/0\.2\s*%/)
  })
})

describe('v2 monitor — 分区独立降级（traffic-summary 源失败）', () => {
  it('fetchTrafficSummary reject → mon-error + traffic 四卡全 — + Top5/donut 空态；上游健康与连接数照常（listRouteStatus 独立可用）', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    const { wrapper } = await factory()
    const err = one(wrapper, 'mon-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.monitor.loadFailed'))
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('—')
    expect(one(wrapper, 'mon-slow-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-slow-row-s1').exists()).toBe(false)
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring').exists()).toBe(false)
    // listRouteStatus 区独立可用
    expect(one(wrapper, 'mon-up-row-s1').exists()).toBe(true)
    expect(one(wrapper, 'mon-up-pbar').attributes('style')).toContain('67%')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
  })

  it('两源同时 reject → 页面不崩，双错误条并存', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    mocks.listRouteStatus.mockRejectedValue(new Error('route status down'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-page').exists()).toBe(true)
    expect(one(wrapper, 'mon-error').exists()).toBe(true)
    expect(one(wrapper, 'mon-upstream-error').exists()).toBe(true)
  })
})

describe('v2 monitor — 只读与 SDK-only 源码契约（S9a/S8 先例）', () => {
  it('只读大盘无写操作：无 act-* 按钮、源码无 http.post/put/patch/delete', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="act-"]').length).toBe(0)
    expect(readSource()).not.toMatch(/http\.(post|put|patch|delete)/)
  })

  it('无 <el- 直用、无 echarts、template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source.toLowerCase()).not.toContain('echarts')
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/v2 仅 fetchTrafficSummary、@/api/misc 仅 listRouteStatus（P4b-2 成员禁提前引入）", () => {
    const v2Import = readSource().match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/v2'/)?.[0] ?? ''
    const miscImport = readSource().match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/misc'/)?.[0] ?? ''
    expect(v2Import, '页面需从 @/api/v2 具名导入 fetchTrafficSummary').toBeTruthy()
    expect(v2Import).toContain('fetchTrafficSummary')
    expect(miscImport, '页面需从 @/api/misc 具名导入 listRouteStatus').toBeTruthy()
    expect(miscImport).toContain('listRouteStatus')
    for (const banned of [
      'fetchRouteTimeseries', 'fetchDecisionTree', 'getRouteTimeseries', 'getRouteMetrics',
      'getTopology', 'listAuditLogs', 'getSyncStatus', 'saveConfig', 'createUser', 'updateUser',
      'deleteUser', 'listRoutes'
    ]) {
      expect(`${v2Import}\n${miscImport}`, `禁用成员 ${banned} 出现在 import 面（越界/P4b-2 未到）`).not.toContain(banned)
    }
  })

  it('testid 前缀契约：template 内全部静态 data-testid 以 mon- 开头', () => {
    const tids = staticTestids()
    expect(tids.length, '页面应声明 mon-* testid（占位 stub 阶段此断言先红）').toBeGreaterThan(0)
    for (const tid of tids) {
      expect(tid.startsWith('mon-'), `testid ${tid} 不在 mon-* 前缀内`).toBe(true)
    }
  })
})

describe('v2 monitor — 砍除三区块 + delta（P4b 契约钉除，缺口不造数）', () => {
  it('无告警表/环境 tabs/delta▲%/峰值：testid 与 v2.monitor.* key/value 三层皆无', async () => {
    const { wrapper } = await factory()
    for (const tid of staticTestids()) {
      expect(tid).not.toMatch(/alert|env|delta|peak/i)
    }
    const keys = collectKeys(dig(zhCN, 'v2.monitor')).map((k) => k.toLowerCase())
    for (const key of keys) {
      expect(key.match(/alert|env|delta|peak|instance/), `i18n key ${key} 落入砍除区`).toBeNull()
    }
    for (const val of collectValues(dig(zhCN, 'v2.monitor'))) {
      expect(val, `i18n 文案「${val}」落入砍除区`).not.toMatch(/告警|环境|峰值|▲|▼/)
    }
    expect(wrapper.text()).not.toMatch(/告警|环境|峰值|▲|▼/)
  })

  it('禁实例矩阵（S2 单上游语义）：无 instance/inst-* testid、无「实例」文案（原型 01/02/03 槽位不落实现）', async () => {
    const { wrapper } = await factory()
    for (const tid of staticTestids()) {
      expect(tid).not.toMatch(/instance|inst-/i)
    }
    for (const val of collectValues(dig(zhCN, 'v2.monitor'))) {
      expect(val, `i18n 文案「${val}」含实例矩阵语义`).not.toContain('实例')
    }
    expect(wrapper.text()).not.toContain('实例')
  })
})
