import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  logout: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  // D1: FcMain 改三段式 Shell 后 #sidebar/#header 真正渲染, 侧栏的
  // useSidebarNavItems -> hasPermission 会读 auth.permissions; mock 需带真实 store 形状.
  useAuthStore: () => ({ logout: mocks.logout, isLogin: true, permissions: [] })
}))

vi.mock('@element-plus/icons-vue', () => {
  const stub = (name: string) => ({ name, template: '<i />' })
  return {
    Operation: stub('Op'),
    Connection: stub('Conn'),
    Share: stub('Share'),
    Histogram: stub('Hist'),
    User: stub('User'),
    Lock: stub('Lock'),
    Box: stub('Box'),
    Grid: stub('Grid'),
    Setting: stub('Setting')
  }
})

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/theme/FcThemeSwitcher.vue', () => ({
  default: { name: 'FcThemeSwitcher', template: '<div class="theme-stub" />' }
}))

import MainLayout from '@/layouts/MainLayout.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      app: { title: 'Gateway4j 控制台' },
      auth: { logout: '退出' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', name: 'Login', component: { template: '<div />' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' }, meta: { titleKey: 'sidebar.routeList' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  return mount(MainLayout, { global: { plugins: [i18n, router] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.logout.mockReset()
})

describe('MainLayout.vue — error resilience', () => {
  it('handles auth.logout throwing without unhandled rejection', async () => {
    mocks.logout.mockImplementation(() => { throw new Error('logout failed') })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    // Wrap in try/catch since onLogout is async and might propagate
    let threw = false
    try { await vm.onLogout() } catch { threw = true }
    expect(threw).toBe(true)
    // router.push happens AFTER logout, so if logout throws, push is skipped
    expect(wrapper.vm.$route.path).toBe('/routes')
  })

  it('handles router.push failure on logout (e.g., guard rejects)', async () => {
    mocks.logout.mockReset()
    const wrapper = await factory()
    // Replace router.push with one that throws
    const originalPush = (wrapper.vm as any).$router.push
    const pushSpy = vi.fn().mockRejectedValue(new Error('nav failed'))
    ;(wrapper.vm as any).$router.push = pushSpy
    const vm = wrapper.vm as any
    let threw = false
    try { await vm.onLogout() } catch { threw = true }
    expect(threw).toBe(true)
    // logout was called even though push failed
    expect(mocks.logout).toHaveBeenCalled()
    // restore
    ;(wrapper.vm as any).$router.push = originalPush
  })

  it('logout-then-navigate order: logout fires BEFORE router.push', async () => {
    mocks.logout.mockReset()
    const order: string[] = []
    mocks.logout.mockImplementation(() => { order.push('logout') })
    const wrapper = await factory()
    const originalPush = (wrapper.vm as any).$router.push
    const pushSpy = vi.fn().mockImplementation(() => {
      order.push('push')
      return originalPush.call((wrapper.vm as any).$router, '/login')
    })
    ;(wrapper.vm as any).$router.push = pushSpy
    const vm = wrapper.vm as any
    await vm.onLogout()
    expect(order).toEqual(['logout', 'push'])
  })
})