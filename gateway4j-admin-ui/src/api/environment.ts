import { http, envelope } from './http'

// ===== H7b 环境维度 API（固定契约）=====
// 1. GET /v1/environments → { environments: ["default","staging",...] }（default 恒在首）
//    404 → 调用方降级：仅用 ['default']，环境功能整体隐藏。
// 2. GET /v1/routes/environment-diff?from=&to= → 环境对比三段结果。

export interface EnvironmentsResponse {
  environments: string[]
}

/** 环境列表：信封内外形状都兼容（envelope 对无 code 载荷原样透传）。 */
export function listEnvironments() {
  return envelope<EnvironmentsResponse>(http.get('/v1/environments'))
}

// ===== 环境对比 =====

/** 单个字段的 from → to 变更 */
export interface EnvDiffFieldChange {
  from: unknown
  to: unknown
}

/** changed 逐路由条目：字段级 from→to */
export interface EnvDiffChangedRoute {
  route_name: string
  fields: Record<string, EnvDiffFieldChange>
}

export interface EnvDiffResult {
  from: string
  to: string
  /** 仅 from 环境有的路由（元素形状兼容字符串名 / 路由摘要对象） */
  only_in_from: unknown[]
  /** 仅 to 环境有的路由 */
  only_in_to: unknown[]
  /** 两边都有但字段不同：逐路由字段级 diff */
  changed: EnvDiffChangedRoute[]
}

export function getEnvironmentDiff(from: string, to: string) {
  return envelope<EnvDiffResult>(http.get('/v1/routes/environment-diff', { params: { from, to } }))
}
