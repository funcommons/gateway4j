import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

// P4f C2：壳组件 MainLayout 摘除后，本文件改挂 LayoutV2（/v2 壳）。
// 守卫镜像逻辑不变 —— 只换挂载壳与 fixture 路径（/x → /v2/x）。

// Dynamic permissions — tests will override this
let mocksPermissions: any[] = []

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isLogin: true,
    user: { id: '1', username: 'guest', roles: ['ROLE_GUEST'] },
    permissions: mocksPermissions,
    hasRole: (_code: string) => false
  })
}))

import LayoutV2 from '@/layouts/LayoutV2.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})

const stub = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2', component: LayoutV2, meta: { requireAuth: true }, children: [
        { path: 'overview', name: 'V2Overview', component: stub, meta: { titleKey: 'v2.page.overview', permission: 'monitor:read' } },
        { path: 'routes', name: 'V2Routes', component: stub, meta: { titleKey: 'v2.page.routes', permission: 'route:read' } },
        { path: 'plugins', name: 'V2Plugins', component: stub, meta: { titleKey: 'v2.page.pluginList', permission: 'plugin:read' } },
        { path: 'users', name: 'V2Users', component: stub, meta: { titleKey: 'v2.page.users', permission: 'system:user' } },
        { path: 'settings', name: 'V2Settings', component: stub, meta: { titleKey: 'v2.page.settings', permission: 'system:read' } }
      ]},
      { path: '/login', name: 'Login', component: stub }
    ]
  })
}

// Permission guard — mirrors the logic in router/index.ts
function installPermissionGuard(router: ReturnType<typeof makeRouter>) {
  router.beforeEach((to) => {
    const perm = to.meta.permission as string | undefined
    if (!perm) return true
    const has = mocksPermissions.some(p => p.permission_code === perm)
    if (!has) return false
    return true
  })
}

describe('Route permission guard', () => {
  it('allows access when user has the required permission', async () => {
    mocksPermissions = [
      { permission_code: 'route:read' },
      { permission_code: 'plugin:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
    await router.push('/v2/plugins')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('V2Plugins')
  })

  it('aborts navigation when user lacks the required permission', async () => {
    mocksPermissions = [
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
    // First navigate to a route we have permission for
    await router.push('/v2/routes')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('V2Routes')
    // Try to navigate to a route we lack permission for — should be aborted
    await router.push('/v2/users')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('V2Routes')
  })

  it('allows access to routes without permission meta', async () => {
    mocksPermissions = []
    const router = makeRouter()
    installPermissionGuard(router)
    // Login route has no permission meta
    await router.push('/login')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Login')
  })

  it('allows overview access with monitor:read permission', async () => {
    mocksPermissions = [
      { permission_code: 'monitor:read' },
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
    await router.push('/v2/overview')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('V2Overview')
  })

  it('aborts overview access without monitor:read permission', async () => {
    mocksPermissions = [
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
    // Start at a route we have permission for
    await router.push('/v2/routes')
    await router.isReady()
    await flushPromises()
    // Try to navigate to overview — should be aborted
    await router.push('/v2/overview')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('V2Routes')
  })
})
