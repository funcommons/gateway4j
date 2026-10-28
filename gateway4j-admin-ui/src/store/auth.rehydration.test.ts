import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import * as authApi from '@/api/auth'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  listPermissions: vi.fn(),
  refreshToken: vi.fn()
}))

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

describe('auth store — init (rehydration)', () => {
  it('does nothing when no token exists', async () => {
    const s = useAuthStore()
    await s.init()
    expect(authApi.refreshToken).not.toHaveBeenCalled()
    expect(authApi.listPermissions).not.toHaveBeenCalled()
  })

  it('does nothing when user is already populated (already logged in)', async () => {
    const s = useAuthStore()
    s.token = 'T'
    s.user = { id: '1', username: 'admin', roles: ['ROLE_ADMIN'] }
    await s.init()
    expect(authApi.refreshToken).not.toHaveBeenCalled()
  })

  it('rehydrates user + permissions when token exists but user is null', async () => {
    localStorageMock.setItem('gw4j_refresh', 'RT')
    vi.mocked(authApi.refreshToken).mockResolvedValue({
      user_id: '1', username: 'admin', real_name: '管理员',
      roles: ['ROLE_ADMIN'], access_token: 'NEW_T', refresh_token: 'NEW_RT', expires_in: 7200
    } as any)
    vi.mocked(authApi.listPermissions).mockResolvedValue([
      { permission_code: 'route:read', permission_name: '查看路由', resource_type: 'ROUTE' },
      { permission_code: 'plugin:read', permission_name: '查看插件', resource_type: 'PLUGIN' }
    ] as any)

    const s = useAuthStore()
    s.token = 'OLD_T'
    expect(s.user).toBeNull()
    expect(s.permissions).toEqual([])

    await s.init()

    expect(authApi.refreshToken).toHaveBeenCalledWith('RT')
    expect(s.user?.username).toBe('admin')
    expect(s.user?.roles).toEqual(['ROLE_ADMIN'])
    expect(s.permissions.length).toBe(2)
    expect(s.permissions[0].permission_code).toBe('route:read')
  })

  it('clears token and logs out on rehydration failure', async () => {
    localStorageMock.setItem('gw4j_refresh', 'BAD_RT')
    vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('401'))

    const s = useAuthStore()
    s.token = 'EXPIRED_T'

    await s.init()

    expect(s.token).toBe('')
    expect(s.user).toBeNull()
    expect(s.isLogin).toBe(false)
  })

  it('rehydrates even when listPermissions fails', async () => {
    localStorageMock.setItem('gw4j_refresh', 'RT')
    vi.mocked(authApi.refreshToken).mockResolvedValue({
      user_id: '1', username: 'admin', roles: ['ROLE_ADMIN'],
      access_token: 'T', refresh_token: 'RT2', expires_in: 7200
    } as any)
    vi.mocked(authApi.listPermissions).mockRejectedValue(new Error('403'))

    const s = useAuthStore()
    s.token = 'OLD_T'
    await s.init()

    expect(s.user?.username).toBe('admin')
    expect(s.permissions).toEqual([])
  })
})
