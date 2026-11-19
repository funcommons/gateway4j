/**
 * S10-4-T：建路表单布局重组（分发路由「规则卡」形态）—— 组件契约测试（RED 先行，C 步照做）。
 * 背景契约 docs/ui-v2/实施契约.md §8.1（2026-11-19 用户裁决，MSE 口径参考布局）：
 * 规则卡 = 分发路由视图，含「域名」显式字段 + 「路径映射」行式编辑（每行：路径/匹配规则/
 * 服务名称/端口）+ 行级增删（+添加路径）；数据层零列变更。本文件在 S10-2（七谓词）之上
 * 钉布局重组契约，条件行编辑能力保留（域名/正则行是语法糖翻译层，不重复渲染进条件行区）。
 *
 * ── 侦察结论（2026-11-19，写测试前实证，C 步落地前提）─────────────────────────
 * ① RouteEditForm.vue 现为【单路由编辑器】：props.routeId → getRoute → updateRoute，
 *   不管理子路由；Detail.vue 每路由一个 dtl-edit-panel 实例（子路由编辑=打开子路由自己的
 *   详情）；Wizard.vue v1 仅创建 DISPATCH 父路由（文件头缺口 1：后端无多分支创建字段）。
 *   → 路径映射行数据源钉【GET /v1/routes/{id}/children】（RouteController:417 已存在，
 *   api/routes.ts listRouteChildren 已封装、当前全站零调用）；行保存走既有
 *   createRoute（payload 带 parent_route_id）/ updateRoute / deleteRoute 逐行批量提交
 *   （后端无批量建/改端点，bulk* 仅发布/下线/删除三类命令）。
 * ② 引擎 RouteDispatcher.dispatchRecursive 只评估【分发路由自身】的 conditions
 *   （conditionMap 按 routeId 分组，后置路由上的条件引擎永不评估 = dead config）；
 *   非 WEIGHT 条件按 priority 升序首个「匹配且 target_route_id 可解析」者胜。
 * ③ 后端 RouteService.validateRequiredFields：BACKEND createRoute 硬拒空 path
 *   （"后端路由路径不能为空"）；PATCH 不校验。→ 任务原案「正则→path 留空」在创建
 *   通道不可行（侦察改判 #1，见 §2 正则翻译）。
 * ④ listRouteChildren 返回 Route 实体【不含 conditions】（条件在 gw_route_condition
 *   独立表）→ 正则行回显数据源 = 分发路由自身 conditions（getRoute 已装载，零新增请求）。
 * ⑤ RoutePathMatcher path 语义：尾 `/**` = 前缀、尾 `/*` = 单段、无通配 = 精确
 *   （精确优先于通配）；RouteConditionMatcher.matchOperator REGEX = Pattern.find()
 *   （非整串 matches）。`/*` 单段形态不在本票翻译表内（回显按前缀族宽容处理 +
 *   未改动行不触发提交 → 往返安全，C 不许对未动行重写 path）。
 *
 * ── 契约 §1：域名段（语法糖翻译层，DOM 不渲染翻译行）──────────────────────────
 * 分发路由形态出现「域名」输入（data-testid=ref-domain-input，可空=不限域名）。
 * 回显反向识别窄口径【精确匹配】：conditions 中存在 condition_type='HEADER' &&
 * condition_key==='Host' && operator==='EQ' 的行 → 域名输入 = condition_value，且该行
 * 不作为条件行渲染（ref-cond-row-* 不含它）；无此行 → 域名输入空串。
 * 保存翻译：域名非空 → updateRoute payload.conditions 恰一条 {condition_type:'HEADER',
 * condition_key:'Host', condition_value:域名, operator:'EQ'} 行（追加或更新既有行，
 * 恰一条不重复）；域名空 → payload.conditions 不含任何 HEADER+Host 行（回显行被清空
 * 即删除）。既有行 target_route_id/priority 等其余字段 C 应保留（不钉数值）。
 * 已有 Host 行仅回显首条；多余 Host 行按普通条件行渲染（不钉，禁臆造去重）。
 *
 * ── 契约 §2：路径映射段（后置路由内联编辑 + 逐行批量提交）───────────────────────
 * 分发路由形态出现「路径映射」区（ref-paths）：行数据源 = listRouteChildren(routeId)，
 * 每行（ref-path-row-{n}）四输入：路径（ref-path-path-{n}）/匹配规则（ref-path-rule-{n}，
 * 值域 PREFIX|EXACT|REGEX）/服务名称（ref-path-service-{n}）/端口（ref-path-port-{n}）
 * + 行删除钮（ref-path-remove-{n}）+ 区尾「添加路径」钮（ref-path-add）。
 * 行模型（vm 通道）：pathRows: Array<{id, path, rule, service, port}>，回显行 id=子路由
 * id，新增行 id=''。
 * 服务/端口 = upstream_url 单字段的投影视图（最小数据变形，存储零拆分）：service 直绑
 * upstream_url 原文；port 读 URL.port（无显式端口=空串），写端口 → 同 origin 换端口回写
 * upstream_url（写空=去端口）。裁断理由：scheme 必须往返保真（http/https 不能丢），
 * 「服务=origin+端口」拆分式会丢 scheme，upstream_url 原文直绑无此风险。
 * 匹配规则翻译表（保存时对行状态重跑，改端口不得回退路径翻译）：
 *   PREFIX → 子路由 path = 输入去尾 '/' + '/**'（RoutePathMatcher doubleWildcard 前缀语义）
 *   EXACT  → 子路由 path = 输入原文
 *   REGEX  → 子路由 path = 正则原文【非空落列——侦察改判 #1：后端 createRoute 硬拒空
 *             path，任务原案「留空」不可行】+ 分发路由 conditions 维护隐藏翻译行
 *             {condition_type:'PATH', operator:'REGEX', condition_value:正则文,
 *             target_route_id:行子路由 id}【侦察改判 #2：任务原案未指明挂载点；后置路由
 *             自身条件引擎不评估（侦察②），挂分发路由是唯一引擎活语义；回显数据源同源
 *             （侦察④，children 不带 conditions）】。该翻译行同域名行：不渲染进条件行区。
 *             condition_key 不钉值（引擎 PATH 分支不消费 key；但须非空过 validateConditions，
 *             或 C 将翻译行置于键值校验豁免通道——实现自由）。正则行规则的「引擎活语义」
 *             完整形态（切规则/删行的孤儿条件清理、与条件行区的互斥编辑）为 C 步实现要求，
 *             本文件不展开独立用例。
 * 保存批量时序（可观察契约）：行提交（create→update）→ 父路由 updateRoute 收尾 →
 *   deleteRoute 收尾删行。理由：正则翻译行 target 需要新建行回填的子路由 id（create 先于
 *   父保存）；后端 deleteRoute 有引用守卫（被条件 target 引用的路由拒删），翻译条件已随
 *   父保存移除后删行才可成功（父保存先于删行）。脏行才提交：未改动回显行不产生任何
 *   行级调用；已存在脏行走 updateRoute(子id, {path:翻译形, upstream_url:合并形,
 *   expected_version:子 config_version})（乐观锁随行）；新行走 createRoute({route_type:
 *   'BACKEND', path:翻译形, upstream_url, parent_route_id:分发id, ...}，route_name 由 C
 *   合成须过 NAME_RE，不钉)。
 * 降级：listRouteChildren 失败 → ref-paths-error 警告条 + 表单其余照常（含保存），
 *   不抛未处理异常。【旧套件共存铁律】同步抛错（如旧测试文件 mock 工厂缺该成员的
 *   TypeError）也必须被装载守卫吞掉——否则 RouteEditForm.test.ts 的 DISPATCH 用例
 *   在 C 落地后集体红（loading 卡死三区不渲染）。仅分发路由形态装载子路由。
 *
 * ── 契约 §3：布局结构与既有能力锚 ─────────────────────────────────────────────
 * 规则卡段序（分发路由形态）= 域名 → 路径映射 → 分发条件行（条件行区保留在尾）。
 * 裁断：域名段与路径映射段落位【ref-section-conditions 面板内】（分发条件 tab 即规则卡，
 * 三 tab 骨架不动——RouteEditForm.test.ts 主文件钉死 ref-section-nav 三 tab × 面板三区，
 * 加 tab / 动三区会爆旧套件）；后置路由形态表单结构零变化（无域名/路径映射段，
 * ref-chain/ref-action-save 等照旧）。
 * 既有能力锚（S10-2 契约仍绿的 1-2 个代表锚，不与其用例重叠）：13 谓词下拉 + WEIGHT
 * 收尾；DISPATCH 空条件保存客户端预检阻断沿用。
 *
 * ── RED 形态预期 ─────────────────────────────────────────────────────────────
 * 布局重组未实现：域名/路径映射段全部 testid 缺失 → 12 用例红（签名 = `缺少
 * data-testid=ref-*` 或 `pathRows 在位` 落空）；既有锚 3 用例绿（后置形态不变锚 /
 * 13 谓词锚 / DISPATCH 空条件阻断锚）。C 步落地后 15 用例全绿（it.each 前缀/精确展开
 * 2 例已计入）。
 *
 * mount/fixture 惯例跟随同目录 RouteEditForm.test.ts / RouteEditForm.scg-predicates.test.ts
 * （mock 面 / factory / vm 通道一致；mock 工厂按本契约扩 listRouteChildren/createRoute/
 * deleteRoute 三成员——现组件未 import，属契约前置声明，无害）。
 * i18n（v2.edit.* 双语随行，C 加，本文件不钉文案）：domainField/domainHint/pathsTitle/
 * pathCol/ruleCol/serviceCol/portCol/pathAdd/pathRemove/pathsLoadFailed/
 * rulePrefix/ruleExact/ruleRegex。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  getRoute: vi.fn(),
  listRoutes: vi.fn(),
  updateRoute: vi.fn(),
  validateRoute: vi.fn(),
  listBindings: vi.fn(),
  getPluginChain: vi.fn(),
  listBuiltinTypes: vi.fn(),
  // S10-4 契约前置：listRouteChildren（行数据源）/ createRoute（新行）/ deleteRoute（删行）
  listRouteChildren: vi.fn(),
  createRoute: vi.fn(),
  deleteRoute: vi.fn(),
  mapFieldErrors: vi.fn(() => ({}) as Record<string, string>),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  getRoute: mocks.getRoute,
  listRoutes: mocks.listRoutes,
  updateRoute: mocks.updateRoute,
  validateRoute: mocks.validateRoute,
  listBindings: mocks.listBindings,
  getPluginChain: mocks.getPluginChain,
  listRouteChildren: mocks.listRouteChildren,
  createRoute: mocks.createRoute,
  deleteRoute: mocks.deleteRoute
}))
vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes
}))
vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, mapFieldErrors: mocks.mapFieldErrors }
})
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.canEdit,
    hasAnyPermission: mocks.canEdit,
    canEdit: mocks.canEdit
  })
}))
vi.mock('@/store/environment', () => ({
  useEnvironments: () => envState
}))
vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, toast: mocks.toast }
})

import RouteEditForm from '@/views-v2/routes/RouteEditForm.vue'

// 环境维度（组件 useEnvironments() 返回态；vi.hoisted 防 mock 工厂 TDZ，主文件先例）
const envState = vi.hoisted(() => ({
  available: true,
  current: 'prod',
  options: [
    { value: 'prod', label: 'prod' },
    { value: 'dev', label: 'dev' }
  ]
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// ── fixtures（makeRoute/condRow 口径随 scg-predicates 文件）────────────────

function makeRoute(id: string, over: Record<string, unknown> = {}) {
  return {
    id, route_name: `${id}_svc`, route_type: 'BACKEND', path: `/api/${id}/**`,
    upstream_url: 'http://10.0.0.11:9001', sort_order: 1, remark: '旧备注',
    parent_route_id: null, tags: 'edge', environment: 'prod',
    status: 'DRAFT', config_version: '42',
    conditions: [] as unknown[], children: [], ...over
  }
}

/** 行条件构造：默认 QUERY/EQ（key+value 全非空过键值校验）；target 缺省空（不牵引用守卫） */
function condRow(over: Record<string, unknown> = {}) {
  return {
    condition_type: 'QUERY', operator: 'EQ', condition_key: 'version',
    condition_value: 'v2', target_route_id: '', priority: 1, ...over
  }
}

/** 域名翻译行（回显 fixture 用）：HEADER/Host/EQ 口径见契约 §1 */
function hostCond(value: string, over: Record<string, unknown> = {}) {
  return condRow({
    condition_type: 'HEADER', condition_key: 'Host', condition_value: value,
    operator: 'EQ', priority: 3, ...over
  })
}

/** 正则翻译行（回显 fixture 用）：PATH/REGEX + target 挂行子路由，口径见契约 §2 */
function regexCond(value: string, targetId: string, over: Record<string, unknown> = {}) {
  return condRow({
    condition_type: 'PATH', condition_key: '', condition_value: value,
    operator: 'REGEX', target_route_id: targetId, priority: 2, ...over
  }
  )
}

/** 分发路由 fixture：带一条 QUERY 条件（保存预检放行必配，DISPATCH 空条件会被客户端阻断） */
function makeDispatch(over: Record<string, unknown> = {}) {
  return makeRoute('rp', {
    route_type: 'DISPATCH', path: '/api/dispatch/**', upstream_url: '',
    conditions: [condRow()], config_version: '9', ...over
  })
}

/** 子后置路由 fixture（listRouteChildren 返回 Route 实体口径：无 conditions，侦察④） */
function makeChild(id: string, path: string, upstream: string, over: Record<string, unknown> = {}) {
  return makeRoute(id, { route_type: 'BACKEND', path, upstream_url: upstream, config_version: '7', ...over })
}

async function factory(routeId = 'rp'): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/:id/detail', component: { template: '<div />' } },
      { path: '/v2/nowhere', component: { template: '<div />' } }
    ]
  })
  await router.push('/v2/routes/x/detail')
  await router.isReady()
  const wrapper = mount(RouteEditForm, {
    props: { routeId },
    global: { plugins: [ElementPlus, createPinia(), i18n, router] }
  })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 先钉存在再取（RED 时错误信息可读，主文件 need 先例） */
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)
const inputVal = (w: VueWrapper<any>, tid: string) => String((inputOf(w, tid).element as HTMLInputElement)?.value ?? '')
const vmOf = (w: VueWrapper<any>) => w.vm as any
const condRows = (w: VueWrapper<any>) => w.findAll('[data-testid^="ref-cond-row-"]')
/** payload 里 HEADER+Host 行（域名翻译行识别口径，契约 §1） */
const hostRowsOf = (body: { conditions: Array<Record<string, unknown>> }) =>
  body.conditions.filter((c) => c.condition_type === 'HEADER' && c.condition_key === 'Host')
/** payload 里 PATH+REGEX 行（正则翻译行识别口径，契约 §2） */
const regexRowsOf = (body: { conditions: Array<Record<string, unknown>> }) =>
  body.conditions.filter((c) => c.condition_type === 'PATH' && c.operator === 'REGEX')
/** document 序 a < b（jsdom compareDocumentPosition，布局段序断言用） */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
/** 父路由 updateRoute 调用（first arg = 分发路由 id） */
const parentUpdateCalls = () => mocks.updateRoute.mock.calls.filter((c) => c[0] === 'rp')

beforeEach(() => {
  setActivePinia(createPinia())
  envState.available = true
  envState.current = 'prod'
  mocks.getRoute.mockReset().mockResolvedValue(makeRoute('r1'))
  mocks.listRoutes.mockReset().mockResolvedValue([makeRoute('r1'), makeRoute('r2', { route_type: 'DISPATCH' })])
  mocks.updateRoute.mockReset().mockResolvedValue(makeRoute('r1'))
  mocks.validateRoute.mockReset().mockResolvedValue({})
  mocks.listBindings.mockReset().mockResolvedValue([])
  mocks.getPluginChain.mockReset().mockResolvedValue({ pre_chain: [], post_chain: [] })
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([{ plugin_id: 'p1', plugin_name: 'rate-limit' }])
  mocks.listRouteChildren.mockReset().mockResolvedValue([])
  mocks.createRoute.mockReset().mockResolvedValue(makeRoute('cn1'))
  mocks.deleteRoute.mockReset().mockResolvedValue({})
  mocks.mapFieldErrors.mockReset().mockReturnValue({})
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReset().mockReturnValue(true)
})

/** 分发形态工厂：getRoute 换分发路由 + 子路由注入（绝大多数 §1/§2 用例入口） */
async function dispatchFactory(children: unknown[] = [], routeOver: Record<string, unknown> = {}) {
  mocks.getRoute.mockResolvedValue(makeDispatch(routeOver))
  mocks.listRouteChildren.mockResolvedValue(children)
  return factory('rp')
}

// ══════════════════════════════════════════════════════════════════════════
// §3/契约 存在性与段序 — 规则卡（分发形态）三段 + 后置形态不变锚
// ══════════════════════════════════════════════════════════════════════════

describe('规则卡形态 — 域名/路径映射存在性 + 段序（契约 §1§2§3）', () => {
  it('分发形态：域名输入与路径映射区在位且落 ref-section-conditions 面板内，段序=域名→路径映射→条件行，行数=children 数，三 tab 骨架不动', async () => {
    const { wrapper } = await dispatchFactory([
      makeChild('c1', '/api/v1/**', 'http://s1.local:9001'),
      makeChild('c2', '/api/v2', 'http://s2.local')
    ])
    need(wrapper, 'ref-domain-field', '域名段容器')
    need(wrapper, 'ref-domain-input', '域名输入（可空=不限域名）')
    need(wrapper, 'ref-paths', '路径映射区容器')
    need(wrapper, 'ref-path-add', '添加路径钮')
    // 行数据源 = listRouteChildren（侦察①：现表单不管理子路由，读 children API 组装）
    expect(wrapper.findAll('[data-testid^="ref-path-row-"]'), '行数 = 子后置路由数').toHaveLength(2)
    // 落位：域名段与路径映射段都在分发条件面板内（规则卡 = 分发条件 tab；三 tab 骨架不动，
    // RouteEditForm.test.ts 主文件钉死 ref-section-nav 三 tab × 三面板，加 tab 即爆旧套件）
    const condPane = need(wrapper, 'ref-section-conditions', '分发条件面板')
    expect(condPane.element.contains(one(wrapper, 'ref-domain-field').element), '域名段落 conditions 面板内').toBe(true)
    expect(condPane.element.contains(one(wrapper, 'ref-paths').element), '路径映射段落 conditions 面板内').toBe(true)
    // 段序：域名 → 路径映射 → 条件行（条件行区保留在尾；conditions[0]=QUERY 行已渲染）
    const condRow0 = need(wrapper, 'ref-cond-row-0', '既有条件行（锚定保留在尾）')
    expect(before(one(wrapper, 'ref-domain-field').element, one(wrapper, 'ref-paths').element), '域名先于路径映射').toBe(true)
    expect(before(one(wrapper, 'ref-paths').element, condRow0.element), '路径映射先于条件行').toBe(true)
    // tab 骨架锚：仍恰 3 tab（重组不加 tab）
    expect(wrapper.findAll('.fc-tab'), '三 tab 骨架不动').toHaveLength(3)
    expect(mocks.listRouteChildren, '子路由读 children 端点').toHaveBeenCalledWith('rp')
  })

  it('后置形态锚：无域名段/无路径映射段，ref-chain/保存钮/三 tab 照旧（后置路由表单结构零变化，本批前后恒绿）', async () => {
    const { wrapper } = await factory('r1') // 默认 BACKEND r1
    expect(one(wrapper, 'ref-domain-field').exists(), '后置形态无域名段').toBe(false)
    expect(one(wrapper, 'ref-domain-input').exists(), '后置形态无域名输入').toBe(false)
    expect(one(wrapper, 'ref-paths').exists(), '后置形态无路径映射段').toBe(false)
    need(wrapper, 'ref-chain', 'chain 常驻只读段照旧')
    need(wrapper, 'ref-action-save', '保存钮照旧')
    need(wrapper, 'ref-section-basic', '基础区照旧')
    expect(wrapper.findAll('.fc-tab'), '三 tab 骨架不动').toHaveLength(3)
  })
})

describe('降级 — listRouteChildren 失败不拖垮表单（契约 §2，旧套件共存铁律）', () => {
  it('children 装载失败：ref-paths-error 警告条 + 表单其余照常（保存仍可用），不抛未处理异常', async () => {
    mocks.getRoute.mockResolvedValue(makeDispatch())
    mocks.listRouteChildren.mockRejectedValue(new Error('children down'))
    const { wrapper } = await factory('rp')
    need(wrapper, 'ref-paths-error', '路径映射降级警告条')
    need(wrapper, 'ref-section-basic', '表单照常渲染')
    need(wrapper, 'ref-action-save', '保存仍可用')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §1 域名段 — 回显反向识别 + 保存翻译（语法糖层，翻译行不渲染进条件行区）
// ══════════════════════════════════════════════════════════════════════════

describe('域名段 — 回显与保存翻译（契约 §1）', () => {
  it('回显双向：已有 HEADER/Host/EQ 行 → 域名输入=condition_value 且条件行区不渲染该行；无 Host 行 → 域名输入空串', async () => {
    const { wrapper } = await dispatchFactory([], {
      conditions: [hostCond('api.example.com'), condRow()]
    })
    need(wrapper, 'ref-domain-input', '域名输入（回显通道）')
    expect(inputVal(wrapper, 'ref-domain-input'), '域名输入回显 condition_value').toBe('api.example.com')
    expect(condRows(wrapper), 'Host 翻译行不重复渲染（仅剩 QUERY 行）').toHaveLength(1)
    expect(condRows(wrapper)[0].text()).not.toContain('api.example.com')

    const { wrapper: bare } = await dispatchFactory([])
    need(bare, 'ref-domain-input', '域名输入（空态）')
    expect(inputVal(bare, 'ref-domain-input'), '无 Host 行 → 域名输入空').toBe('')
  })

  it('填域名保存：payload.conditions 恰一条 HEADER/Host/EQ 翻译行，值为域名（追加或更新皆此形态）', async () => {
    const { wrapper } = await dispatchFactory([])
    vmOf(wrapper).domain = 'api.example.com'
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(parentUpdateCalls(), '保存到达父路由 updateRoute').toHaveLength(1)
    const hosts = hostRowsOf(parentUpdateCalls()[0][1])
    expect(hosts, '恰一条 Host 翻译行（不重复追加）').toHaveLength(1)
    expect(hosts[0]).toMatchObject({
      condition_type: 'HEADER', condition_key: 'Host',
      condition_value: 'api.example.com', operator: 'EQ'
    })
  })

  it('回显行改值→更新不追加（仍恰一条、值换新）；清空域名→保存后 payload 无任何 HEADER+Host 行', async () => {
    const { wrapper } = await dispatchFactory([], {
      conditions: [hostCond('api.example.com'), condRow()]
    })
    vmOf(wrapper).domain = 'b.example.com'
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    let hosts = hostRowsOf(parentUpdateCalls()[0][1])
    expect(hosts, '改值后仍恰一条 Host 行（更新非追加）').toHaveLength(1)
    expect(hosts[0]).toMatchObject({ condition_value: 'b.example.com', operator: 'EQ' })

    vmOf(wrapper).domain = ''
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    hosts = hostRowsOf(parentUpdateCalls()[1][1])
    expect(hosts, '域名空 = 保存不产生 Host 条件（回显行被删）').toHaveLength(0)
    expect(parentUpdateCalls()[1][1].conditions.some((c: Record<string, unknown>) => c.condition_type === 'QUERY'),
      '其余条件行不受牵连').toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §2 路径映射段 — 行渲染/反向翻译/增删/批量提交/翻译表
// ══════════════════════════════════════════════════════════════════════════

describe('路径映射段 — 行渲染与反向翻译（契约 §2）', () => {
  it('回显行反向翻译：尾 /** → 规则=PREFIX+路径输入摘后缀；无通配 → 规则=EXACT+原文；服务=upstream 原文；端口=URL.port 投影（无显式端口=空）', async () => {
    const { wrapper } = await dispatchFactory([
      makeChild('c1', '/api/v1/**', 'http://s1.local:9001'),
      makeChild('c2', '/api/v2', 'http://s2.local')
    ])
    const vm = vmOf(wrapper)
    expect(Array.isArray(vm.pathRows), '行模型进 vm 通道（契约 §2 pathRows 五字段）').toBe(true)
    expect(vm.pathRows, '回显行数 = children 数').toHaveLength(2)
    expect([vm.pathRows[0].rule, vm.pathRows[1].rule]).toEqual(['PREFIX', 'EXACT'])
    expect(vm.pathRows[0].id).toBe('c1')
    // 行输入值（DOM 可读）
    expect(inputVal(wrapper, 'ref-path-path-0'), '前缀行路径输入摘 /**').toBe('/api/v1')
    expect(inputVal(wrapper, 'ref-path-path-1'), '精确行路径输入原文').toBe('/api/v2')
    expect(inputVal(wrapper, 'ref-path-service-0'), '服务列=upstream_url 原文直绑').toBe('http://s1.local:9001')
    expect(inputVal(wrapper, 'ref-path-port-0'), '端口列=URL.port 投影').toBe('9001')
    expect(inputVal(wrapper, 'ref-path-port-1'), '无显式端口 → 端口列空').toBe('')
    // 每行四输入 + 删除钮
    for (const i of [0, 1]) {
      need(wrapper, `ref-path-path-${i}`, `行${i} 路径输入`)
      need(wrapper, `ref-path-rule-${i}`, `行${i} 规则下拉`)
      need(wrapper, `ref-path-service-${i}`, `行${i} 服务输入`)
      need(wrapper, `ref-path-port-${i}`, `行${i} 端口输入`)
      need(wrapper, `ref-path-remove-${i}`, `行${i} 删除钮`)
    }
  })
})

describe('路径映射段 — 行级增删（契约 §2）', () => {
  it('添加路径钮：行数 +1 且新行 id=\'\'（未保存态）；行删除钮：行 -1 + 保存触发 deleteRoute(被删子id) 且调用序在父 updateRoute 之后（后端引用守卫前置解除）', async () => {
    const { wrapper } = await dispatchFactory([
      makeChild('c1', '/api/v1/**', 'http://s1.local:9001')
    ])
    await need(wrapper, 'ref-path-add', '添加路径钮').trigger('click')
    await flushPromises()
    expect(vmOf(wrapper).pathRows, '添加后行数 2').toHaveLength(2)
    expect(vmOf(wrapper).pathRows[1].id, '新行 id 空（未保存态）').toBe('')

    // 复位到单行场景再钉删除语义
    const { wrapper: w2 } = await dispatchFactory([
      makeChild('c1', '/api/v1/**', 'http://s1.local:9001'),
      makeChild('c2', '/api/v2', 'http://s2.local')
    ])
    await need(w2, 'ref-path-remove-0', '行删除钮').trigger('click')
    await flushPromises()
    expect(vmOf(w2).pathRows, '删除后行数 1').toHaveLength(1)
    await need(w2, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.deleteRoute, '被删行提交 deleteRoute(子id)').toHaveBeenCalledWith('c1')
    const delOrder = mocks.deleteRoute.mock.invocationCallOrder[0]
    const parentOrder = parentUpdateCalls()[0] ? mocks.updateRoute.mock.invocationCallOrder[mocks.updateRoute.mock.calls.findIndex((c) => c[0] === 'rp')] : Infinity
    expect(delOrder, '删行在父路由保存之后（引用守卫先随父条件更新解除）').toBeGreaterThan(parentOrder)
    expect(mocks.updateRoute.mock.calls.filter((c) => c[0] === 'c1'), '未删行不产生行级调用').toHaveLength(0)
  })
})

describe('路径映射段 — 逐行批量提交与脏行纪律（契约 §2）', () => {
  it('只动行0端口：行0走 updateRoute（path 保持翻译形不回退 + upstream 同 origin 换端口 + expected_version=子 config_version）；行1未动零调用；createRoute 未调', async () => {
    const { wrapper } = await dispatchFactory([
      makeChild('c1', '/api/v1/**', 'http://10.0.0.11:9001'),
      makeChild('c2', '/api/v2', 'http://10.0.0.12:9002')
    ])
    need(wrapper, 'ref-path-row-0', '路径映射行0（脏行载体）')
    expect(Array.isArray(vmOf(wrapper).pathRows), '行模型 vm 通道 pathRows 在位').toBe(true)
    vmOf(wrapper).pathRows[0].port = '9002'
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    const childCalls = mocks.updateRoute.mock.calls.filter((c) => c[0] === 'c1')
    expect(childCalls, '脏行恰好一次行级 updateRoute').toHaveLength(1)
    expect(childCalls[0][1]).toMatchObject({
      path: '/api/v1/**',
      upstream_url: 'http://10.0.0.11:9002'
    })
    expect(childCalls[0][1].expected_version, '子路由乐观锁随行').toBe('7')
    expect(mocks.updateRoute.mock.calls.filter((c) => c[0] === 'c2'), '未动行零调用').toHaveLength(0)
    expect(mocks.createRoute, '无新行 → createRoute 未调').not.toHaveBeenCalled()
  })
})

describe('路径映射段 — 匹配规则翻译表（契约 §2，保存时按行状态重跑）', () => {
  it.each([
    ['PREFIX', '/api/v1/**'],
    ['EXACT', '/api/v1']
  ])('新行规则 %s：createRoute payload path=%s（RoutePathMatcher 语义对齐），且不产生 PATH/REGEX 父条件', async (rule, expectedPath) => {
    const { wrapper } = await dispatchFactory([])
    await need(wrapper, 'ref-path-add', '添加路径钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.pathRows[0].path = '/api/v1'
    vm.pathRows[0].rule = rule
    vm.pathRows[0].service = 'http://s1.local'
    vm.pathRows[0].port = '9001'
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.createRoute, '新行走 createRoute（parent_route_id 挂分发路由）').toHaveBeenCalledTimes(1)
    const payload = mocks.createRoute.mock.calls[0][0]
    expect(payload).toMatchObject({
      route_type: 'BACKEND',
      path: expectedPath,
      upstream_url: 'http://s1.local:9001',
      parent_route_id: 'rp'
    })
    expect(regexRowsOf(parentUpdateCalls()[0][1]), '前缀/精确不产生正则翻译条件').toHaveLength(0)
  })

  it('新行规则 REGEX：path 非空落正则原文（侦察改判 #1：createRoute 硬拒空 path）+ 父 conditions 添 PATH/REGEX 翻译行（target=新行回填 id，create 先于父保存）+ 翻译行不渲染进条件行区', async () => {
    const { wrapper } = await dispatchFactory([])
    await need(wrapper, 'ref-path-add', '添加路径钮').trigger('click')
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.pathRows[0].path = '/v[0-9]+'
    vm.pathRows[0].rule = 'REGEX'
    vm.pathRows[0].service = 'http://r.dev'
    vm.pathRows[0].port = '8080'
    await flushPromises()
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    // 侦察改判 #1：正则文非空落子路由 path 列
    expect(mocks.createRoute).toHaveBeenCalledTimes(1)
    expect(mocks.createRoute.mock.calls[0][0]).toMatchObject({
      route_type: 'BACKEND', path: '/v[0-9]+', parent_route_id: 'rp'
    })
    // 侦察改判 #2：正则翻译行挂分发路由（引擎活语义），target = createRoute 回填的新子路由 id
    const parentBody = parentUpdateCalls()[0][1]
    const regexRows = regexRowsOf(parentBody)
    expect(regexRows, '恰一条正则翻译条件').toHaveLength(1)
    expect(regexRows[0]).toMatchObject({
      condition_type: 'PATH', operator: 'REGEX',
      condition_value: '/v[0-9]+', target_route_id: 'cn1'
    })
    // 时序：create（拿 id 回填 target）先于父路由保存
    const createOrder = mocks.createRoute.mock.invocationCallOrder[0]
    const parentOrder = mocks.updateRoute.mock.invocationCallOrder[mocks.updateRoute.mock.calls.findIndex((c) => c[0] === 'rp')]
    expect(createOrder, '行提交先于父路由保存（target 引用新行回填 id）').toBeLessThan(parentOrder)
    // 翻译行不渲染进条件行区（同域名行语法糖模式；仅剩 fixture 的 QUERY 行）
    expect(condRows(wrapper), '正则翻译行不重复渲染').toHaveLength(1)
  })

  it('回显正则行：父 conditions 有 PATH/REGEX(target=c1) → 行规则=REGEX、路径输入=正则文、条件行区不渲染该翻译行', async () => {
    const { wrapper } = await dispatchFactory([
      makeChild('c1', '/v[0-9]+', 'http://r.dev:8080'),
      makeChild('c2', '/api/x/**', 'http://x.dev')
    ], {
      conditions: [condRow(), regexCond('/v[0-9]+', 'c1')]
    })
    need(wrapper, 'ref-path-row-0', '路径映射行0（正则回显载体）')
    const vm = vmOf(wrapper)
    expect(Array.isArray(vm.pathRows), '行模型 vm 通道 pathRows 在位').toBe(true)
    expect(vm.pathRows[0].rule, '正则行回显规则').toBe('REGEX')
    expect(vm.pathRows[0].path, '路径输入回显正则文').toBe('/v[0-9]+')
    expect(vm.pathRows[1].rule, '相邻前缀行不受牵连').toBe('PREFIX')
    expect(condRows(wrapper), '正则翻译行不渲染（仅剩 QUERY 行）').toHaveLength(1)
    expect(condRows(wrapper)[0].text()).not.toContain('/v[0-9]+')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 既有能力锚 — 布局重组后 S10-2 契约与保存时序仍绿（本批前后恒绿）
// ══════════════════════════════════════════════════════════════════════════

describe('既有锚 — 13 谓词与 DISPATCH 空条件阻断（S10-2 代表锚，本批前后恒绿）', () => {
  it('锚 A：条件类型下拉仍 13 项（既有 5 + 新七 + WEIGHT 恒收尾），label=类型名直出', async () => {
    const { wrapper } = await dispatchFactory([])
    const opts = vmOf(wrapper).condTypeOptions
    expect(opts.map((o: { value: string }) => o.value)).toEqual([
      'HEADER', 'PATH', 'QUERY', 'BODY', 'GROOVY',
      'HOST', 'METHOD', 'COOKIE', 'REMOTE_ADDR', 'AFTER', 'BEFORE', 'BETWEEN',
      'WEIGHT'
    ])
    expect(opts.every((o: { label: string; value: string }) => o.label === o.value)).toBe(true)
  })

  it('锚 B：DISPATCH 空条件保存客户端预检阻断沿用（域名空+无行 → ref-save-error + 不调任何保存 API）', async () => {
    const { wrapper } = await dispatchFactory([], { conditions: [] })
    await need(wrapper, 'ref-action-save', '保存钮').trigger('click')
    await flushPromises()
    need(wrapper, 'ref-save-error', 'DISPATCH 空条件阻断错误条')
    expect(mocks.updateRoute, '预检阻断不调 updateRoute').not.toHaveBeenCalled()
    expect(mocks.validateRoute, '预检阻断不调 validateRoute').not.toHaveBeenCalled()
    expect(mocks.createRoute, '预检阻断不调 createRoute').not.toHaveBeenCalled()
  })
})
