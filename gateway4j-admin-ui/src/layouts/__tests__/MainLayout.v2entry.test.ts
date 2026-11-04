/**
 * S1-T：MainLayout 顶栏「新版体验」入口测试（契约 §1「顶栏切换入口」+ 铁律 1/6）。
 * 断言的 i18n key（C-agent 必须在 zh-CN/en-US 同时添加）：v2.topbar.tryV2。
 * 实现约定：MainLayout.vue 顶栏 #actions 内加
 *   <FcButton variant="secondary" data-testid="v2-entry" @click="router.push('/v2/overview')">{{ t('v2.topbar.tryV2') }}</FcButton>
 * 断言：入口存在（data-testid="v2-entry"）+ 文案来自 v2.topbar.tryV2 + 点击落到 /v2/overview；
 * 用 router-link 实现亦可通过点击断言，但 testid 必须保留。
 * 断言风格沿用 MainLayout.test.ts（不注册 ElementPlus：FcButton 未解析时插槽内容仍以
 * 字面 el-button 元素渲染，testid/文本/点击均可断言）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  logout: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    logout: mocks.logout,
    permissions: ['monitor:read', 'route:read', 'plugin:read', 'user:read', 'system:read']
      .map((c) => ({ permission_code: c }))
  })
}))

vi.mock('@element-plus/icons-vue', () => {
  const stub = (name: string) => ({ name, template: '<i />' })
  // has trap: 组件侧用 `in` 探测图标是否存在, Proxy 默认 has 返回 false 会导致图标解析失败
  return new Proxy({}, { get: (_t, prop) => stub(String(prop)), has: () => true })
})

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/theme/FcThemeSwitcher.vue', () => ({
  default: { name: 'FcThemeSwitcher', template: '<div class="theme-stub" />' }
}))

import MainLayout from '@/layouts/MainLayout.vue'

const i18n = createI18n({
  legacy: false, locale: 'zh-CN',
  messages: { 'zh-CN': {
    app: { title: 'Gateway4j 控制台' },
    auth: { logout: '退出' },
    ux: { 'command-palette': { trigger: '命令面板' } },
    common: { home: '首页' },
    sidebar: { routeList: '路由列表' },
    v2: { topbar: { tryV2: '新版体验' } }
  } }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' }, meta: { titleKey: 'sidebar.routeList' } },
      { path: '/v2/overview', name: 'V2Overview', component: { template: '<div />' } },
      { path: '/login', name: 'Login', component: { template: '<div />' } }
    ]
  })
}

async function factory(opts: { initialPath?: string } = {}) {
  const router = makeRouter()
  await router.push(opts.initialPath ?? '/routes')
  await router.isReady()
  const wrapper = mount(MainLayout, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.logout.mockReset()
})

describe('MainLayout — 顶栏「新版体验」入口（契约 §1）', () => {
  it('i18n key v2.topbar.tryV2 在 zh-CN 与 en-US 都存在（铁律 6）', () => {
    const dig = (obj: any, dotPath: string) =>
      dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
    expect(dig(zhCN, 'v2.topbar.tryV2'), 'zh-CN 缺少 v2.topbar.tryV2').toBeDefined()
    expect(dig(enUS, 'v2.topbar.tryV2'), 'en-US 缺少 v2.topbar.tryV2').toBeDefined()
  })

  it('顶栏存在 [data-testid="v2-entry"] 入口，文案来自 v2.topbar.tryV2', async () => {
    const wrapper = await factory()
    const entry = wrapper.find('[data-testid="v2-entry"]')
    expect(entry.exists(), '顶栏没有「新版体验」入口（约定 data-testid="v2-entry"）').toBe(true)
    expect(entry.text()).toContain('新版体验')
  })

  it('点击入口后跳转 /v2/overview', async () => {
    const wrapper = await factory()
    await wrapper.find('[data-testid="v2-entry"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm.$route as { path: string }).path).toBe('/v2/overview')
  })
})

describe('MainLayout — 既有顶栏渲染不受 v2 入口影响（铁律 1）', () => {
  it('登出按钮与命令面板入口仍在', async () => {
    const wrapper = await factory()
    expect(wrapper.text()).toContain('退出')
    expect(wrapper.find('[data-testid="command-palette-trigger"]').exists()).toBe(true)
  })

  it('面包屑（首页 / 当前页）照常渲染', async () => {
    const wrapper = await factory({ initialPath: '/routes' })
    expect(wrapper.find('[data-testid="breadcrumb"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="breadcrumb-home"]').text()).toContain('首页')
    expect(wrapper.find('[data-testid="breadcrumb-current"]').text()).toContain('路由列表')
  })

  it('MainLayout 源码包含 /v2/overview 跳转目标与 v2-entry 标记', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../MainLayout.vue'), 'utf-8')
    expect(source).toContain('/v2/overview')
    expect(source).toContain('v2-entry')
  })
})
