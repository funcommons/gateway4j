import { http } from '../request'
import { envelope } from './envelope'

export interface RouteNode {
  id: string
  route_name: string
  route_type: 'DISPATCH' | 'BACKEND'
  path?: string
  upstream_url?: string
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'CHANGING'
  sort_order: number
  remark?: string
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

export function listRoutes() {
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
  conditions: RouteConditionDto[]
  plugin_ids: string[]
  bindings: Array<{ plugin_id: string; binding_config: string; sort_order?: number }>
}>) {
  return envelope<RouteDetail>(http.patch(`/v1/routes/${id}`, payload))
}

export function deleteRoute(id: string) {
  return http.delete(`/v1/routes/${id}`)
}

export function publishRoute(id: string) {
  return http.post(`/v1/routes/${id}/publish`)
}

export function offlineRoute(id: string) {
  return http.post(`/v1/routes/${id}/offline`)
}

export function validateRoute(payload: { route_id?: string; conditions: RouteConditionDto[] }) {
  return http.post('/v1/routes/validate', payload)
}

export function getCanvas(routeId: string) {
  return envelope<{ route_id: string; canvas_data: any }>(http.get(`/v1/routes/${routeId}/canvas`))
}

export function saveCanvas(routeId: string, canvasData: any) {
  return http.put(`/v1/routes/${routeId}/canvas`, { canvas_data: canvasData })
}

export function listBindings(routeId: string) {
  return envelope<BindingDto[]>(http.get(`/v1/routes/${routeId}/plugins`))
}

export function getPluginChain(routeId: string) {
  return envelope<{ pre_chain: any[]; post_chain: any[] }>(http.get(`/v1/routes/${routeId}/plugin-chain`))
}

export interface RoutePackage {
  version: string
  exported_at: number
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

export interface ImportReport {
  is_valid: boolean
  conflicts?: string[]
  missing_plugins?: string[]
  missing_targets?: string[]
  cycle_warnings?: string[]
}

export interface ImportResult {
  total: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ route_name: string; message: string }>
}

export function exportRoutes(routeIds?: string[], status?: string) {
  const params: Record<string, unknown> = {}
  if (routeIds) params.route_ids = routeIds
  if (status) params.status = status
  return envelope<RoutePackage>(http.get('/v1/routes/export', { params }))
}

export function validateImport(pkg: RoutePackage) {
  return envelope<ImportReport>(http.post('/v1/routes/import/validate', pkg))
}

export function importRoutes(pkg: RoutePackage, strategy: 'SKIP' | 'OVERWRITE' | 'ERROR') {
  return envelope<ImportResult>(http.post('/v1/routes/import', { data: pkg, strategy }))
}
