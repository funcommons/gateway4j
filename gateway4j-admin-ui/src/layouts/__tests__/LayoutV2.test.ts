/**
 * S1-T：LayoutV2 骨架测试（契约 §2「LayoutV2 骨架」+ §1 侧栏切换入口）。
 * 断言的 i18n key（C-agent 必须在 zh-CN/en-US 同时添加，铁律 6）：
 *   分组（顺序 = 原型 01 侧栏）：v2.nav.group.overview / routes / plugins / observability / system
 *   S1 静态导航叶子：v2.nav.overview→/v2/overview  v2.nav.routes→/v2/routes
 *                    v2.nav.pluginChain→/v2/plugins/chain  v2.nav.monitor→/v2/monitor  v2.nav.debug→/v2/debug
 *   侧栏底部：v2.layout.backToLegacy → /routes（「返回旧版」）
 * 约定：active 态走 route.name（§2），active 类名认 el-menu 的 is-active 或自定义 active；
 * 本文件 mount 时局部注册 ElementPlus（导航是 el-menu 子树，不注册不渲染；不影响其他 app 用例）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import LayoutV2 from '@/layouts/LayoutV2.vue'

// LayoutV2 可能按 MainLayout 同款做法用 meta.permission 过滤侧栏可见性 —— 给满权限账号
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'user:read', 'system:read']
      .map((c) => ({ permission_code: c }))
  })
}))

/** 按点路径取 locale 值（key 不存在返回 undefined） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

/** 契约 §2 + §1：分组与叶子（顺序即断言顺序） */
const GROUP_KEYS = ['v2.nav.group.overview', 'v2.nav.group.routes', 'v2.nav.group.plugins', 'v2.nav.group.observability', 'v2.nav.group.system']
const LEAVES = [
  { key: 'v2.nav.overview', path: '/v2/overview', name: 'V2Overview' },
  { key: 'v2.nav.routes', path: '/v2/routes', name: 'V2Routes' },
  { key: 'v2.nav.pluginChain', path: '/v2/plugins/chain', name: 'V2PluginChain' },
  { key: 'v2.nav.monitor', path: '/v2/monitor', name: 'V2Monitor' },
  { key: 'v2.nav.debug', path: '/v2/debug', name: 'V2Debug' }
]
const BACK_KEY = 'v2.layout.backToLegacy'
const ALL_KEYS = [...GROUP_KEYS, ...LEAVES.map((l) => l.key), BACK_KEY]

const i18n = createI18n({
  legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})

const stub = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/v2',
        component: LayoutV2,
        children: [...LEAVES.map((l) => ({ path: l.path.slice(4), name: l.name, component: stub }))]
      },
      { path: '/routes', name: 'Routes', component: stub }
    ]
  })
}

async function factory(initialPath = '/v2/overview') {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(LayoutV2, { global: { plugins: [ElementPlus, i18n, router] } })
  await flushPromises()
  return { wrapper: wrapper as VueWrapper<any>, router }
}

/** 按显示文本找导航节点（el-menu 叶子 / 自定义导航锚点都覆盖） */
function findNavItem(wrapper: VueWrapper<any>, label: string) {
  return wrapper.findAll('.el-menu-item, [role="menuitem"], a').find((n) => n.text().includes(label))
}

/** active 类名：el-menu 的 is-active 或自定义 active（约定见文件头） */
function isActive(node: { classes(): string[] }) {
  return node.classes().some((c) => c === 'is-active' || c === 'active')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('LayoutV2 — i18n 双语 key 存在（契约 §0 铁律 6）', () => {
  it.each(ALL_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('LayoutV2 — 侧栏分组（契约 §2）', () => {
  it('渲染 5 个分组，顺序为 总览→路由→插件→可观测→系统（原型 01 侧栏）', async () => {
    const { wrapper } = await factory()
    const text = wrapper.text()
    const labels = GROUP_KEYS.map((k) => String(dig(zhCN, k)))
    let prev = -1
    for (const label of labels) {
      const at = text.indexOf(label)
      expect(at, `分组「${label}」(${GROUP_KEYS[labels.indexOf(label)]}) 未按顺序渲染`).toBeGreaterThan(prev)
      prev = at
    }
  })

  it.each(LEAVES)('导航叶子 $name 存在，点击后跳转 $path', async ({ key, path, name }) => {
    const { wrapper, router } = await factory()
    const label = String(dig(zhCN, key))
    const leaf = findNavItem(wrapper, label)
    expect(leaf, `找不到文案为「${label}」(${key}) 的导航项`).toBeDefined()
    await leaf!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.name).toBe(name)
  })
})

describe('LayoutV2 — 侧栏 active 态（契约 §2：走 route.name）', () => {
  it('路由 name 变化时 active 类跟随（/v2/overview → /v2/routes）', async () => {
    const { wrapper, router } = await factory('/v2/overview')
    const overview = findNavItem(wrapper, String(dig(zhCN, 'v2.nav.overview')))
    expect(overview).toBeDefined()
    expect(isActive(overview!), '初始路由 /v2/overview 的导航项未高亮').toBe(true)
    await router.push('/v2/routes')
    await flushPromises()
    expect(isActive(findNavItem(wrapper, String(dig(zhCN, 'v2.nav.routes')))!)).toBe(true)
    expect(isActive(findNavItem(wrapper, String(dig(zhCN, 'v2.nav.overview')))!)).toBe(false)
  })

  it('active 态由 route.name 推导（源码契约，参照 MainLayout.sidebar-active.test.ts）', () => {
    // 用 $route.path 直推会在 /v2/routes/:id/detail 等嵌套页失配；契约要求按 name 归位
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    expect(source).toMatch(/route\.name|activePath|SIDEBAR_ROUTE_MAP|currentRoute/)
  })
})

describe('LayoutV2 — 返回旧版（契约 §1 侧栏切换入口）', () => {
  it('「返回旧版」存在且点击后回 /routes', async () => {
    const { wrapper, router } = await factory()
    const label = String(dig(zhCN, BACK_KEY))
    const entry = findNavItem(wrapper, label)
    expect(entry, `找不到「${label}」(${BACK_KEY}) 入口`).toBeDefined()
    await entry!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/routes')
  })
})
