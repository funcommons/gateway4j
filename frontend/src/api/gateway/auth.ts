import { http } from '../request'
import { envelope } from './envelope'

export interface LoginResponse {
  user_id: string
  username: string
  real_name?: string
  roles: string[]
  access_token: string
  refresh_token: string
  expires_in: number
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
