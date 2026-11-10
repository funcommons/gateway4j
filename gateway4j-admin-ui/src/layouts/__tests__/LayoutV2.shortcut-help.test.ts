/**
 * LOW-2-T：LayoutV2 × 全局快捷键帮助接线（v2 优化低优先级 #8 —— docs/ui-v2/gateway4j-v2优化.md #8）。
 * 先红是预期（RED 类型：行为缺失）—— LayoutV2.vue 真实存在，但尚未常驻挂载 ShortcutHelp。
 * 本文件全部断言围绕「`?` 速查表在壳层可用」的接线行为，组件本体契约（`?` 开合/输入豁免/
 * a11y/testid/i18n/注册表）见 src/components-v2/shortcuts/__tests__/ShortcutHelp.test.ts
 * （组件缺失型 RED 在彼处）。
 *
 * 接线契约（C 步实现）：
 * - LayoutV2 常驻挂载 <ShortcutHelp />（无 props、无 v-model——开合状态组件自持，与
 *   CommandPalette 的 v-model:open 形态不同：速查表无顶栏触发器，`?` 是唯一入口）；
 *   `?`/Esc 全局监听由组件自身挂 window 实现（⌘K 先例），布局侧不另建监听。
 * - fs 源码契约：LayoutV2.vue 引入（@/components-v2/shortcuts/ShortcutHelp.vue）并渲染
 *   <ShortcutHelp />。
 * - 互不串扰：`?` 只开关速查表（sc-root），不得触发命令面板（cmd-root 只认 ⌘K/Ctrl+K）；
 *   ⌘K 只开关命令面板，不得触发速查表。
 * - i18n：本步零新增布局侧 key（速查表 10 个 v2.sc.* key 的存在性断言在组件测试文件）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import LayoutV2 from '@/layouts/LayoutV2.vue'

const navAuth = vi.hoisted(() => ({
  /** 全权限种子：12 个侧栏叶子全部可见（LayoutV2.command-palette.test.ts 同款） */
  permissions: ['monitor:read', 'route:read', 'route:edit', 'plugin:read', 'plugin:edit', 'user:read', 'system:read', 'system:user'] as string[],
  logout: vi.fn()
}))
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: navAuth.permissions.map((c: string) => ({ permission_code: c })),
    logout: navAuth.logout
  })
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/overview', name: 'V2Overview', component: stub },
      { path: '/v2/monitor', name: 'V2Monitor', component: stub },
      { path: '/login', name: 'Login', component: stub }
    ]
  })
}

const wrappers: VueWrapper<any>[] = []

async function factory(initialPath = '/v2/overview') {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(LayoutV2, { attachTo: document.body, global: { plugins: [ElementPlus, i18n, router] } }) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

function cleanEnv() {
  try {
    localStorage.removeItem('fc-theme-provider')
    localStorage.removeItem('gw4j_lang')
  } catch { /* 非浏览器环境静默 */ }
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-brand')
  document.documentElement.removeAttribute('data-theme')
}

beforeEach(() => {
  setActivePinia(createPinia())
  cleanEnv()
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  wrappers.length = 0
  cleanEnv()
})

const winKey = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))
const scRoot = () => document.querySelector('[data-testid="sc-root"]')
const cmdRoot = () => document.querySelector('[data-testid="cmd-root"]')

describe('LOW-2 — LayoutV2 常驻接线全局快捷键帮助（行为缺失型 RED）', () => {
  it('fs 源码契约：LayoutV2 引入并常驻渲染 <ShortcutHelp />（无 props，键盘监听组件自管）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    expect(source, 'LayoutV2 未引入 ShortcutHelp 组件').toContain('@/components-v2/shortcuts/ShortcutHelp.vue')
    expect(source, 'ShortcutHelp 应以 <ShortcutHelp /> 常驻渲染（无开合 props）').toMatch(/<ShortcutHelp\s*\/>/)
  })

  it('`?`（window 级）→ sc-root 打开（速查表随壳层常驻可用，任意 v2 页生效）', async () => {
    await factory()
    expect(scRoot(), '初始态速查表不得打开').toBeNull()
    winKey('?')
    await flushPromises()
    expect(scRoot(), '`?` 未在壳层打开快捷键速查表').not.toBeNull()
  })

  it('速查表在非首页（/v2/monitor）同样生效（常驻挂载不随路由页变化）', async () => {
    await factory('/v2/monitor')
    winKey('?')
    await flushPromises()
    expect(scRoot(), '非 overview 页 `?` 未打开速查表（挂载须常驻于 LayoutV2）').not.toBeNull()
    winKey('Escape')
    await flushPromises()
    expect(scRoot(), 'Esc 未关闭速查表').toBeNull()
  })

  it('互不串扰：`?` 只开速查表不触发命令面板；⌘K 只开命令面板不触发速查表', async () => {
    await factory()
    winKey('?')
    await flushPromises()
    expect(scRoot()).not.toBeNull()
    expect(cmdRoot(), '`?` 误触发了命令面板（cmd-root 只认 ⌘K/Ctrl+K）').toBeNull()
    for (const w of wrappers) w.unmount()
    wrappers.length = 0
    await factory()
    winKey('k', { metaKey: true })
    await flushPromises()
    expect(cmdRoot()).not.toBeNull()
    expect(scRoot(), '⌘K 误触发了快捷键速查表（sc-root 只认 `?`）').toBeNull()
  })
})
