import { http, envelope } from './http'
import type { TimeseriesResponse } from './misc'

/**
 * v2 页面专用 API（S3 起，v2 视图统一从本模块取数）。
 * 惯例与 src/api/misc.ts 一致：http + envelope 解包，snake_case 字段原样透传不改名。
 */

/** 单上游端点健康（S2 契约：UpstreamHealthProbe 单 URL 探测，无多实例池） */
export interface RouteTrafficUpstream {
  reachable: boolean
  latency_ms: number | null
}

export interface RouteTrafficStatusCodes {
  c2xx: number
  c4xx: number
  c5xx: number
}

/** GET /v1/monitor/routes/traffic-summary 行结构（S2 后端契约，字段不下发时调用方按 undefined 兜底） */
export interface RouteTrafficSummaryItem {
  route_id: string
  route_name: string
  path: string
  status: string
  /** Long→String 契约下可能以字符串到达，展示前 Number() 归一 */
  hits_24h: number
  qps: number
  /** null = Prometheus 无原生分位数（quantile_fallback=true 时为均值估算值） */
  p95_latency_ms: number | null
  avg_latency_ms: number | null
  status_codes: RouteTrafficStatusCodes
  upstream: RouteTrafficUpstream | null
  /** prometheus = 实时指标；snapshot = 落库快照兜底 */
  source: 'prometheus' | 'snapshot'
  /** true = P95 为估算值（页面需出现快照兜底提示条） */
  quantile_fallback: boolean
}

/** 路由流量聚合（Prometheus 优先 + snapshot 兜底；任何后端异常由调用方降级为 —） */
export function fetchTrafficSummary() {
  return envelope<RouteTrafficSummaryItem[]>(http.get('/v1/monitor/routes/traffic-summary'))
}

/**
 * 单路由时序。端点与 src/api/misc.ts getRouteTimeseries 相同
 * （/v1/monitor/timeseries，source 声明 prometheus/snapshot 口径）；
 * v2 页面统一从 @/api/v2 取数，默认 24h 窗口 / 1h 粒度。
 */
export function fetchRouteTimeseries(routeId: string, timeRange = '24h', granularity = '1h') {
  return envelope<TimeseriesResponse>(
    http.get('/v1/monitor/timeseries', { params: { routeId, timeRange, granularity } })
  )
}

// ===== P4b-2b：网关级聚合时序（GET /v1/monitor/gateway/timeseries，P4b-2a 后端契约） =====

/** 时序点（MonitorTimeseriesService#gatewayTimeseries 8 字段权威；Instant → ISO-8601 直解） */
export interface GatewayTimeseriesPoint {
  timestamp: string
  /** Long→String 契约下可能以字符串到达，展示前 Number() 归一 */
  total_requests: number
  error_count: number
  error_rate: number
  avg_latency_ms?: number
  p50_latency_ms?: number
  p95_latency_ms?: number
  p99_latency_ms?: number
}

/** 网关级聚合时序载荷（source 快照口径与 traffic-summary 一致） */
export interface GatewayTimeseriesResponse {
  source: 'prometheus' | 'snapshot'
  data_points: GatewayTimeseriesPoint[]
  /** true = 分位序列缺失按 avg 退化填充（有值可画，非 null 占位） */
  quantile_fallback?: boolean
}

/** 网关级聚合时序（网关级 sum 单序列聚合，不带 path 过滤；wire 参数 snake_case 随后端） */
export function fetchGatewayTimeseries(timeRange = '24h', granularity = '1h') {
  return envelope<GatewayTimeseriesResponse>(http.get('/v1/monitor/gateway/timeseries',
    { params: { time_range: timeRange, granularity } }))
}

// ===== S7：分发决策树（GET /v1/v2/routes/{id}/decision-tree，S7a 后端契约） =====

/** 分支条件四元组（gw_route_condition；condition_type ∈ HEADER/PATH/QUERY/BODY/GROOVY） */
export interface DecisionTreeCondition {
  condition_type: string
  operator: string
  condition_key: string
  condition_value: string
}

/**
 * 决策树分支（分发边）。weight 仅 WEIGHT 条件下下发（非法 → null）；
 * hit_ratio 分母 = 本层 Σ分支 hits_24h，「未命中」由前端 1−Σ 推导，服务端不造数；
 * target_resolvable=false = 目标为 DRAFT/OFFLINE（include_unpublished 默认 true 时展示但不可解析）。
 */
export interface DecisionTreeBranch {
  target_route_id: string
  target_route_name: string
  target_route_type: string
  target_path: string
  target_upstream_url: string
  target_resolvable: boolean
  is_nested: boolean
  priority: number
  condition: DecisionTreeCondition | null
  weight: number | null
  hits_24h: number | null
  qps: number | null
  p95_latency_ms: number | null
  hit_ratio: number
  children: DecisionTreeBranch[]
}

/** 决策树载荷（payload 自包含：totals + 各分支指标 + source 都在内，无需再拉 traffic-summary） */
export interface DecisionTreePayload {
  route_id: string
  route_name: string
  route_type: 'DISPATCH' | 'BACKEND'
  path: string
  upstream_url: string
  status: string
  environment: string
  max_depth: number
  source: 'prometheus' | 'snapshot'
  totals: { hits_24h: number; qps: number }
  children: DecisionTreeBranch[]
}

/** 单路由分发决策树（只读呈现；id 不存在 → BusinessError 10400 ROUTE_NOT_FOUND） */
export function fetchDecisionTree(id: string | number) {
  return envelope<DecisionTreePayload>(http.get(`/v1/v2/routes/${id}/decision-tree`))
}
