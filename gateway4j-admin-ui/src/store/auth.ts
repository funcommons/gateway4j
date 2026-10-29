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

/** P2-9：本会话「已改密」标记 key（横幅消除的本地记忆，下次登录以后端字段为准） */
const PWD_CHANGED_KEY = 'gw4j_pwd_changed'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken() ?? '',
    user: null as null | { id: string; username: string; real_name?: string; roles: string[] },
    permissions: [] as Array<{ permission_code: string; permission_name: string; resource_type: string }>,
    remember: true,
    /**
     * P2-9 弱口令横幅：登录响应 password_stale===true 时置位（缺省 false 非阻断）。
     * 本地改密成功后由 markPasswordChanged() 就地消除（sessionStorage 记忆本会话，
     * 下次登录以后端响应字段为准）。
     */
    passwordStale: false
  }),
  getters: {
    isLogin: (s) => !!s.token,
    hasRole: (s) => (code: string) => (s.user?.roles ?? []).includes(code),
    /** 横幅可见 = 响应声明弱口令 且 本会话未记录「已改密」 */
    showPasswordStaleBanner: (s) => s.passwordStale && sessionStorage.getItem(PWD_CHANGED_KEY) !== '1'
  },
  actions: {
    applyPasswordStale(v: unknown) {
      // 契约：缺省 false 非阻断。字段缺省（undefined）时保持现状（旧后端 refresh 不带该字段，
      // 不应清掉登录时已置位的横幅）；显式 true/false 才覆盖。
      if (typeof v === 'boolean') this.passwordStale = v
    },
    markPasswordChanged() {
      // 本地记录已改状态：横幅立即消失；sessionStorage 会话内防刷新复活
      this.passwordStale = false
      try { sessionStorage.setItem(PWD_CHANGED_KEY, '1') } catch { /* 隐私模式等场景静默 */ }
    },
    async init() {
      if (!this.token || this.user) return
      const refresh = getRefreshToken()
      if (!refresh) { this.logout(); return }
      this.remember = !!localStorage.getItem('gw4j_refresh')
      try {
        const r = (await doRefresh(refresh)) as unknown as LoginResponse
        this.token = r.access_token
        this.user = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
        this.applyPasswordStale((r as any).password_stale)
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
      this.applyPasswordStale((r as any).password_stale)
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
      this.applyPasswordStale((r as any).password_stale)
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
      this.passwordStale = false
      try { sessionStorage.removeItem(PWD_CHANGED_KEY) } catch { /* 静默 */ }
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
