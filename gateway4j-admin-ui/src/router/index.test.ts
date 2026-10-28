import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.mock is hoisted above imports, so any state it needs must be declared
// via vi.hoisted to also be available at the top.
const captured = vi.hoisted(() => ({
  guards: [] as Array<(to: any) => any>
}))

vi.mock('vue-router', () => ({
  createRouter: (_opts: any) => ({
    beforeEach: (fn: any) => captured.guards.push(fn)
  }),
  createWebHistory: () => ({}),
  RouteRecordRaw: class {}
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isLogin: (globalThis as any).__authIsLogin ?? false,
    permissions: (globalThis as any).__authPermissions ?? [],
    init: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock('@/views/auth/Login.vue', () => ({ default: { name: 'Login' } }))
vi.mock('@/layouts/MainLayout.vue', () => ({ default: { name: 'MainLayout' } }))
vi.mock('@/views/dashboard/Index.vue', () => ({ default: { name: 'Dashboard' } }))
vi.mock('@/views/routes/List.vue', () => ({ default: { name: 'RoutesList' } }))
vi.mock('@/views/routes/Editor.vue', () => ({ default: { name: 'RouteEditor' } }))
vi.mock('@/views/routes/Canvas.vue', () => ({ default: { name: 'RouteCanvas' } }))
vi.mock('@/views/routes/ImportExport.vue', () => ({ default: { name: 'ImportExport' } }))
vi.mock('@/views/plugins/List.vue', () => ({ default: { name: 'PluginsList' } }))
vi.mock('@/views/plugins/Builtin.vue', () => ({ default: { name: 'BuiltinPlugins' } }))
vi.mock('@/views/plugins/Editor.vue', () => ({ default: { name: 'PluginEditor' } }))
vi.mock('@/views/users/List.vue', () => ({ default: { name: 'UsersList' } }))
vi.mock('@/views/users/Roles.vue', () => ({ default: { name: 'Roles' } }))
vi.mock('@/views/Settings.vue', () => ({ default: { name: 'Settings' } }))

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key } }
}))

// Import the router module ONCE so the beforeEach guard registers with the mock.
import '@/router'

beforeEach(() => {
  setActivePinia(createPinia())
  ;(globalThis as any).__authIsLogin = false
})

async function runGuard(to: any) {
  return captured.guards[0](to)
}

describe('router — auth guard behavior', () => {
  it('registers at least one beforeEach guard', () => {
    expect(captured.guards.length).toBeGreaterThanOrEqual(1)
  })

  it('redirects to Login when requireAuth=true and user is not logged in', async () => {
    ;(globalThis as any).__authIsLogin = false
    const result = await runGuard({ meta: { requireAuth: true }, fullPath: '/routes' })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/routes' } })
  })

  it('allows navigation when requireAuth=true and user is logged in', async () => {
    ;(globalThis as any).__authIsLogin = true
    const result = await runGuard({ meta: { requireAuth: true }, fullPath: '/routes' })
    expect(result).toBeUndefined()
  })

  it('allows navigation to /login even when not logged in', async () => {
    ;(globalThis as any).__authIsLogin = false
    const result = await runGuard({ meta: {}, fullPath: '/login' })
    expect(result).toBeUndefined()
  })

  it('preserves the originally requested fullPath in the redirect query', async () => {
    ;(globalThis as any).__authIsLogin = false
    const result = await runGuard({
      meta: { requireAuth: true },
      fullPath: '/plugins/builtin'
    })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/plugins/builtin' } })
  })

  it('preserves query params in fullPath when redirecting', async () => {
    ;(globalThis as any).__authIsLogin = false
    const result = await runGuard({
      meta: { requireAuth: true },
      fullPath: '/routes/123?tab=basic'
    })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/routes/123?tab=basic' } })
  })
})