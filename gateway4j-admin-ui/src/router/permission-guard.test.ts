import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  logout: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isLogin: true,
    user: { id: '1', username: 'guest', roles: ['ROLE_GUEST'] },
    permissions: mocksPermissions,
    hasRole: (code: string) => false,
    logout: mocks.logout
  })
}))

// Dynamic permissions — tests will override this
let mocksPermissions: any[] = []

vi.mock('@/components/layout/FcSidebar.vue', () => ({
  default: { name: 'FcSidebar', props: ['collapse'], template: '<div class="sidebar-stub"><slot /></div>' }
}))
vi.mock('@/components/layout/FcSidebarNav.vue', () => ({
  default: { name: 'FcSidebarNav', props: ['items', 'activePath', 'collapse'], template: '<nav class="nav-stub" />' }
}))
vi.mock('@/components/layout/FcHeader.vue', () => ({
  default: { name: 'FcHeader', props: ['title', 'collapse'], template: '<header class="header-stub"><slot name="actions" /></header>' }
}))
vi.mock('@/components/layout/FcSectionHeader.vue', () => ({
  default: { name: 'FcSectionHeader', props: ['title', 'back'], template: '<div class="section-header-stub" />' }
}))
vi.mock('@/components/form/FcThemeSwitcher.vue', () => ({
  default: { name: 'FcThemeSwitcher', template: '<div class="theme-stub" />' }
}))
vi.mock('@element-plus/icons-vue', () => {
  const stub = (name: string) => ({ name, template: '<i />' })
  return { Operation: stub('Op'), Connection: stub('Conn'), Share: stub('Share'), Histogram: stub('Hist'), User: stub('User'), Lock: stub('Lock'), Box: stub('Box'), Grid: stub('Grid'), Setting: stub('Setting'), Tickets: stub('Tickets'), Files: stub('Files'), Cpu: stub('Cpu'), UserFilled: stub('UserFilled') }
})

import MainLayout from '@/layouts/MainLayout.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      app: { title: 'Gateway4j Console' },
      auth: { logout: '退出' },
      sidebar: {
        dashboard: '监控大盘', route: '路由管理', routeList: '路由列表', routeCanvas: '路由画布',
        routeImport: '导入导出', plugin: '插件管理', pluginList: '插件列表', pluginGlobal: '全局插件',
        pluginBuiltin: '内置插件',
        user: '用户管理', userList: '用户列表', rolePerm: '角色权限', settings: '系统设置'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: MainLayout, meta: { requireAuth: true }, children: [
        { path: '', redirect: '/routes' },
        { path: 'dashboard', name: 'Dashboard', component: { template: '<div />' }, meta: { titleKey: 'sidebar.dashboard', permission: 'monitor:read' } },
        { path: 'routes', name: 'Routes', component: { template: '<div />' }, meta: { titleKey: 'sidebar.routeList', permission: 'route:read' } },
        { path: 'plugins', name: 'Plugins', component: { template: '<div />' }, meta: { titleKey: 'sidebar.pluginList', permission: 'plugin:read' } },
        { path: 'users', name: 'Users', component: { template: '<div />' }, meta: { titleKey: 'sidebar.userList', permission: 'user:read' } },
        { path: 'settings', name: 'Settings', component: { template: '<div />' }, meta: { titleKey: 'sidebar.settings', permission: 'system:read' } }
      ]},
      { path: '/login', name: 'Login', component: { template: '<div />' } }
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
    mount(MainLayout, { global: { plugins: [i18n, router] } })
    await router.push('/plugins')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Plugins')
  })

  it('aborts navigation when user lacks the required permission', async () => {
    mocksPermissions = [
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(MainLayout, { global: { plugins: [i18n, router] } })
    // First navigate to a route we have permission for
    await router.push('/routes')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Routes')
    // Try to navigate to a route we lack permission for — should be aborted
    await router.push('/users')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Routes')
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

  it('allows dashboard access with monitor:read permission', async () => {
    mocksPermissions = [
      { permission_code: 'monitor:read' },
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(MainLayout, { global: { plugins: [i18n, router] } })
    await router.push('/dashboard')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Dashboard')
  })

  it('aborts dashboard access without monitor:read permission', async () => {
    mocksPermissions = [
      { permission_code: 'route:read' }
    ]
    const router = makeRouter()
    installPermissionGuard(router)
    setActivePinia(createPinia())
    mount(MainLayout, { global: { plugins: [i18n, router] } })
    // Start at a route we have permission for
    await router.push('/routes')
    await router.isReady()
    await flushPromises()
    // Try to navigate to dashboard — should be aborted
    await router.push('/dashboard')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('Routes')
  })
})
