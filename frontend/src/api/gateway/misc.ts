import { http } from '../request'
import { envelope } from './envelope'

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
}

export function listRouteStatus(routeId?: string) {
  return envelope<RouteStatusItem[]>(http.get('/v1/monitor/routes/status', { params: routeId ? { route_id: routeId } : {} }))
}

export interface RouteMetricsPoint {
  timestamp: number
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

export function getConfig(configType: string) {
  return envelope<Record<string, any>>(http.get(`/v1/config/${configType}`))
}

export function saveConfig(configType: string, payload: Record<string, any>) {
  return http.put(`/v1/config/${configType}`, payload)
}
