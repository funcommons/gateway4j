import { http, envelope } from './http'
import type { GatewaySyncInfo } from './misc'

export interface RouteNode {
  id: string
  route_name: string
  route_type: 'DISPATCH' | 'BACKEND'
  path?: string
  upstream_url?: string
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'CHANGING'
  sort_order: number
  remark?: string
  tags?: string
  /** H7b 环境维度：路由归属环境（缺省/旧后端不下发 → 视为 default） */
  environment?: string
  config_version: string
  created_at: number
  updated_at: number
  plugins: Array<{
    plugin_id: string
    plugin_name: string
    plugin_phase: string
    sort_order: number
  }>
  children: RouteNode[]
}

export interface RouteDetail {
  id: string
  route_name: string
  route_type: string
  path?: string
  upstream_url?: string
  status: string
  sort_order: number
  remark?: string
  tags?: string
  config_version: string
  parent_route_id?: string
  created_at?: string
  updated_at?: string
}

export interface RouteConditionDto {
  id?: string
  condition_type: 'HEADER' | 'PATH' | 'QUERY' | 'BODY' | 'GROOVY'
  operator: 'EQ' | 'NE' | 'CONTAINS' | 'REGEX' | 'EXISTS' | 'GT' | 'LT'
  condition_key?: string
  condition_value?: string
  target_route_id?: string
  priority?: number
}

export interface BindingDto {
  binding_id?: string
  plugin_id: string
  binding_config?: string
  sort_order?: number
}

/** S7-5：keyword 服务端搜索（route_name/path 平铺命中列表，见 RouteServiceKeywordSearchTest 契约）；
 * as-is 透传勿改名；无任何参数仍走零参分支（既有行为不变）。 */
export function listRoutes(params?: { tag?: string; environment?: string; keyword?: string }) {
  if (params?.tag || params?.environment || params?.keyword) {
    return envelope<RouteNode[]>(http.get('/v1/routes', { params }))
  }
  return envelope<RouteNode[]>(http.get('/v1/routes'))
}

export function getRoute(id: string) {
  return envelope<RouteDetail>(http.get(`/v1/routes/${id}`))
}

export function createRoute(payload: {
  route_name: string
  route_type: string
  path?: string
  upstream_url?: string
  parent_route_id?: string
  sort_order?: number
  remark?: string
  tags?: string
  /** H7b：归属环境（^[a-z0-9_-]{1,20}$），缺省 default；环境功能降级时不传 */
  environment?: string
  conditions?: RouteConditionDto[]
  plugin_ids?: string[]
  bindings?: Array<{ plugin_id: string; binding_config: string; sort_order?: number }>
}) {
  return envelope<RouteDetail>(http.post('/v1/routes', payload))
}

export function updateRoute(id: string, payload: Partial<{
  route_name: string
  path: string
  upstream_url: string
  parent_route_id: string
  sort_order: number
  remark: string
  tags: string
  /**
   * H7b：PATCH 携带 environment 则迁移环境；缺省（不传）保持原环境。
   * 仅在用户显式改动环境时携带。
   */
  environment?: string
  conditions: RouteConditionDto[]
  plugin_ids: string[]
  bindings: Array<{ plugin_id: string; binding_config: string; sort_order?: number }>
  /** 乐观锁：打开编辑器时的 config_version（Long→String 契约，传字符串数字）。不传则不做冲突校验 */
  expected_version: string
}>) {
  return envelope<RouteDetail>(http.patch(`/v1/routes/${id}`, payload))
}

/**
 * 命令端点（delete/publish/offline 等）统一过 envelope()：全站契约 = 一切异常 HTTP 200 +
 * ApiResponse 失败信封（success:false/code≠0）。裸 http 调用会把失败信封当成功 resolve
 * → 调用方假成功（成功 toast / 批量计成功）。过 envelope 后 code≠0 抛 BusinessError
 * （进调用方 catch → 错误呈现），成功裸实体 / 空体原样透传（信封幂等：双层包裹无害）。
 */
export function deleteRoute(id: string) {
  return envelope(http.delete(`/v1/routes/${id}`))
}

/**
 * 发布路由。H7b：body 可选 { change_description }（UI 侧必填 1~200 字）；
 * 旧后端忽略 body —— 不传时保持无 body 调用（兼容）。
 */
export function publishRoute(id: string, changeDescription?: string) {
  if (changeDescription != null && changeDescription !== '') {
    return envelope(http.post(`/v1/routes/${id}/publish`, { change_description: changeDescription }))
  }
  return envelope(http.post(`/v1/routes/${id}/publish`))
}

export function offlineRoute(id: string) {
  return envelope(http.post(`/v1/routes/${id}/offline`))
}

/** 复制路由：返回新建的路由实体 */
export function duplicateRoute(id: string) {
  return envelope<RouteDetail>(http.post(`/v1/routes/${id}/duplicate`))
}

/** 批量操作结果：succeeded/failed 逐条回传，failed 带 reason */
export interface BulkResult {
  succeeded: Array<{ id: string }>
  failed: Array<{ id: string; reason: string }>
}

/** H7b：批量发布 body 可选 change_description（UI 侧必填） */
export function bulkPublishRoutes(ids: string[], changeDescription?: string) {
  const body = (changeDescription != null && changeDescription !== '')
    ? { ids, change_description: changeDescription }
    : { ids }
  return envelope<BulkResult>(http.post('/v1/routes/bulk-publish', body))
}

export function bulkOfflineRoutes(ids: string[]) {
  return envelope<BulkResult>(http.post('/v1/routes/bulk-offline', { ids }))
}

export function bulkDeleteRoutes(ids: string[]) {
  return envelope<BulkResult>(http.post('/v1/routes/bulk-delete', { ids }))
}

export function validateRoute(payload: { route_id?: string; conditions: RouteConditionDto[] }) {
  return envelope(http.post('/v1/routes/validate', payload))
}

export function listRouteChildren(id: string) {
  return envelope<RouteNode[]>(http.get(`/v1/routes/${id}/children`))
}

export function sortRoutes(routeIds: string[]) {
  return envelope(http.put('/v1/routes/sort', { route_ids: routeIds }))
}

export function getCanvas(routeId: string) {
  return envelope<{ route_id: string; canvas_data: any }>(http.get(`/v1/routes/${routeId}/canvas`))
}
export function saveCanvas(routeId: string, canvasData: any) {
  return envelope(http.put(`/v1/routes/${routeId}/canvas`, { canvas_data: canvasData }))
}

/** 画布应用到路由树 — 请求体 */
export interface CanvasApplyPayload {
  nodes: any[]
  edges: any[]
  /** true=仅预览 diff 不落库 */
  dry_run: boolean
  /** 建议删除列表中用户勾选确认的 id；dry_run=false 时生效 */
  confirm_delete_ids?: string[]
  /** H7b：变更说明（可选；画布走 diff 流已天然留痕，仅在用户填写时携带） */
  change_description?: string
}

/** 画布 → 路由树 diff（dry_run=true 与正式应用共用同一返回结构） */
export interface CanvasApplyDiff {
  to_create: Array<{ label: string; path?: string; upstream_url?: string }>
  to_update: Array<{ id: string; changes: Record<string, unknown> }>
  to_delete: Array<{ id: string; name: string }>
  /** 条件变更条数 */
  conditions_changes?: number
}

/** dry_run=true 预览 diff / dry_run=false 正式应用，共用该接口 */
export function applyCanvas(routeId: string, payload: CanvasApplyPayload) {
  return envelope<CanvasApplyDiff>(http.post(`/v1/routes/${routeId}/canvas/apply`, payload))
}

export function addCondition(routeId: string, condition: RouteConditionDto) {
  return envelope(http.post(`/v1/routes/${routeId}/conditions`, condition))
}
export function updateCondition(routeId: string, condId: string, condition: RouteConditionDto) {
  return envelope(http.put(`/v1/routes/${routeId}/conditions/${condId}`, condition))
}
export function deleteCondition(routeId: string, condId: string) {
  return envelope(http.delete(`/v1/routes/${routeId}/conditions/${condId}`))
}

export function listBindings(routeId: string) {
  return envelope<BindingDto[]>(http.get(`/v1/routes/${routeId}/plugins`))
}
export function bindPlugin(routeId: string, payload: { plugin_id: string; binding_config: string }) {
  return envelope(http.post(`/v1/routes/${routeId}/plugins`, payload))
}
export function updateBinding(routeId: string, bindingId: string, payload: { binding_config: string; sort_order?: number }) {
  return envelope(http.put(`/v1/routes/${routeId}/plugins/${bindingId}`, payload))
}
export function unbindPlugin(routeId: string, bindingId: string) {
  return envelope(http.delete(`/v1/routes/${routeId}/plugins/${bindingId}`))
}
export function sortRoutePlugins(routeId: string, pluginPhase: string, bindingIds: string[]) {
  return envelope(http.put(`/v1/routes/${routeId}/plugins/sort`, { plugin_phase: pluginPhase, binding_ids: bindingIds }))
}
export function getPluginChain(routeId: string) {
  return envelope<{ pre_chain: any[]; post_chain: any[] }>(http.get(`/v1/routes/${routeId}/plugin-chain`))
}

export interface RoutePackage {
  version: string
  exported_at: number
  /** H7b：包来源环境（单环境名 | 'mixed'）；旧包无此字段（视为 default） */
  environment?: string
  routes: ExportNode[]
}

export interface ExportNode {
  route_name: string
  route_type: string
  path?: string
  upstream_url?: string
  sort_order: number
  remark?: string
  conditions: Array<{ condition_type: string; operator: string; condition_key?: string; condition_value?: string; target_route_key: string; priority: number }>
  plugins: Array<{ plugin_id: string; binding_config: string; sort_order: number }>
  children: ExportNode[]
}

/** H7b：export 支持按环境导出（包顶层 environment：单环境名 | 'mixed'） */
export function exportRoutes(routeIds?: string[], status?: string, environment?: string) {
  const params: Record<string, unknown> = {}
  if (routeIds) params.route_ids = routeIds
  if (status) params.status = status
  if (environment) params.environment = environment
  return envelope<RoutePackage>(http.get('/v1/routes/export', { params }))
}
export interface ImportReport {
  is_valid: boolean
  conflicts?: string[]
  missing_plugins?: string[]
  missing_targets?: string[]
  cycle_warnings?: string[]
  /** H7b：本次预检/导入的目标环境（缺省 default） */
  environment?: string
  /** H7b：路由包来源环境（旧包 = default） */
  package_environment?: string
  /** 预检失败原因（D14：预检失败必须带可读原因） */
  reason?: string
}

export interface ImportResult {
  total: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ route_name: string; message: string }>
}

export function validateImport(pkg: RoutePackage) {
  return envelope<ImportReport>(http.post('/v1/routes/import/validate', pkg))
}
/** H7b：body 可选 target_environment（缺省 default）；环境功能降级时不传 */
export function importRoutes(pkg: RoutePackage, strategy: 'SKIP' | 'OVERWRITE' | 'ERROR', targetEnvironment?: string) {
  const body = (targetEnvironment != null && targetEnvironment !== '')
    ? { data: pkg, strategy, target_environment: targetEnvironment }
    : { data: pkg, strategy }
  return envelope<ImportResult>(http.post('/v1/routes/import', body))
}

/** 导入前自动快照（可选能力：后端未实现时该接口 404，调用方需静默跳过） */
export interface SnapshotResult {
  snapshot_id?: string
  [key: string]: unknown
}

export function createImportSnapshot() {
  return envelope<SnapshotResult>(http.post('/v1/routes/import/snapshot', {}))
}

/** S5a：路由版本行（gw_route_version；接口按 config_version 倒序返回） */
export interface RouteVersionDto {
  id?: string
  route_id: string
  /** 字符串数字（Long→String 契约） */
  config_version: string
  /** 'CREATE' | 'PUBLISH' | 'OFFLINE'（其它值页面原样展示） */
  change_type: string
  /** 发布时路由全量快照（含 conditions，灰度只读卡数据源） */
  snapshot_data?: Record<string, unknown> | null
  change_description?: string | null
  actor?: string
  /** epoch ms */
  published_at?: number | null
}

/** S5a：版本 diff 行（from===to 视为未变更） */
export interface RouteVersionDiffRow {
  field: string
  from: string
  to: string
}

/** 版本时间线：某路由全部版本（倒序） */
export function getRouteVersions(id: string) {
  return envelope<RouteVersionDto[]>(http.get(`/v1/routes/${id}/versions`))
}

/** 相邻版本快照 diff（from/to = config_version） */
export function getRouteVersionDiff(id: string, from: string, to: string) {
  return envelope<RouteVersionDiffRow[]>(
    http.get(`/v1/routes/${id}/versions/diff`, { params: { from, to } })
  )
}

// ===== OPT-6: per-route 同步状态（详情页角标的数据源）=====

/**
 * GET /v1/routes/{id}/sync-status 的响应。in_sync 是【全局口径】
 * （网关已加载到与 DB 一致的版本）。available=false（引擎未上报 / TTL 过期）时
 * gateway 为 null（契约：形状同 @/api/misc SyncStatusResponse）。
 */
export interface RouteSyncStatus {
  route_id: string
  /** 字符串数字（Long→String 契约） */
  route_config_version: string
  /** false = 引擎状态未知（未上报 / Redis 失败 / TTL 过期），此时 gateway 为 null */
  available: boolean
  /** 形状同 @/api/misc GatewaySyncInfo；available=false 时为 null */
  gateway: GatewaySyncInfo | null
  db_version: number
  /** true = 网关已加载到与 DB 一致的版本（发布生效） */
  in_sync: boolean
}

/**
 * per-route 同步状态：详情页【挂载时 + dtl-refresh 手动刷新时各查一次】的一次性快照用。
 * Publish/List 页的轮询（usePublishSync）是另一套；详情页不做轮询。
 */
export function getRouteSyncStatus(id: string) {
  return envelope<RouteSyncStatus>(http.get(`/v1/routes/${id}/sync-status`))
}

/* ══ S12-4：K8s Ingress 风格批量建路由（契约 §10「批量 API 契约」）══════════════════
 * 单次 POST 建 N 条 BACKEND 路由（每个 (host, path) 一条）+ N 条路由级 SCG 谓词行；
 * 服务端事务内完成。响应 data.created[] = { route_id, route_name, path, host }。
 * 字段名与 §10 逐字一致；pathType 三值 PREFIX / EXACT / IMPLEMENTATION_SPECIFIC。
 */

/** pathType 三值（§10 pathType → SCG 映射裁决） */
export type IngressPathType = 'PREFIX' | 'EXACT' | 'IMPLEMENTATION_SPECIFIC'

/** 后端目标（K8s 风格：服务名 + 端口；service 不含 scheme） */
export interface IngressBackendDto {
  service: string
  port: string
}

/** 一条 path（= 一条 BACKEND 路由） */
export interface IngressPathDto {
  /** SCG 路径（Prefix 已被前端补成 `/api/**` 形态） */
  path: string
  pathType: IngressPathType
  backend: IngressBackendDto
  /**
   * 前端合成的上游地址（`http://{service}[:{port}]`）——服务端若按 service/port 自算可忽略本字段
   * （Spring Boot 默认忽略未知字段），带上有值即用、无值即算，两种后端实现都能吃。
   */
  upstream_url?: string
}

/** 一条 rule（= 一个 host + 若干 paths） */
export interface IngressRuleDto {
  /** 可空 = 不限域名（K8s 允许空 host） */
  host: string
  paths: IngressPathDto[]
}

/** 插件绑定（SCG filters ↔ gateway4j 插件） */
export interface IngressPluginDto {
  plugin_id: string
  binding_config: string
}

/** POST /v1/routes/ingress 请求体 */
export interface IngressRoutePayload {
  name: string
  environment: string
  remark: string
  tags: string
  rules: IngressRuleDto[]
  plugins: IngressPluginDto[]
  /** 路由级 SCG 谓词定义串（Host=**.example.com 形态）；顶层字段，与 rules/plugins 平级 */
  predicates: string[]
}

/** 响应 data.created[] 元素 */
export interface IngressCreatedRoute {
  route_id?: string
  route_name?: string
  path?: string
  host?: string
}

/** 响应 data */
export interface IngressCreateResult {
  created: IngressCreatedRoute[]
}

/** S12-4：批量 Ingress 建路由（K8s Ingress 风格单页提交） */
export function createIngressRoute(payload: IngressRoutePayload) {
  return envelope<IngressCreateResult>(http.post('/v1/routes/ingress', payload))
}
