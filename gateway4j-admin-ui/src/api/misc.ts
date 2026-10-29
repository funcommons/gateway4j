import { http, envelope } from './http'

export interface DictEntry { value: string; label: string }

export function getDict(code: string) {
  return envelope<DictEntry[]>(http.get(`/v1/dict/${code}`))
}

export interface RouteStatusItem {
  route_id: string
  route_name: string
  status: 'HEALTHY' | 'ERROR' | 'CIRCUIT_OPEN'
  total_requests: number
  error_count: number
  error_rate: number
  /** P2-6 配套：上游健康探测结果（可选，旧版后端不下发 → undefined 不展示徽标） */
  upstream?: { reachable: boolean; latency_ms?: number | string; checked_at?: string | number } | null
}

export function listRouteStatus(routeId?: string) {
  return envelope<RouteStatusItem[]>(http.get('/v1/monitor/routes/status', { params: routeId ? { route_id: routeId } : {} }))
}

export interface RouteMetricsPoint {
  /** ISO-8601 字符串（后端 Instant.toString()），前端 new Date(iso) 直解 */
  timestamp: string
  total_requests: number
  error_count: number
  error_rate: number
  avg_latency_ms?: number
  p50_latency_ms?: number
  p95_latency_ms?: number
  p99_latency_ms?: number
}

export interface TopologyNode { id: string; name: string; type: string; status: string }
export interface TopologyEdge { source_id: string; target_id: string; condition: string }

export function getRouteMetrics(id: string, timeRange = '1h', granularity = '1m') {
  return envelope<{ route_id: string; data_points: RouteMetricsPoint[] }>(
    http.get(`/v1/monitor/routes/${id}/metrics`, { params: { time_range: timeRange, granularity } })
  )
}

export function getTopology() {
  return envelope<{ nodes: TopologyNode[]; edges: TopologyEdge[] }>(http.get('/v1/monitor/topology'))
}

// ===== P1-6: 时序指标（Prometheus → 快照兜底，由后端声明 source 口径）=====

export interface TimeseriesPoint {
  /** ISO-8601 字符串，前端 new Date(iso) 直解 */
  timestamp: string
  total_requests: number
  error_count: number
  error_rate: number
  avg_latency_ms?: number
  p50_latency_ms?: number
  p95_latency_ms?: number
  p99_latency_ms?: number
}

/** source=prometheus 走实时指标；source=snapshot 为落库快照（分位数与均值同口径） */
export interface TimeseriesResponse {
  source: 'prometheus' | 'snapshot'
  data_points: TimeseriesPoint[]
}

/**
 * P1-6 大盘指标时序源。旧 /monitor/routes/{id}/metrics 保留兼容，
 * 但大盘改调本接口；旧接口仅作为本接口 404/异常时的前端回退（新旧混布不白屏）。
 */
export function getRouteTimeseries(routeId: string, timeRange = '1h', granularity = '1m') {
  return envelope<TimeseriesResponse>(
    http.get('/v1/monitor/timeseries', { params: { routeId, timeRange, granularity } })
  )
}

// ===== P1-3: 配置同步状态（发布后轮询「已生效」确认）=====

export interface GatewaySyncInfo {
  version: number
  fingerprint: string
  updated_at: number
  instance: string
}

export interface SyncStatusResponse {
  /** false = 引擎状态未知（未上报 / Redis 失败 / TTL 过期），此时 gateway 为 null */
  available: boolean
  gateway: GatewaySyncInfo | null
  db_version: number
  /** true = 网关已加载到与 DB 一致的版本（发布生效） */
  in_sync: boolean
}

/** 配置同步状态：发布/应用画布后轮询该接口确认网关已生效。 */
export function getSyncStatus() {
  return envelope<SyncStatusResponse>(http.get('/v1/config/sync-status'))
}

export interface UserItem {
  id: string
  username: string
  real_name?: string
  phone?: string
  status: 'ENABLED' | 'DISABLED'
  role_codes: string[]
  created_at: number
  updated_at: number
}

export function listUsers(params: { page: number; pageSize: number; status?: string; keyword?: string }) {
  const { page, pageSize, ...rest } = params
  return envelope<{ records: UserItem[]; total: number }>(http.get('/v1/users', {
    params: { page, page_size: pageSize, ...rest }
  }))
}
export function createUser(payload: { username: string; password: string; real_name?: string; phone?: string; role_codes: string[] }) {
  return http.post('/v1/users', payload)
}
export function updateUser(id: string, payload: Partial<{ real_name: string; phone: string; password: string; status: string; role_codes: string[] }>) {
  return http.patch(`/v1/users/${id}`, payload)
}
export function deleteUser(id: string) {
  return http.delete(`/v1/users/${id}`)
}
export function resetPassword(id: string, newPassword: string) {
  return http.post(`/v1/users/${id}/reset-password`, { new_password: newPassword })
}

// ===== 变更记录（系统设置 Tab）=====

export interface ChangeItem {
  type: 'route' | 'plugin'
  id: string
  name: string
  status: string
  config_version: string
  updated_at: number | string
}

export function listChanges(limit = 50) {
  return envelope<ChangeItem[]>(http.get('/v1/changes', { params: { limit } }))
}

// ===== P2-6 变更记录升级：审计日志信封分页 =====
// 契约（固定）：GET /v1/audit/logs?action=&actor=&target=&from=&to=&page=&pageSize=
// 信封分页 { records, total, size, current, pages }；Long→String 契约下 id 为字符串。
// 旧 /v1/changes 保留为 404 / 失败时的前端回退（新旧混布安全）。

export interface AuditLogItem {
  /** Long→String 契约：雪花 id 以字符串到达 */
  id: string
  action: string
  /** 后端 AuditLog 实际形状：target_type + target_id */
  target_type?: string
  target_id?: string
  /** 任务契约草稿字段（后端未下发时为 undefined） */
  target?: string
  actor: string
  result: string
  /** 审计时间（AuditLog.createdAt，ISO-8601） */
  created_at: string | number
  [key: string]: unknown
}

export interface AuditLogPage {
  records: AuditLogItem[]
  total: number | string
  size: number | string
  current: number | string
  pages: number | string
}

export interface AuditLogQuery {
  page: number
  pageSize: number
  action?: string
  actor?: string
  target?: string
  /** ISO-8601 / 'YYYY-MM-DD HH:mm:ss'，原样透传给后端 */
  from?: string
  to?: string
}

export function listAuditLogs(params: AuditLogQuery) {
  const { page, pageSize, ...rest } = params
  // 契约逐字：查询参数名为 pageSize（区别于站内旧接口的 page_size）
  return envelope<AuditLogPage>(http.get('/v1/audit/logs', {
    params: { page, pageSize, ...rest }
  }))
}

export function getConfig(configType: string) {
  return envelope<Record<string, any>>(http.get(`/v1/config/${configType}`))
}

export function saveConfig(configType: string, payload: Record<string, any>) {
  return http.put(`/v1/config/${configType}`, payload)
}
