import { http, envelope } from './http'

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

export function listRoutes(params?: { tag?: string; environment?: string }) {
  if (params?.tag || params?.environment) {
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

export function deleteRoute(id: string) {
  return http.delete(`/v1/routes/${id}`)
}

/**
 * 发布路由。H7b：body 可选 { change_description }（UI 侧必填 1~200 字）；
 * 旧后端忽略 body —— 不传时保持无 body 调用（兼容）。
 */
export function publishRoute(id: string, changeDescription?: string) {
  if (changeDescription != null && changeDescription !== '') {
    return http.post(`/v1/routes/${id}/publish`, { change_description: changeDescription })
  }
  return http.post(`/v1/routes/${id}/publish`)
}

export function offlineRoute(id: string) {
  return http.post(`/v1/routes/${id}/offline`)
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
  return http.post('/v1/routes/validate', payload)
}

export function listRouteChildren(id: string) {
  return envelope<RouteNode[]>(http.get(`/v1/routes/${id}/children`))
}

export function sortRoutes(routeIds: string[]) {
  return http.put('/v1/routes/sort', { route_ids: routeIds })
}

export function getCanvas(routeId: string) {
  return envelope<{ route_id: string; canvas_data: any }>(http.get(`/v1/routes/${routeId}/canvas`))
}
export function saveCanvas(routeId: string, canvasData: any) {
  return http.put(`/v1/routes/${routeId}/canvas`, { canvas_data: canvasData })
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
  return http.post(`/v1/routes/${routeId}/conditions`, condition)
}
export function updateCondition(routeId: string, condId: string, condition: RouteConditionDto) {
  return http.put(`/v1/routes/${routeId}/conditions/${condId}`, condition)
}
export function deleteCondition(routeId: string, condId: string) {
  return http.delete(`/v1/routes/${routeId}/conditions/${condId}`)
}

export function listBindings(routeId: string) {
  return envelope<BindingDto[]>(http.get(`/v1/routes/${routeId}/plugins`))
}
export function bindPlugin(routeId: string, payload: { plugin_id: string; binding_config: string }) {
  return http.post(`/v1/routes/${routeId}/plugins`, payload)
}
export function updateBinding(routeId: string, bindingId: string, payload: { binding_config: string; sort_order?: number }) {
  return http.put(`/v1/routes/${routeId}/plugins/${bindingId}`, payload)
}
export function unbindPlugin(routeId: string, bindingId: string) {
  return http.delete(`/v1/routes/${routeId}/plugins/${bindingId}`)
}
export function sortRoutePlugins(routeId: string, pluginPhase: string, bindingIds: string[]) {
  return http.put(`/v1/routes/${routeId}/plugins/sort`, { plugin_phase: pluginPhase, binding_ids: bindingIds })
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
