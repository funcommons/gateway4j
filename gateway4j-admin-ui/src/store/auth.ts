import { defineStore } from 'pinia'
import { getToken, setToken, setOnTokenRefresh } from '@/api/http'
import { login, refreshToken as doRefresh, listPermissions } from '@/api/auth'
import type { LoginResponse } from '@/api/auth'

function getRefreshToken(): string | null {
  return localStorage.getItem('gw4j_refresh') ?? sessionStorage.getItem('gw4j_refresh')
}

function setRefreshToken(token: string, remember: boolean) {
  localStorage.removeItem('gw4j_refresh')
  sessionStorage.removeItem('gw4j_refresh')
  if (remember) localStorage.setItem('gw4j_refresh', token)
  else sessionStorage.setItem('gw4j_refresh', token)
}

function removeRefreshToken() {
  localStorage.removeItem('gw4j_refresh')
  sessionStorage.removeItem('gw4j_refresh')
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken() ?? '',
    user: null as null | { id: string; username: string; real_name?: string; roles: string[] },
    permissions: [] as Array<{ permission_code: string; permission_name: string; resource_type: string }>,
    remember: true
  }),
  getters: {
    isLogin: (s) => !!s.token,
    hasRole: (s) => (code: string) => (s.user?.roles ?? []).includes(code)
  },
  actions: {
    async init() {
      if (!this.token || this.user) return
      const refresh = getRefreshToken()
      if (!refresh) { this.logout(); return }
      this.remember = !!localStorage.getItem('gw4j_refresh')
      try {
        const r = (await doRefresh(refresh)) as unknown as LoginResponse
        this.token = r.access_token
        this.user = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
        setToken(r.access_token)
        setRefreshToken(r.refresh_token, this.remember)
        try {
          this.permissions = await listPermissions()
        } catch { /* allow missing */ }
      } catch {
        this.logout()
      }
    },
    async doLogin(username: string, password: string, remember = true) {
      const r = (await login(username, password)) as unknown as LoginResponse
      this.token = r.access_token
      this.user = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
      this.remember = remember
      setToken(r.access_token)
      setRefreshToken(r.refresh_token, remember)
      try {
        this.permissions = await listPermissions()
      } catch { /* allow missing */ }
    },
    async refresh() {
      if (!this.token) return
      const refresh = getRefreshToken()
      if (!refresh) return
      const r = (await doRefresh(refresh)) as unknown as LoginResponse
      this.token = r.access_token
      setToken(r.access_token)
      setRefreshToken(r.refresh_token, this.remember)
    },
    async refreshPermissions() {
      try {
        this.permissions = await listPermissions()
      } catch { /* keep existing permissions on failure */ }
    },
    logout() {
      this.token = ''
      this.user = null
      this.permissions = []
      setToken(null)
      removeRefreshToken()
    }
  }
})

setOnTokenRefresh(async () => {
  const refresh = getRefreshToken()
  if (!refresh) return null
  try {
    const r = (await doRefresh(refresh)) as unknown as LoginResponse
    const auth = useAuthStore()
    auth.token = r.access_token
    setToken(r.access_token)
    setRefreshToken(r.refresh_token, auth.remember)
    return r.access_token
  } catch {
    return null
  }
})
