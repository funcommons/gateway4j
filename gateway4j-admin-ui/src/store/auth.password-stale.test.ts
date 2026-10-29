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

const storageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

function baseLogin(over: Record<string, unknown> = {}) {
  return {
    user_id: '1', username: 'admin', roles: ['ROLE_ADMIN'],
    access_token: 'T', refresh_token: 'RT', expires_in: 7200,
    ...over
  } as any
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storageMock, configurable: true })
  storageMock.clear()
  setActivePinia(createPinia())
  vi.mocked(authApi.login).mockReset()
  vi.mocked(authApi.listPermissions).mockReset().mockResolvedValue([] as any)
  vi.mocked(authApi.refreshToken).mockReset()
})

describe('auth store — P2-9 password_stale 三态', () => {
  it('password_stale=true → passwordStale 置位且横幅可见', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: true }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.passwordStale).toBe(true)
    expect(s.showPasswordStaleBanner).toBe(true)
  })

  it('password_stale 缺省 → false 非阻断（横幅不渲染）', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin())
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.passwordStale).toBe(false)
    expect(s.showPasswordStaleBanner).toBe(false)
  })

  it('password_stale=false → 显式否定（横幅不渲染）', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: false }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.passwordStale).toBe(false)
    expect(s.showPasswordStaleBanner).toBe(false)
  })

  it('markPasswordChanged → 横幅就地消失并记录本会话已改', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: true }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.showPasswordStaleBanner).toBe(true)
    s.markPasswordChanged()
    expect(s.passwordStale).toBe(false)
    expect(s.showPasswordStaleBanner).toBe(false)
    expect(storageMock.getItem('gw4j_pwd_changed')).toBe('1')
  })

  it('refresh 响应 password_stale=false 可纠正已置位状态', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: true }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    expect(s.passwordStale).toBe(true)
    storageMock.setItem('gw4j_refresh', 'RT')
    vi.mocked(authApi.refreshToken).mockResolvedValue(baseLogin({ password_stale: false, access_token: 'T2', refresh_token: 'RT2' }))
    await s.refresh()
    expect(s.passwordStale).toBe(false)
    expect(s.showPasswordStaleBanner).toBe(false)
  })

  it('refresh 响应缺省字段时不清掉已有置位（缺省非阻断语义）', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: true }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    storageMock.setItem('gw4j_refresh', 'RT')
    vi.mocked(authApi.refreshToken).mockResolvedValue(baseLogin({ access_token: 'T3', refresh_token: 'RT3' }))
    await s.refresh()
    expect(s.passwordStale).toBe(true)
  })

  it('logout 清除弱口令状态与会话「已改」标记', async () => {
    vi.mocked(authApi.login).mockResolvedValue(baseLogin({ password_stale: true }))
    const s = useAuthStore()
    await s.doLogin('admin', 'pw')
    s.markPasswordChanged()
    s.logout()
    expect(s.passwordStale).toBe(false)
    expect(s.showPasswordStaleBanner).toBe(false)
    expect(storageMock.getItem('gw4j_pwd_changed')).toBeNull()
  })
})
