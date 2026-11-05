import { http, envelope } from './http'

/**
 * S11b：调试台影子回放 API 封装（契约 docs/ui-v2/实施契约.md §4 S11 行 S11b；
 * 后端 = V2DebugController POST /v1/v2/debug/replay + DebugReplayService，baa8bc7）。
 *
 * route_id 恒传（@RequestParam Long 必填）：未选路由传空串 —— Spring 对空串
 * 转 null Long → 稳定走 validateRoute(null) → 业务信封 10601（ROUTE_NOT_FOUND），
 * 而参数缺失会拿到非信封 400，页面无法按业务码分支文案。
 */
export function debugReplay(routeId: string | null, payload: DebugReplayPayload) {
  return envelope<DebugReplayResult>(
    http.post('/v1/v2/debug/replay', payload, { params: { route_id: routeId ?? '' } })
  )
}

/** 回放请求体五分量（与后端 V2DebugReplayRequest record 一一同形） */
export interface DebugReplayPayload {
  path: string
  method: string
  /** 键 trim 后非空才收；值允许空串 */
  headers: Record<string, string>
  query: Record<string, string>
  /** 空（trim 后空白）→ null；后端按无请求体处理 */
  body: string | null
}

/** simulate 预测段（RouteSimulateService.simulate 返回形状，服务端原样内嵌） */
export interface DebugSimulate {
  matched: boolean
  route: {
    id: string
    route_name: string
    route_type: string
    path?: string
    upstream_url?: string
  } | null
  evaluated: Array<{
    route_id: string
    route_name: string
    route_type: string
    matched: boolean
    path_matched: boolean
    reason: string
  }>
  /** 仅 DISPATCH 命中时下发（条件求值 trace） */
  dispatch?: Record<string, unknown>
  plugins: { global_pre: unknown[]; route: unknown[]; global_post: unknown[] }
  request: { path: string; method: string }
}

/** replay 成功 data 五键（snake_case）。无截断标记字段：body >64KB 截为 65536 字符前缀 */
export interface DebugReplayResult {
  simulate: DebugSimulate
  /** 上游真实状态码（4xx/5xx 不抛，原样回传） */
  status: number
  /** 回放墙钟毫秒 */
  latency_ms: number
  headers: Record<string, string>
  body: string | null
}
