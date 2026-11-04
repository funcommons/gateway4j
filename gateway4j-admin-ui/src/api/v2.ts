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
