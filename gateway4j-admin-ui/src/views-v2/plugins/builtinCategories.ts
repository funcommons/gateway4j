export type BuiltinCategoryKey =
  | 'security'
  | 'rate-limit'
  | 'traffic-rewrite'
  | 'observability'
  | 'traffic-control'
  | 'response'
  | 'other'

export const PLUGIN_CATEGORY_MAP: Record<string, BuiltinCategoryKey> = {
  // 安全认证 (6)
  security: 'security',
  'basic-auth': 'security',
  'key-auth': 'security',
  jwt: 'security',
  oauth2: 'security',
  sign: 'security',
  // 限流熔断 (3)
  'rate-limiter': 'rate-limit',
  'circuit-breaker': 'rate-limit',
  sentinel: 'rate-limit',
  // 流量改写 (5)
  rewrite: 'traffic-rewrite',
  redirect: 'traffic-rewrite',
  'param-mapping': 'traffic-rewrite',
  'context-path': 'traffic-rewrite',
  request: 'traffic-rewrite',
  // 可观测 (5)
  logging: 'observability',
  'logging-kafka': 'observability',
  'logging-es': 'observability',
  tracing: 'observability',
  metrics: 'observability',
  // 流量控制 (4)
  cache: 'traffic-control',
  retry: 'traffic-control',
  websocket: 'traffic-control',
  waf: 'traffic-control',
  // 响应处理 (3)
  'modify-response': 'response',
  'cryptor-request': 'response',
  'cryptor-response': 'response',
  // 其他 (4)
  sharing: 'other',
  mock: 'other',
  dingtalk: 'other',
  watermark: 'other',
}

export const BUILTIN_CATEGORIES: Array<{ key: BuiltinCategoryKey }> = [
  { key: 'security' },
  { key: 'rate-limit' },
  { key: 'traffic-rewrite' },
  { key: 'observability' },
  { key: 'traffic-control' },
  { key: 'response' },
  { key: 'other' },
]

export function getBuiltinCategory(pluginId: string): BuiltinCategoryKey {
  return PLUGIN_CATEGORY_MAP[pluginId] ?? 'other'
}
