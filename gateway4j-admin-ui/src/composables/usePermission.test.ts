import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  listPermissions: vi.fn(),
  refreshToken: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: vi.fn(), post: vi.fn() },
  envelope: (p: any) => p,
  getToken: () => null,
  setToken: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

import { useAuthStore } from '@/store/auth'
import { usePermission } from '@/composables/usePermission'

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
})

describe('usePermission', () => {
  function setPermissions(codes: string[]) {
    const auth = useAuthStore()
    ;(auth as any).permissions = codes.map(c => ({ permission_code: c, permission_name: c, resource_type: 'TEST' }))
  }

  it('hasPermission returns true when permission exists', () => {
    setPermissions(['route:read', 'route:edit'])
    const { hasPermission } = usePermission()
    expect(hasPermission('route:read')).toBe(true)
  })

  it('hasPermission returns false when permission does not exist', () => {
    setPermissions(['route:read'])
    const { hasPermission } = usePermission()
    expect(hasPermission('route:edit')).toBe(false)
  })

  it('hasPermission returns false for empty permissions', () => {
    setPermissions([])
    const { hasPermission } = usePermission()
    expect(hasPermission('route:read')).toBe(false)
  })

  it('hasAnyPermission returns true if any permission matches', () => {
    setPermissions(['route:read'])
    const { hasAnyPermission } = usePermission()
    expect(hasAnyPermission('route:edit', 'route:read')).toBe(true)
  })

  it('hasAnyPermission returns false if no permission matches', () => {
    setPermissions(['route:read'])
    const { hasAnyPermission } = usePermission()
    expect(hasAnyPermission('route:edit', 'plugin:read')).toBe(false)
  })

  it('hasAnyPermission returns false for empty permissions', () => {
    setPermissions([])
    const { hasAnyPermission } = usePermission()
    expect(hasAnyPermission('route:read')).toBe(false)
  })

  it('canEdit returns true when route:edit exists', () => {
    setPermissions(['route:edit'])
    const { canEdit } = usePermission()
    expect(canEdit('route')).toBe(true)
  })

  it('canEdit returns false when only route:read exists', () => {
    setPermissions(['route:read'])
    const { canEdit } = usePermission()
    expect(canEdit('route')).toBe(false)
  })

  it('canEdit works for plugin:edit', () => {
    setPermissions(['plugin:edit'])
    const { canEdit } = usePermission()
    expect(canEdit('plugin')).toBe(true)
  })

  it('canEdit works for user:edit', () => {
    setPermissions(['user:edit'])
    const { canEdit } = usePermission()
    expect(canEdit('user')).toBe(true)
  })

  it('canEdit works for system:edit', () => {
    setPermissions(['system:edit'])
    const { canEdit } = usePermission()
    expect(canEdit('system')).toBe(true)
  })
})
