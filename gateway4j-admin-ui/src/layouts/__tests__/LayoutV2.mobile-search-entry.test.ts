/**
 * P3-b【T 步 RED】：移动端命令面板入口（P3 池 b 组「移动端面板 UI 入口」，契约 §6）。
 * 病灶：≤768 视口 .v2-top-search display:none（壳修复票固化既有决策，375 溢出收口钉在
 * LayoutV2.test.ts「375 壳层溢出收口钉」段把该 display:none 钉死不许动）——移动端命令
 * 面板自此只剩 ⌘K 快捷键（移动端无物理键盘），无任何可点 UI 入口。
 *
 * 方案裁决（T 步定契约，C 步照落）：**方案① 移动抽屉菜单加「搜索 / 命令面板」项**。
 * - 入口收敛进既有 v2-menu-btn 抽屉（#v2-side），符合移动端「菜单即入口聚合地」惯例；
 * - 否决方案②（menu-btn 旁加独立搜索钮）：375 顶栏横向预算已被 P4e 三入口吃满，
 *   ≤480 五路收紧钉正在防溢出，再添顶栏元素有把溢出顶回来的风险；
 * - 机制与顶栏触发器同款：点击/Enter/Space → cmdOpen = true（v-model:open 布局侧置真），
 *   同时 sideOpen = false（先收抽屉再开面板，与 onNav「跳转前先收抽屉」同序）。
 *
 * 固化契约（C 步实现清单）：
 * - 位置：#v2-side 抽屉 aside 内（登录可见、不挂权限门控——命令面板本身无权限语义）；
 * - testid：data-testid="v2-menu-search"（同族命名 v2-menu-btn / v2-scrim）；
 * - i18n：v2.topbar.searchEntry（zh-CN「搜索 / 命令面板」/ en-US「Search / Command palette」，
 *   铁律 6 双语同落）；文案可再拼 v2.topbar.kbd（⌘K 字形），不做强断言；
 * - 语义：原生 <button> 或 role="button"（键盘可达免费拿）+ aria-haspopup="dialog"
 *   （与顶栏触发器 v2-topbar-search 同款）；Enter/Space 键盘等价（顶栏触发器先例）；
 * - 行为：点击 → cmd-root 出现（面板开）+ #v2-side 失去 is-open（抽屉收）+ menu-btn
 *   aria-expanded 归 "false"，两个状态断言缺一不可；
 * - 桌面（≥769）顶栏入口行为不变：v2-topbar-search 点击开面板既有链路原样（本文件第 ⑦
 *   组冗余钉 + 既有 LayoutV2.command-palette.test.ts 全绿为守）；
 * - ≤768 .v2-top-search display:none 既有决策不动（第 ① 组钉死——本票禁止「把顶栏触发器
 *   在窄视口放回来」式修法）。
 *
 * Esc 焦点归还判词（第 ⑧ 组固化）：面板关闭归还 lastTrigger=抽屉搜索项（CommandPalette
 * watch 既有逻辑，isConnected 守卫已内置）。抽屉已收时该项在真浏览器处于 display:none，
 * 焦点规范下 focus() 对 display:none 元素是无操作 → 焦点安全降级回 body，**不炸即达标**，
 * 无需面板侧追加代码；jsdom 不做样式重算，focus() 照常生效 → 本文件断言 activeElement
 * 归还抽屉项（jsdom 语义）。两侧行为都安全，判词在此固化，C 步零额外焦点处理。
 *
 * RED 类型：行为缺失型——LayoutV2.vue 真实存在，抽屉搜索项整体缺失（第 ②③④⑤⑥⑧ 组先红），
 * 第 ①⑦ 组为守护钉（落成即绿、C 后仍绿）。
 *
 * 测试侧改动判词（独立复核固化）：第 ④ 组原「点击后 side.classes() 含 is-open」是快照语义
 * 误设——classes() 实时读 element.classList（@vue/test-utils 2.4.11 dist 7153），与同用例
 * 「点击后无 is-open」对同一活元素互斥；改为点击前快照 classes 数组，「点击前抽屉开着」防伪
 * 意图保留。业务码 LayoutV2.vue 零改动。
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
  /** 全权限种子：侧栏叶子全可见（本票抽屉搜索项无权限语义，种子只服务 mount 存活性） */
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
      { path: '/login', name: 'Login', component: stub }
    ]
  })
}

const wrappers: VueWrapper<any>[] = []

/** attachTo body：焦点断言（activeElement）需要真实挂载树 */
async function factory() {
  const router = makeRouter()
  await router.push('/v2/overview')
  await router.isReady()
  const wrapper = mount(LayoutV2, { attachTo: document.body, global: { plugins: [ElementPlus, i18n, router] } }) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

/** 经 v2-menu-btn 打开移动抽屉（jsdom 无视口，状态走 is-open 类；行为与 ≤768 真机一致） */
async function openDrawer(wrapper: VueWrapper<any>) {
  const menuBtn = wrapper.find('[data-testid="v2-menu-btn"]')
  expect(menuBtn.exists(), '前置：移动抽屉开关 v2-menu-btn 未渲染').toBe(true)
  await menuBtn.trigger('click')
  await flushPromises()
  const side = wrapper.find('#v2-side')
  expect(side.classes(), '前置：点击 menu-btn 后抽屉未展开（is-open 缺失）').toContain('is-open')
  return side
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

describe('P3-b — 移动端命令面板入口（行为缺失型 RED）', () => {
  // ① 守护钉（绿）：缺口根因 = ≤768 隐藏顶栏触发器的既有响应式决策。本票修法是「补抽屉入口」，
  //    不是「窄视口把顶栏触发器放回来」——该决策被挪动/删除即打回（375 溢出收口钉同口径）。
  it('fs 契约（守护钉）：≤768 媒体查询内 .v2-top-search display:none 决策不动（移动端入口走抽屉，不走顶栏复辟）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    const at = source.indexOf('@media (max-width: 768px)')
    expect(at, '未找到 ≤768 媒体查询块').toBeGreaterThan(-1)
    const next = source.indexOf('@media', at + 1)
    const css = next > -1 ? source.slice(at, next) : source.slice(at)
    expect(css, 'v2-top-search 的 ≤768 display:none 决策被挪动/删除（P3-b 禁止顶栏复辟式修法）')
      .toMatch(/\.v2-top-search\s*\{[^}]*display:\s*none/)
  })

  // ② RED：抽屉搜索项整体缺失。fs 窗口锁在 #v2-side aside 内——入口必须收敛进抽屉，
  //    不许落回顶栏（第 ① 组的反向约束）。
  it('fs 契约（RED）：#v2-side 抽屉内落 v2-menu-search 搜索项，引用 v2.topbar.searchEntry，接线 = 开面板 + 收抽屉', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../LayoutV2.vue'), 'utf-8')
    const at = source.indexOf('<aside')
    const end = source.indexOf('</aside>', at)
    expect(at, '未找到抽屉 aside').toBeGreaterThan(-1)
    expect(end, '抽屉 aside 未闭合').toBeGreaterThan(at)
    const drawer = source.slice(at, end)
    expect(drawer, '抽屉内缺移动命令面板入口 v2-menu-search（P3-b 主体缺失 = RED 根因）')
      .toContain('data-testid="v2-menu-search"')
    expect(drawer, '抽屉搜索项文案未走 v2.topbar.searchEntry').toContain('v2.topbar.searchEntry')
    expect(drawer, '抽屉搜索项未接线开面板（cmdOpen = true）').toContain('cmdOpen = true')
    expect(drawer, '抽屉搜索项未先收抽屉（sideOpen = false，onNav「先收再走」同序）').toContain('sideOpen = false')
  })

  // ③ RED：铁律 6 双语同落。
  it('v2.topbar.searchEntry 在 zh-CN 与 en-US 都存在（铁律 6）', () => {
    expect(dig(zhCN, 'v2.topbar.searchEntry'), 'zh-CN 缺少 v2.topbar.searchEntry').toBeDefined()
    expect(dig(enUS, 'v2.topbar.searchEntry'), 'en-US 缺少 v2.topbar.searchEntry').toBeDefined()
  })

  // ④ RED：主行为。两个状态断言缺一不可：面板开（cmd-root 出现）+ 抽屉收（is-open 退场）。
  it('点击抽屉搜索项 → 命令面板打开（cmd-root 出现）+ 抽屉关闭（is-open 退场、menu-btn aria-expanded 归 false）', async () => {
    const { wrapper } = await factory()
    const menuBtn = wrapper.find('[data-testid="v2-menu-btn"]')
    const side = await openDrawer(wrapper)
    expect(menuBtn.attributes('aria-expanded'), '前置：抽屉展开时 menu-btn aria-expanded 应为 true').toBe('true')
    expect(document.querySelector('[data-testid="cmd-root"]'), '前置：抽屉打开本身不得触发命令面板').toBeNull()

    const item = wrapper.find('[data-testid="v2-menu-search"]')
    expect(item.exists(), 'RED 预期：抽屉缺命令面板入口 v2-menu-search').toBe(true)
    const sideClassesBefore = side.classes() // 前态快照：classes() 实时读 classList（dist 7153），点击后重读即后态
    await item.trigger('click')
    await flushPromises()

    expect(document.querySelector('[data-testid="cmd-root"]'), '点抽屉搜索项未打开命令面板').not.toBeNull()
    expect(wrapper.find('#v2-side').classes(), '点抽屉搜索项后抽屉未收（is-open 未退场）').not.toContain('is-open')
    expect(menuBtn.attributes('aria-expanded'), '抽屉收起后 menu-btn aria-expanded 未归 false').toBe('false')
    expect(sideClassesBefore, '前态快照防伪：点击前抽屉确曾展开（is-open）').toContain('is-open')
  })

  // ⑤ RED：语义契约。原生 button 或 role=button（键盘可达免费拿）+ aria-haspopup=dialog
  //    （与顶栏触发器同款）+ 可见文案来自 v2.topbar.searchEntry。
  it('抽屉搜索项语义：button 语义 + aria-haspopup=dialog + 文案走 v2.topbar.searchEntry', async () => {
    const { wrapper } = await factory()
    const item = wrapper.find('#v2-side [data-testid="v2-menu-search"]')
    expect(item.exists(), 'RED 预期：抽屉内缺 v2-menu-search').toBe(true)
    const isButton = item.element.tagName === 'BUTTON' || item.attributes('role') === 'button'
    expect(isButton, '抽屉搜索项缺 button 语义（原生 <button> 或 role="button"）').toBe(true)
    expect(item.attributes('aria-haspopup'), '抽屉搜索项缺 aria-haspopup="dialog"（顶栏触发器同款）').toBe('dialog')
    expect(item.text(), '抽屉搜索项可见文案未走 v2.topbar.searchEntry')
      .toContain(String(dig(zhCN, 'v2.topbar.searchEntry')))
  })

  // ⑥ RED：键盘等价（顶栏触发器 @keydown.enter/.space 先例随迁）。Enter 与 Space 各验一轮
  //    「开面板 + 收抽屉」，中途重开抽屉还原前态。
  it('抽屉搜索项键盘等价：Enter / Space 触发同款「面板开 + 抽屉收」（顶栏触发器先例）', async () => {
    const { wrapper } = await factory()
    for (const key of ['enter', 'space'] as const) {
      await openDrawer(wrapper)
      const item = wrapper.find('[data-testid="v2-menu-search"]')
      expect(item.exists(), `RED 预期（${key}）：抽屉缺 v2-menu-search`).toBe(true)
      await item.trigger(`keydown.${key}`)
      await flushPromises()
      expect(document.querySelector('[data-testid="cmd-root"]'), `${key} 未打开命令面板`).not.toBeNull()
      expect(wrapper.find('#v2-side').classes(), `${key} 后抽屉未收`).not.toContain('is-open')
    }
  })

  // ⑦ 守护钉（绿）：桌面顶栏入口行为不变。冗余钉 + 既有 LayoutV2.command-palette.test.ts
  //    全绿为守——抽屉项加入不得分流/破坏 v2-topbar-search 既有链路。
  it('桌面顶栏入口行为不变：点击 v2-topbar-search → cmd-root 打开，Esc 关闭（既有链路守护）', async () => {
    const { wrapper } = await factory()
    expect(document.querySelector('[data-testid="cmd-root"]')).toBeNull()
    await wrapper.find('[data-testid="v2-topbar-search"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), '顶栏触发器开面板链路被破坏').not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), 'Esc 关闭链路被破坏').toBeNull()
  })

  // ⑧ RED：Esc 关闭 → 焦点归还判词（文件头判词固化）。jsdom 不做样式重算，display:none
  //    不影响 focus() 生效 → 断言归还抽屉项；真浏览器同场景 focus() 是无操作 → 降级回
  //    body，同样安全（不炸即达标），C 步零额外焦点处理。
  it('抽屉项打开面板 → Esc 关闭 → 面板闭合 + 焦点归还抽屉项（jsdom 语义；真浏览器 display:none 降级 body 亦安全）', async () => {
    const { wrapper } = await factory()
    await openDrawer(wrapper)
    const item = wrapper.find('[data-testid="v2-menu-search"]')
    expect(item.exists(), 'RED 预期：抽屉缺 v2-menu-search（焦点归还无从谈起）').toBe(true)
    ;(item.element as HTMLElement).focus()
    expect(document.activeElement, '前置：抽屉搜索项聚焦失败').toBe(item.element)

    await item.trigger('click')
    await flushPromises()
    const input = document.querySelector('[data-testid="cmd-input"]')
    expect(input, '面板打开后未把焦点接管到 cmd-input').not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('[data-testid="cmd-root"]'), 'Esc 未关闭命令面板').toBeNull()
    expect(document.activeElement, '关闭后焦点未归还抽屉搜索项（display:none 降级判词见文件头；jsdom 下必须显式归还）')
      .toBe(item.element)
  })
})

/** 按点路径取 locale 值；undefined = key 缺失（LayoutV2.test.ts 先例） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
