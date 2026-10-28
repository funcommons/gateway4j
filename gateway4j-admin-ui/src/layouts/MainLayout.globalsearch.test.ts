import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

// 权限列表可变，供分权限场景测试
const mocks = vi.hoisted(() => ({
  perms: ['route:read', 'plugin:read', 'user:read'] as string[],
  listRoutes: vi.fn(),
  listPlugins: vi.fn(),
  listUsers: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: mocks.perms.map(c => ({ permission_code: c }))
  })
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes
}))
vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins
}))
vi.mock('@/api/misc', () => ({
  listUsers: mocks.listUsers
}))

// FcInput stub：渲染真实 <input>，可输入/聚焦
vi.mock('@/components/form/FcInput.vue', () => ({
  default: {
    name: 'FcInput',
    props: ['modelValue', 'placeholder', 'clearable', 'size'],
    emits: ['update:modelValue', 'focus', 'clear'],
    template: `<div class="fcinput-stub">
      <input :placeholder="placeholder" :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        @focus="$emit('focus')" />
    </div>`
  }
}))
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title', 'type', 'spanFull'], template: '<div class="empty-stub">{{ title }}</div>' }
}))

import GlobalSearch from '@/components/search/GlobalSearch.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        globalSearchPlaceholder: '搜索路由 / 插件 / 用户（⌘K）',
        gsGroupRoutes: '路由',
        gsGroupPlugins: '插件',
        gsGroupUsers: '用户',
        enabled: '已启用',
        disabled: '已禁用'
      },
      route: {
        statusDraft: '草稿', statusPublished: '已发布',
        statusChanging: '变更中', statusOffline: '已下线'
      }
    }
  }
})

const ROUTE_TREE = [
  {
    id: 'r1', route_name: 'web-gateway', path: '/api/web', status: 'PUBLISHED',
    children: [{ id: 'r2', route_name: 'web-backend', upstream_url: 'http://svc:8080', status: 'DRAFT', children: [] }]
  },
  { id: 'r3', route_name: 'dispatch-root', path: '/dispatch', status: 'OFFLINE', children: [] }
]

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes/:id', name: 'RouteEdit', component: { template: '<div />' } },
      { path: '/plugins/:id/edit', name: 'PluginEdit', component: { template: '<div />' } },
      { path: '/users', name: 'Users', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(GlobalSearch, {
    attachTo: document.body,
    global: { plugins: [i18n, router] }
  })
  await flushPromises()
  return { wrapper, router }
}

async function type(wrapper: ReturnType<typeof mount>, kw: string) {
  await wrapper.find('input').setValue(kw)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.perms = ['route:read', 'plugin:read', 'user:read']
  mocks.listRoutes.mockReset().mockResolvedValue(ROUTE_TREE)
  mocks.listPlugins.mockReset().mockResolvedValue({
    records: [{ id: 'p1', plugin_name: 'JWT Auth', plugin_type: 'BUILTIN', status: 'ENABLED' }],
    total: 1
  })
  mocks.listUsers.mockReset().mockResolvedValue({
    records: [{ id: 'u1', username: 'alice', real_name: 'Alice Zhang', status: 'ENABLED' }],
    total: 1
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('GlobalSearch — 分组展示', () => {
  it('renders input with placeholder and hidden panel initially', async () => {
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="global-search-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="global-search-panel"]').exists()).toBe(false)
  })

  it('queries all three sources after 300ms debounce and shows grouped results', async () => {
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    expect(mocks.listRoutes).toHaveBeenCalledTimes(1)
    expect(mocks.listPlugins).toHaveBeenCalledWith({ page: 1, pageSize: 8, keyword: 'web' })
    expect(mocks.listUsers).toHaveBeenCalledWith({ page: 1, pageSize: 8, keyword: 'web' })

    expect(wrapper.find('[data-testid="gs-group-route"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gs-group-plugin"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gs-group-user"]').exists()).toBe(true)
    // 路由树拍平：web-gateway + 子路由 web-backend 命中，dispatch-root 不命中
    const routeItems = wrapper.findAll('[data-testid="gs-item-route"]')
    expect(routeItems.length).toBe(2)
    expect(routeItems[0].text()).toContain('web-gateway')
    expect(routeItems[1].text()).toContain('web-backend')
    // 插件项展示名称 + 类型辅助信息
    expect(wrapper.find('[data-testid="gs-item-plugin"]').text()).toContain('JWT Auth')
    // 用户项展示 username + real_name 辅助信息
    expect(wrapper.find('[data-testid="gs-item-user"]').text()).toContain('alice')
    expect(wrapper.find('[data-testid="gs-item-user"]').text()).toContain('Alice Zhang')
  })

  it('omits a group (no query, no display) when its read permission is missing', async () => {
    mocks.perms = ['route:read']
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    expect(wrapper.find('[data-testid="gs-group-route"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gs-group-plugin"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gs-group-user"]').exists()).toBe(false)
    expect(mocks.listPlugins).not.toHaveBeenCalled()
    expect(mocks.listUsers).not.toHaveBeenCalled()
  })

  it('shows the no-result empty state when nothing matches', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.listPlugins.mockResolvedValue({ records: [], total: 0 })
    mocks.listUsers.mockResolvedValue({ records: [], total: 0 })
    const { wrapper } = await factory()
    await type(wrapper, 'zzz')
    expect(wrapper.find('[data-testid="global-search-empty"]').exists()).toBe(true)
  })

  it('a failing source silently drops its group without crashing', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('500'))
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    expect(wrapper.find('[data-testid="gs-group-route"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gs-group-plugin"]').exists()).toBe(false)
  })
})

describe('GlobalSearch — 键盘导航', () => {
  it('ArrowDown / ArrowUp cycle the highlight with wrap-around', async () => {
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    const vm = wrapper.vm as any
    // flat: r1, r2（route）→ p1（plugin）→ u1（user）
    expect(vm.flatItems.length).toBe(4)
    expect(vm.activeIndex).toBe(0)
    const root = wrapper.find('[data-testid="global-search"]')
    await root.trigger('keydown', { key: 'ArrowDown' })
    expect(vm.activeIndex).toBe(1)
    await root.trigger('keydown', { key: 'ArrowDown' })
    await root.trigger('keydown', { key: 'ArrowDown' })
    await root.trigger('keydown', { key: 'ArrowDown' })
    expect(vm.activeIndex).toBe(0)
    await root.trigger('keydown', { key: 'ArrowUp' })
    expect(vm.activeIndex).toBe(3)
  })

  it('Enter navigates: route -> /routes/:id, plugin -> /plugins/:id/edit, user -> /users', async () => {
    const { wrapper, router } = await factory()
    const vm = wrapper.vm as any
    const root = wrapper.find('[data-testid="global-search"]')
    await type(wrapper, 'web')
    await root.trigger('keydown', { key: 'ArrowDown' })
    await root.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/routes/r2')

    // 插件命中项（flatIndex 2）
    ;(vm as any).activeIndex = 2
    await root.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/plugins/p1/edit')

    // 用户命中项（flatIndex 3）→ 固定跳用户列表
    ;(vm as any).activeIndex = 3
    await root.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/users')
  })

  it('Escape closes the panel', async () => {
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    expect(wrapper.find('[data-testid="global-search-panel"]').exists()).toBe(true)
    await wrapper.find('[data-testid="global-search"]').trigger('keydown', { key: 'Escape' })
    expect((wrapper.vm as any).open).toBe(false)
    expect(wrapper.find('[data-testid="global-search-panel"]').exists()).toBe(false)
  })

  it('Cmd/Ctrl+K focuses the input and reopens the panel', async () => {
    const { wrapper } = await factory()
    await type(wrapper, 'web')
    await wrapper.find('[data-testid="global-search"]').trigger('keydown', { key: 'Escape' })
    expect((wrapper.vm as any).open).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }))
    await flushPromises()
    expect(document.activeElement?.tagName).toBe('INPUT')
    expect((wrapper.vm as any).open).toBe(true)
  })
})
