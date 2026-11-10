/**
 * LOW-2-T：全局快捷键帮助（`?` 唤出速查表，v2 优化低优先级 #8，对标 Kong/Tyk ——
 * docs/ui-v2/gateway4j-v2优化.md #8）。先红是预期（RED 类型：组件缺失）——
 * ShortcutHelp 由 LOW-2-C 实现。对缺失组件/注册表采用「非常量动态导入」（见 HELP_PATH /
 * REGISTRY_PATH 处注释）：避免 RED 阶段 vue-tsc 对不存在模块报 TS2307（契约 §3：TSC 0 错
 * 不得新增），C 步落地后该写法与静态 import 完全等价。LayoutV2 常驻接线属「行为缺失」型
 * RED，见 src/layouts/__tests__/LayoutV2.shortcut-help.test.ts。
 *
 * ══ 组件契约（LOW-2-T 固化，LOW-2-C 不得偏离）══
 * - 落点：src/components-v2/shortcuts/ShortcutHelp.vue + 同目录 shortcutRegistry.ts
 *   （业务域组件：依赖 v2.sc.* i18n 命名空间与既有 --app-* token，不进 src/components 的
 *   SDK 快照域；且 src/components 在 tsconfig 被 exclude，放进去会逃过 vue-tsc 类型检查）。
 *   静态注册表与组件分文件（ShortcutHelp.vue 只管壳与交互，数据全部来自注册表常量）。
 * - 注册表 API（shortcutRegistry.ts 导出，测试 B 组逐一钉死）：
 *     type ShortcutGroupId = 'global' | 'canvas' | 'list'
 *     interface ShortcutEntry { id: string; group: ShortcutGroupId; keys: string; descKey: string }
 *     const SHORTCUT_GROUP_ORDER: ShortcutGroupId[]      // 固定 ['global','canvas','list']
 *     const SHORTCUT_GROUP_LABEL_KEYS: Record<ShortcutGroupId, string>  // v2.sc.group.*
 *     const SHORTCUTS: ShortcutEntry[]                    // 平铺注册表（每项自带 group）
 *     function groupedShortcuts(): { group; labelKey; items: ShortcutEntry[] }[]  // 按 ORDER 分组
 *   id 即 testid 后缀（sc-item-{id} / sc-kbd-{id}），须全表唯一且 ^[a-z][a-zA-Z0-9-]*$
 *   （小写驼峰 slug：rowDetail 与双语 locale i18n key v2.sc.item.rowDetail 全表同口径；
 *    LOW-2-D 复核修正——原 ^[a-z][a-z0-9-]*$ 禁大写，与注册表唯一 camelCase 条目自相矛盾）。
 * - 注册表内容（真实枚举，来源代码点，B 组 fs 对账防漂移——代码改动必须同步注册表）：
 *     global：palette 'Ctrl/⌘+K'（CommandPalette.vue ⌘K/Ctrl+K）、help '?'（本组件）、
 *             close 'Esc'（CommandPalette Esc 关 / LayoutV2 Esc 收抽屉，三处真实绑定）
 *     canvas：undo 'Ctrl/⌘+Z'、redo 'Ctrl/⌘+Y'
 *             （useCanvasGraph.ts onKeydown：实际绑定是 Ctrl/Cmd+Z undo 与 Ctrl/Cmd+Y redo，
 *              优化建议原文的 Ctrl+Shift+Z 与代码不符，按实际绑定入表）
 *     list：  rowDetail 'Enter'（Monitor.vue 慢路由行 @keydown.enter=openRouteDetail，OPT-1
 *             键盘等价；v2 列表页目前唯一成体系的键盘项）
 * - 组件 API：无 props / 无 emits——开合状态自持，window 常驻监听（挂载即监听，与状态无关；
 *   ⌘K 先例）。不设顶栏触发器，`?` 是唯一入口（与 CommandPalette 的 v-model:open 形态不同）。
 * - 键盘：`?`（e.key==='?'，无 ctrl/meta/alt 修饰）全局开合 toggle；输入框/textarea/
 *   contenteditable 聚焦时不触发（防打字误弹；contenteditable 判据须兼容 jsdom——其
 *   isContentEditable 恒 undefined，用 getAttribute('contenteditable') / closest 判定）；
 *   Esc（window 级，仅开着时）关闭。
 * - 点击：sc-mask 关闭；面板内（分组/条目区）点击不关闭。
 * - a11y：sc-root role="dialog" aria-modal="true" :aria-label="t('v2.sc.title')"；
 *   sc-root 自带 tabindex="-1"，打开自动聚焦 sc-root，关闭焦点归还打开前的触发元素；
 *   组件源码含 :focus-visible 焦点环（Hallmark 门槛）。
 * - testid 全表（前缀 sc-，{id}=注册表条目 id）：sc-root / sc-mask /
 *   sc-group-{global|canvas|list} / sc-item-{id} / sc-kbd-{id}（kbd 样式元素，条目内恰一个，
 *   文本=注册表 keys 展示串）。
 * - i18n：全部可见文案走 i18n（铁律 6，zh-CN/en-US 同步）。新增 key 全表（10 个，v2 命名空间）：
 *   v2.sc.title / v2.sc.group.global / v2.sc.group.canvas / v2.sc.group.list /
 *   v2.sc.item.palette / v2.sc.item.help / v2.sc.item.close / v2.sc.item.undo /
 *   v2.sc.item.redo / v2.sc.item.rowDetail
 *   （键位展示串 keys 是平台中立字形 'Ctrl/⌘+K' 等，不入 i18n，与 v2.topbar.kbd='⌘K' 先例同口径。）
 * - 样式：token-only（禁字面 hex/rgb/hsl）；遮罩 var(--app-overlay-strong)；面板 max-width:90vw
 *   （375 不溢出，.cmd-panel 先例）+ max-height 收口内滚；kbd 用既有 token（.v2-top-kbd 先例）；
 *   浮层层级 z-index 2000（对齐 .cmd-root）。
 * - 生命周期：onBeforeUnmount 配对移除 window keydown（卸载后 `?` 不再生效，⌘K 先例）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createI18n, type I18n } from 'vue-i18n'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

// —— RED 关键：非常量动态导入（组件/注册表缺失 → 运行时模块解析失败 = 合法 RED）——
// 说明见文件头；静态 import 会在 RED 阶段产生 TS2307，违反「TSC 0 错不得新增」。
const HELP_PATH = '@/components-v2/shortcuts/ShortcutHelp.vue'
const REGISTRY_PATH = '@/components-v2/shortcuts/shortcutRegistry'
const ShortcutHelp: any = (await import(HELP_PATH)).default
const registryMod: any = await import(REGISTRY_PATH)

// —— i18n：真双语 message（key 存在性 + 文案断言两用），显式 I18n<> 类型（CommandPalette.test.ts 先例）——
const i18nBase = { legacy: false as const, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } }
function makeI18n(): I18n<typeof i18nBase['messages'], Record<string, unknown>, Record<string, unknown>, string, false> {
  return createI18n(i18nBase)
}

/** 按点路径取 locale 值；undefined = key 缺失（LayoutV2.test.ts 先例） */
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

const wrappers: VueWrapper<any>[] = []

async function factory(opts: { attach?: boolean } = {}) {
  const global = { plugins: [makeI18n()] }
  const wrapper = (
    opts.attach ? mount(ShortcutHelp, { attachTo: document.body, global }) : mount(ShortcutHelp, { global })
  ) as VueWrapper<any>
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  for (const w of wrappers) w.unmount()
  wrappers.length = 0
})

const tid = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="${id}"]`)
const scRoot = () => document.querySelector('[data-testid="sc-root"]')
/** window 级按键（组件自管监听，⌘K 先例同款手法） */
const winKey = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))

// ═══════════ A. i18n 双语 key 存在（铁律 6；C 步补 zh-CN.ts / en-US.ts）═══════════
const SC_KEYS = [
  'v2.sc.title',
  'v2.sc.group.global',
  'v2.sc.group.canvas',
  'v2.sc.group.list',
  'v2.sc.item.palette',
  'v2.sc.item.help',
  'v2.sc.item.close',
  'v2.sc.item.undo',
  'v2.sc.item.redo',
  'v2.sc.item.rowDetail'
]
describe('ShortcutHelp — i18n 双语 key 存在（契约铁律 6）', () => {
  it.each(SC_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ═══════════ B. 注册表结构 + 真实枚举对账（防漂移 fs 锚）═══════════
const GROUP_IDS: string[] = ['global', 'canvas', 'list']

describe('ShortcutHelp — 注册表结构（shortcutRegistry.ts）', () => {
  it('注册表非空；SHORTCUT_GROUP_ORDER 固定 global→canvas→list；三组 labelKey 齐备且双语存在', () => {
    const order: string[] = registryMod.SHORTCUT_GROUP_ORDER
    expect(Array.isArray(order)).toBe(true)
    expect(order).toEqual(GROUP_IDS)
    const labelKeys: Record<string, string> = registryMod.SHORTCUT_GROUP_LABEL_KEYS
    for (const g of GROUP_IDS) {
      const key = labelKeys?.[g]
      expect(key, `分组 ${g} 缺 labelKey`).toBeTruthy()
      expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
      expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
    }
  })

  it('每条目都有 group/keys/descKey（id 即 testid 后缀）：id 唯一、slug 格式、keys 非空、group ∈ 三组', () => {
    const entries: any[] = registryMod.SHORTCUTS
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length, '注册表不得为空（真实枚举 ≥5 条）').toBeGreaterThanOrEqual(5)
    const seen = new Set<string>()
    for (const e of entries) {
      expect(e.id, '条目缺 id').toBeTruthy()
      // LOW-2-D 复核修正（笔误）：注册表/双语 locale/i18n key 全表引用均为驼峰 rowDetail
      // （测试 9 处 + 注册表 + zh/en locale，0 处 row-detail），故放宽为小写驼峰 slug——
      // 命名纪律不变：首字符小写字母，其余仅字母/数字/连字符，仍作合法 testid 后缀。
      expect(e.id, `id ${e.id} 须为 slug（^[a-z][a-zA-Z0-9-]*$，作 testid 后缀；驼峰 rowDetail 合法）`).toMatch(
        /^[a-z][a-zA-Z0-9-]*$/
      )
      expect(seen.has(e.id), `id 重复：${e.id}`).toBe(false)
      seen.add(e.id)
      expect(GROUP_IDS, `条目 ${e.id} 的 group 非法`).toContain(e.group)
      expect(typeof e.keys, `条目 ${e.id} 缺 keys 展示串`).toBe('string')
      expect((e.keys as string).length, `条目 ${e.id} keys 为空`).toBeGreaterThan(0)
      expect(typeof e.descKey, `条目 ${e.id} 缺 descKey（i18n key）`).toBe('string')
    }
  })

  it('groupedShortcuts() 按 ORDER 分组且不丢条目（每项归入所属组、组内序=注册表序）', () => {
    const groups: any[] = registryMod.groupedShortcuts()
    expect(groups.map((g) => g.group)).toEqual(GROUP_IDS)
    const flat = groups.flatMap((g) => g.items)
    expect(flat.length).toBe(registryMod.SHORTCUTS.length)
    for (const g of groups) {
      expect(g.labelKey).toBe(registryMod.SHORTCUT_GROUP_LABEL_KEYS[g.group])
      for (const item of g.items) expect(item.group).toBe(g.group)
    }
  })

  const descRows: Array<[string, string]> = registryMod.SHORTCUTS.map((e: any) => [e.id, e.descKey])
  it.each(descRows)(
    '条目 %s 的 desc=%s 是存在的 i18n key（zh-CN 与 en-US 双语）',
    (id, descKey) => {
      expect(dig(zhCN, descKey), `zh-CN 缺少 ${descKey}（条目 ${id}）`).toBeDefined()
      expect(dig(enUS, descKey), `en-US 缺少 ${descKey}（条目 ${id}）`).toBeDefined()
    }
  )
})

describe('ShortcutHelp — 注册表真实枚举对账（代码↔注册表 fs 防漂移）', () => {
  const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')

  it('canvas 组真实枚举：undo(Ctrl/⌘+Z)+redo(Ctrl/⌘+Y)，与 useCanvasGraph.onKeydown 实际绑定一致', () => {
    const entries: any[] = registryMod.SHORTCUTS
    const undo = entries.find((e) => e.group === 'canvas' && e.id === 'undo')
    const redo = entries.find((e) => e.group === 'canvas' && e.id === 'redo')
    expect(undo, 'canvas 组缺 undo 条目').toBeTruthy()
    expect(redo, 'canvas 组缺 redo 条目').toBeTruthy()
    expect(undo.keys).toContain('Z')
    expect(redo.keys).toContain('Y')
    // 实际绑定锚：Ctrl/Cmd+Z undo、Ctrl/Cmd+Y redo（优化建议原文 Ctrl+Shift+Z 与代码不符，按实际入表）
    const src = readSrc('../../../views-v2/canvas/composables/useCanvasGraph.ts')
    // LOW-2-D 复核修正（笔误）：真实代码是 (e.ctrlKey || e.metaKey)（useCanvasGraph.ts L358/361），
    // 原正则漏写 e\. 前缀致误报漂移。防漂移锚须匹配真实代码——照字面改生产码会 ReferenceError，
    // 故修正则不动生产码；锚定语义不变。
    expect(src, 'useCanvasGraph 键盘绑定漂移：Ctrl/Cmd+Z undo 不在了，注册表须同步').toMatch(/ctrlKey \|\| e\.metaKey\)[^]*e\.key === 'z'/)
    expect(src, 'useCanvasGraph 键盘绑定漂移：Ctrl/Cmd+Y redo 不在了，注册表须同步').toMatch(/ctrlKey \|\| e\.metaKey\)[^]*e\.key === 'y'/)
  })

  it('global 组真实枚举：palette(Ctrl/⌘+K)+help(?)+close(Esc)，与 CommandPalette/LayoutV2 实际绑定一致', () => {
    const entries: any[] = registryMod.SHORTCUTS
    const palette = entries.find((e) => e.group === 'global' && e.id === 'palette')
    const help = entries.find((e) => e.group === 'global' && e.id === 'help')
    const close = entries.find((e) => e.group === 'global' && e.id === 'close')
    expect(palette, 'global 组缺 palette（命令面板）条目').toBeTruthy()
    expect(palette.keys).toContain('K')
    expect(help, 'global 组缺 help（`?` 本帮助）条目').toBeTruthy()
    expect(help.keys).toBe('?')
    expect(close, 'global 组缺 close（Esc 关弹层）条目').toBeTruthy()
    const paletteSrc = readSrc('../../command/CommandPalette.vue')
    // LOW-2-D 复核修正（笔误）：真实代码是 (e.metaKey || e.ctrlKey)（CommandPalette.vue L70），
    // 原正则漏写 e\. 前缀致误报漂移；锚真实代码，锚定语义不变。
    expect(paletteSrc, 'CommandPalette ⌘K/Ctrl+K 绑定漂移，注册表须同步').toMatch(/metaKey \|\| e\.ctrlKey/)
    expect(paletteSrc, 'CommandPalette Esc 关闭绑定漂移，注册表须同步').toMatch(/e\.key === 'Escape' && props\.open/)
    const layoutSrc = readSrc('../../../layouts/LayoutV2.vue')
    expect(layoutSrc, 'LayoutV2 Esc 收抽屉绑定漂移，注册表须同步').toMatch(/e\.key === 'Escape'/)
  })

  it('list 组真实枚举：rowDetail(Enter)，与 Monitor 慢路由行 @keydown.enter 实际绑定一致', () => {
    const entries: any[] = registryMod.SHORTCUTS
    const row = entries.find((e) => e.group === 'list' && e.id === 'rowDetail')
    expect(row, 'list 组缺 rowDetail 条目').toBeTruthy()
    expect(row.keys).toBe('Enter')
    const src = readSrc('../../../views-v2/monitor/Monitor.vue')
    expect(src, 'Monitor 慢路由行 Enter 下钻绑定漂移，注册表须同步').toContain('@keydown.enter="openRouteDetail(r.id)"')
  })
})

// ═══════════ C. `?` 全局开合（window 常驻监听 + 生命周期配对）═══════════
describe('ShortcutHelp — `?` 全局开合（组件自管监听）', () => {
  it('初始不渲染 sc-root（v-if 收口，常驻挂载零 DOM）', async () => {
    await factory()
    expect(scRoot()).toBeNull()
  })

  it('window 按 `?` → sc-root 出现（开）', async () => {
    await factory({ attach: true })
    winKey('?')
    await flushPromises()
    expect(scRoot(), '`?` 未打开快捷键速查表').not.toBeNull()
  })

  it('再按 `?` → sc-root 消失（开合 toggle，⌘K 同款语义）', async () => {
    await factory({ attach: true })
    winKey('?')
    await flushPromises()
    expect(scRoot()).not.toBeNull()
    winKey('?')
    await flushPromises()
    expect(scRoot(), '`?` 二次按下未关闭速查表（应为 toggle）').toBeNull()
  })

  it('Esc（window 级，开着时）→ 关闭', async () => {
    await factory({ attach: true })
    winKey('?')
    await flushPromises()
    expect(scRoot()).not.toBeNull()
    winKey('Escape')
    await flushPromises()
    expect(scRoot(), 'Esc 未关闭速查表').toBeNull()
  })

  it('Esc 闭合态按下是 no-op（不产生打开）', async () => {
    await factory()
    winKey('Escape')
    await flushPromises()
    expect(scRoot()).toBeNull()
  })

  it('卸载后 `?` 不再打开（onBeforeUnmount 配对移除 window 监听，⌘K 先例）', async () => {
    const wrapper = await factory({ attach: true })
    wrapper.unmount()
    wrappers.length = 0
    winKey('?')
    await flushPromises()
    expect(scRoot(), '组件卸载后 window 监听未移除（`?` 仍打开面板）').toBeNull()
  })
})

// ═══════════ D. 关闭路径与点击语义（遮罩关 / 面板内不关）═══════════
describe('ShortcutHelp — 关闭路径（遮罩 / 面板内点击）', () => {
  it('点击 sc-mask → 关闭', async () => {
    const wrapper = await factory({ attach: true })
    winKey('?')
    await flushPromises()
    await tid(wrapper, 'sc-mask').trigger('click')
    await flushPromises()
    expect(scRoot(), '点击遮罩未关闭速查表').toBeNull()
  })

  it('点击面板内容（sc-group-global 条目区）→ 不关闭', async () => {
    const wrapper = await factory({ attach: true })
    winKey('?')
    await flushPromises()
    await tid(wrapper, 'sc-group-global').trigger('click')
    await flushPromises()
    expect(scRoot(), '面板内点击误关闭速查表（关闭只许 Esc/遮罩/`?`）').not.toBeNull()
  })
})

// ═══════════ E. 输入聚焦防误弹（打字不触发 `?`）═══════════
/**
 * 守卫判据契约：事件 target（或其祖先）是 input / textarea / contenteditable 之一时忽略 `?`。
 * contenteditable 判定须兼容 jsdom（isContentEditable 恒 undefined）：用
 * getAttribute('contenteditable') != null 或 closest('[contenteditable]')。
 */
function pressQuestionOn(target: HTMLElement) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
}

describe('ShortcutHelp — 输入聚焦防误弹（文本输入域豁免）', () => {
  let guards: HTMLElement[] = []

  afterEach(() => {
    for (const el of guards) el.remove()
    guards = []
  })

  it('input 聚焦时按 `?` → 不打开', async () => {
    await factory({ attach: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    guards.push(input)
    input.focus()
    pressQuestionOn(input)
    await flushPromises()
    expect(scRoot(), '输入框内打字误触发了速查表').toBeNull()
  })

  it('textarea 聚焦时按 `?` → 不打开', async () => {
    await factory({ attach: true })
    const area = document.createElement('textarea')
    document.body.appendChild(area)
    guards.push(area)
    area.focus()
    pressQuestionOn(area)
    await flushPromises()
    expect(scRoot(), 'textarea 内打字误触发了速查表').toBeNull()
  })

  it('contenteditable 聚焦时按 `?` → 不打开（jsdom 兼容：按属性判定，isContentEditable 恒 undefined）', async () => {
    await factory({ attach: true })
    const ce = document.createElement('div')
    ce.setAttribute('contenteditable', '')
    document.body.appendChild(ce)
    guards.push(ce)
    ce.focus()
    pressQuestionOn(ce)
    await flushPromises()
    expect(scRoot(), 'contenteditable 内打字误触发了速查表').toBeNull()
  })

  it('普通 div（非文本输入域）聚焦时按 `?` → 正常打开（守卫只豁免文本输入）', async () => {
    await factory({ attach: true })
    const div = document.createElement('div')
    document.body.appendChild(div)
    guards.push(div)
    div.focus()
    pressQuestionOn(div)
    await flushPromises()
    expect(scRoot(), '非文本输入域聚焦时 `?` 被误豁免').not.toBeNull()
  })

  it('带修饰键的 `?`（Ctrl/?、⌘/?、Alt/?）不触发（避免吞浏览器组合键）', async () => {
    await factory({ attach: true })
    winKey('?', { ctrlKey: true })
    await flushPromises()
    expect(scRoot(), 'Ctrl+? 不应打开速查表').toBeNull()
    winKey('?', { metaKey: true })
    await flushPromises()
    expect(scRoot(), '⌘+? 不应打开速查表').toBeNull()
    winKey('?', { altKey: true })
    await flushPromises()
    expect(scRoot(), 'Alt+? 不应打开速查表').toBeNull()
  })
})

// ═══════════ F. 速查表渲染（分组 / 条目 / kbd / testid 全表）═══════════
describe('ShortcutHelp — 速查表渲染（注册表驱动）', () => {
  it('三组 sc-group-global/canvas/list 按 ORDER 顺序渲染', async () => {
    const wrapper = await factory()
    winKey('?')
    await flushPromises()
    const html = wrapper.html()
    const at = (id: string) => html.indexOf(`data-testid="sc-group-${id}"`)
    for (const g of GROUP_IDS) expect(at(g), `缺 sc-group-${g}`).toBeGreaterThan(-1)
    expect(at('global')).toBeLessThan(at('canvas'))
    expect(at('canvas')).toBeLessThan(at('list'))
  })

  it('分组名走 i18n（sc-group-{g} 文本含 v2.sc.group.{g} 的 zh 文案）', async () => {
    const wrapper = await factory()
    winKey('?')
    await flushPromises()
    for (const g of GROUP_IDS) {
      expect(tid(wrapper, `sc-group-${g}`).text(), `sc-group-${g} 分组名未走 i18n`).toContain(
        String(dig(zhCN, `v2.sc.group.${g}`))
      )
    }
  })

  const itemRows: Array<[string, string, string]> = registryMod.SHORTCUTS.map((e: any) => [e.id, e.keys, e.descKey])
  it.each(itemRows)(
    '条目 %s 渲染 sc-item-%s：内含 sc-kbd-%s（文本=「%s」），描述文本=descKey zh 文案',
    async (id, keys, descKey) => {
      const wrapper = await factory()
      winKey('?')
      await flushPromises()
      const item = tid(wrapper, `sc-item-${id}`)
      expect(item.exists(), `速查表缺条目 sc-item-${id}`).toBe(true)
      const kbd = tid(wrapper, `sc-kbd-${id}`)
      expect(kbd.exists(), `条目 ${id} 缺 kbd 元素 sc-kbd-${id}`).toBe(true)
      expect(kbd.element.tagName).toBe('KBD')
      expect(kbd.text()).toBe(keys)
      expect(item.text(), `条目 ${id} 描述未走 ${descKey} 的 zh 文案`).toContain(String(dig(zhCN, descKey)))
    }
  )

  it('条目归属正确：sc-item-undo/redo 在 canvas 组、sc-item-rowDetail 在 list 组（groupedShortcuts 渲染口径）', async () => {
    const wrapper = await factory()
    winKey('?')
    await flushPromises()
    const canvasGroup = tid(wrapper, 'sc-group-canvas')
    expect(canvasGroup.find('[data-testid="sc-item-undo"]').exists()).toBe(true)
    expect(canvasGroup.find('[data-testid="sc-item-redo"]').exists()).toBe(true)
    expect(canvasGroup.find('[data-testid="sc-item-rowDetail"]').exists(), 'rowDetail 不得混入 canvas 组').toBe(false)
    const listGroup = tid(wrapper, 'sc-group-list')
    expect(listGroup.find('[data-testid="sc-item-rowDetail"]').exists()).toBe(true)
  })
})

// ═══════════ G. a11y（dialog 语义 + 焦点接管/归还）═══════════
describe('ShortcutHelp — a11y 语义与焦点管理', () => {
  it('sc-root 为 role=dialog + aria-modal=true，且 aria-label = v2.sc.title（非空）', async () => {
    const wrapper = await factory()
    winKey('?')
    await flushPromises()
    const root = tid(wrapper, 'sc-root')
    expect(root.attributes('role')).toBe('dialog')
    expect(root.attributes('aria-modal')).toBe('true')
    expect(root.attributes('aria-label')).toBe(String(dig(zhCN, 'v2.sc.title')))
  })

  it('打开自动聚焦 sc-root（tabindex=-1 接管焦点）', async () => {
    const wrapper = await factory({ attach: true })
    winKey('?')
    await flushPromises()
    const root = tid(wrapper, 'sc-root')
    expect(root.exists()).toBe(true)
    expect(root.attributes('tabindex'), 'sc-root 须 tabindex=-1 才可编程聚焦').toBe('-1')
    expect(document.activeElement, '打开后面板未接管焦点到 sc-root').toBe(root.element)
  })

  it('关闭后焦点归还打开前的触发元素（a11y 焦点归还契约，CommandPalette 先例）', async () => {
    const wrapper = await factory({ attach: true })
    const triggerBtn = document.createElement('button')
    document.body.appendChild(triggerBtn)
    try {
      triggerBtn.focus()
      expect(document.activeElement).toBe(triggerBtn)
      winKey('?')
      await flushPromises()
      expect(document.activeElement, '打开后面板未接管焦点').toBe(tid(wrapper, 'sc-root').element)
      winKey('Escape')
      await flushPromises()
      expect(scRoot()).toBeNull()
      expect(document.activeElement, '关闭后焦点未归还触发元素').toBe(triggerBtn)
    } finally {
      triggerBtn.remove()
    }
  })
})

// ═══════════ H. 源码契约 fs（落点 / 焦点环 / 375 / token-only / kbd）═══════════
describe('ShortcutHelp — 源码契约（fs grep，CanvasMinimap/Settings 手法）', () => {
  const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
  const helpSource = () => readSrc('../ShortcutHelp.vue')
  const styleBlock = (): string => {
    const m = helpSource().match(/<style[^>]*>([\s\S]*?)<\/style>/)
    expect(m, 'ShortcutHelp.vue 缺 <style> 块').toBeTruthy()
    return m![1]
  }

  it('落点契约：ShortcutHelp.vue 与 shortcutRegistry.ts 分文件落在 src/components-v2/shortcuts/ 下', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../ShortcutHelp.vue')), 'ShortcutHelp.vue 未落在 src/components-v2/shortcuts/ 下').toBe(true)
    expect(fs.existsSync(path.resolve(__dirname, '../shortcutRegistry.ts')), 'shortcutRegistry.ts 未落在 src/components-v2/shortcuts/ 下').toBe(true)
  })

  it('a11y 源码契约：含 :focus-visible 焦点环（Hallmark 门槛）', () => {
    expect(helpSource(), '组件缺 :focus-visible 焦点环（Hallmark 门槛）').toContain(':focus-visible')
  })

  it('kbd 源码契约：条目键位用 <kbd> 元素承载（sc-kbd 惯例）', () => {
    expect(helpSource(), '条目键位未用 <kbd> 元素').toContain('<kbd')
  })

  it('375 防溢出源码契约：.sc-panel max-width:90vw（.cmd-panel 惯例）+ 遮罩走 var(--app-overlay-strong)', () => {
    const css = styleBlock()
    expect(css, '面板缺 max-width:90vw（375 惯例，.cmd-panel 先例）').toMatch(/\.sc-panel\s*\{[^}]*max-width:\s*90vw/)
    expect(css, '遮罩底色须走 var(--app-overlay-strong) token').toMatch(/\.sc-mask\s*\{[^}]*var\(--app-overlay-strong\)/)
    expect(css, '面板须 max-height 收口 + 内滚（6+ 条目矮屏可滚）').toMatch(/\.sc-(panel|body)\s*\{[^}]*overflow(?:-y)?:\s*auto/)
  })

  it('样式 token-only：style 块零字面色值（hex / rgb(a) / hsl(a) 全禁，只许 var()/color-mix token）', () => {
    const css = styleBlock()
    expect(css, 'style 含字面 hex').not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css, 'style 含字面 rgb(a)').not.toMatch(/\brgba?\s*\(/)
    expect(css, 'style 含字面 hsl(a)').not.toMatch(/\bhsla?\s*\(/)
  })
})
