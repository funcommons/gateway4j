import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, refreshToken as doRefresh, listPermissions } from '@/api/gateway/auth'
import type { LoginResponse } from '@/api/gateway/auth'

const TOKEN_KEY = 'gw4j_token'
const REFRESH_KEY_REMEMBER = 'gw4j_refresh'

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY_REMEMBER) ?? sessionStorage.getItem(REFRESH_KEY_REMEMBER)
}

function setRefreshToken(token: string, remember: boolean) {
  localStorage.removeItem(REFRESH_KEY_REMEMBER)
  sessionStorage.removeItem(REFRESH_KEY_REMEMBER)
  if (remember) localStorage.setItem(REFRESH_KEY_REMEMBER, token)
  else sessionStorage.setItem(REFRESH_KEY_REMEMBER, token)
}

function removeRefreshToken() {
  localStorage.removeItem(REFRESH_KEY_REMEMBER)
  sessionStorage.removeItem(REFRESH_KEY_REMEMBER)
}

export const useGatewayAuthStore = defineStore('gateway-auth', () => {
  const accessToken = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const refreshTokenVal = ref<string>(getRefreshToken() || '')
  const user = ref<{ id: string; username: string; real_name?: string; roles: string[] } | null>(null)
  const permissions = ref<Array<{ permission_code: string; permission_name: string; resource_type: string }>>([])
  const remember = ref(true)

  const isLoggedIn = computed(() => !!accessToken.value && !!user.value)
  const hasToken = computed(() => !!accessToken.value)

  function persistTokens(access: string, refresh: string) {
    accessToken.value = access
    refreshTokenVal.value = refresh
    localStorage.setItem(TOKEN_KEY, access)
    setRefreshToken(refresh, remember.value)
  }

  function clearAuth() {
    accessToken.value = ''
    refreshTokenVal.value = ''
    user.value = null
    permissions.value = []
    localStorage.removeItem(TOKEN_KEY)
    removeRefreshToken()
  }

  async function doLogin(username: string, password: string, rememberMe = true) {
    const r = await loginApi(username, password)
    remember.value = rememberMe
    user.value = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
    persistTokens(r.access_token, r.refresh_token)
    try {
      permissions.value = await listPermissions()
    } catch { /* allow missing */ }
  }

  async function refreshAccessToken(): Promise<string> {
    if (!refreshTokenVal.value) throw new Error('no refresh token')
    const r = await doRefresh(refreshTokenVal.value)
    persistTokens(r.access_token, r.refresh_token)
    user.value = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
    return r.access_token
  }

  async function init() {
    if (!accessToken.value || user.value) return
    const refresh = getRefreshToken()
    if (!refresh) { clearAuth(); return }
    remember.value = !!localStorage.getItem(REFRESH_KEY_REMEMBER)
    try {
      const r = await doRefresh(refresh)
      user.value = { id: r.user_id, username: r.username, real_name: r.real_name, roles: r.roles ?? [] }
      persistTokens(r.access_token, r.refresh_token)
      try {
        permissions.value = await listPermissions()
      } catch { /* allow missing */ }
    } catch {
      clearAuth()
    }
  }

  async function refreshPermissions() {
    try {
      permissions.value = await listPermissions()
    } catch { /* keep existing */ }
  }

  function logout() {
    clearAuth()
  }

  return {
    accessToken,
    refreshToken: refreshTokenVal,
    user,
    permissions,
    remember,
    isLoggedIn,
    hasToken,
    doLogin,
    refreshAccessToken,
    init,
    refreshPermissions,
    logout,
    clearAuth,
  }
})
