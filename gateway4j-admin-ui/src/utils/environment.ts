/**
 * H7b 环境维度 — 共用常量与工具。
 *
 * 契约（固定）：
 *   - 环境名 ^[a-z0-9_-]{1,20}$（创建路由可选 environment，缺省 default）
 *   - GET /v1/environments → { environments: string[] }，default 恒在首
 *   - 404 → 仅用 ['default']，且环境功能整体隐藏（降级路径）
 */
export const ENV_NAME_PATTERN = /^[a-z0-9_-]{1,20}$/

export const DEFAULT_ENV = 'default'

/** localStorage 持久化 key（顶栏切换器选中值） */
export const ENV_STORAGE_KEY = 'gw4j_env'

/** 环境名合法性（后端契约 ^[a-z0-9_-]{1,20}$）；非字符串一律非法 */
export function isValidEnvName(v: unknown): v is string {
  return typeof v === 'string' && ENV_NAME_PATTERN.test(v)
}

/**
 * 契约：default 恒在首。后端保证；前端兜底再排一次（其余保持后端顺序稳定）。
 * 非 default 的相对顺序不动，仅把 default 提到最前。
 */
export function sortEnvironmentsDefaultFirst(list: string[]): string[] {
  const idx = list.indexOf(DEFAULT_ENV)
  if (idx <= 0) return list
  return [DEFAULT_ENV, ...list.slice(0, idx), ...list.slice(idx + 1)]
}

/**
 * 环境标签色调（T4 路由列表「环境」小标签列）：default 灰、非 default 蓝。
 * 未知/缺省环境按 default 处理（旧后端不下发 environment 字段 → 视为 default）。
 */
export function envTagTone(environment?: string | null): 'gray' | 'primary' {
  const env = environment || DEFAULT_ENV
  return env === DEFAULT_ENV ? 'gray' : 'primary'
}

/**
 * 环境对比 only_in_from / only_in_to 元素归一：契约未固定元素形状，
 * 兼容字符串名与路由摘要对象（route_name / name）。
 */
export function envDiffRouteLabel(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    if (typeof o.route_name === 'string') return o.route_name
    if (typeof o.name === 'string') return o.name
  }
  return String(item ?? '')
}
