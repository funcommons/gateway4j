/**
 * S5-T：v2 发布与版本页测试（对应契约 §1 V2Publish（/v2/publish/:id，permission route:edit）+ §4 S5
 * + S5a 后端契约 + 原型 prototype-v2/10-publish.html）。
 * 先红是预期：页面由 S5-C 实现（当前为 V2PagePlaceholder 占位）。
 *
 * ── API 封装选型 ─────────────────────────────────────────────────────────
 * 发布 = 复用现有 publishRoute(id, changeDescription?)（src/api/routes.ts：有描述时 POST
 * /v1/routes/{id}/publish body { change_description }）——不新增 v2.ts 封装。
 * 版本/diff 为 S5a 新端点，S5-C 需在 src/api/routes.ts 新增两个封装（本测试 mock 之）：
 *   getRouteVersions(id)      → GET /v1/routes/{id}/versions           → RouteVersion[]
 *   getRouteVersionDiff(id, from, to) → GET /v1/routes/{id}/versions/diff?from=&to= → DiffRow[]
 *
 * ── 数据契约（提示词 camelCase → 真实 JSON snake_case，Jackson snake_case 透传）──
 * RouteVersion: routeId→route_id / configVersion→config_version（字符串数字，desc 排序返回）/
 *   changeType→change_type（'CREATE'|'PUBLISH'|'OFFLINE'）/ snapshotData→snapshot_data（对象）/
 *   changeDescription→change_description（string|null）/ actor / publishedAt→published_at（epoch ms）。
 * DiffRow: { field: string, from: string, to: string }（from===to 视为未变更）。
 * 灰度只读数据来源声明：后端无 GET conditions 端点、路由树节点不含 conditions（RouteService.
 * listRouteTree 实证），故灰度布局取自【最新一条 RouteVersion.snapshot_data.conditions】。
 * WEIGHT 条件形状与旧画布 Canvas.weight-edge 一致：condition_type='WEIGHT'，权重数字存
 * condition_key（'10'），互补分支 condition_value='residual'（condition_key 空）；展示为
 * 10% / 90%（residual = 100 − Σ显式权重）。原型「v3 草稿/待发布」不在 S5a 最小集（发布即写版本行），
 * 本页「当前」= 最新 config_version 行。
 * 其余取数：影响面 hits = fetchTrafficSummary()（@/api/v2）按 route_id 匹配 hits_24h；
 *   children 数 = listRoutes()（@/api/routes）树中 id===路由参数 节点的 children.length；
 *   权限 = usePermission().canEdit('route')。
 *
 * ── i18n key 全表（v2.publish.*，zh/en 同步加，铁律 6；21 个）──────────────
 * title / versionTimeline / current / changeCreate / changePublish / viewDiff / diffTitle /
 * diffFrom / diffTo / noDiff / affectedTitle / impactHits('每日 {n} 次命中') /
 * impactChildren('{n} 条后置') / readonlyGray / changeDescription / descriptionPlaceholder /
 * publishNow / published / publishFailed / errorLoad / empty
 *
 * ── DOM 契约（data-testid，pub-*）────────────────────────────────────────
 * pub-page（根，加载失败也在）；pub-error（versions 加载失败错误条）；
 * pub-timeline（版本时间线卡，头文案 versionTimeline）；
 * pub-version-row-{configVersion}（每条版本行，内含 actor 文本 / pub-time-{configVersion} /
 *   最新行含 pub-badge-current / 每行含 pub-diff-btn-{configVersion}（文案 viewDiff））；
 * pub-diff-card（配置对比卡，头文案 diffTitle，含 pub-diff-from / pub-diff-to（自/至 + 版本号））；
 * pub-diff-table（行 pub-diff-row-{field}，from!==to 的行带 data-changed="true"）；pub-diff-empty；
 * pub-impact（影响面卡，头文案 affectedTitle，含 pub-impact-hits / pub-impact-children）；
 * pub-gray（灰度只读卡，含 pub-gray-bar 权重条 + readonlyGray 提示；卡内不得有 input/button/.el-slider）；
 * pub-publish-form（发布区：changeDescription label + pub-desc-input（placeholder=
 *   descriptionPlaceholder，testid 落在原生 input/textarea 上）+ pub-publish-btn（文案 publishNow））；
 * pub-publish-error（发布失败错误条）；pub-empty（空版本态）。
 * toast 契约：发布成功 ElMessage.success(含 published 文案)。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  getRouteVersions: vi.fn(),
  getRouteVersionDiff: vi.fn(),
  fetchTrafficSummary: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  getRouteVersions: mocks.getRouteVersions,
  getRouteVersionDiff: mocks.getRouteVersionDiff
}))
vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import Publish from '@/views-v2/publish/Publish.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
// dig: 按点路径取 locale 值；undefined = key 缺失（参照 List.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

const NOW = 1793750400000 // 2026-11-04T00:00:00Z 附近，仅作展示数据，断言不依赖具体格式
/** WEIGHT 灰度条件对（形状同 Canvas.weight-edge：权重在 condition_key，互补分支 value='residual'） */
const WEIGHT_CONDITIONS = [
  { condition_type: 'WEIGHT', operator: 'EXISTS', condition_key: '10', condition_value: '', target_route_id: 'c1', priority: 1 },
  { condition_type: 'WEIGHT', operator: 'EXISTS', condition_key: '', condition_value: 'residual', target_route_id: 'c2', priority: 2 }
]

function makeNode(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', status: 'PUBLISHED', sort_order: 0,
    config_version: '1', created_at: 0, updated_at: 0, plugins: [], children: [], ...over
  }
}
function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 84000, qps: 12, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 80000, c4xx: 3000, c5xx: 1000 },
    upstream: { reachable: true, latency_ms: 8 }, source: 'prometheus', quantile_fallback: false, ...over
  }
}
/** S5a RouteVersion（snake_case）；接口按 config_version 倒序返回，页面按返回顺序渲染 */
function makeVersion(v: string, over: Record<string, unknown> = {}) {
  return {
    id: `ver-${v}`, route_id: 'r1', config_version: v,
    change_type: v === 'v1' ? 'CREATE' : 'PUBLISH',
    snapshot_data: { route_name: 'api_gateway', path: '/api/**', upstream_url: '', conditions: WEIGHT_CONDITIONS },
    change_description: v === 'v3' ? '新增限流插件并放宽超时' : null,
    actor: 'admin', published_at: NOW, ...over
  }
}
function defaultVersions() {
  return [makeVersion('v3'), makeVersion('v2'), makeVersion('v1')]
}
function defaultDiff() {
  return [
    { field: 'upstream_retry', from: '2', to: '3' },
    { field: 'timeout', from: '3s', to: '5s' },
    { field: 'plugins', from: '—', to: 'rate-limit' }
  ]
}
function defaultNodes() {
  return [
    makeNode('r1', {
      route_name: 'api_gateway', route_type: 'DISPATCH', upstream_url: '',
      children: [makeNode('c1', { route_name: 'canary_a' }), makeNode('c2', { route_name: 'canary_b' })]
    })
  ]
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/publish/:id', component: Publish as any },
      { path: '/v2/routes', component: stub },
      { path: '/v2/routes/:id/detail', component: stub },
      { path: '/v2/routes/tree/:id', component: stub }
    ]
  })
  await router.push('/v2/publish/r1')
  await router.isReady()
  const wrapper = mount(Publish, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listRoutes.mockReset().mockResolvedValue(defaultNodes())
  mocks.publishRoute.mockReset().mockResolvedValue({})
  mocks.getRouteVersions.mockReset().mockResolvedValue(defaultVersions())
  mocks.getRouteVersionDiff.mockReset().mockResolvedValue(defaultDiff())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue([makeTraffic('r1', { hits_24h: 84000 })])
  mocks.canEdit.mockReturnValue(true)
  vi.spyOn(ElMessage, 'success').mockClear()
})

const KEYS = ['title', 'versionTimeline', 'current', 'changeCreate', 'changePublish', 'viewDiff',
  'diffTitle', 'diffFrom', 'diffTo', 'noDiff', 'affectedTitle', 'impactHits', 'impactChildren',
  'readonlyGray', 'changeDescription', 'descriptionPlaceholder', 'publishNow', 'published',
  'publishFailed', 'errorLoad', 'empty']
  .map((k) => `v2.publish.${k}`)

describe('v2 publish/Publish — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 publish/Publish — 版本时间线', () => {
  it('按接口顺序（config_version 倒序）渲染 3 条：最新行「当前」徽章 + actor/时间/changeType + 查看 diff', async () => {
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'pub-page').exists()).toBe(true)
    expect(byTestid(wrapper, 'pub-timeline').text()).toContain(t('v2.publish.versionTimeline'))
    const rows = wrapper.findAll('[data-testid^="pub-version-row-"]')
    expect(rows.map((r) => r.attributes('data-testid')))
      .toEqual(['pub-version-row-v3', 'pub-version-row-v2', 'pub-version-row-v1'])
    expect(rows[0].find('[data-testid="pub-badge-current"]').text()).toContain(t('v2.publish.current'))
    expect(rows[0].text()).toContain('admin')
    expect(rows[0].text()).toContain('新增限流插件并放宽超时')
    expect(rows[0].text()).toContain(t('v2.publish.changePublish'))
    expect(rows[2].text()).toContain(t('v2.publish.changeCreate'))
    for (const row of rows) {
      expect(row.find('[data-testid^="pub-time-"]').text()).not.toBe('')
    }
    expect(rows[0].find('[data-testid="pub-diff-btn-v3"]').text()).toContain(t('v2.publish.viewDiff'))
  })

  it('版本为空 → pub-empty 空态，不渲染时间线', async () => {
    mocks.getRouteVersions.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'pub-empty').text()).toContain(t('v2.publish.empty'))
    expect(byTestid(wrapper, 'pub-timeline').exists()).toBe(false)
  })
})

describe('v2 publish/Publish — diff 视图', () => {
  it('点 v3 的查看 diff → getRouteVersionDiff(r1, v2, v3)（前一版本为 from）+ 字段行渲染 + 变更行高亮', async () => {
    const { wrapper } = await factory()
    await byTestid(wrapper, 'pub-diff-btn-v3').trigger('click')
    await flushPromises()
    expect(mocks.getRouteVersionDiff).toHaveBeenCalledWith('r1', 'v2', 'v3')
    expect(byTestid(wrapper, 'pub-diff-card').text()).toContain(t('v2.publish.diffTitle'))
    expect(byTestid(wrapper, 'pub-diff-from').text()).toContain(t('v2.publish.diffFrom'))
    expect(byTestid(wrapper, 'pub-diff-from').text()).toContain('v2')
    expect(byTestid(wrapper, 'pub-diff-to').text()).toContain(t('v2.publish.diffTo'))
    expect(byTestid(wrapper, 'pub-diff-to').text()).toContain('v3')
    const rows = wrapper.findAll('[data-testid^="pub-diff-row-"]')
    expect(rows.length).toBe(3)
    expect(rows[0].text()).toContain('upstream_retry')
    expect(rows[0].text()).toContain('2')
    expect(rows[0].text()).toContain('3')
    expect(rows[0].attributes('data-changed')).toBe('true')
    expect(rows[2].attributes('data-changed')).toBe('true')
    await byTestid(wrapper, 'pub-diff-btn-v2').trigger('click')
    await flushPromises()
    expect(mocks.getRouteVersionDiff).toHaveBeenCalledWith('r1', 'v1', 'v2')
  })

  it('diff 为空数组 → pub-empty 类「无差异」提示（noDiff），不渲染表格', async () => {
    mocks.getRouteVersionDiff.mockResolvedValue([])
    const { wrapper } = await factory()
    await byTestid(wrapper, 'pub-diff-btn-v3').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'pub-diff-empty').text()).toContain(t('v2.publish.noDiff'))
    expect(byTestid(wrapper, 'pub-diff-table').exists()).toBe(false)
  })
})

describe('v2 publish/Publish — 发布流程（复用 publishRoute(id, changeDescription)）', () => {
  it('填变更说明 → 发布：POST body 走现有封装 + 成功 toast（published）+ 刷新版本列表', async () => {
    const { wrapper } = await factory()
    const form = byTestid(wrapper, 'pub-publish-form')
    expect(form.text()).toContain(t('v2.publish.changeDescription'))
    const input = byTestid(wrapper, 'pub-desc-input')
    expect(input.attributes('placeholder')).toContain(t('v2.publish.descriptionPlaceholder'))
    const btn = byTestid(wrapper, 'pub-publish-btn')
    expect(btn.text()).toContain(t('v2.publish.publishNow'))
    await input.setValue('首发限流保护')
    await btn.trigger('click')
    await flushPromises()
    expect(mocks.publishRoute).toHaveBeenCalledWith('r1', '首发限流保护')
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining(t('v2.publish.published')))
    expect(mocks.getRouteVersions).toHaveBeenCalledTimes(2)
  })

  it('发布失败 → pub-publish-error（publishFailed）+ 不刷新版本列表', async () => {
    mocks.publishRoute.mockRejectedValueOnce(new Error('downstream 500'))
    const { wrapper } = await factory()
    await byTestid(wrapper, 'pub-desc-input').setValue('灰度全量')
    await byTestid(wrapper, 'pub-publish-btn').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'pub-publish-error').text()).toContain(t('v2.publish.publishFailed'))
    expect(mocks.getRouteVersions).toHaveBeenCalledTimes(1)
  })
})

describe('v2 publish/Publish — 影响面卡片', () => {
  it('hits_24h + 树 children 数 → 「每日 84k 次命中 · 2 条后置」', async () => {
    const { wrapper } = await factory()
    const impact = byTestid(wrapper, 'pub-impact')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain(t('v2.publish.affectedTitle'))
    expect(byTestid(wrapper, 'pub-impact-hits').text())
      .toContain(String(dig(zhCN, 'v2.publish.impactHits')).replace('{n}', '84k'))
    expect(byTestid(wrapper, 'pub-impact-children').text())
      .toContain(String(dig(zhCN, 'v2.publish.impactChildren')).replace('{n}', '2'))
  })
})

describe('v2 publish/Publish — 灰度只读（WEIGHT 条件来自最新版本 snapshot_data）', () => {
  it('WEIGHT 10 + residual → 只读权重条 10% / 90% + 只读提示，卡内无编辑控件', async () => {
    const { wrapper } = await factory()
    const gray = byTestid(wrapper, 'pub-gray')
    expect(gray.exists()).toBe(true)
    expect(gray.find('[data-testid="pub-gray-bar"]').text()).toContain('10%')
    expect(gray.find('[data-testid="pub-gray-bar"]').text()).toContain('90%')
    expect(gray.text()).toContain(t('v2.publish.readonlyGray'))
    expect(gray.find('input').exists()).toBe(false)
    expect(gray.find('button').exists()).toBe(false)
    expect(gray.find('.el-slider').exists()).toBe(false)
  })
})

describe('v2 publish/Publish — 权限', () => {
  it('canEdit(route)=false → 发布区不渲染；时间线与 diff 入口只读保留', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'pub-publish-form').exists()).toBe(false)
    expect(byTestid(wrapper, 'pub-publish-btn').exists()).toBe(false)
    expect(byTestid(wrapper, 'pub-timeline').exists()).toBe(true)
    expect(byTestid(wrapper, 'pub-diff-btn-v3').exists()).toBe(true)
  })
})

describe('v2 publish/Publish — 加载失败态', () => {
  it('versions reject → pub-error（errorLoad）+ 页面不崩（pub-page 仍在）', async () => {
    mocks.getRouteVersions.mockRejectedValue(new Error('versions down'))
    const { wrapper } = await factory()
    expect(byTestid(wrapper, 'pub-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'pub-error').text()).toContain(t('v2.publish.errorLoad'))
    expect(byTestid(wrapper, 'pub-page').exists()).toBe(true)
  })
})
