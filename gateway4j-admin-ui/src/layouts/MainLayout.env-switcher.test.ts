import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

// H7b T1 契约用例：顶栏环境切换器（外观按钮旁）—— 404 降级整体不渲染 / 可用时渲染
const mocks = vi.hoisted(() => ({
  listEnvironments: vi.fn(),
  listPermissions: vi.fn()
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments
}))

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  refreshToken: vi.fn(),
  listPermissions: mocks.listPermissions
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/search/GlobalSearch.vue', () => ({
  default: { name: 'GlobalSearch', template: '<div class="search-stub" />' }
}))

vi.mock('@/components/PasswordStaleBanner.vue', () => ({
  default: { name: 'PasswordStaleBanner', template: '<div class="pwd-banner-stub" />' }
}))

import MainLayout from '@/layouts/MainLayout.vue'
import { useAuthStore } from '@/store/auth'
import { useEnvironmentStore } from '@/store/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      app: { title: 'Gateway4j 控制台' },
      auth: { logout: '退出' },
      common: { home: '首页' },
      env: { switcherLabel: '环境', switcherTip: '管理面视图过滤与路由归属环境选择；数据面环境由网关进程配置决定' },
      sidebar: {}
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' }, meta: { titleKey: 'route.list' } },
      { path: '/login', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const auth = useAuthStore()
  auth.token = 'tok'
  auth.user = { id: 'u1', username: 'admin', roles: ['ADMIN'] }
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  const wrapper = mount(MainLayout, { global: { plugins: [i18n, router] } })
  // MainLayout 挂载 → EnvironmentSwitcher.onMounted → ensureLoaded
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listEnvironments.mockReset().mockRejectedValue(new Error('404'))
  mocks.listPermissions.mockReset().mockRejectedValue(new Error('skip'))
  localStorage.removeItem('gw4j_token')
  localStorage.setItem('gw4j_token', 'tok')
})

describe('MainLayout — 顶栏环境切换器（T1）', () => {
  it('GET /v1/environments 404 → 切换器不渲染（降级：环境功能整体隐藏）', async () => {
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="env-switcher"]').exists()).toBe(false)
  })

  it('环境可用 → 切换器渲染在顶栏 actions 区（外观切换按钮旁）', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="env-switcher"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-switcher-select"]').exists()).toBe(true)
  })

  it('切换选中写入共享 store（路由列表 / 大盘 watch 同一状态刷新）', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const wrapper = await factory()
    const env = useEnvironmentStore()
    expect(env.available).toBe(true)
    // 直接驱动切换器的 onChange（未注册 ElementPlus，无法从 DOM 触发下拉）
    const switcher = wrapper.findComponent({ name: 'EnvironmentSwitcher' })
    ;(switcher.vm as any).onChange('staging')
    expect(env.current).toBe('staging')
    expect(localStorage.getItem('gw4j_env')).toBe('staging')
  })
})
