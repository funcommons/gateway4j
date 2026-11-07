/**
 * S10a-T：v2 插件链页测试（全局 scope 五泳道）—— 契约 docs/ui-v2/实施契约.md §4 S10 行
 * （S10a/S10b 拆步裁决 10 条，2026-11-04）+ 视觉参照 prototype-v2/06-plugin-chain.html
 * 与 shots/06-plugin-chain.png。测试基座：Publish.test.ts（vi.hoisted/factory/it.each/dig）
 * + DecisionTree.test.ts（头注模式 + 源码 grep）。
 * 先红是预期：页面由 S10a-C 实现（当前为 V2PagePlaceholder 占位）。
 * S10b（路由级 scope 的 binding 泳道/排序/启停/join）测试在本文件尾部 S10b-T 追加段；
 * H16 的「点击路由级 tab 后五泳道保持渲染」语义被 S10b 保留（路由级也不卸载五泳道）。
 *
 * ── 数据源侦察（已裁决，C 按此实现）────────────────────────────────────────
 * ① 泳道 = 前端派生（引擎 PluginPhase 只有 PRE/POST，PluginExecutionFilter 为序权威）：
 *    lane1=GLOBAL+PRE、lane2=路由绑定+PRE、lane3=静态转发卡（网关核心·不可插拔）、
 *    lane4=绑定+POST、lane5=GLOBAL+POST。S10a 只填 lane1/lane5，lane2/lane4 留空占位。
 * ② 缺口不造数：每插件 p95/泳道耗时/合计开销/转发延迟/QPS 剩余/命中率/实例数一律不渲染；
 *    stats 仅 executed/skipped/error 计数（Long→String 兼容，原样字符串渲染，不做千分位）。
 * ③ 全局泳道数据 = listPlugins({ scope:'GLOBAL', ... })（分页形状 records/total，全状态含
 *    DISABLED——置灰排后），【不用】listGlobalPlugins（只回 ENABLED）。
 * ④ 无「保存编排」两段式：enable/disable + sortGlobalPlugins 即时落库（后端即时生效 + 配置
 *    推送），页面只放一句 syncHint 如实文案；「模拟一次执行」归 S11 不做。
 * ⑤ 市场区 = listBuiltinTypes()（按 builtinCategories 7 组分组；server category 优先，
 *    缺省 getBuiltinCategory(plugin_id) 兜底）∪ listPlugins 返回行的 JAR/GROOVY/GROUP 卡；
 *    已装判定 = gw_plugin 行 plugin_id 与 builtin type 的 plugin_id 比对 → 安装钮 disabled；
 *    安装 = createPlugin（payload 至少含 plugin_id + scope:'GLOBAL'，canEdit('plugin') 控制，
 *    成功后 reload 让新卡落泳道）；管理 = 跳旧路由 /plugins/:id/edit（导航不改动）。
 * ⑥ runtime 徽标 = getRuntimeStatus()（items 按 plugin_id 接线；registered→已接线）；
 *    available=false 或接口异常 → 静默降级无徽标不崩；JAR/GROOVY/GROUP 卡与接线无关不渲染
 *    徽标（沿用 Builtin.vue 先例）；stats 仅引擎上报的 item 渲染。
 * ⑦ 拖拽排序 = 手写 HTML5 DnD（搬 Global.vue:152-179）：@dragstart/@drop 绑定在
 *    chn-card-<id> 卡元素本身（jsdom 无坐标、事件无 dataTransfer，onDragStart 必须容错）；
 *    成功 → sortGlobalPlugins(phase, ids) 后 reload；失败 → reload 回滚 + action-error；
 *    loadEpoch 竞态防陈旧覆盖（随迁 Global.vue:97-117 模式）。
 * ⑧ 启停 = FcSwitch（testid 落根 button，FcSwitch inheritAttrs:false）：disable 需
 *    useFcConfirm().confirm({ variant:'danger' })，enable 直接；失败 → chn-action-error。
 * ⑨ 布局 = 纯 CSS grid 五列（1fr 1fr 200px 1fr 1fr）+ 375 横滚容器 chn-scroll
 *    （overflow-x:auto，包住五泳道 grid；无 SVG 需求）。
 *
 * ── API mock 面（vi.mock('@/api/plugins') 全量导出 = 页面允许的 import 面，头注固化）──
 * listPlugins / listBuiltinTypes / enablePlugin / disablePlugin / sortGlobalPlugins /
 * createPlugin / getRuntimeStatus
 * 禁用名单（页面 import 即红）：listGlobalPlugins（裁决③）/ getPlugin / updatePlugin /
 *   deletePlugin / validateConfig / getBuiltinSchema / validateGroovy。
 * 另 mock：@/composables/useFcConfirm（confirm）、@/composables/usePermission
 *   （hasPermission/hasAnyPermission/canEdit）—— 照 DecisionTree.test.ts 模式。
 *
 * ── i18n key 全表（v2.chain.*，zh/en 同步加，铁律 6；34 个 = 27 核心 + 7 分类结构性开销）──
 * subtitle / scopeGlobal / scopeRoute / routeScopeWip /
 * lanePreGlobal / lanePreRoute / laneForward / lanePostRoute / lanePostGlobal /
 * forwardCore / forwardNotPluggable / badgeGlobal / disabledLabel / addFromMarket /
 * marketTitle / marketBuiltin / marketInstall / marketInstalled / marketManage / marketCustom /
 * runtimeWired / runtimeUnwired / statsLabel('执行 {executed} · 跳过 {skipped} · 错误 {error}') /
 * syncHint / loadFailed / retry / actionFailed /
 * catSecurity / catRateLimit / catTrafficRewrite / catObservability / catTrafficControl /
 * catResponse / catOther
 * （cat* 与 src/views/plugins/builtinCategories.ts 的 BUILTIN_CATEGORIES 一一对应；
 *   不引用 plugin.category* 旧树 —— 契约 ⑨。）
 *
 * ── DOM 契约（data-testid 前缀 chn-，全表）────────────────────────────────
 * chn-page（根，加载失败也在）
 * chn-error / chn-retry（listPlugins 失败态错误条 + 重试按钮；retry 在重试挂起期间保持
 *   渲染可点 —— H12 竞态依赖，成功后错误态一并清除）
 * chn-action-error（启停/排序/安装失败错误条，文案优先取 e?.message，兜底 actionFailed）
 * chn-scope-tabs（作用域 tab 容器）；chn-scope-global / chn-scope-route（data-active="true"
 *   标激活；S10a 只激活 global；route tab 点击无动作或渲染 routeScopeWip 占位 —— S10b 实现）
 * chn-scroll（375 横滚容器，overflow-x:auto，包住五泳道 grid）
 * chn-lane-pre-global / chn-lane-pre-route / chn-lane-forward / chn-lane-post-route /
 *   chn-lane-post-global（五泳道，DOM 顺序 = 执行顺序；可插拔泳道头含 lane 标签 + 「×N」
 *   计数，N = 泳道卡数含停用；转发泳道无计数无插件卡）
 * chn-forward-card（转发静态卡：forwardCore + forwardNotPluggable 文案，无耗时数字）
 * chn-card-<plugin.id>（泳道插件卡：plugin_name + badgeGlobal 徽标；data-state=
 *   "enabled|disabled"；disabled 卡置灰类名含 'disabled' 且排 ENABLED 后；可编辑时卡元素
 *   draggable="true" 且绑定 @dragstart/@drop —— 可编程 reorder 入口，jsdom 直接 trigger）
 * chn-switch-<plugin.id>（启停 FcSwitch，click 触发 toggle；canEdit=false 不渲染）
 * chn-runtime-<plugin.id>（数据面接线徽标：runtimeWired/runtimeUnwired；仅 BUILTIN 卡；
 *   available=false / 自定义类型不渲染）
 * chn-stats-<plugin.id>（执行计数 statsLabel，字符串原样；item 无 stats 不渲染）
 * chn-add-<laneKey>（「从市场添加」dashed 占位，恒渲染 —— 对齐原型 06 非空泳道也渲染；
 *   laneKey ∈ pre-global|pre-route|post-route|post-global，转发泳道无）
 * chn-market（市场区根，头 marketTitle）
 * chn-market-cat-<BuiltinCategoryKey>（内置分组容器，头 = cat* 文案；无货分组不渲染）
 * chn-mkt-<plugin_id>（市场卡：名称 + 描述 + 类型徽标（内置 = marketBuiltin 文案；
 *   自定义 = plugin_type 原文 GROOVY/JAR/GROUP））
 * chn-mkt-install-<plugin_id>（安装钮；已装 disabled + marketInstalled 文案；
 *   canEdit=false 不渲染）
 * chn-mkt-manage-<plugin_id>（管理钮 → /plugins/<id>/edit；恒渲染 —— 只读导航）
 *
 * ── fixtures（与 src/api/plugins.ts 类型一致，snake_case）────────────────────
 * makePlugin({ plugin_id, plugin_name?, plugin_phase, scope, status, plugin_type, sort_order })
 *   → PluginItem（id 默认取 plugin_id，便于 testid/排序断言；listPlugins 回 Page 形状）；
 * makeBuiltinType(plugin_id, { plugin_name?, plugin_phase?, description?, category? })
 *   → BuiltinTypeMeta（category 缺省 = 服务端不下发，页面走 PLUGIN_CATEGORY_MAP 兜底）；
 * makeRuntimeStatus({ available?, items? }) → PluginRuntimeStatusResponse
 *   （stats 用字符串数字，验证 Long→String 直通）。
 *
 * ══════════ S10b-T 追加段（路由级 scope：选择器/绑定泳道/排序/启停/join）══════════
 * 契约：§4 S10 行 S10b 半步（~500 行）。上方 S10a 面保持不变；以下裁决只约束文件尾部的
 * S10b-* describe 块。先红是预期：当前页面为 S10a 实现（路由级 tab 点击只置 routeWip 占位）。
 *
 * ── API 面裁决（src/api/routes.ts 实际存在，已对 RouteController/RouteBindingService 核实）──
 * listRoutes()：路由选择器数据源。RouteNode 嵌入 plugins 数组无 binding_id → 不作绑定泳道
 *   数据源；惰性拉取 = 首次进入路由级 scope 才调，全局 scope 不发请求。
 * listBindings(routeId)：绑定泳道数据源 → GET /v1/routes/{id}/plugins。后端实际返回
 *   binding_id / route_id / plugin_id / plugin_name / plugin_phase / sort_order / binding_config，
 *   其中 plugin_id = gw_plugin 行主键（Long→String 后与 PluginItem.id 同域）。
 * sortRoutePlugins(routeId, pluginPhase, bindingIds)：绑定排序 → PUT /v1/routes/{id}/plugins/sort，
 *   body { plugin_phase, binding_ids }；binding_ids = 全 lane【绑定主键】全量提交（同
 *   sortGlobalPlugins 语义），成功 reload、失败 reload 回滚 + chn-action-error（裁决⑦随迁）。
 * 启停裁决：gw_route_plugin_binding 无 status 列、RouteBindingService 无绑定级 enable/disable
 *   —— 引擎 ConfigService.getRouteBoundPluginRows 只吃底层行 ENABLED → 绑定卡启停 =
 *   enablePlugin/disablePlugin(底层 gw_plugin 行主键)（@/api/plugins 既有成员；disable 需
 *   confirm({ variant:'danger' }) 模式沿用裁决⑦）；底层行状态 = 页面 join 全量 listPlugins
 *   （【不带 scope】的第二取数，路由级选中路由后发起；mock 分支：params.scope==='GLOBAL' →
 *   全局泳道页，其余 → 绑定 join 行页，两分支 fixture 见 routeBoundRows/defaultGlobalRows）。
 * 禁用名单（页面 import 即红 —— vi.mock('@/api/routes') 不导出）：bindPlugin / updateBinding /
 *   unbindPlugin / getPluginChain / getRoute 等 —— S10b 无绑定增删改配置流，绑定泳道
 *   chn-add-* 占位保持 S10a 静态渲染。
 *
 * ── POST 相序裁决（PluginExecutionFilter.compose L237-255 为序权威）──
 * PRE = 全局先、路由绑定后；POST = 路由绑定先、全局后（与 PRE 镜像）。路由级不重排五泳道
 * DOM 序（lane4 整体先于 lane5 执行）；join 语义（路由级链插在全局帧内、执行完回到全局后置链）
 * 由 chn-join-hint + routeJoinHint 文案钉住。
 *
 * ── 绑定泳道卡序裁决（与全局泳道唯一差异）──
 * 卡序 = binding sort_order 升序，停用卡【不】沉尾：后端 listBindings orderByAsc(sort_order)
 * 即权威序，绑定 sort_order 是每路由泳道的持久化序，状态分桶会与 sortRoutePlugins 全量提交
 * 打架 —— 停用卡仅置灰 + data-state="disabled" 标记（fixture 903 sort_order=0 刻意小于 902
 * 且停用，仍居 lane4 首位，钉死该差异）。
 *
 * ── S10b 新增 testid（chn-* 前缀延续，并入上表）──
 * chn-route-picker（路由选择器容器，仅路由级 scope 渲染）
 * chn-route-search（搜索输入，route_name + path 客户端子串过滤）
 * chn-route-opt-<route.id>（路由选项行 = route_name + path；data-selected="true" 标选中）
 * chn-route-empty（未选路由空态 = routeSelectEmpty；选中后退场）
 * chn-join-hint（join 语义提示 = routeJoinHint，仅路由级 scope 渲染）
 * 绑定卡复用 chn-card-<binding_id> / chn-switch-<binding_id> —— testid key 是 binding_id，
 *   启停 API 参数是底层行主键：fixture 刻意错位（binding 90x / 行主键 8x），传错即红。
 *
 * ── S10b 新增 i18n key（v2.chain.* 树，zh/en 同步；不引用 plugin.* 旧树）──
 * routePickerLabel / routeSearchPlaceholder / routeSelectEmpty / routeJoinHint / badgeRoute
 * （routeScopeWip 保留在 locale —— 既有 KEYS it.each 依赖；S10b 起页面不再渲染该占位，
 *   S10b-B1 断言其退场。）
 *
 * ══════════ S12-T 追加段（C-1 市场直达钮 + C-5 路由 tab 计数诚实化）══════════
 * 契约：docs/ui-v2/实施契约.md §4 S12 行 ①⑤（2026-11-07 用户裁决五项之 Chain 两项）。
 * 先红是预期；本步不动业务文件，既有用例一字未动。
 *
 * ── C-1 跳转目标裁决（T 侦察结论）────────────────────────────────────────
 * 旧 UI 的 JAR 上传与 Groovy 编写【没有】独立 per-type 路由、也没有 dialog：唯一入口 =
 * /plugins/new（router name PluginNew → src/views/plugins/Editor.vue），JAR/GROOVY 由
 * Editor 页内 FcSegmented plugin_type 选择（缺省 GROOVY，JAR 选中后出 FcDropZone 上传页签），
 * Editor 只读 route.params.id、不读 query —— 无法（也不应，旧 UI 零改动铁律）按类型深链。
 * 故两钮均 router.push('/plugins/new')，形态 = 独立路由（非 dialog）。
 * - testid：chn-market-upload-jar / chn-market-new-groovy，落市场区头（chn-market 头部
 *   marketTitle 同排）；恒渲染（只读导航，同 chn-mkt-manage-* 先例，权限由旧路由 meta
 *   plugin:edit 的全局守卫把守）。
 * - i18n：v2.chain.marketUploadJar（上传 JAR）/ v2.chain.marketNewGroovy（编写 Groovy），
 *   zh/en 同步。
 *
 * ── C-5 路由级 tab 计数诚实化（现有 DOM 裁决）────────────────────────────
 * chn-scope-route 内加计数徽标 testid=chn-scope-route-count（class 沿全局 tab 的 scope-n）：
 * - listRoutes 未惰性拉取（routesLoaded=false）→ 徽标不渲染（tab 文本无数字，现状保持，
 *   不为此新增前置请求）；
 * - 拉取成功 → 徽标文本 = 路由总数（listRoutes 行数，fixture 3 条 → '3'）；切回全局 scope
 *   徽标保留（routesLoaded 不回退）；
 * - listRoutes 失败（routes=[] 且 routesLoaded 仍 false）→ 徽标不渲染（数量未知不造数）。
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

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  listBuiltinTypes: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  createPlugin: vi.fn(),
  getRuntimeStatus: vi.fn(),
  // S10b-T 追加：路由级 binding 面（页面将 import 的全部成员 —— 契约⑩）
  listRoutes: vi.fn(),
  listBindings: vi.fn(),
  sortRoutePlugins: vi.fn(),
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  listBuiltinTypes: mocks.listBuiltinTypes,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  createPlugin: mocks.createPlugin,
  getRuntimeStatus: mocks.getRuntimeStatus
}))
// S10b-T：路由级 binding 面（只导出页面允许 import 的 3 个成员；bindPlugin/updateBinding/
// unbindPlugin/getPluginChain 等属禁用名单 —— 页面 import 即红，见头注 S10b 段）
vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  listBindings: mocks.listBindings,
  sortRoutePlugins: mocks.sortRoutePlugins
}))
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))

import Chain from '@/views-v2/plugins/Chain.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 Publish.test.ts / DecisionTree.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Chain.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

// ── fixtures（PluginItem / BuiltinTypeMeta / PluginRuntimeStatusResponse 原形状，snake_case）──

type PluginFixture = {
  plugin_id: string
  plugin_name?: string
  plugin_phase?: 'PRE' | 'POST'
  scope?: 'GLOBAL' | 'ROUTE'
  status?: 'ENABLED' | 'DISABLED'
  plugin_type?: 'BUILTIN' | 'JAR' | 'GROOVY' | 'GROUP'
  sort_order?: number
}

/** gw_plugin 行（PluginItem）：id 默认取 plugin_id（fixture 内唯一），断言与 testid 都好读 */
function makePlugin(f: PluginFixture) {
  return {
    id: f.plugin_id,
    plugin_name: f.plugin_name ?? f.plugin_id,
    plugin_id: f.plugin_id,
    plugin_type: f.plugin_type ?? 'BUILTIN',
    plugin_phase: f.plugin_phase ?? 'PRE',
    scope: f.scope ?? 'GLOBAL',
    status: f.status ?? 'ENABLED',
    sort_order: f.sort_order ?? 1,
    config: '{}',
    remark: ''
  }
}

/** listPlugins 分页返回形状（Page<PluginItem>：records/total/size/current/pages） */
function pageOf(records: ReturnType<typeof makePlugin>[]) {
  return { records, total: records.length, size: 20, current: 1, pages: 1 }
}

/**
 * 默认全局插件集（scope=GLOBAL 全状态）：
 * lane1（GLOBAL+PRE）= sign(1) + tracing(2) + security(DISABLED, sort_order=0) —— 停用卡
 *   sort_order 更小仍排最后，证明「置灰排后」不是 sort_order 顺序的副产品；
 * lane5（GLOBAL+POST）= logging(1) + groovy-split(2, GROOVY) + member-group(3, GROUP)
 *   + jar-retry(4, JAR) —— 后三张同时是市场自定义行；
 * lane2/lane4（路由绑定）= 空（S10a 只取 GLOBAL，天然空 → 占位断言）。
 */
function defaultGlobalRows() {
  return [
    makePlugin({ plugin_id: 'sign', plugin_name: '签名校验', plugin_phase: 'PRE', sort_order: 1 }),
    makePlugin({ plugin_id: 'tracing', plugin_name: '链路追踪', plugin_phase: 'PRE', sort_order: 2 }),
    makePlugin({ plugin_id: 'security', plugin_name: 'IP 黑名单', plugin_phase: 'PRE', status: 'DISABLED', sort_order: 0 }),
    makePlugin({ plugin_id: 'logging', plugin_name: '日志采样', plugin_phase: 'POST', sort_order: 1 }),
    makePlugin({ plugin_id: 'groovy-split', plugin_name: 'channel-split.groovy', plugin_phase: 'POST', plugin_type: 'GROOVY', sort_order: 2 }),
    makePlugin({ plugin_id: 'member-group', plugin_name: '聚合分组', plugin_phase: 'POST', plugin_type: 'GROUP', sort_order: 3 }),
    makePlugin({ plugin_id: 'jar-retry', plugin_name: 'upstream-retry.jar', plugin_phase: 'POST', plugin_type: 'JAR', sort_order: 4 })
  ]
}

/** BuiltinTypeMeta：category 缺省（不下发）时页面应走 PLUGIN_CATEGORY_MAP 兜底 */
function makeBuiltinType(pluginId: string, over: { plugin_name?: string; plugin_phase?: string; description?: string; category?: string } = {}) {
  const f: Record<string, unknown> = {
    plugin_id: pluginId,
    plugin_name: over.plugin_name ?? pluginId,
    plugin_phase: over.plugin_phase ?? 'PRE',
    description: over.description ?? '',
    config_schema: {}
  }
  if (over.category !== undefined) f.category = over.category
  return f
}

/** 默认内置类型：security 组 2 个（jwt 未装 / sign 已装）、observability 组 1 个（logging 已装）、
 *  cache 不带 category → 兜底 traffic-control 组（未装）。 */
function defaultBuiltinTypes() {
  return [
    makeBuiltinType('jwt', { plugin_name: 'JWT 鉴权', category: 'security', description: 'token 校验 + claims 注入' }),
    makeBuiltinType('sign', { plugin_name: '签名校验', category: 'security', description: 'HMAC 签名防重放' }),
    makeBuiltinType('logging', { plugin_name: '日志采样', category: 'observability', plugin_phase: 'POST', description: '访问日志记录' }),
    makeBuiltinType('cache', { plugin_name: '缓存', plugin_phase: 'POST', description: '响应缓存' })
  ]
}

/** PluginRuntimeStatusResponse：stats 用字符串数字（Long→String 直通契约） */
function makeRuntimeStatus(over: { available?: boolean; items?: unknown[] } = {}) {
  return {
    available: over.available ?? true,
    items: over.items ?? [
      { plugin_id: 'sign', phase: 'PRE', registered: true, updated_at: 1793750400000, stats: { executed: '1234', skipped: '5678', error: '9' } },
      { plugin_id: 'tracing', phase: 'PRE', registered: false, updated_at: 1793750400000 }
    ]
  }
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/plugins/chain', component: Chain as any },
      { path: '/plugins/:id/edit', component: stub },
      // S12-T：C-1 直达钮跳转目标（旧 UI 建插件唯一入口，静态段优先于 :id 动态段）
      { path: '/plugins/new', component: stub },
      { path: '/plugins', component: stub }
    ]
  })
  await router.push('/v2/plugins/chain')
  await router.isReady()
  const wrapper = mount(Chain, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
/** 泳道内插件卡（chn-card-*）按 DOM 顺序取 id */
const laneCards = (w: VueWrapper<any>, laneTid: string) =>
  w.find(`[data-testid="${laneTid}"]`).findAll('[data-testid^="chn-card-"]')
    .map((c) => (c.attributes('data-testid') ?? '').replace('chn-card-', ''))

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.listPlugins.mockReset().mockImplementation(() => Promise.resolve(pageOf(defaultGlobalRows().map((r) => ({ ...r })))))
  mocks.listBuiltinTypes.mockReset().mockImplementation(() => Promise.resolve(defaultBuiltinTypes()))
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.sortGlobalPlugins.mockReset().mockResolvedValue({})
  mocks.createPlugin.mockReset().mockResolvedValue({})
  mocks.getRuntimeStatus.mockReset().mockImplementation(() => Promise.resolve(makeRuntimeStatus()))
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
})

// S10b-T 取数分支（后注册后执行，覆盖上一条 listPlugins 实现；对 S10a 用例行为等价 ——
// 它们只以 scope:'GLOBAL' 调用，走同一全局页分支）：
// scope:'GLOBAL' → 全局泳道页；其余（无 scope 全量 / scope:'ROUTE'）→ 绑定 join 行页
beforeEach(() => {
  mocks.listRoutes.mockReset().mockImplementation(() => Promise.resolve(defaultRoutes().map((r) => ({ ...r }))))
  mocks.listBindings.mockReset().mockImplementation(() => Promise.resolve(defaultBindings().map((b) => ({ ...b }))))
  mocks.sortRoutePlugins.mockReset().mockResolvedValue({})
  mocks.listPlugins.mockImplementation((params?: { scope?: string }) =>
    params?.scope === 'GLOBAL'
      ? Promise.resolve(pageOf(defaultGlobalRows().map((r) => ({ ...r }))))
      : Promise.resolve(pageOf(routeBoundRows().map((r) => ({ ...r }))))
  )
})

const KEYS = ['subtitle', 'scopeGlobal', 'scopeRoute', 'routeScopeWip',
  'lanePreGlobal', 'lanePreRoute', 'laneForward', 'lanePostRoute', 'lanePostGlobal',
  'forwardCore', 'forwardNotPluggable', 'badgeGlobal', 'disabledLabel', 'addFromMarket',
  'marketTitle', 'marketBuiltin', 'marketInstall', 'marketInstalled', 'marketManage', 'marketCustom',
  'runtimeWired', 'runtimeUnwired', 'statsLabel', 'syncHint', 'loadFailed', 'retry', 'actionFailed',
  'catSecurity', 'catRateLimit', 'catTrafficRewrite', 'catObservability', 'catTrafficControl',
  'catResponse', 'catOther']
  .map((k) => `v2.chain.${k}`)

// ── H1 ────────────────────────────────────────────────────────────────────
describe('v2 chain — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── H2 ────────────────────────────────────────────────────────────────────
describe('H2 — 五泳道列序（DOM 顺序 = 执行顺序）', () => {
  it('五列固定顺序：全局前置 → 路由前置 → 转发 → 路由后置 → 全局后置 + lane key 断言 + 全局取数', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-page').exists()).toBe(true)
    // 数据源 = listPlugins({ scope:'GLOBAL' })（裁决③；page/pageSize 不约束具体值）
    expect(mocks.listPlugins).toHaveBeenCalledWith(expect.objectContaining({ scope: 'GLOBAL' }))
    const lanes = wrapper.findAll('[data-testid^="chn-lane-"]').map((l) => l.attributes('data-testid'))
    expect(lanes).toEqual([
      'chn-lane-pre-global', 'chn-lane-pre-route', 'chn-lane-forward', 'chn-lane-post-route', 'chn-lane-post-global'
    ])
    // 泳道头标签走 i18n
    expect(one(wrapper, 'chn-lane-pre-global').text()).toContain(t('v2.chain.lanePreGlobal'))
    expect(one(wrapper, 'chn-lane-pre-route').text()).toContain(t('v2.chain.lanePreRoute'))
    expect(one(wrapper, 'chn-lane-forward').text()).toContain(t('v2.chain.laneForward'))
    expect(one(wrapper, 'chn-lane-post-route').text()).toContain(t('v2.chain.lanePostRoute'))
    expect(one(wrapper, 'chn-lane-post-global').text()).toContain(t('v2.chain.lanePostGlobal'))
    // 裁决④：无「保存编排」两段式，只有一句如实 syncHint
    expect(one(wrapper, 'chn-page').text()).toContain(t('v2.chain.syncHint'))
  })
})

// ── H3 ────────────────────────────────────────────────────────────────────
describe('H3 — lane1/lane5 归位与排序', () => {
  it('GLOBAL+PRE → lane1、GLOBAL+POST → lane5，各按 sort_order 升序', async () => {
    const { wrapper } = await factory()
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
    expect(laneCards(wrapper, 'chn-lane-post-global')).toEqual(['logging', 'groovy-split', 'member-group', 'jar-retry'])
  })
})

// ── H4 ────────────────────────────────────────────────────────────────────
describe('H4 — DISABLED 卡置灰并排后', () => {
  it('security（DISABLED，sort_order=0 仍排最后）：data-state=disabled + 置灰类；ENABLED 卡 data-state=enabled', async () => {
    const { wrapper } = await factory()
    const disabledCard = one(wrapper, 'chn-card-security')
    expect(disabledCard.exists()).toBe(true)
    expect(disabledCard.attributes('data-state')).toBe('disabled')
    expect(disabledCard.classes().some((c) => c.includes('disabled')), '停用卡需带置灰类（类名含 disabled）').toBe(true)
    expect(disabledCard.text()).toContain(t('v2.chain.disabledLabel'))
    // 排在 ENABLED 之后（fixture 的 sort_order=0 比 sign/tracing 都小 → 证明是状态分桶而非数值序）
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
    expect(one(wrapper, 'chn-card-sign').attributes('data-state')).toBe('enabled')
  })
})

// ── H5 ────────────────────────────────────────────────────────────────────
describe('H5 — 转发泳道（静态卡）', () => {
  it('lane3 只有静态转发卡（网关核心 / 不可插拔），无插件卡、无「从市场添加」占位', async () => {
    const { wrapper } = await factory()
    const lane = one(wrapper, 'chn-lane-forward')
    expect(lane.exists()).toBe(true)
    expect(one(wrapper, 'chn-forward-card').exists()).toBe(true)
    expect(lane.text()).toContain(t('v2.chain.forwardCore'))
    expect(lane.text()).toContain(t('v2.chain.forwardNotPluggable'))
    expect(lane.findAll('[data-testid^="chn-card-"]').length).toBe(0)
    expect(lane.find('[data-testid^="chn-add-"]').exists()).toBe(false)
  })
})

// ── H6 ────────────────────────────────────────────────────────────────────
describe('H6 — 泳道头 ×N 计数与「缺口不造数」', () => {
  it('lane1 ×3 / lane5 ×4（含停用卡）；泳道区无 p95 / 无耗时数字（裁决②）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-lane-pre-global').text()).toMatch(/×3/)
    expect(one(wrapper, 'chn-lane-post-global').text()).toMatch(/×4/)
    const lanesText = one(wrapper, 'chn-scroll').text()
    expect(lanesText).not.toMatch(/p95/i)
    expect(lanesText).not.toMatch(/\d+(?:\.\d+)?\s*ms/)
  })
})

// ── H7 ────────────────────────────────────────────────────────────────────
describe('H7 — runtime 接线徽标与执行计数', () => {
  it('registered→已接线 / 未按 registered→未接线；JAR/GROOVY/GROUP 卡不渲染徽标', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-runtime-sign').exists()).toBe(true)
    expect(one(wrapper, 'chn-runtime-sign').text()).toContain(t('v2.chain.runtimeWired'))
    expect(one(wrapper, 'chn-runtime-tracing').exists()).toBe(true)
    expect(one(wrapper, 'chn-runtime-tracing').text()).toContain(t('v2.chain.runtimeUnwired'))
    // 自定义类型与数据面接线无关（Builtin.vue 先例）
    expect(one(wrapper, 'chn-card-groovy-split').find('[data-testid="chn-runtime-groovy-split"]').exists()).toBe(false)
    expect(one(wrapper, 'chn-card-jar-retry').find('[data-testid="chn-runtime-jar-retry"]').exists()).toBe(false)
  })

  it('stats 计数按字符串原样渲染（Long→String：executed "1234"）；无 stats 的 item 不渲染', async () => {
    const { wrapper } = await factory()
    const stats = one(wrapper, 'chn-stats-sign')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('1234')
    expect(stats.text()).toContain('5678')
    // tracing 的 runtime item 没有 stats 字段 → 不渲染计数位
    expect(one(wrapper, 'chn-stats-tracing').exists()).toBe(false)
  })

  it('available=false → 静默降级：无徽标无 stats、页面不崩（泳道照常渲染）', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({ available: false, items: [] })
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid^="chn-runtime-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="chn-stats-"]').exists()).toBe(false)
    expect(one(wrapper, 'chn-card-sign').exists()).toBe(true)
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
  })
})

// ── H8 ────────────────────────────────────────────────────────────────────
describe('H8 — 市场·内置（listBuiltinTypes 按 category 分组）', () => {
  it('按分组渲染：security 组含 jwt+sign、observability 组含 logging；cache 无 category → 兜底 traffic-control 组；内置徽标', async () => {
    const { wrapper } = await factory()
    const market = one(wrapper, 'chn-market')
    expect(market.exists()).toBe(true)
    expect(market.text()).toContain(t('v2.chain.marketTitle'))
    const sec = one(wrapper, 'chn-market-cat-security')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain(t('v2.chain.catSecurity'))
    expect(sec.find('[data-testid="chn-mkt-jwt"]').exists()).toBe(true)
    expect(sec.find('[data-testid="chn-mkt-sign"]').exists()).toBe(true)
    const obs = one(wrapper, 'chn-market-cat-observability')
    expect(obs.exists()).toBe(true)
    expect(obs.text()).toContain(t('v2.chain.catObservability'))
    expect(obs.find('[data-testid="chn-mkt-logging"]').exists()).toBe(true)
    // server 不下发 category → getBuiltinCategory(plugin_id) 兜底（'cache' → traffic-control）
    const tc = one(wrapper, 'chn-market-cat-traffic-control')
    expect(tc.exists()).toBe(true)
    expect(tc.text()).toContain(t('v2.chain.catTrafficControl'))
    expect(tc.find('[data-testid="chn-mkt-cache"]').exists()).toBe(true)
    // 内置卡类型徽标 = marketBuiltin 文案
    expect(one(wrapper, 'chn-mkt-jwt').text()).toContain(t('v2.chain.marketBuiltin'))
  })

  it('已装（gw_plugin 有同 plugin_id 行）→ 安装钮 disabled + marketInstalled；未装 → 可安装，点击 createPlugin({ plugin_id, scope:\'GLOBAL\' }) 并 reload', async () => {
    const { wrapper } = await factory()
    const installedBtn = one(wrapper, 'chn-mkt-install-sign')
    expect(installedBtn.exists()).toBe(true)
    expect(installedBtn.attributes('disabled')).toBeDefined()
    expect(installedBtn.text()).toContain(t('v2.chain.marketInstalled'))
    const installBtn = one(wrapper, 'chn-mkt-install-jwt')
    expect(installBtn.exists()).toBe(true)
    expect(installBtn.attributes('disabled')).toBeUndefined()
    expect(installBtn.text()).toContain(t('v2.chain.marketInstall'))
    await installBtn.trigger('click')
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    expect(mocks.createPlugin).toHaveBeenCalledWith(expect.objectContaining({ plugin_id: 'jwt', scope: 'GLOBAL' }))
    // 安装成功后 reload，新卡落泳道
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)
  })
})

// ── H9 ────────────────────────────────────────────────────────────────────
describe('H9 — 市场·自定义（listPlugins 的 JAR/GROOVY/GROUP 行）', () => {
  it('三行自定义卡带 plugin_type 原文徽标 + 「管理」跳旧路由 /plugins/:id/edit', async () => {
    const { wrapper, router } = await factory()
    for (const [id, type] of [['groovy-split', 'GROOVY'], ['member-group', 'GROUP'], ['jar-retry', 'JAR']] as const) {
      const card = one(wrapper, `chn-mkt-${id}`)
      expect(card.exists(), `自定义市场卡 chn-mkt-${id}`).toBe(true)
      expect(card.text()).toContain(type)
      expect(one(wrapper, `chn-mkt-manage-${id}`).exists()).toBe(true)
    }
    expect(one(wrapper, 'chn-market').text()).toContain(t('v2.chain.marketCustom'))
    await one(wrapper, 'chn-mkt-manage-groovy-split').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/plugins/groovy-split/edit')
  })
})

// ── H10 ───────────────────────────────────────────────────────────────────
describe('H10 — 启停（FcSwitch，disable 需 confirm）', () => {
  it('ENABLED 卡点击 → confirm({ variant:\'danger\' }) + disablePlugin(id) + reload；DISABLED 卡点击 → enablePlugin(id) 无 confirm', async () => {
    const { wrapper } = await factory()
    await one(wrapper, 'chn-switch-sign').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    expect(mocks.disablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.disablePlugin).toHaveBeenCalledWith('sign')
    expect(mocks.enablePlugin).not.toHaveBeenCalled()
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)

    await one(wrapper, 'chn-switch-security').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.enablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.enablePlugin).toHaveBeenCalledWith('security')
  })

  it('启停失败 → chn-action-error 显示（文案取 e?.message）', async () => {
    mocks.disablePlugin.mockRejectedValueOnce(new Error('engine push failed'))
    const { wrapper } = await factory()
    await one(wrapper, 'chn-switch-sign').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-action-error').exists()).toBe(true)
    expect(one(wrapper, 'chn-action-error').text()).toContain('engine push failed')
  })
})

// ── H11 ───────────────────────────────────────────────────────────────────
describe('H11 — 拖拽排序（chn-card 自带 @dragstart/@drop 可编程入口）', () => {
  it('同 lane reorder：卡 0 拖到卡 1 → sortGlobalPlugins(\'PRE\', [新序 ids]) + 成功 reload', async () => {
    const { wrapper } = await factory()
    const cards = one(wrapper, 'chn-lane-pre-global').findAll('[data-testid^="chn-card-"]')
    await cards[0].trigger('dragstart')
    await cards[1].trigger('drop')
    await flushPromises()
    expect(mocks.sortGlobalPlugins).toHaveBeenCalledTimes(1)
    // phase 用引擎 PluginPhase 原值（PRE/POST）；ids = 全 lane 新序（含置灰卡，后端全量提交）
    expect(mocks.sortGlobalPlugins).toHaveBeenCalledWith('PRE', ['tracing', 'sign', 'security'])
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)
  })

  it('排序失败 → reload 回滚（服务端序恢复）+ chn-action-error', async () => {
    mocks.sortGlobalPlugins.mockRejectedValueOnce(new Error('sort rejected'))
    const { wrapper } = await factory()
    const cards = one(wrapper, 'chn-lane-pre-global').findAll('[data-testid^="chn-card-"]')
    await cards[0].trigger('dragstart')
    await cards[1].trigger('drop')
    await flushPromises()
    expect(one(wrapper, 'chn-action-error').text()).toContain('sort rejected')
    // 回滚 = 重新拉取服务端全量（initial + rollback reload）
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
  })
})

// ── H12 ───────────────────────────────────────────────────────────────────
describe('H12 — loadEpoch 竞态', () => {
  it('慢 retry 挂起期间再点 retry（快）→ 快的生效；慢的后到不覆盖最新数据', async () => {
    // call#1 失败 → 错误态；call#2 慢（挂起）；call#3 快
    mocks.listPlugins.mockRejectedValueOnce(new Error('first down'))
    let resolveSlow!: (v: unknown) => void
    mocks.listPlugins.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
    const FAST_B = [makePlugin({ plugin_id: 'fresh-one', plugin_name: '新数据', plugin_phase: 'PRE', sort_order: 1 })]
    mocks.listPlugins.mockImplementationOnce(() => Promise.resolve(pageOf(FAST_B.map((r) => ({ ...r })))))

    const { wrapper } = await factory()
    await flushPromises()
    expect(one(wrapper, 'chn-error').exists()).toBe(true)
    expect(one(wrapper, 'chn-lane-pre-global').exists()).toBe(false)

    await one(wrapper, 'chn-retry').trigger('click') // load#2 慢，挂起
    await flushPromises()
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)
    // retry 挂起期间保持可点（契约见头注 chn-retry 行）
    expect(one(wrapper, 'chn-retry').exists()).toBe(true)

    await one(wrapper, 'chn-retry').trigger('click') // load#3 快，立即生效
    await flushPromises()
    expect(one(wrapper, 'chn-lane-pre-global').exists()).toBe(true)
    expect(one(wrapper, 'chn-error').exists()).toBe(false)
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['fresh-one'])

    resolveSlow(pageOf([makePlugin({ plugin_id: 'stale-one', plugin_name: '陈旧数据', plugin_phase: 'PRE', sort_order: 1 })]))
    await flushPromises()
    // 陈旧响应后到，不得覆盖最新数据
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['fresh-one'])
    expect(one(wrapper, 'chn-error').exists()).toBe(false)
  })
})

// ── H13 ───────────────────────────────────────────────────────────────────
describe('H13 — 只读权限（canEdit(\'plugin\')=false）', () => {
  it('启停开关与安装钮不渲染；卡片不可拖（draggable≠true），dragstart/drop 不触发排序；市场与管理入口只读保留', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid^="chn-switch-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="chn-mkt-install-"]').exists()).toBe(false)
    const card = one(wrapper, 'chn-card-sign')
    expect(card.exists()).toBe(true)
    expect(card.attributes('draggable')).not.toBe('true')
    await card.trigger('dragstart')
    await one(wrapper, 'chn-card-tracing').trigger('drop')
    await flushPromises()
    expect(mocks.sortGlobalPlugins).not.toHaveBeenCalled()
    // 只读视图保留：泳道 + 市场 + 管理跳转（只读导航不受 canEdit 限制）
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
    expect(one(wrapper, 'chn-mkt-jwt').exists()).toBe(true)
    expect(one(wrapper, 'chn-mkt-manage-jar-retry').exists()).toBe(true)
  })
})

// ── H14 ───────────────────────────────────────────────────────────────────
describe('H14 — 空泳道「从市场添加」占位', () => {
  it('空泳道（路由前置/路由后置）渲染 dashed 占位 chn-add-*；非空泳道恒渲染（对齐原型 06）', async () => {
    const { wrapper } = await factory()
    for (const laneKey of ['pre-route', 'post-route']) {
      const lane = one(wrapper, `chn-lane-${laneKey}`)
      expect(lane.findAll('[data-testid^="chn-card-"]').length).toBe(0)
      const add = lane.find(`[data-testid="chn-add-${laneKey}"]`)
      expect(add.exists(), `空泳道占位 chn-add-${laneKey}`).toBe(true)
      expect(add.text()).toContain(t('v2.chain.addFromMarket'))
    }
    // 非空泳道也渲染占位（原型 06：lane1 有卡仍带「＋ 从市场添加」）
    expect(one(wrapper, 'chn-add-pre-global').text()).toContain(t('v2.chain.addFromMarket'))
    expect(one(wrapper, 'chn-add-post-global').exists()).toBe(true)
  })
})

// ── H15 ───────────────────────────────────────────────────────────────────
describe('H15 — 加载失败与重试', () => {
  it('listPlugins reject → chn-error（loadFailed）+ chn-retry + 泳道不渲染；点重试重发成功后恢复', async () => {
    mocks.listPlugins.mockRejectedValueOnce(new Error('plugins down'))
    const { wrapper } = await factory()
    const err = one(wrapper, 'chn-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.chain.loadFailed'))
    expect(one(wrapper, 'chn-retry').text()).toContain(t('v2.chain.retry'))
    expect(one(wrapper, 'chn-lane-pre-global').exists()).toBe(false)
    await one(wrapper, 'chn-retry').trigger('click')
    await flushPromises()
    expect(mocks.listPlugins).toHaveBeenCalledTimes(2)
    expect(one(wrapper, 'chn-error').exists()).toBe(false)
    expect(one(wrapper, 'chn-lane-pre-global').exists()).toBe(true)
  })
})

// ── H16 ───────────────────────────────────────────────────────────────────
describe('H16 — scope tab（S10a 只渲染，路由级内容归 S10b）', () => {
  it('全局 tab 激活（data-active="true"）+ 路由级 tab 存在未激活；点击路由级不崩、泳道保持', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-scope-tabs').exists()).toBe(true)
    expect(one(wrapper, 'chn-scope-global').attributes('data-active')).toBe('true')
    expect(one(wrapper, 'chn-scope-global').text()).toContain(t('v2.chain.scopeGlobal'))
    const routeTab = one(wrapper, 'chn-scope-route')
    expect(routeTab.exists()).toBe(true)
    expect(routeTab.attributes('data-active')).not.toBe('true')
    await routeTab.trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-page').exists()).toBe(true)
    // S10a 裁决：点击路由级 tab 无动作或渲染 routeScopeWip 占位 —— 泳道保持全局内容即可
    expect(one(wrapper, 'chn-lane-pre-global').exists()).toBe(true)
  })
})

// ── H17 ───────────────────────────────────────────────────────────────────
describe('H17 — SDK-only 与 375 横滚', () => {
  it('SDK-only：源码无 <el- 直用（铁律 2）；template 块无 CJK（文案一律 t()）', () => {
    expect(readSource()).not.toMatch(/<el-/)
    expect(readTemplate()).not.toMatch(/[\u4e00-\u9fff\u3000-\u303f\uff01-\uff5e]/)
  })

  it('chn-scroll 横滚容器包住五泳道 + 源码 overflow-x:auto（jsdom 无法实测 scrollWidth）', async () => {
    const { wrapper } = await factory()
    const scroller = one(wrapper, 'chn-scroll')
    expect(scroller.exists()).toBe(true)
    expect(scroller.find('[data-testid="chn-lane-pre-global"]').exists()).toBe(true)
    expect(scroller.find('[data-testid="chn-lane-post-global"]').exists()).toBe(true)
    expect(readSource()).toMatch(/overflow-x:\s*auto/)
  })
})

// ── H18 ───────────────────────────────────────────────────────────────────
describe('H18 — 模板无造数文案（裁决② 缺口不造数）', () => {
  it('template 块无 p95 / 实例 / QPS 剩余 / 合计开销 / 硬编码耗时数字', () => {
    const template = readTemplate()
    expect(template).not.toMatch(/p95/i)
    expect(template).not.toMatch(/实例/)
    expect(template).not.toMatch(/QPS\s*剩余/)
    expect(template).not.toMatch(/合计开销/)
    expect(template).not.toMatch(/\d+(?:\.\d+)?\s*ms/)
  })
})

// ═══════════════ S10b-T：路由级 scope（选择器/绑定泳道/排序/启停/join）═══════════════
// 契约：§4 S10 行 S10b 半步（~500 行）。裁决与 testid/i18n 契约见文件头注 S10b 追加段。

/** RouteNode fixture（Long→String 下 id 为字符串；嵌入 plugins/children 本步不用） */
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

/** 绑定行（RouteBindingService.listBindings 实际返回形状；plugin_id = gw_plugin 行主键） */
function makeBinding(f: { binding_id: string; plugin_id: string; plugin_name: string; plugin_phase: 'PRE' | 'POST'; sort_order: number }) {
  return {
    binding_id: f.binding_id,
    route_id: '5001',
    plugin_id: f.plugin_id,
    plugin_name: f.plugin_name,
    plugin_phase: f.plugin_phase,
    sort_order: f.sort_order,
    binding_config: '{}'
  }
}

/** 5001 的绑定集：PRE ×1；POST ×2 —— 903（底层行停用、sort_order=0 更小）刻意排在 902 之前，
 *  钉死「绑定泳道停用卡不重排」（与全局泳道状态分桶规则相反，见头注裁决）。
 *  binding_id 用 90x、底层行主键用 8x —— 启停参数一旦传错（binding_id 当行 id）立刻红。 */
function defaultBindings() {
  return [
    makeBinding({ binding_id: '901', plugin_id: '81', plugin_name: '路由JWT校验', plugin_phase: 'PRE', sort_order: 1 }),
    makeBinding({ binding_id: '903', plugin_id: '83', plugin_name: '路由重试(停用)', plugin_phase: 'POST', sort_order: 0 }),
    makeBinding({ binding_id: '902', plugin_id: '82', plugin_name: '路由日志采样', plugin_phase: 'POST', sort_order: 1 })
  ]
}

/** 绑定卡启停状态 join 源：binding.plugin_id（gw_plugin 行主键）→ 全量 listPlugins（无 scope）行 */
function routeBoundRows() {
  return [
    makePlugin({ plugin_id: '81', plugin_name: '路由JWT校验', plugin_phase: 'PRE', scope: 'ROUTE', sort_order: 1 }),
    makePlugin({ plugin_id: '82', plugin_name: '路由日志采样', plugin_phase: 'POST', scope: 'ROUTE', sort_order: 1 }),
    makePlugin({ plugin_id: '83', plugin_name: '路由重试(停用)', plugin_phase: 'POST', scope: 'ROUTE', status: 'DISABLED', sort_order: 0 })
  ]
}

async function enterRouteScope(w: VueWrapper<any>) {
  await one(w, 'chn-scope-route').trigger('click')
  await flushPromises()
}

async function selectRoute(w: VueWrapper<any>, id = '5001') {
  await enterRouteScope(w)
  await one(w, `chn-route-opt-${id}`).trigger('click')
  await flushPromises()
}

const S10B_KEYS = ['routePickerLabel', 'routeSearchPlaceholder', 'routeSelectEmpty', 'routeJoinHint', 'badgeRoute']
  .map((k) => `v2.chain.${k}`)

// ── S10b i18n ─────────────────────────────────────────────────────────────
describe('S10b-i18n — 路由级新增 key 双语存在（铁律 6，v2.chain.* 树）', () => {
  it.each(S10B_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── S10b-B1 ───────────────────────────────────────────────────────────────
describe('S10b-B1 — scope 切换与路由选择器（惰性拉取）', () => {
  it('进入路由级：激活态翻转 + 选择器/join 提示渲染 + WIP 占位退场 + listRoutes 惰性首拉', async () => {
    const { wrapper } = await factory()
    // 全局 scope：选择器不渲染、路由清单不拉
    expect(one(wrapper, 'chn-route-picker').exists()).toBe(false)
    expect(mocks.listRoutes).not.toHaveBeenCalled()
    await enterRouteScope(wrapper)
    expect(one(wrapper, 'chn-scope-route').attributes('data-active')).toBe('true')
    expect(one(wrapper, 'chn-scope-global').attributes('data-active')).toBe('false')
    expect(one(wrapper, 'chn-route-picker').exists()).toBe(true)
    expect(one(wrapper, 'chn-join-hint').exists()).toBe(true)
    // S10a 的 routeScopeWip 占位在 S10b 实装后退场（key 留在 locale 供既有 it.each）
    expect(one(wrapper, 'chn-page').text()).not.toContain(t('v2.chain.routeScopeWip'))
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
  })

  it('路由级切回全局：全局 tab 复活 + 选择器退场 + 五泳道保持全局内容（H16 语义延续）', async () => {
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    await one(wrapper, 'chn-scope-global').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-scope-global').attributes('data-active')).toBe('true')
    expect(one(wrapper, 'chn-scope-route').attributes('data-active')).toBe('false')
    expect(one(wrapper, 'chn-route-picker').exists()).toBe(false)
    expect(laneCards(wrapper, 'chn-lane-pre-global')).toEqual(['sign', 'tracing', 'security'])
  })
})

// ── S10b-B2 ───────────────────────────────────────────────────────────────
describe('S10b-B2 — 路由搜索与选中', () => {
  it('搜索按 route_name/path 客户端过滤、清空恢复；选项行含名称与路径', async () => {
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    const optIds = () => wrapper.findAll('[data-testid^="chn-route-opt-"]').map((o) => o.attributes('data-testid'))
    expect(optIds()).toEqual(['chn-route-opt-5001', 'chn-route-opt-5002', 'chn-route-opt-5003'])
    expect(one(wrapper, 'chn-route-opt-5001').text()).toContain('用户服务分发')
    expect(one(wrapper, 'chn-route-opt-5001').text()).toContain('/api/u/**')
    await one(wrapper, 'chn-route-search').setValue('订单')
    expect(optIds()).toEqual(['chn-route-opt-5002'])
    await one(wrapper, 'chn-route-search').setValue('')
    expect(optIds()).toEqual(['chn-route-opt-5001', 'chn-route-opt-5002', 'chn-route-opt-5003'])
  })

  it('选中路由：data-selected 标记 + listBindings(route.id) + lane2/lane4 出现绑定卡 + 空态退场', async () => {
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    expect(one(wrapper, 'chn-route-empty').exists()).toBe(true)
    expect(mocks.listBindings).not.toHaveBeenCalled()
    await one(wrapper, 'chn-route-opt-5001').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-route-opt-5001').attributes('data-selected')).toBe('true')
    expect(one(wrapper, 'chn-route-opt-5002').attributes('data-selected')).not.toBe('true')
    expect(mocks.listBindings).toHaveBeenCalledTimes(1)
    expect(mocks.listBindings).toHaveBeenCalledWith('5001')
    expect(one(wrapper, 'chn-route-empty').exists()).toBe(false)
    expect(laneCards(wrapper, 'chn-lane-pre-route')).toEqual(['901'])
    expect(laneCards(wrapper, 'chn-lane-post-route')).toEqual(['903', '902'])
  })
})

// ── S10b-B3 ───────────────────────────────────────────────────────────────
describe('S10b-B3 — 绑定卡归位/卡序/徽标', () => {
  it('PRE→lane2、POST→lane4；卡序 = binding sort_order 升序且停用卡不重排（903 停用仍居首）', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    expect(laneCards(wrapper, 'chn-lane-pre-route')).toEqual(['901'])
    expect(laneCards(wrapper, 'chn-lane-post-route')).toEqual(['903', '902'])
    const disabled = one(wrapper, 'chn-card-903')
    expect(disabled.attributes('data-state')).toBe('disabled')
    expect(disabled.text()).toContain(t('v2.chain.disabledLabel'))
    expect(one(wrapper, 'chn-card-902').attributes('data-state')).toBe('enabled')
  })

  it('绑定卡徽标 = badgeRoute（不带 badgeGlobal）；泳道 ×N 计数含停用；chn-add-* 占位沿用', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    const card = one(wrapper, 'chn-card-901')
    expect(card.text()).toContain(t('v2.chain.badgeRoute'))
    expect(card.text()).not.toContain(t('v2.chain.badgeGlobal'))
    expect(one(wrapper, 'chn-lane-pre-route').text()).toMatch(/×1/)
    expect(one(wrapper, 'chn-lane-post-route').text()).toMatch(/×2/)
    expect(one(wrapper, 'chn-add-pre-route').exists()).toBe(true)
    expect(one(wrapper, 'chn-add-post-route').exists()).toBe(true)
  })
})

// ── S10b-B4 ───────────────────────────────────────────────────────────────
describe('S10b-B4 — 绑定启停（作用于底层 gw_plugin 行，confirm 模式沿用）', () => {
  it('ENABLED 行卡：confirm(danger) + disablePlugin(\'82\')（行主键，非 binding_id \'902\'）；DISABLED 行卡：无 confirm + enablePlugin(\'83\')；成功重拉绑定', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    mocks.listBindings.mockClear()
    await one(wrapper, 'chn-switch-902').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    expect(mocks.disablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.disablePlugin).toHaveBeenCalledWith('82')
    expect(mocks.enablePlugin).not.toHaveBeenCalled()
    expect(mocks.listBindings).toHaveBeenCalledTimes(1)
    await one(wrapper, 'chn-switch-903').trigger('click')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.enablePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.enablePlugin).toHaveBeenCalledWith('83')
  })

  it('启停失败 → chn-action-error 文案取 e?.message', async () => {
    mocks.disablePlugin.mockRejectedValueOnce(new Error('row locked'))
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    await one(wrapper, 'chn-switch-902').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-action-error').exists()).toBe(true)
    expect(one(wrapper, 'chn-action-error').text()).toContain('row locked')
  })
})

// ── S10b-B5 ───────────────────────────────────────────────────────────────
describe('S10b-B5 — 绑定拖拽排序（sortRoutePlugins，失败回滚）', () => {
  it('lane4 启用卡拖到首位 → sortRoutePlugins(\'5001\', \'POST\', 新序 binding_ids) + 成功重拉；不误调 sortGlobalPlugins', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    mocks.listBindings.mockClear()
    const cards = one(wrapper, 'chn-lane-post-route').findAll('[data-testid^="chn-card-"]')
    await cards[1].trigger('dragstart')
    await cards[0].trigger('drop')
    await flushPromises()
    expect(mocks.sortRoutePlugins).toHaveBeenCalledTimes(1)
    expect(mocks.sortRoutePlugins).toHaveBeenCalledWith('5001', 'POST', ['902', '903'])
    expect(mocks.sortGlobalPlugins).not.toHaveBeenCalled()
    expect(mocks.listBindings).toHaveBeenCalledTimes(1)
  })

  it('排序失败 → 重拉回滚（卡序恢复 903→902）+ chn-action-error', async () => {
    mocks.sortRoutePlugins.mockRejectedValueOnce(new Error('binding sort rejected'))
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    const cards = one(wrapper, 'chn-lane-post-route').findAll('[data-testid^="chn-card-"]')
    await cards[1].trigger('dragstart')
    await cards[0].trigger('drop')
    await flushPromises()
    expect(one(wrapper, 'chn-action-error').exists()).toBe(true)
    expect(one(wrapper, 'chn-action-error').text()).toContain('binding sort rejected')
    expect(laneCards(wrapper, 'chn-lane-post-route')).toEqual(['903', '902'])
  })
})

// ── S10b-B6 ───────────────────────────────────────────────────────────────
describe('S10b-B6 — join 语义与 POST 相序（PluginExecutionFilter.compose 为权威）', () => {
  it('chn-join-hint 钉住「执行完回到全局后置链」；五泳道 DOM 序不变（post-route 先于 post-global）', async () => {
    const { wrapper } = await factory()
    await selectRoute(wrapper)
    const hint = one(wrapper, 'chn-join-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.chain.routeJoinHint'))
    // join 语义本体钉在文案里（引擎 compose：POST = 路由绑定先、全局后）
    expect(String(dig(zhCN, 'v2.chain.routeJoinHint'))).toContain('全局后置')
    expect(String(dig(enUS, 'v2.chain.routeJoinHint'))).toMatch(/global POST/i)
    const lanes = wrapper.findAll('[data-testid^="chn-lane-"]').map((l) => l.attributes('data-testid'))
    expect(lanes).toEqual([
      'chn-lane-pre-global', 'chn-lane-pre-route', 'chn-lane-forward', 'chn-lane-post-route', 'chn-lane-post-global'
    ])
  })
})

// ── S10b-B7 ───────────────────────────────────────────────────────────────
describe('S10b-B7 — 未选路由空态', () => {
  it('路由级已激活未选路由：chn-route-empty（routeSelectEmpty）+ 绑定泳道无卡 + 不发 listBindings', async () => {
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    expect(one(wrapper, 'chn-route-empty').exists()).toBe(true)
    expect(one(wrapper, 'chn-route-empty').text()).toContain(t('v2.chain.routeSelectEmpty'))
    expect(one(wrapper, 'chn-lane-pre-route').findAll('[data-testid^="chn-card-"]').length).toBe(0)
    expect(one(wrapper, 'chn-lane-post-route').findAll('[data-testid^="chn-card-"]').length).toBe(0)
    expect(mocks.listBindings).not.toHaveBeenCalled()
  })
})

// ═══════════════ S12-T：C-1 市场直达钮 + C-5 路由 tab 计数诚实化 ═══════════════
// 契约：§4 S12 行 ①⑤；裁决要点见文件头注 S12 追加段。既有用例一字未动，先红是预期。

const S12_KEYS = ['marketUploadJar', 'marketNewGroovy'].map((k) => `v2.chain.${k}`)

// ── S12 i18n ──────────────────────────────────────────────────────────────
describe('S12 — i18n 新增 key 双语存在（铁律 6，v2.chain.* 树）', () => {
  it.each(S12_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── S12-C1 ────────────────────────────────────────────────────────────────
describe('S12-C1 — 市场头「上传 JAR / 编写 Groovy」直达旧 UI /plugins/new', () => {
  it('两钮落市场区头（marketTitle 同排）+ 文案 i18n（marketUploadJar / marketNewGroovy）', async () => {
    const { wrapper } = await factory()
    const market = one(wrapper, 'chn-market')
    const jar = one(wrapper, 'chn-market-upload-jar')
    const groovy = one(wrapper, 'chn-market-new-groovy')
    expect(jar.exists()).toBe(true)
    expect(groovy.exists()).toBe(true)
    expect(jar.text()).toContain(t('v2.chain.marketUploadJar'))
    expect(groovy.text()).toContain(t('v2.chain.marketNewGroovy'))
    // 落市场区头（不在泳道/市场卡内）
    expect(market.find('[data-testid="chn-market-upload-jar"]').exists()).toBe(true)
    expect(market.find('[data-testid="chn-market-new-groovy"]').exists()).toBe(true)
  })

  it('点击 chn-market-upload-jar → /plugins/new（旧 UI 建插件唯一入口，独立路由非 dialog）', async () => {
    const { wrapper, router } = await factory()
    await one(wrapper, 'chn-market-upload-jar').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/plugins/new')
  })

  it('点击 chn-market-new-groovy → /plugins/new（同一路由，类型由旧 Editor 页内选择）', async () => {
    const { wrapper, router } = await factory()
    await one(wrapper, 'chn-market-new-groovy').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/plugins/new')
  })

  it('只读（canEdit=false）恒渲染（只读导航，同 chn-mkt-manage-* 先例）', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-market-upload-jar').exists()).toBe(true)
    expect(one(wrapper, 'chn-market-new-groovy').exists()).toBe(true)
  })
})

// ── S12-C5 ────────────────────────────────────────────────────────────────
describe('S12-C5 — 路由级 tab 计数徽标诚实化（chn-scope-route-count）', () => {
  it('未拉取（全局 scope）→ 徽标不渲染且路由级 tab 文本无数字（现状保持，不新增前置请求）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'chn-scope-route-count').exists()).toBe(false)
    expect(one(wrapper, 'chn-scope-route').text()).not.toMatch(/\d/)
    expect(mocks.listRoutes).not.toHaveBeenCalled()
  })

  it('惰性拉取成功（3 条路由）→ 徽标 = 路由总数 3；切回全局徽标保留（routesLoaded 不回退）', async () => {
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    const count = one(wrapper, 'chn-scope-route-count')
    expect(count.exists()).toBe(true)
    expect(count.text()).toBe('3')
    await one(wrapper, 'chn-scope-global').trigger('click')
    await flushPromises()
    expect(one(wrapper, 'chn-scope-route-count').exists()).toBe(true)
    expect(one(wrapper, 'chn-scope-route-count').text()).toBe('3')
    // 诚实化不新增前置请求：整个往返只发这一次惰性拉取
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
  })

  it('listRoutes 失败 → 徽标不渲染（数量未知不造数，routesLoaded 仍 false）', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('routes down'))
    const { wrapper } = await factory()
    await enterRouteScope(wrapper)
    expect(one(wrapper, 'chn-scope-route-count').exists()).toBe(false)
    expect(one(wrapper, 'chn-scope-route').text()).not.toMatch(/\d/)
  })
})
