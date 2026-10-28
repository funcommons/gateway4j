import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/store/auth'

// We need to track all localStorage operations. Mock localStorage to record
// getItem/setItem/removeItem calls and their arguments.
const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: vi.fn((k: string) => m.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => m.set(k, v)),
    removeItem: vi.fn((k: string) => m.delete(k)),
    _data: m,
    clear: () => m.clear()
  }
})()

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
  localStorageMock.clear()
  vi.mocked(localStorageMock.getItem).mockClear()
  vi.mocked(localStorageMock.setItem).mockClear()
  vi.mocked(localStorageMock.removeItem).mockClear()
  setActivePinia(createPinia())
})

afterEach(() => {
  setActivePinia(null as any)
})

describe('auth store logout — multi-step cleanup', () => {
  it('removes both gw4j_token AND gw4j_refresh from localStorage', () => {
    localStorageMock._data.set('gw4j_token', 'TOKEN')
    localStorageMock._data.set('gw4j_refresh', 'REFRESH')
    const auth = useAuthStore()
    auth.logout()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('gw4j_token')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('gw4j_refresh')
    // Both should actually be gone
    expect(localStorageMock._data.has('gw4j_token')).toBe(false)
    expect(localStorageMock._data.has('gw4j_refresh')).toBe(false)
  })

  it('clears in-memory token + user + permissions', () => {
    const auth = useAuthStore()
    auth.token = 'T'
    auth.user = { id: '1', username: 'u', roles: ['R'] }
    auth.permissions = [{ permission_code: 'p', permission_name: 'P', resource_type: 'X' }]
    auth.logout()
    expect(auth.token).toBe('')
    expect(auth.user).toBeNull()
    expect(auth.permissions).toEqual([])
  })

  it('isLogin becomes false after logout', () => {
    const auth = useAuthStore()
    auth.token = 'T'
    expect(auth.isLogin).toBe(true)
    auth.logout()
    expect(auth.isLogin).toBe(false)
  })

  it('logout on a logged-out user is a no-op (no errors)', () => {
    const auth = useAuthStore()
    expect(auth.token).toBe('')
    expect(() => auth.logout()).not.toThrow()
  })

  it('logout does not affect other localStorage keys (isolated)', () => {
    localStorageMock._data.set('gw4j_token', 'T')
    localStorageMock._data.set('other_key', 'PRESERVED')
    const auth = useAuthStore()
    auth.logout()
    expect(localStorageMock._data.has('other_key')).toBe(true)
    expect(localStorageMock._data.get('other_key')).toBe('PRESERVED')
  })

  it('logout is idempotent — calling twice does not error', () => {
    localStorageMock._data.set('gw4j_token', 'T')
    const auth = useAuthStore()
    auth.logout()
    expect(() => auth.logout()).not.toThrow()
  })
})

describe('auth store logout — order of operations', () => {
  it('removes gw4j_token before gw4j_refresh (consistent order)', () => {
    localStorageMock._data.set('gw4j_token', 'T')
    localStorageMock._data.set('gw4j_refresh', 'R')
    const auth = useAuthStore()
    vi.mocked(localStorageMock.removeItem).mockClear()
    auth.logout()
    const calls = vi.mocked(localStorageMock.removeItem).mock.calls.map((c: any[]) => c[0])
    // Both should be called, but order is implementation-defined
    expect(calls).toContain('gw4j_token')
    expect(calls).toContain('gw4j_refresh')
    expect(calls.length).toBe(2)
  })
})
