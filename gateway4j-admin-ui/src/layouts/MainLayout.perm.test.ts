import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  logout: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isLogin: true,
    user: { id: '1', username: 'admin', roles: ['ROLE_ADMIN'] },
    permissions: [
      { permission_code: 'route:read', permission_name: 'Read Routes', resource_type: 'ROUTE' },
      { permission_code: 'plugin:read', permission_name: 'Read Plugins', resource_type: 'PLUGIN' },
      { permission_code: 'monitor:read', permission_name: 'Read Monitor', resource_type: 'MONITOR' },
      { permission_code: 'user:read', permission_name: 'Read Users', resource_type: 'USER' },
      { permission_code: 'system:read', permission_name: 'Read System', resource_type: 'SYSTEM' }
    ],
    hasRole: (code: string) => code === 'ROLE_ADMIN',
    logout: mocks.logout
  })
}))

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

import MainLayout from '@/layouts/MainLayout.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      app: { title: 'Gateway4j Console' },
      auth: { logout: '退出' },
      sidebar: {
        dashboard: '监控大盘', routeList: '路由列表', routeCanvas: '路由画布',
        routeImport: '导入导出', pluginList: '插件列表', pluginGlobal: '全局插件',
        userList: '用户列表', rolePerm: '角色权限', settings: '系统设置'
      }
    }
  }
})

function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: MainLayout, children: [
        { path: '', redirect: '/routes' },
        { path: 'dashboard', name: 'Dashboard', component: { template: '<div />' }, meta: { title: '监控大盘', titleKey: 'sidebar.dashboard', permission: 'monitor:read' } },
        { path: 'routes', name: 'Routes', component: { template: '<div />' }, meta: { title: '路由列表', titleKey: 'sidebar.routeList', permission: 'route:read' } },
        { path: 'plugins', name: 'Plugins', component: { template: '<div />' }, meta: { title: '插件列表', titleKey: 'sidebar.pluginList', permission: 'plugin:read' } },
        { path: 'users', name: 'Users', component: { template: '<div />' }, meta: { title: '用户列表', titleKey: 'sidebar.userList', permission: 'user:read' } },
        { path: 'settings', name: 'Settings', component: { template: '<div />' }, meta: { title: '系统设置', titleKey: 'sidebar.settings', permission: 'system:read' } }
      ]}
    ]
  })
  setActivePinia(createPinia())
  return mount(MainLayout, {
    global: { plugins: [i18n, router] }
  })
}

describe('MainLayout.vue — permission-based nav', () => {
  it('computes visible nav groups based on user permissions', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // All nav items should be visible since mock has all permissions
    expect(vm.navItems.length).toBeGreaterThan(0)
  })

  it('hasPermission helper checks permission codes', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.hasPermission('route:read')).toBe(true)
    expect(vm.hasPermission('route:delete')).toBe(false)
  })
})
