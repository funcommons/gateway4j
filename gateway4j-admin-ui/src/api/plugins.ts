import { http, envelope } from './http'

export interface Page<T> {
  records: T[]
  total: number
  size: number
  current: number
  pages: number
}

export interface PluginItem {
  id: string
  plugin_name: string
  plugin_id: string
  plugin_type: 'BUILTIN' | 'JAR' | 'GROOVY' | 'GROUP'
  plugin_phase: 'PRE' | 'POST'
  scope: 'GLOBAL' | 'ROUTE'
  status: 'ENABLED' | 'DISABLED'
  sort_order: number
  config: string
  remark?: string
}

export interface BuiltinTypeMeta {
  plugin_id: string
  plugin_name: string
  plugin_phase: string
  description: string
  config_schema: any
  category?: string
}

export function listPlugins(params: { page: number; pageSize: number; keyword?: string; pluginType?: string; pluginPhase?: string; scope?: string; status?: string }) {
  const { page, pageSize, keyword, pluginType, pluginPhase, ...rest } = params
  return envelope<Page<PluginItem>>(http.get('/v1/plugins', {
    params: { page, page_size: pageSize, keyword, plugin_type: pluginType, plugin_phase: pluginPhase, ...rest }
  }))
}

// P4f C2：listGlobalPlugins 已随旧树 plugins/Global.vue 拆除（P4a 裁决「随拆旧废弃」）；
// sortGlobalPlugins 为 v2 插件链（Chain.vue）共享，保留。

export function sortGlobalPlugins(pluginPhase: string, pluginIds: string[]) {
  return http.put('/v1/plugins/global/sort', { plugin_phase: pluginPhase, plugin_ids: pluginIds })
}

export function createPlugin(payload: Partial<PluginItem> & { group_member_ids?: string[]; script_content?: string } | FormData) {
  if (payload instanceof FormData) {
    return http.post('/v1/plugins', payload, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
  return http.post('/v1/plugins', payload)
}
export function getPlugin(id: string) {
  return envelope<PluginItem>(http.get(`/v1/plugins/${id}`))
}
export function updatePlugin(id: string, payload: Partial<PluginItem> | FormData) {
  if (payload instanceof FormData) {
    return http.patch(`/v1/plugins/${id}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
  return http.patch(`/v1/plugins/${id}`, payload)
}
export function deletePlugin(id: string) {
  return http.delete(`/v1/plugins/${id}`)
}
export function enablePlugin(id: string) {
  return http.post(`/v1/plugins/${id}/enable`)
}
export function disablePlugin(id: string) {
  return http.post(`/v1/plugins/${id}/disable`)
}

export function listBuiltinTypes() {
  return envelope<BuiltinTypeMeta[]>(http.get('/v1/plugins/builtin-types'))
}
export function getBuiltinSchema(pluginId: string) {
  return envelope<BuiltinTypeMeta>(http.get(`/v1/plugins/builtin-types/${pluginId}/schema`))
}
export function validateConfig(pluginId: string, config: string) {
  return envelope<{ is_valid: boolean; error_message?: string }>(http.post('/v1/plugins/validate-config', { plugin_id: pluginId, config }))
}

export function validateGroovy(scriptContent: string) {
  return envelope<{ is_valid: boolean; error_message?: string }>(http.post('/v1/plugins/validate-groovy', { script_content: scriptContent }))
}

export interface PluginRuntimeStatusItem {
  plugin_id: string
  phase: string
  registered: boolean
  updated_at: number
  /** P1-2: 自装载以来的执行计数；引擎未上报时缺省（前端需兼容不显示） */
  stats?: {
    executed: number
    skipped: number
    error: number
  }
}

export interface PluginRuntimeStatusResponse {
  /** false = 状态未知（engine 未写入 / Redis 失败 / TTL 过期），前端需静默降级不显示接线徽标 */
  available: boolean
  items: PluginRuntimeStatusItem[]
}

/** 数据面插件接线状态（engine 每次 reload 后写入 Redis，TTL 10 分钟）。 */
export function getRuntimeStatus() {
  return envelope<PluginRuntimeStatusResponse>(http.get('/v1/plugins/runtime-status'))
}
