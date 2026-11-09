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

// P4f C2：旧树页面 mock（12 页 + MainLayout）随摘树移除 —— vue-router 为 mock 实现，
// 路由表的懒加载 component 闭包从不解析，无需页面级 mock。

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
    const result = await runGuard({ meta: { requireAuth: true }, fullPath: '/v2/overview' })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/v2/overview' } })
  })

  it('allows navigation when requireAuth=true and user is logged in', async () => {
    ;(globalThis as any).__authIsLogin = true
    const result = await runGuard({ meta: { requireAuth: true }, fullPath: '/v2/overview' })
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
      fullPath: '/v2/plugins'
    })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/v2/plugins' } })
  })

  it('preserves query params in fullPath when redirecting', async () => {
    ;(globalThis as any).__authIsLogin = false
    const result = await runGuard({
      meta: { requireAuth: true },
      fullPath: '/v2/routes/123?tab=basic'
    })
    expect(result).toEqual({ name: 'Login', query: { redirect: '/v2/routes/123?tab=basic' } })
  })
})