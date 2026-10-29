import { http, envelope } from './http'

export interface LoginUserInfo {
  user_id: string
  username: string
  real_name?: string
  roles?: string[]
  access_token: string
  refresh_token?: string
  expires_in?: number
}

export interface LoginResponse {
  user_id: string
  username: string
  real_name?: string
  roles: string[]
  access_token: string
  refresh_token: string
  expires_in: number
  /**
   * P2-9 弱口令标记：登录响应平铺追加（缺省 false，非阻断）。
   * true = 仍在使用默认/初始口令，前端展示常驻改密横幅。
   */
  password_stale?: boolean
}

export function login(username: string, password: string) {
  return envelope<LoginResponse>(http.post('/v1/auth/login', { username, password }))
}

export function refreshToken(refreshToken: string) {
  return envelope<LoginResponse>(http.post('/v1/auth/refresh', { refresh_token: refreshToken }))
}

export function listPermissions() {
  return envelope<Array<{ permission_code: string; permission_name: string; resource_type: string }>>(
    http.get('/v1/permissions')
  )
}

export function listRoles() {
  return envelope<Array<{ id: string; role_code: string; role_name: string }>>(
    http.get('/v1/roles')
  )
}

// ===== 角色管理 (D16) — 契约固定，不得改路径 =====

export interface RoleCreatePayload {
  role_code: string
  role_name: string
  remark?: string
}

export interface RoleUpdatePayload {
  role_name: string
  remark?: string
}

export function createRole(payload: RoleCreatePayload) {
  return envelope<{ id: string; role_code: string; role_name: string }>(
    http.post('/v1/roles', payload)
  )
}

export function updateRole(id: string, payload: RoleUpdatePayload) {
  return envelope<{ id: string; role_code: string; role_name: string }>(
    http.put(`/v1/roles/${id}`, payload)
  )
}

export function deleteRole(id: string) {
  return envelope<void>(http.delete(`/v1/roles/${id}`))
}

export function getRolePermissions(id: string) {
  return envelope<string[]>(http.get(`/v1/roles/${id}/permissions`))
}

export function updateRolePermissions(id: string, permissionCodes: string[]) {
  return envelope<void>(
    http.put(`/v1/roles/${id}/permissions`, { permission_codes: permissionCodes })
  )
}

// ===== 角色成员管理 — 契约固定，不得改路径 =====

export interface RoleUserItem {
  id: string
  username: string
  real_name?: string
}

export function listRoleUsers(id: string) {
  return envelope<RoleUserItem[]>(http.get(`/v1/roles/${id}/users`))
}

export function updateRoleUsers(id: string, userIds: string[]) {
  return envelope<void>(http.put(`/v1/roles/${id}/users`, { user_ids: userIds }))
}
