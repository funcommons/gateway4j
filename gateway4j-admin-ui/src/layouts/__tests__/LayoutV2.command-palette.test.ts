/**
 * OPT-2-T：LayoutV2 × ⌘K 命令面板接线（v2 优化建议 #1 —— docs/ui-v2/gateway4j-v2优化.md §三.1）。
 * 先红是预期（RED 类型：行为缺失）—— LayoutV2.vue 真实存在，但其顶栏搜索框自 S1 起是
 * aria-hidden 占位（见 LayoutV2.vue .v2-top-search 注释「S1 不可交互」），未接命令面板。
 * 本文件全部断言围绕「占位 → 成品」的接线行为，组件本体契约见
 * src/components-v2/command/__tests__/CommandPalette.test.ts（组件缺失型 RED 在彼处）。
 *
 * 接线契约（C 步实现）：
 * - 顶栏搜索占位改为真实触发器：data-testid="v2-topbar-search"（挂 .v2-top-search 容器）、
 *   去掉 aria-hidden、role="button"、tabindex 可聚焦、aria-haspopup="dialog"、
 *   aria-expanded 随面板开合；仍保持「非文本输入」形态（占位框内不得出现 <input>）。
 * - 点击触发器 → CommandPalette 打开；面板关闭后焦点归还触发器。
 * - LayoutV2 常驻挂载 CommandPalette（v-model:open），⌘K/Ctrl+K 全局开关由面板组件
 *   自身监听 window 实现（布局侧无需自建监听，组件契约见彼文件头）。
 * - fs 源码契约：LayoutV2.vue 引入并渲染 CommandPalette（v-model:open）。
 * - i18n：触发器复用既有 v2.topbar.searchPlaceholder / v2.topbar.kbd，本步零新增布局侧 key
 *   （面板 12 个 v2.cmd.* key 的存在性断言在组件测试文件）。
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
  /** 全权限种子：12 个侧栏叶子全部可见（含 system:user / plugin:edit） */
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
      { path: '/v2/routes', name: 'V2Routes', component: stub },
      { path: '/login', name: 'Login', component: stub }
    ]
  })
}

const wrappers: VueWrapper<any>[] = []

async function factory() {
  const router = makeRouter()
  await router.push('/v2/overview')
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

describe('OPT-2 — LayoutV2 顶栏搜索接线命令面板（行为缺失型 RED）', () => {
  it('fs 源码契约：LayoutV2 引入并渲染 CommandPalette（v-model:open），顶栏搜索占位挂 v2-topbar-search', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    expect(source, 'LayoutV2 未引入 CommandPalette 组件').toContain('CommandPalette')
    expect(source, 'CommandPalette 应以 v-model:open 双向绑定接线').toContain('v-model:open')
    expect(source, '顶栏搜索框缺 v2-topbar-search testid').toContain('data-testid="v2-topbar-search"')
  })

  it('顶栏搜索占位 → 真实触发器：去 aria-hidden、role=button、aria-haspopup=dialog、内不含 <input>（保持只读占位形态）', async () => {
    const { wrapper } = await factory()
    const trigger = wrapper.find('[data-testid="v2-topbar-search"]')
    expect(trigger.exists(), '顶栏缺命令面板触发器 v2-topbar-search').toBe(true)
    expect(trigger.attributes('aria-hidden'), '触发器不得是 aria-hidden 装饰（S1 占位形态）').toBeUndefined()
    expect(trigger.attributes('role')).toBe('button')
    expect(trigger.attributes('aria-haspopup')).toBe('dialog')
    expect(trigger.attributes('tabindex'), '触发器必须可键盘聚焦').toBeTruthy()
    expect(trigger.find('input').exists(), '搜索框只读：触发器内不得出现文本 input').toBe(false)
  })

  it('点击触发器 → cmd-root 打开（面板由 LayoutV2 常驻挂载）；Esc 关闭', async () => {
    const { wrapper } = await factory()
    expect(document.querySelector('[data-testid="cmd-root"]'), '初始态面板不得打开').toBeNull()
    await wrapper.find('[data-testid="v2-topbar-search"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), '点击顶栏搜索框未打开命令面板').not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), 'Esc 未关闭命令面板').toBeNull()
  })

  it('⌘K（window 级）→ cmd-root 打开（全局快捷键经常驻面板生效）', async () => {
    await factory()
    expect(document.querySelector('[data-testid="cmd-root"]')).toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), '⌘K 未打开命令面板').not.toBeNull()
  })

  it('a11y：关闭后焦点归还顶栏触发器（打开前聚焦触发 → 关闭还原）', async () => {
    const { wrapper } = await factory()
    const trigger = wrapper.find('[data-testid="v2-topbar-search"]')
    expect(trigger.exists(), 'RED 预期：顶栏缺命令面板触发器 v2-topbar-search').toBe(true)
    ;(trigger.element as HTMLElement).focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    await flushPromises()
    const input = document.querySelector('[data-testid="cmd-input"]')
    expect(input, '⌘K 打开后面板未渲染').not.toBeNull()
    expect(document.activeElement, '打开后焦点应移入 cmd-input').toBe(input)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]')).toBeNull()
    expect(document.activeElement, '关闭后焦点未归还顶栏触发器').toBe(trigger.element)
  })

  it('触发器文案仍走既有 i18n（v2.topbar.searchPlaceholder / v2.topbar.kbd 复用，零新增布局侧 key）', async () => {
    const { wrapper } = await factory()
    const trigger = wrapper.find('[data-testid="v2-topbar-search"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain(String(dig(zhCN, 'v2.topbar.searchPlaceholder')))
    expect(trigger.text()).toContain(String(dig(zhCN, 'v2.topbar.kbd')))
    expect(dig(enUS, 'v2.topbar.searchPlaceholder'), 'en-US 缺少 v2.topbar.searchPlaceholder').toBeDefined()
    expect(dig(enUS, 'v2.topbar.kbd'), 'en-US 缺少 v2.topbar.kbd').toBeDefined()
  })
})

/** 按点路径取 locale 值；undefined = key 缺失（LayoutV2.test.ts 先例） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
