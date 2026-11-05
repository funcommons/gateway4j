/**
 * S11b-T (2/3 主战场)：v2 调试台页测试 —— 契约 docs/ui-v2/实施契约.md §4 S11 行 S11b 半步
 * （裁决细则 ⑦~⑩，2026-11-05）+ S11a 后端契约（baa8bc7）+ 原型 prototype-v2/09-debug.html。
 * 测试基座：Publish.test.ts（vi.hoisted/factory/it.each/dig）+ Chain.test.ts
 * （头注模式 + S10b 路由选择器 DOM 契约 + H18 源码 grep 手法）。
 * 先红是预期：页面由 S11b-C 实现 —— SUT 是【既有路由指向的】@/views-v2/debug/Debug.vue，
 * C 步原地替换 V2PagePlaceholder 占位（不新建 DebugConsole.vue、不动 router/nav，见下「入口接线裁决」）。
 * 文件名 DebugConsole.test.ts 为管道既定名，与组件名解耦。
 *
 * ── 入口接线裁决（任务 4 之验收落点）──────────────────────────────────────
 * ① 侧栏入口 S1 已落：LayoutV2 NAV_GROUPS observability 组 { V2Debug, /v2/debug,
 *    v2.nav.debug, ri-terminal-line }，点击跳 /v2/debug 由 src/layouts/__tests__/LayoutV2.test.ts
 *    既有 LEAVES it.each 断言（S11b 追加段钉归组顺序与占位文案边界）。
 * ② 路由 S1 已注册：V2Debug → /v2/debug → @/views-v2/debug/Debug.vue，
 *    meta { title: 'v2.page.debug', permission: 'route:edit' } —— 断言在
 *    src/router/v2.routing.test.ts S11b 追加段（对齐 V2Canvas 行写法，不改既有行）。
 * ③ 故 S11b-C 的实现落点 = Debug.vue 原地替换；「该分组将在后续步骤开放」
 *    （v2.nav.systemEmpty）与调试台入口无关：它只挂在零可见条目的分组（现为 system 组），
 *    随 system 组首个条目实装才退场，S11b 不动它。
 *
 * ── 裁决⑦ 两段阶段时间线（原型「逐跳瀑布」不实现）──────────────────────────
 * 影子请求跳过统计（S11a②：MetricsPlugin 早退 + PluginExecutionStats 守卫）→ 无逐插件耗时
 * 数据源，造数违反「缺口不造数」。时间线 = 恰两段：dbg-phase-sim（simulate 静态预测段，
 * 无耗时数字）+ dbg-phase-fwd（转发段，latency_ms 墙钟）。F2 以源码 grep 钉死不回潮。
 *
 * ── 截断语义裁决（按 S11a DebugReplayService 源码核实）──────────────────────
 * 后端把 body >64KB 截为 65536 字符前缀，但【不下发截断标记字段】（响应 Map 仅
 * simulate/status/latency_ms/headers/body 五键）。故前端唯一诚实信号 = body 长度：
 * typeof body === 'string' && body.length >= 65536（MAX_BODY_CHARS=64*1024）→ 显示
 * truncated 文案「响应体超过 64KB 已截断」；否则一律不渲染 dbg-truncated。
 * （恰为 65536 的未截断响应会误报 —— 概率可忽略，且契约要求「仅当超长」即此口径。）
 *
 * ── simulate 结构映射裁决（RouteSimulateService.simulate 源码为权威）──────────
 * simulate 段原样内嵌：matched:boolean；route{id,route_name,route_type,path,upstream_url}|null；
 * evaluated[]（逐路由 {route_id,route_name,route_type,matched,path_matched,reason}）；
 * dispatch?（仅 DISPATCH 命中时的条件求值 trace）；plugins{global_pre,route,global_post}
 * （三段数组，元素为插件摘要）；request{path,method}。
 * 预测命中卡消费：matched=true → dbg-sim-route-name/dbg-sim-route-path + dbg-sim-plugins
 * 三段【计数】（只数量，无任何耗时）；matched=false → dbg-sim-unmatched（simUnmatched 文案）。
 * evaluated/dispatch 明细 S11b 不展开（原型 09 无此面板，留 S 后续按需）。
 *
 * ── API mock 面（vi.mock 全量导出 = 页面允许的 import 面，Chain 头注同款固化）──
 * vi.mock('@/api/debug')  → 运行时成员仅 debugReplay（DebugReplayPayload/DebugReplayResult
 *   为 TS 类型，编译期消失，mock 面不固化类型成员）。
 * vi.mock('@/api/routes') → 仅导出 listRoutes（路由选择器数据源，RouteNode.id 为 Long→String
 *   字符串，回填用 node.path）。禁用名单（页面 import 即红 —— mock 不导出）：getRoute /
 *   listBindings / bindPlugin / getRouteVersions / publishRoute / getCanvas / applyCanvas 等。
 * 另 mock：@/composables/usePermission（hasPermission/hasAnyPermission/canEdit）。
 * 不 mock useFcConfirm：调试发送【不做二次确认】—— 副作用靠常驻警示横幅（裁决，对齐
 *   「写操作幂等」之外的交互克制；重试即重放同一实参，风险已被横幅声明）。
 *
 * ── 发送 payload 组装契约 ────────────────────────────────────────────────
 * { path: dbg-path 原文, method: dbg-method value, headers/query: 非空键（trim）行收进
 *   Map（键非空即收、值可为空串），body: textarea trim 后为空 → null，否则原文 }。
 * 路由选择：选中 → route_id 传 node.id；未选/清除 → 传 null（封装层恒传空串，见
 *   src/api/debug.test.ts「裁决」段）。
 *
 * ── 历史裁决⑨ ───────────────────────────────────────────────────────────
 * 仅内存（组件实例内数组），最近 10 条 FIFO 淘汰；行 testid 用【递增发送序号】
 * dbg-history-item-{seq}（seq 从 1 起，最新在前），淘沠除名不 shift 他人；行文本含
 * method + path + 响应 status；点击全量回填表单（method/path/headers/query/body）；
 * 失败的发送【不进】历史（无 status 可显）；重挂载（≈刷新）即空 —— 无任何持久化。
 *
 * ── DOM 契约（data-testid 前缀 dbg-，全表）────────────────────────────────
 * dbg-page（根，任何状态都在 —— 含权限只读态）
 * dbg-warning（副作用警示横幅：有操作面即【进页渲染】，先于任何发送；文案含
 *   warningTitle + warning，warning 文案必须含「真实触达上游」语义）
 * dbg-readonly（canEdit('route')=false 只读提示 = readonly 文案；此时 form/warning/
 *   send/history 全部退场，dbg-page 仍在）
 * dbg-form（请求构造卡）
 * dbg-method（原生 <select>，option value 恰 GET/POST/PUT/DELETE 四值，缺省 GET；
 *   testid 落原生元素 —— Publish pub-desc-input 同款约定，el-select 弹层 jsdom 不可驱动）
 * dbg-path（原生 input，必填）
 * dbg-path-error（path 为空点发送 → pathRequired 提示，不发请求）
 * dbg-route-picker（路由选择器容器；dbg-route-search 搜索框 + dbg-route-opt-{id}
 *   选项行（route_name + path 文本；data-selected="true" 标选中）+ dbg-route-clear 清除钮；
 *   搜索按 route_name/path 客户端子串过滤；listRoutes 失败 → routeLoadFailed 提示且
 *   不阻断手填主流程；未选路由渲染 routeSelectEmpty 空态行 dbg-route-empty）
 * dbg-route-clear 语义：只清 route_id 选中态，不清已回填/手改的 path（裁决⑩ 并存）
 * dbg-headers / dbg-query（KV 容器，初始各含一空行）
 * dbg-header-key-{i} / dbg-header-value-{i} / dbg-header-del-{i} / dbg-header-add（i 从 0）
 * dbg-query-key-{i} / dbg-query-value-{i} / dbg-query-del-{i} / dbg-query-add
 * dbg-body（原生 textarea）
 * dbg-send（发送钮 = send 文案；in-flight 禁用 + sending 文案，handler 层亦守卫防重复）
 * dbg-error（失败错误条：err.code 10601 → errRouteNotPublished 文案 / 10607 →
 *   errGatewayUnreachable / 其它 → errGeneric + err.message）
 * dbg-retry（重试钮：以上次完全相同的实参再调 debugReplay；成功后 error 态退场）
 * dbg-result（响应区，首次成功后渲染）
 * dbg-status-badge（text 含状态码；data-band="2xx|4xx|5xx|other" 徽色契约）
 * dbg-latency（latency_ms 文本，含毫秒数值）
 * dbg-resp-headers（响应头列表，行 dbg-resp-hdr-row，行文本含 header 名与值）
 * dbg-resp-body（body 文本；body null → emptyBody 文案）
 * dbg-truncated（截断提示 = truncated 文案；仅 body.length>=65536 渲染，见截断裁决）
 * dbg-simulate（预测命中卡）
 * dbg-sim-route-name / dbg-sim-route-path（命中路由名/路径 = simulate.route）
 * dbg-sim-unmatched（matched=false → simUnmatched 文案；命中卡字段退场）
 * dbg-sim-plugins（simPlugins + 三段计数（N·N·N 形态即可），无任何耗时文案）
 * dbg-timeline（两段阶段时间线容器；子节点 [data-testid^="dbg-phase"] 恰 2 个；首发送前不渲染）
 * dbg-phase-sim（phaseSimulate + phaseSimHint 文案；不得含 ms 耗时数字）
 * dbg-phase-fwd（phaseForward + phaseForwardHint + latency_ms 数值）
 * dbg-history（历史卡：historyTitle + historyHint 常驻；空态行 dbg-history-empty = historyEmpty）
 * dbg-history-item-{seq}（历史行，seq 递增序号、最新在前；点击回填表单）
 *
 * ── i18n key 全表（v2.debug.*，zh/en 同步加，铁律 6；45 个）──────────────────
 * warning / warningTitle / formTitle / method / path / pathPlaceholder / pathRequired /
 * headers / query / keyPlaceholder / valuePlaceholder / body / bodyPlaceholder / addRow /
 * routePickerLabel / routeSearchPlaceholder / routeSelectEmpty / routeClear / routeLoadFailed /
 * send / sending / readonly / simulateTitle / simMatched / simUnmatched / simPlugins /
 * timelineTitle / phaseSimulate / phaseSimHint / phaseForward / phaseForwardHint /
 * responseTitle / status / latency / respHeaders / respBody / truncated / emptyBody /
 * historyTitle / historyEmpty / historyHint / errRouteNotPublished / errGatewayUnreachable /
 * errGeneric / retry
 * 铁律：不引用 v2.canvas.* / v2.chain.* / route.* 既有树（裁决⑧）—— F3 源码 grep 钉死。
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
  debugReplay: vi.fn(),
  listRoutes: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

// 页面允许 import 的运行时成员仅 debugReplay（类型成员编译期消失，mock 面不固化）
vi.mock('@/api/debug', () => ({
  debugReplay: mocks.debugReplay
}))
// 仅导出 listRoutes；getRoute/listBindings/… 属禁用名单，页面 import 即红（见头注 API 面）
vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import Debug from '@/views-v2/debug/Debug.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（Publish.test.ts 同款）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Debug.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures（S11a DebugReplayService / RouteSimulateService 返回 Map 原形状，snake_case）──

/** 路由选择器数据源 RouteNode（Long→String 下 id 为字符串；回填字段 = path） */
function makeRouteNode(f: { id: string; route_name: string; route_type?: 'DISPATCH' | 'BACKEND'; path?: string }) {
  return {
    id: f.id,
    route_name: f.route_name,
    route_type: f.route_type ?? 'BACKEND',
    path: f.path,
    upstream_url: '',
    status: 'PUBLISHED',
    sort_order: 1,
    remark: '',
    tags: '',
    config_version: '7',
    created_at: 1793750400000,
    updated_at: 1793750400000,
    plugins: [] as unknown[],
    children: [] as unknown[]
  }
}

function defaultRoutes() {
  return [
    makeRouteNode({ id: '5001', route_name: '用户服务分发', route_type: 'DISPATCH', path: '/api/u/**' }),
    makeRouteNode({ id: '5002', route_name: '订单服务', path: '/api/o/**' }),
    makeRouteNode({ id: '5003', route_name: '商品服务', path: '/api/p/**' })
  ]
}

/** simulate 预测段（RouteSimulateService.simulate 返回形状，见头注映射裁决） */
function makeSimulate(over: Record<string, unknown> = {}) {
  return {
    matched: true,
    route: { id: '5001', route_name: '用户服务分发', route_type: 'DISPATCH', path: '/api/u/**', upstream_url: '' },
    evaluated: [
      { route_id: '5001', route_name: '用户服务分发', route_type: 'DISPATCH', matched: true, path_matched: true, reason: 'path 匹配且排序最前（命中）' },
      { route_id: '5002', route_name: '订单服务', route_type: 'BACKEND', matched: false, path_matched: false, reason: 'path 不匹配：路由 /api/o/** vs 请求 /api/u/1' }
    ],
    plugins: {
      global_pre: [{ id: '81', plugin_id: 'sign', plugin_name: '签名校验', plugin_type: 'BUILTIN', plugin_phase: 'PRE', sort_order: 1 }],
      route: [
        { plugin_id: '82', plugin_name: '路由JWT校验', plugin_type: 'BUILTIN', plugin_phase: 'PRE', plugin_status: 'ENABLED', sort_order: 1, binding_config: '{}', bound_route_id: '5001', bound_route_name: '用户服务分发' },
        { plugin_id: '83', plugin_name: '路由日志采样', plugin_type: 'BUILTIN', plugin_phase: 'POST', plugin_status: 'ENABLED', sort_order: 2, binding_config: '{}', bound_route_id: '5001', bound_route_name: '用户服务分发' }
      ],
      global_post: [{ id: '85', plugin_id: 'logging', plugin_name: '日志采样', plugin_type: 'BUILTIN', plugin_phase: 'POST', sort_order: 1 }]
    },
    request: { path: '/api/u/1', method: 'POST' },
    ...over
  }
}

/** replay 响应五键（snake_case；body 缺省远小于 64KB） */
function makeReplay(over: { simulate?: Record<string, unknown> } & Record<string, unknown> = {}) {
  const { simulate, ...rest } = over
  return {
    simulate: makeSimulate(simulate ?? {}),
    status: 200,
    latency_ms: 37,
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': 't-9f2c' },
    body: '{"ok":true}',
    ...rest
  }
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/debug', component: Debug as any },
      { path: '/v2/routes', component: stub }
    ]
  })
  await router.push('/v2/debug')
  await router.isReady()
  const wrapper = mount(Debug, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)

/** 发送一次并等 Promise 落地 */
async function send(w: VueWrapper<any>) {
  await one(w, 'dbg-send').trigger('click')
  await flushPromises()
}

/** 填第 i 条 KV 行（容器 headers|query）；i=0 用初始空行，i>0 先点 add */
async function fillKV(w: VueWrapper<any>, kind: 'header' | 'query', i: number, key: string, value: string) {
  if (i > 0) {
    await one(w, `dbg-${kind}-add`).trigger('click')
    await flushPromises()
  }
  await one(w, `dbg-${kind}-key-${i}`).setValue(key)
  await one(w, `dbg-${kind}-value-${i}`).setValue(value)
}

/** 选中路由（先搜后点，链 S10b selectRoute 手法） */
async function selectRoute(w: VueWrapper<any>, id = '5001') {
  await one(w, `dbg-route-opt-${id}`).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.debugReplay.mockReset().mockResolvedValue(makeReplay())
  mocks.listRoutes.mockReset().mockResolvedValue(defaultRoutes().map((r) => ({ ...r })))
  mocks.canEdit.mockReturnValue(true)
})

const KEYS = ['warning', 'warningTitle', 'formTitle', 'method', 'path', 'pathPlaceholder', 'pathRequired',
  'headers', 'query', 'keyPlaceholder', 'valuePlaceholder', 'body', 'bodyPlaceholder', 'addRow',
  'routePickerLabel', 'routeSearchPlaceholder', 'routeSelectEmpty', 'routeClear', 'routeLoadFailed',
  'send', 'sending', 'readonly', 'simulateTitle', 'simMatched', 'simUnmatched', 'simPlugins',
  'timelineTitle', 'phaseSimulate', 'phaseSimHint', 'phaseForward', 'phaseForwardHint',
  'responseTitle', 'status', 'latency', 'respHeaders', 'respBody', 'truncated', 'emptyBody',
  'historyTitle', 'historyEmpty', 'historyHint', 'errRouteNotPublished', 'errGatewayUnreachable',
  'errGeneric', 'retry']
  .map((k) => `v2.debug.${k}`)

// ── i18n ──────────────────────────────────────────────────────────────────
describe('v2 debug — i18n key 全表双语存在（铁律 6，v2.debug.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 副作用警示与权限门禁 ──────────────────────────────────────────────────
describe('副作用警示横幅与只读门禁（S11b 契约「副作用警示文案」）', () => {
  it('进页即见警示横幅（先于任何发送）：warningTitle + warning 文案，且必须含「真实触达上游」语义', async () => {
    const { wrapper } = await factory()
    const warning = one(wrapper, 'dbg-warning')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain(t('v2.debug.warningTitle'))
    expect(warning.text()).toContain(t('v2.debug.warning'))
    expect(t('v2.debug.warning')).toMatch(/真实触达|真实请求|真实流量/)
    // 无发送前无响应区/时间线
    expect(one(wrapper, 'dbg-result').exists()).toBe(false)
    expect(one(wrapper, 'dbg-timeline').exists()).toBe(false)
  })

  it("canEdit('route')=false → form/send/warning/history 退场，dbg-readonly 提示渲染，dbg-page 仍在", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-page').exists()).toBe(true)
    expect(one(wrapper, 'dbg-readonly').text()).toContain(t('v2.debug.readonly'))
    expect(one(wrapper, 'dbg-form').exists()).toBe(false)
    expect(one(wrapper, 'dbg-send').exists()).toBe(false)
    expect(one(wrapper, 'dbg-warning').exists()).toBe(false)
    expect(one(wrapper, 'dbg-history').exists()).toBe(false)
    expect(mocks.debugReplay).not.toHaveBeenCalled()
  })
})

// ── 表单 ──────────────────────────────────────────────────────────────────
describe('表单 — method 预置 / path 必填 / KV 行 / body', () => {
  it('method 预置恰 GET/POST/PUT/DELETE 四 option，缺省 GET；dbg-path 初始为空', async () => {
    const { wrapper } = await factory()
    const method = one(wrapper, 'dbg-method')
    expect(method.exists()).toBe(true)
    const values = method.findAll('option').map((o) => (o.element as HTMLOptionElement).value)
    expect(values).toEqual(['GET', 'POST', 'PUT', 'DELETE'])
    expect((method.element as HTMLSelectElement).value).toBe('GET')
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe('')
  })

  it('headers/query 初始各一空行；add 增行、del 减行；键名/键值占位 = keyPlaceholder/valuePlaceholder', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="dbg-header-key-"]').length).toBe(1)
    expect(wrapper.findAll('[data-testid^="dbg-query-key-"]').length).toBe(1)
    await one(wrapper, 'dbg-header-add').trigger('click')
    await flushPromises()
    await one(wrapper, 'dbg-query-add').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="dbg-header-key-"]').length).toBe(2)
    expect(wrapper.findAll('[data-testid^="dbg-query-key-"]').length).toBe(2)
    await one(wrapper, 'dbg-header-del-1').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="dbg-header-key-"]').length).toBe(1)
    expect(one(wrapper, 'dbg-header-key-0').attributes('placeholder')).toContain(t('v2.debug.keyPlaceholder'))
    expect(one(wrapper, 'dbg-header-value-0').attributes('placeholder')).toContain(t('v2.debug.valuePlaceholder'))
  })

  it('path 为空点发送 → dbg-path-error（pathRequired）且 debugReplay 不被调用', async () => {
    const { wrapper } = await factory()
    await send(wrapper)
    expect(one(wrapper, 'dbg-path-error').text()).toContain(t('v2.debug.pathRequired'))
    expect(mocks.debugReplay).not.toHaveBeenCalled()
  })

  it('dbg-body 为原生 textarea；bodyPlaceholder 占位生效', async () => {
    const { wrapper } = await factory()
    const body = one(wrapper, 'dbg-body')
    expect(body.exists()).toBe(true)
    expect(body.element.tagName).toBe('TEXTAREA')
    expect(body.attributes('placeholder')).toContain(t('v2.debug.bodyPlaceholder'))
  })
})

// ── 路由选择器（裁决⑩ 辅助回填与手动输入并存）───────────────────────────────
describe('路由选择器 — 辅助回填 path，与手动输入并存（裁决⑩）', () => {
  it('listRoutes 渲染选项行（route_name + path 文本）；未选路由时 dbg-route-empty 空态', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-route-picker').text()).toContain(t('v2.debug.routePickerLabel'))
    expect(one(wrapper, 'dbg-route-empty').text()).toContain(t('v2.debug.routeSelectEmpty'))
    expect(one(wrapper, 'dbg-route-opt-5001').text()).toContain('用户服务分发')
    expect(one(wrapper, 'dbg-route-opt-5001').text()).toContain('/api/u/**')
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
  })

  it('搜索按 route_name/path 客户端过滤、清空恢复（Chain S10b-B2 同款）', async () => {
    const { wrapper } = await factory()
    const optIds = () => wrapper.findAll('[data-testid^="dbg-route-opt-"]').map((o) => o.attributes('data-testid'))
    await one(wrapper, 'dbg-route-search').setValue('订单')
    expect(optIds()).toEqual(['dbg-route-opt-5002'])
    await one(wrapper, 'dbg-route-search').setValue('/api/p')
    expect(optIds()).toEqual(['dbg-route-opt-5003'])
    await one(wrapper, 'dbg-route-search').setValue('')
    expect(optIds()).toEqual(['dbg-route-opt-5001', 'dbg-route-opt-5002', 'dbg-route-opt-5003'])
  })

  it('选中路由 → data-selected + dbg-path 回填 route.path；随后手动改写 path 生效（并存）', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper, '5001')
    expect(one(wrapper, 'dbg-route-opt-5001').attributes('data-selected')).toBe('true')
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe('/api/u/')
    // 手动改写后以手写值发送 —— 选择器只回填一次，不锁输入
    await one(wrapper, 'dbg-path').setValue('/api/u/42')
    await setMethodAndSend(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith('5001',
      expect.objectContaining({ path: '/api/u/42' }))
    expect(one(wrapper, 'dbg-path-error').exists()).toBe(false)
  })

  it('dbg-route-clear 只清选中态（route_id 回到 null），不清已回填的 path（裁决⑩）', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper, '5001')
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe('/api/u/')
    await one(wrapper, 'dbg-route-clear').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'dbg-route-opt-5001').attributes('data-selected')).not.toBe('true')
    expect(one(wrapper, 'dbg-route-empty').exists()).toBe(true)
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe('/api/u/')
    await setMethodAndSend(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith(null, expect.objectContaining({ path: '/api/u/' }))
  })

  it('listRoutes reject → routeLoadFailed 提示，选择器降级但手填主流程不被阻断', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('routes down'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-route-picker').text()).toContain(t('v2.debug.routeLoadFailed'))
    await one(wrapper, 'dbg-path').setValue('/api/manual')
    await setMethodAndSend(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith(null, expect.objectContaining({ path: '/api/manual' }))
  })

  // ── V 轮实播评审缺陷②回归：回填剥尾部 glob，字面 ** 不上行（字面 ** 会让网关 500）──
  it.each([
    ['/a/b/**', '/a/b/'],
    ['/v8rev/**', '/v8rev/'],
    ['/e2e/e2e_pub_mvvsu52o483/*', '/e2e/e2e_pub_mvvsu52o483/'],
    ['/exact/path', '/exact/path'],
    ['/exact', '/exact']
  ])('路由 path %s 选中 → dbg-path 回填 %s（尾部 glob 剥掉、精确 path 原样）', async (routePath, expected) => {
    mocks.listRoutes.mockResolvedValue([makeRouteNode({ id: '6001', route_name: 'glob 路由', path: routePath })])
    const { wrapper } = await factory()
    await selectRoute(wrapper, '6001')
    expect(one(wrapper, 'dbg-route-opt-6001').attributes('data-selected')).toBe('true')
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe(expected)
  })

  it('回填值即发送值：glob 剥离后的 path 上行，字面 ** 不再出现在 payload', async () => {
    mocks.listRoutes.mockResolvedValue([makeRouteNode({ id: '6001', route_name: 'glob 路由', path: '/a/b/**' })])
    const { wrapper } = await factory()
    await selectRoute(wrapper, '6001')
    await setMethodAndSend(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith('6001', expect.objectContaining({ path: '/a/b/' }))
    const sentPath = mocks.debugReplay.mock.calls[0][1].path
    expect(String(sentPath)).not.toContain('*')
  })

  it('回填剥 glob 不锁输入：剥尾后仍可手改 path 并按手写值发送（并存语义不变）', async () => {
    mocks.listRoutes.mockResolvedValue([makeRouteNode({ id: '6001', route_name: 'glob 路由', path: '/a/b/**' })])
    const { wrapper } = await factory()
    await selectRoute(wrapper, '6001')
    await one(wrapper, 'dbg-path').setValue('/a/b/42')
    await setMethodAndSend(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith('6001', expect.objectContaining({ path: '/a/b/42' }))
  })
})

/** 快捷：POST + path 已填 + 发送（各选择器用例复用） */
async function setMethodAndSend(w: VueWrapper<any>) {
  await one(w, 'dbg-method').setValue('POST')
  await send(w)
}

// ── 发送主流程 ────────────────────────────────────────────────────────────
describe('发送 → debugReplay 恰一次（route_id 取选中或空）', () => {
  it('完整表单 + 选中路由 → debugReplay(routeId, 五分量 payload) 恰一次', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper, '5001')
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await one(wrapper, 'dbg-method').setValue('POST')
    await fillKV(wrapper, 'header', 0, 'X-Debug', '1')
    await fillKV(wrapper, 'query', 0, 'uid', '9')
    await one(wrapper, 'dbg-body').setValue('{"k":1}')
    await send(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledTimes(1)
    expect(mocks.debugReplay).toHaveBeenCalledWith('5001', {
      path: '/api/u/1',
      method: 'POST',
      headers: { 'X-Debug': '1' },
      query: { uid: '9' },
      body: '{"k":1}'
    })
  })

  it('未选路由 → route_id 实参为 null（空串恒传由封装层负责，见 src/api/debug.test.ts）', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/o/7')
    await send(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledTimes(1)
    expect(mocks.debugReplay).toHaveBeenCalledWith(null,
      expect.objectContaining({ path: '/api/o/7', method: 'GET' }))
  })

  it('空键 KV 行不进 payload、值空串保留；body 全空白 → null（GET 回放常态）', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u')
    await fillKV(wrapper, 'header', 0, '', 'ignored')
    await fillKV(wrapper, 'query', 0, 'uid', '')
    await fillKV(wrapper, 'header', 1, 'X-Empty', '')
    await one(wrapper, 'dbg-body').setValue('   ')
    await send(wrapper)
    expect(mocks.debugReplay).toHaveBeenCalledWith(null, {
      path: '/api/u',
      method: 'GET',
      headers: { 'X-Empty': '' },
      query: { uid: '' },
      body: null
    })
  })

  it('in-flight 防重复：dbg-send 禁用 + sending 文案，重复点击不重入；落定后恢复 send 文案', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    let release!: (v: unknown) => void
    mocks.debugReplay.mockImplementationOnce(() => new Promise((res) => { release = res }))
    await send(wrapper)
    const btn = one(wrapper, 'dbg-send')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain(t('v2.debug.sending'))
    await btn.trigger('click')
    await flushPromises()
    expect(mocks.debugReplay).toHaveBeenCalledTimes(1)
    release(makeReplay())
    await flushPromises()
    expect(one(wrapper, 'dbg-send').attributes('disabled')).toBeUndefined()
    expect(one(wrapper, 'dbg-send').text()).toContain(t('v2.debug.send'))
    expect(one(wrapper, 'dbg-result').exists()).toBe(true)
  })
})

// ── 响应查看器 ────────────────────────────────────────────────────────────
describe('响应查看器 — status 徽色 / latency / headers / body / 截断（裁决见头注）', () => {
  it('成功 200：dbg-result + 状态徽标 data-band="2xx" + latency_ms + 响应头 2 行 + body 文本', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    expect(one(wrapper, 'dbg-result').text()).toContain(t('v2.debug.responseTitle'))
    const badge = one(wrapper, 'dbg-status-badge')
    expect(badge.text()).toContain('200')
    expect(badge.attributes('data-band')).toBe('2xx')
    expect(one(wrapper, 'dbg-latency').text()).toContain('37')
    expect(one(wrapper, 'dbg-resp-headers').text()).toContain(t('v2.debug.respHeaders'))
    const rows = wrapper.findAll('[data-testid="dbg-resp-hdr-row"]')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('Content-Type')
    expect(rows[0].text()).toContain('application/json')
    expect(rows.map((r) => r.text()).join(' ')).toContain('X-Trace-Id')
    expect(rows.map((r) => r.text()).join(' ')).toContain('t-9f2c')
    expect(one(wrapper, 'dbg-resp-body').text()).toContain('{"ok":true}')
    expect(one(wrapper, 'dbg-truncated').exists()).toBe(false)
  })

  it('4xx/5xx 徽色带：404 → data-band="4xx"、502 → data-band="5xx"（上游真实状态码原样）', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    mocks.debugReplay.mockResolvedValueOnce(makeReplay({ status: 404 }))
    await send(wrapper)
    expect(one(wrapper, 'dbg-status-badge').attributes('data-band')).toBe('4xx')
    mocks.debugReplay.mockResolvedValueOnce(makeReplay({ status: 502 }))
    await send(wrapper)
    expect(one(wrapper, 'dbg-status-badge').attributes('data-band')).toBe('5xx')
  })

  it('body null → dbg-resp-body 显示 emptyBody 文案；截断提示不渲染', async () => {
    mocks.debugReplay.mockResolvedValue(makeReplay({ body: null }))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u')
    await send(wrapper)
    expect(one(wrapper, 'dbg-resp-body').text()).toContain(t('v2.debug.emptyBody'))
    expect(one(wrapper, 'dbg-truncated').exists()).toBe(false)
  })

  it('截断裁决：body 恰 65536 字符（MAX_BODY_CHARS 前缀）→ dbg-truncated（truncated 文案）；短 body 不渲染', async () => {
    mocks.debugReplay.mockResolvedValue(makeReplay({ body: 'x'.repeat(64 * 1024) }))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/big')
    await send(wrapper)
    expect(one(wrapper, 'dbg-truncated').text()).toContain(t('v2.debug.truncated'))
    expect(t('v2.debug.truncated')).toMatch(/64KB/)
    mocks.debugReplay.mockResolvedValueOnce(makeReplay({ body: 'short' }))
    await send(wrapper)
    expect(one(wrapper, 'dbg-truncated').exists()).toBe(false)
  })

  it('截断阈值边界：65535 字符不提示（后端仅截 >65536 的体，长度即唯一诚实信号）', async () => {
    mocks.debugReplay.mockResolvedValue(makeReplay({ body: 'x'.repeat(64 * 1024 - 1) }))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/big')
    await send(wrapper)
    expect(one(wrapper, 'dbg-truncated').exists()).toBe(false)
  })
})

// ── 预测命中卡（simulate 段）──────────────────────────────────────────────
describe('预测命中卡 — simulate 结构映射（头注映射裁决）', () => {
  it('matched=true：命中卡含 simulateTitle/simMatched + 路由名/路径 + 插件链三段计数（无耗时）', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    const card = one(wrapper, 'dbg-simulate')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain(t('v2.debug.simulateTitle'))
    expect(card.text()).toContain(t('v2.debug.simMatched'))
    expect(one(wrapper, 'dbg-sim-route-name').text()).toContain('用户服务分发')
    expect(one(wrapper, 'dbg-sim-route-path').text()).toContain('/api/u/**')
    const plugins = one(wrapper, 'dbg-sim-plugins')
    expect(plugins.text()).toContain(t('v2.debug.simPlugins'))
    // 三段计数 1·2·1（global_pre·route·global_post），只数量无耗时文案
    expect(plugins.text()).toMatch(/1/)
    expect(plugins.text()).toMatch(/2/)
  })

  it('matched=false：dbg-sim-unmatched（simUnmatched 文案）渲染，命中路由字段退场', async () => {
    mocks.debugReplay.mockResolvedValue(makeReplay({
      simulate: makeSimulate({ matched: false, route: null })
    }))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/nope')
    await send(wrapper)
    expect(one(wrapper, 'dbg-simulate').text()).toContain(t('v2.debug.simUnmatched'))
    expect(one(wrapper, 'dbg-sim-unmatched').exists()).toBe(true)
    expect(one(wrapper, 'dbg-sim-route-name').exists()).toBe(false)
    expect(one(wrapper, 'dbg-sim-route-path').exists()).toBe(false)
  })
})

// ── 两段阶段时间线（裁决⑦：原型逐跳瀑布不实现）─────────────────────────────
describe('两段阶段时间线 — 预测段 + 转发段，无逐插件耗时（裁决⑦）', () => {
  it('首次成功后渲染：[data-testid^="dbg-phase"] 恰 2 个 = dbg-phase-sim + dbg-phase-fwd', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-timeline').exists()).toBe(false)
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    const timeline = one(wrapper, 'dbg-timeline')
    expect(timeline.text()).toContain(t('v2.debug.timelineTitle'))
    const phases = wrapper.findAll('[data-testid^="dbg-phase"]')
    expect(phases.length).toBe(2)
    const sim = one(wrapper, 'dbg-phase-sim')
    const fwd = one(wrapper, 'dbg-phase-fwd')
    expect(sim.exists()).toBe(true)
    expect(fwd.exists()).toBe(true)
    // DOM 序 = 执行序：预测段先于转发段
    expect(sim.text()).toContain(t('v2.debug.phaseSimulate'))
    expect(sim.text()).toContain(t('v2.debug.phaseSimHint'))
    expect(fwd.text()).toContain(t('v2.debug.phaseForward'))
    expect(fwd.text()).toContain(t('v2.debug.phaseForwardHint'))
    // 转发段墙钟 = latency_ms（37）
    expect(fwd.text()).toContain('37')
  })

  it('预测段不得出现耗时数字（静态预测无墙钟；转发段才有）', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    const simText = one(wrapper, 'dbg-phase-sim').text()
    expect(simText).not.toMatch(/\d+(?:\.\d+)?\s*ms/)
  })

  it('源码 grep：不回潮「逐跳瀑布」造数面（Chain H18 手法；裁决⑦）', () => {
    const template = readTemplate()
    expect(template).not.toMatch(/瀑布|waterfall/i)
    expect(template).not.toMatch(/逐插件|逐跳/)
    expect(template).not.toMatch(/p95/i)
  })

  it('源码 grep：i18n 只用 v2.debug.* 新树，不引用 v2.canvas/v2.chain/route.*（裁决⑧）', () => {
    const source = readSource()
    expect(source).not.toMatch(/\$?t\(\s*['"`](v2\.canvas\.|v2\.chain\.|route\.)/)
  })
})

// ── 历史（裁决⑨：仅内存最近 10 条，FIFO，点击回填）─────────────────────────
describe('历史 — 最近 10 条内存 FIFO，点击回填表单（裁决⑨）', () => {
  it('两次发送 → 行序最新在前（seq 递增 testid 不随插入移位），行文本含 method/path/status', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/first')
    mocks.debugReplay.mockResolvedValueOnce(makeReplay({ status: 201 }))
    await send(wrapper)
    await one(wrapper, 'dbg-path').setValue('/api/second')
    await send(wrapper)
    const ids = wrapper.findAll('[data-testid^="dbg-history-item-"]').map((r) => r.attributes('data-testid'))
    expect(ids).toEqual(['dbg-history-item-2', 'dbg-history-item-1'])
    expect(one(wrapper, 'dbg-history-item-2').text()).toContain('/api/second')
    expect(one(wrapper, 'dbg-history-item-2').text()).toContain('200')
    expect(one(wrapper, 'dbg-history-item-1').text()).toContain('/api/first')
    expect(one(wrapper, 'dbg-history-item-1').text()).toContain('201')
    // method 列：两次发送分别缺省 GET / 显式 POST（第二次未显式设，沿用缺省）
    expect(one(wrapper, 'dbg-history-item-1').text()).toContain('GET')
  })

  it('historyHint 常驻 + 点击旧行回填表单（method/path/body/KV 全量）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-history').text()).toContain(t('v2.debug.historyHint'))
    // 第一次发送带 KV 与 body 与 POST
    await one(wrapper, 'dbg-path').setValue('/api/first')
    await one(wrapper, 'dbg-method').setValue('POST')
    await fillKV(wrapper, 'header', 0, 'X-A', '1')
    await one(wrapper, 'dbg-body').setValue('{"a":1}')
    await send(wrapper)
    // 第二次发送换成 GET 短表单
    await one(wrapper, 'dbg-path').setValue('/api/second')
    await one(wrapper, 'dbg-method').setValue('GET')
    await one(wrapper, 'dbg-body').setValue('')
    await send(wrapper)
    // 点击旧行 → 回填第一次发送的完整表单
    await one(wrapper, 'dbg-history-item-1').trigger('click')
    await flushPromises()
    expect((one(wrapper, 'dbg-path').element as HTMLInputElement).value).toBe('/api/first')
    expect((one(wrapper, 'dbg-method').element as HTMLSelectElement).value).toBe('POST')
    expect((one(wrapper, 'dbg-body').element as HTMLTextAreaElement).value).toBe('{"a":1}')
    expect((one(wrapper, 'dbg-header-key-0').element as HTMLInputElement).value).toBe('X-A')
    expect((one(wrapper, 'dbg-header-value-0').element as HTMLInputElement).value).toBe('1')
  })

  it('FIFO：11 次发送恰留 10 行，最早一条（item-1）淘汰，最新（item-11）居首', async () => {
    const { wrapper } = await factory()
    for (let i = 1; i <= 11; i++) {
      await one(wrapper, 'dbg-path').setValue(`/api/n${i}`)
      await send(wrapper)
    }
    const rows = wrapper.findAll('[data-testid^="dbg-history-item-"]')
    expect(rows.length).toBe(10)
    expect(rows[0].attributes('data-testid')).toBe('dbg-history-item-11')
    expect(rows[0].text()).toContain('/api/n11')
    expect(one(wrapper, 'dbg-history-item-1').exists()).toBe(false)
    expect(one(wrapper, 'dbg-history-item-2').exists()).toBe(true)
  })

  it('失败发送不进历史；重挂载（≈刷新）历史即空 —— 仅内存无持久化（裁决⑨）', async () => {
    const first = await factory()
    await one(first.wrapper, 'dbg-path').setValue('/api/ok')
    await send(first.wrapper)
    mocks.debugReplay.mockRejectedValueOnce(new BusinessError(10607, '后端服务不可用'))
    await one(first.wrapper, 'dbg-path').setValue('/api/fail')
    await send(first.wrapper)
    const ids = first.wrapper.findAll('[data-testid^="dbg-history-item-"]').map((r) => r.attributes('data-testid'))
    expect(ids).toEqual(['dbg-history-item-1'])
    expect(one(first.wrapper, 'dbg-history-item-1').text()).toContain('/api/ok')
    // 重新挂载 = 刷新页面：历史空态
    const second = await factory()
    expect(one(second.wrapper, 'dbg-history-empty').text()).toContain(t('v2.debug.historyEmpty'))
    expect(second.wrapper.findAll('[data-testid^="dbg-history-item-"]').length).toBe(0)
  })

  it('历史空态：dbg-history-empty（historyEmpty）渲染，historyTitle 卡仍在', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'dbg-history').text()).toContain(t('v2.debug.historyTitle'))
    expect(one(wrapper, 'dbg-history-empty').text()).toContain(t('v2.debug.historyEmpty'))
  })
})

// ── 错误态与重试（10601 / 10607 / 其它）────────────────────────────────────
describe('错误态与重试 — 10601 路由未发布 / 10607 网关不可达', () => {
  it('BusinessError(10601) → dbg-error 文案 errRouteNotPublished，dbg-result 不渲染', async () => {
    mocks.debugReplay.mockRejectedValue(new BusinessError(10601, '路由未找到'))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    expect(one(wrapper, 'dbg-error').exists()).toBe(true)
    expect(one(wrapper, 'dbg-error').text()).toContain(t('v2.debug.errRouteNotPublished'))
    expect(one(wrapper, 'dbg-retry').exists()).toBe(true)
    expect(one(wrapper, 'dbg-result').exists()).toBe(false)
  })

  it('BusinessError(10607) → dbg-error 文案 errGatewayUnreachable', async () => {
    mocks.debugReplay.mockRejectedValue(new BusinessError(10607, '后端服务不可用'))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    expect(one(wrapper, 'dbg-error').text()).toContain(t('v2.debug.errGatewayUnreachable'))
  })

  it('其它错误 → errGeneric 兜底 + err.message 透出（脚本错误/未知码不误标 10601/10607 语义）', async () => {
    mocks.debugReplay.mockRejectedValue(new Error('boom'))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await send(wrapper)
    const err = one(wrapper, 'dbg-error')
    expect(err.text()).toContain(t('v2.debug.errGeneric'))
    expect(err.text()).toContain('boom')
    expect(err.text()).not.toContain(t('v2.debug.errRouteNotPublished'))
    expect(err.text()).not.toContain(t('v2.debug.errGatewayUnreachable'))
  })

  it('重试：以上次完全相同实参再调；第二次成功 → dbg-error 退场 + dbg-result 渲染', async () => {
    mocks.debugReplay.mockRejectedValueOnce(new BusinessError(10607, '后端服务不可用'))
    const { wrapper } = await factory()
    await one(wrapper, 'dbg-path').setValue('/api/u/1')
    await one(wrapper, 'dbg-method').setValue('POST')
    await send(wrapper)
    expect(one(wrapper, 'dbg-error').exists()).toBe(true)
    await one(wrapper, 'dbg-retry').trigger('click')
    await flushPromises()
    expect(mocks.debugReplay).toHaveBeenCalledTimes(2)
    expect(mocks.debugReplay).toHaveBeenLastCalledWith(null,
      expect.objectContaining({ path: '/api/u/1', method: 'POST' }))
    expect(one(wrapper, 'dbg-error').exists()).toBe(false)
    expect(one(wrapper, 'dbg-result').exists()).toBe(true)
  })
})
