import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import * as authApi from '@/api/auth'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  listPermissions: vi.fn(),
  refreshToken: vi.fn()
}))

// Lazy import the store AFTER vi.mock so the mock applies.
import { useAuthStore } from '@/store/auth'

const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
  localStorageMock.clear()
  setActivePinia(createPinia())
  vi.mocked(authApi.login).mockReset()
  vi.mocked(authApi.listPermissions).mockReset()
  vi.mocked(authApi.refreshToken).mockReset()
})

describe('auth store — initial state', () => {
  it('starts logged-out when no token in storage', () => {
    const s = useAuthStore()
    expect(s.token).toBe('')
    expect(s.user).toBeNull()
    expect(s.permissions).toEqual([])
    expect(s.isLogin).toBe(false)
  })

  it('hydrates token from getToken on first access', () => {
    localStorageMock.setItem('gw4j_token', 'STORED')
    const s = useAuthStore()
    expect(s.token).toBe('STORED')
  })
})

describe('auth store — doLogin', () => {
  it('stores token, user, and persists token to storage', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user_id: '1', username: 'admin', real_name: '管理员',
      roles: ['ROLE_ADMIN'], access_token: 'TOKEN', refresh_token: 'RT', expires_in: 7200
    } as any)
    vi.mocked(authApi.listPermissions).mockResolvedValue([] as any)
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.isLogin).toBe(true)
    expect(s.user?.username).toBe('admin')
    expect(localStorageMock.getItem('gw4j_token')).toBe('TOKEN')
    expect(s.hasRole('ROLE_ADMIN')).toBe(true)
    expect(s.hasRole('ROLE_GUEST')).toBe(false)
  })

  it('fetches and stores permissions after successful login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user_id: '2', username: 'u', roles: [], access_token: 'T2', refresh_token: 'RT2', expires_in: 60
    } as any)
    vi.mocked(authApi.listPermissions).mockResolvedValue([
      { permission_code: 'route:read', permission_name: '查看路由', resource_type: 'ROUTE' }
    ] as any)
    const s = useAuthStore()
    await s.doLogin('u', 'pw')
    expect(s.permissions.length).toBe(1)
    expect(s.permissions[0].permission_code).toBe('route:read')
  })

  it('handles missing roles array by defaulting to []', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user_id: '3', username: 'u3', access_token: 'T3', refresh_token: 'RT3', expires_in: 60
    } as any)
    vi.mocked(authApi.listPermissions).mockResolvedValue([] as any)
    const s = useAuthStore()
    await s.doLogin('u3', 'pw')
    expect(s.user?.roles).toEqual([])
    expect(s.hasRole('ANY')).toBe(false)
  })

  it('continues even if listPermissions fails (allows login without perms)', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user_id: '4', username: 'u4', roles: ['R'], access_token: 'T4', refresh_token: 'RT4', expires_in: 60
    } as any)
    vi.mocked(authApi.listPermissions).mockRejectedValue(new Error('403'))
    const s = useAuthStore()
    await s.doLogin('u4', 'pw')
    expect(s.isLogin).toBe(true)
    expect(s.user?.username).toBe('u4')
    expect(s.permissions).toEqual([])
  })

  it('persists refresh_token to localStorage after login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user_id: '5', username: 'u5', roles: [], access_token: 'T5', refresh_token: 'RT5', expires_in: 60
    } as any)
    vi.mocked(authApi.listPermissions).mockResolvedValue([] as any)
    const s = useAuthStore()
    await s.doLogin('u5', 'pw')
    expect(localStorageMock.getItem('gw4j_refresh')).toBe('RT5')
  })
})

describe('auth store — refresh', () => {
  it('no-op when no token in store', async () => {
    const s = useAuthStore()
    await s.refresh()
    expect(authApi.refreshToken).not.toHaveBeenCalled()
  })

  it('no-op when no refresh token in localStorage', async () => {
    const s = useAuthStore()
    s.token = 'T'
    await s.refresh()
    expect(authApi.refreshToken).not.toHaveBeenCalled()
  })

  it('calls refreshToken, updates token + persists new refresh token', async () => {
    localStorageMock.setItem('gw4j_refresh', 'OLD_REFRESH')
    vi.mocked(authApi.refreshToken).mockResolvedValue({
      user_id: '5', username: 'u5', roles: [], access_token: 'NEW_T', refresh_token: 'NEW_RT', expires_in: 60
    } as any)
    const s = useAuthStore()
    s.token = 'OLD_T'
    await s.refresh()
    expect(s.token).toBe('NEW_T')
    expect(localStorageMock.getItem('gw4j_refresh')).toBe('NEW_RT')
  })
})

describe('auth store — logout', () => {
  it('clears state and storage', () => {
    localStorageMock.setItem('gw4j_token', 'TOK')
    localStorageMock.setItem('gw4j_refresh', 'RT')
    const s = useAuthStore()
    s.user = { id: '1', username: 'u', roles: ['R'] }
    s.permissions = [{ permission_code: 'p', permission_name: 'p', resource_type: 'X' }]
    s.logout()
    expect(s.token).toBe('')
    expect(s.user).toBeNull()
    expect(s.permissions).toEqual([])
    expect(localStorageMock.getItem('gw4j_token')).toBeNull()
    expect(localStorageMock.getItem('gw4j_refresh')).toBeNull()
  })
})

describe('auth store — getters', () => {
  it('isLogin is true iff token is non-empty', () => {
    const s = useAuthStore()
    expect(s.isLogin).toBe(false)
    s.token = 'X'
    expect(s.isLogin).toBe(true)
    s.token = ''
    expect(s.isLogin).toBe(false)
  })

  it('hasRole returns false when no user', () => {
    const s = useAuthStore()
    expect(s.hasRole('ADMIN')).toBe(false)
  })

  it('hasRole checks membership in user.roles', () => {
    const s = useAuthStore()
    s.user = { id: '1', username: 'u', roles: ['A', 'B'] }
    expect(s.hasRole('A')).toBe(true)
    expect(s.hasRole('B')).toBe(true)
    expect(s.hasRole('C')).toBe(false)
  })
})