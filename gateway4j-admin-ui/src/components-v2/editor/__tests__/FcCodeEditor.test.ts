/**
 * OPT-5-T：插件 config 编辑器 FcCodeEditor（CodeMirror 6 封装）—— v2 优化建议 #4
 * （对标 APISIX 表单/JSON 双模，docs/ui-v2/gateway4j-v2优化.md §三.4）。
 * 先红是预期（RED 类型：组件缺失）——FcCodeEditor 由 OPT-5-C 实现。对缺失组件采用
 * 「变量路径动态导入」（见 CDE_PATH 处注释）：字面量路径会在 vite import-analysis 的
 * transform 阶段炸掉整文件收集（OPT-5-T 探针实证），变量路径才能得到「运行时模块解析
 * 失败 = 合法 RED」——与 CommandPalette.test.ts PALETTE_PATH 同法。落地后该写法与静态
 * import 完全等价。Editor.vue 侧接线（行为缺失型 RED）见
 * src/views-v2/plugins/__tests__/Editor.code-editor.test.ts。
 *
 * ══ 组件契约（OPT-5-T 固化，OPT-5-C 不得偏离）══
 * - 落点：src/components-v2/editor/FcCodeEditor.vue。不进 src/components——该目录在
 *   tsconfig 被 exclude，放进去会逃过 vue-tsc 类型检查（components-v2 先例 CommandPalette）。
 * - API：props { modelValue: string; disabled?: boolean; maxlength?: number; rows?: number }
 *   emits ['update:modelValue']（v-model 双向）；defineExpose({ view }) —— view 为
 *   CodeMirror EditorView | null（ready 形态必有实例、fallback 形态恒 null；测试注入输入
 *   与父层取视图的出口）。
 * - 两种形态（cde-root 状态类外显）：
 *   · is-loading：挂载即进入，动态 import CodeMirror 期间；
 *   · is-ready：CM 就绪——contenteditable 视图 + 镜像 textarea（见 cde-content）；
 *   · is-fallback：动态 import('codemirror') 或 import('@codemirror/lang-json') 任一 reject，
 *     或 CM 初始化抛异常 → 原生 textarea 顶上，行为与旧 FcInput textarea 一致
 *     （降级可测：vi.doMock(specifier, 抛错工厂) → import reject，探针实证可行）。
 *     不做额外 memoize：每次挂载都重新 import()（esm 模块缓存已兜底成功路径的成本；
 *     成功/失败都不缓存——降级与恢复可逆，测试可先 ready 后 doMock-reject 逆序组合）。
 * - cde-content 契约（两种形态都要能取值断言，本文件一律按 textarea 取值）：
 *   恒为一个真实 <textarea data-testid="cde-content">。
 *   fallback = 交互本体（setValue 即用户输入路径）；
 *   ready = 单向镜像（doc → textarea.value 持续同步；aria-hidden + tabindex=-1，
 *   其 input 不再回灌——CM 模式用户输入走视图，镜像仅供断言与 Editor.vue 的
 *   collectDomValues DOM 基线快照）。aria-label = t('v2.cde.editorLabel')（两形态都要有
 *   可访问名）。
 * - 即时解析（无防抖）：初始值与每次变更即 JSON.parse：
 *   合法 → cde-error / cde-error-line 不渲染、格式化钮可点；
 *   非法 → cde-error（文案 = t('v2.cde.errorAt', { line })，含行号）+ cde-error-line
 *   （行号徽标，text 含行号数字）+ CM 形态错误行标线（错误行 .cm-line 挂 cde-line-error 类，
 *   Decoration.line 级自绘，DOM 契约钉死类名；用 @codemirror/lint 与否不限，DOM 形态为准）；
 *   空串 / 纯空白 = 中性态（无错、格式化禁用）。
 *   行号提取契约：error.message 优先匹配 /line (\d+) column (\d+)/（Node 26/V8 实证携带），
 *   退化匹配 /position (\d+)/ 按前缀数换行，再退化按第 1 行。
 * - 格式化钮 cde-format：可见文案 t('v2.cde.format')（非纯图标钮）；enabled ⇔ 非空且解析
 *   合法；点击 → JSON.stringify(JSON.parse(v), null, 2) 回写 update:modelValue（两形态都可用）；
 *   解析非法（或 disabled）时 title = t('v2.cde.formatInvalidHint')。
 * - disabled prop：fallback textarea 原生 disabled、格式化禁用；CM 形态只读（readonly 域）。
 * - maxlength prop：仅 fallback textarea maxlength 透传（Editor.vue 传 10000）；CM 形态不做
 *   硬截断——长度约束仍由【提交时服务端 validateConfig 权威】把守，前端只做即时解析反馈，
 *   校验语义零改动（Editor.vue 侧 fs 断言在 Editor.code-editor.test.ts）。
 * - 懒加载边界（源码级）：本组件内部动态 import 的 specifier 钉死为 'codemirror' 与
 *   '@codemirror/lang-json' 两个（vi.doMock 按 specifier 拦截测降级）；组件自身静态 import
 *   CodeMirror 合法——它整体只进动态 chunk，主 bundle 不含（全仓 confinement walk 断言在
 *   Editor.code-editor.test.ts；vite.config 无 manualChunks，动态 import 自然分块即可）。
 * - 主题 token-only（颜色零字面）：style 块与 EditorView.theme 注入一律 var(--app-*)；
 *   CM6 theme 值即 CSS 属性值，直接引 var 可行；暗色随 data-theme 翻转零额外代码
 *   （fs 断言无 hex / rgb / rgba / hsl 字面）。
 * - SDK 铁律：无 <el- 直用；文案一律 t()（template 块零 CJK）。
 *
 * ── i18n 新 key 全表（4 个，v2.cde.* 命名空间，zh-CN/en-US 同步加，铁律 6）──
 * v2.cde.format              格式化 / Format JSON
 * v2.cde.formatInvalidHint   修复 JSON 后才能格式化 / Fix the JSON to enable formatting
 * v2.cde.errorAt             第 {line} 行 JSON 解析失败 / Invalid JSON at line {line}
 * v2.cde.editorLabel         配置 JSON / Config JSON
 * （字段名 label 复用既有 v2.plugins.fieldConfig，不新增。）
 *
 * ── testid 全表（新前缀 cde-）──
 * cde-root（根；状态类 is-loading / is-ready / is-fallback）
 * cde-content（编辑区或降级 textarea——两形态都可取值断言）
 * cde-format（格式化钮）
 * cde-error（解析错误文案条；合法/中性态不渲染）
 * cde-error-line（错误行行号徽标；合法/中性态不渲染）
 *
 * ── CM × jsdom 环境 shim（beforeAll）──
 * jsdom 未实现 Element.scrollIntoView / Range 测量 API，CM6 挂视图必需——社区通用 shim，
 * 仅测试环境补齐；C 步实现无需关心。若 C 步真实挂载仍受阻，优先补 shim 而不是放宽契约。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

// —— RED 关键：变量路径动态导入（组件缺失 → 运行时模块解析失败 = 合法 RED）——
// 字面量会被 vite import-analysis 在 transform 阶段拦截（探针实证），必须先落变量。
const CDE_PATH = '@/components-v2/editor/FcCodeEditor.vue'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FcCodeEditor: any = (await import(CDE_PATH)).default

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const i18nEn = createI18n({ legacy: false, locale: 'en-US', fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const areaOf = (w: VueWrapper<any>, tid: string) => w.find(`textarea[data-testid="${tid}"]`)
const areaVal = (w: VueWrapper<any>, tid: string) => (areaOf(w, tid).element as HTMLTextAreaElement).value

// —— CM × jsdom shim（契约见文件尾注；幂等，只补缺失项）——
beforeAll(() => {
  const el = Element.prototype as unknown as Record<string, unknown>
  if (typeof el.scrollIntoView !== 'function') el.scrollIntoView = function scrollIntoView() {}
  const range = Range.prototype as unknown as Record<string, unknown>
  if (typeof range.getBoundingClientRect !== 'function') {
    range.getBoundingClientRect = function getBoundingClientRect() {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return {} } }
    }
  }
  if (typeof range.getClientRects !== 'function') {
    range.getClientRects = function getClientRects() {
      const list: DOMRect[] = []
      return { length: list.length, item: (_index: number) => null, [Symbol.iterator]: list[Symbol.iterator] }
    }
  }
})

async function cdeFactory(props: Record<string, unknown> = {}, globalI18n = i18n): Promise<VueWrapper<any>> {
  const wrapper = mount(FcCodeEditor, { props, global: { plugins: [ElementPlus, globalI18n] } }) as VueWrapper<any>
  await flushPromises()
  return wrapper
}
/** CM 就绪窗口（动态 import 异步；jsdom shim 后真实挂载） */
const readyIn = (w: VueWrapper<any>) => vi.waitFor(() => expect(one(w, 'cde-root').classes()).toContain('is-ready'))
/** 降级窗口（动态 import reject / CM 初始化异常） */
const fallbackIn = (w: VueWrapper<any>) => vi.waitFor(() => expect(one(w, 'cde-root').classes()).toContain('is-fallback'))
/** CM 形态下模拟用户输入（契约出口 = defineExpose({ view })，jsdom 无法对 contenteditable 直打字） */
function typeIntoView(w: VueWrapper<any>, text: string) {
  const view = (w.vm as any).view as { state: { doc: { length: number } }; dispatch: (spec: unknown) => void }
  expect(view, 'ready 形态必须暴露 EditorView（defineExpose({ view })）').toBeTruthy()
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}
const lastEmit = (w: VueWrapper<any>): unknown[] | undefined => {
  const emitted = w.emitted('update:modelValue')
  return emitted ? emitted[emitted.length - 1] : undefined
}

function readCdeSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../FcCodeEditor.vue'), 'utf-8')
}

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = ['format', 'formatInvalidHint', 'errorAt', 'editorLabel'].map((k) => `v2.cde.${k}`)

describe('OPT-5 — i18n key 全表双语存在（铁律 6，v2.cde.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 形态与 v-model ────────────────────────────────────────────────────────
describe('OPT-5 — 两种形态与 v-model', () => {
  it('ready 形态：cde-root 带 is-ready、cde-content 镜像 textarea 初值=modelValue、暴露 view、格式化钮可点', async () => {
    const w = await cdeFactory({ modelValue: '{"a":1}' })
    await readyIn(w)
    const root = need(w, 'cde-root', '编辑器根')
    expect(root.classes()).not.toContain('is-fallback')
    expect(areaVal(w, 'cde-content')).toBe('{"a":1}')
    expect((w.vm as any).view).toBeTruthy()
    expect(need(w, 'cde-format', '格式化钮').attributes('disabled')).toBeUndefined()
    expect(one(w, 'cde-error').exists()).toBe(false)
  })

  it('ready 形态 v-model 出向：view.dispatch 输入 → update:modelValue + 镜像同步', async () => {
    const w = await cdeFactory({ modelValue: '' })
    await readyIn(w)
    typeIntoView(w, '{"k":1}')
    await nextTick()
    expect(lastEmit(w)).toEqual(['{"k":1}'])
    expect(areaVal(w, 'cde-content')).toBe('{"k":1}')
  })

  it('ready 形态 v-model 入向：父层 setProps(modelValue) → 镜像同步', async () => {
    const w = await cdeFactory({ modelValue: '{"a":1}' })
    await readyIn(w)
    await w.setProps({ modelValue: '{"x":2}' })
    await nextTick()
    expect(areaVal(w, 'cde-content')).toBe('{"x":2}')
  })

  it.each(['codemirror', '@codemirror/lang-json'])(
    '降级形态（%s 动态 import reject）→ is-fallback + view=null + textarea 交互可用（失败不缓存，不影响后续挂载）',
    async (specifier) => {
      vi.doMock(specifier, () => {
        throw new Error('chunk fetch failed')
      })
      try {
        const w = await cdeFactory({ modelValue: '{"a":1}' })
        await fallbackIn(w)
        expect(one(w, 'cde-root').classes()).not.toContain('is-ready')
        expect((w.vm as any).view).toBeNull()
        expect(areaVal(w, 'cde-content')).toBe('{"a":1}')
        await areaOf(w, 'cde-content').setValue('{"b":2}')
        expect(lastEmit(w)).toEqual(['{"b":2}'])
      } finally {
        vi.doUnmock(specifier)
      }
    }
  )
})

// ── 即时解析 ──────────────────────────────────────────────────────────────
describe('OPT-5 — 即时 JSON 解析（合法无错 / 非法标线行号 / 空白中性）', () => {
  it('初始值非法 → 不等交互即外显：cde-error 文案含行号插值 + cde-error-line 行号徽标', async () => {
    const w = await cdeFactory({ modelValue: 'not-json' })
    await readyIn(w)
    const err = need(w, 'cde-error', '解析错误文案条')
    expect(err.text()).toContain(String(t('v2.cde.errorAt')).replace('{line}', '1'))
    expect(need(w, 'cde-error-line', '错误行徽标').text()).toContain('1')
    expect(need(w, 'cde-format', '格式化钮').attributes('disabled')).toBeDefined()
  })

  it("非法输入落在第 2 行（'\"ok\":1}\\nXX'）→ 行号=2（V8 实证 message 携带 line/column 与 position，两提取策略收敛）", async () => {
    const w = await cdeFactory({ modelValue: '' })
    await readyIn(w)
    typeIntoView(w, '{"ok":1}\nXX')
    await nextTick()
    expect(need(w, 'cde-error', '解析错误文案条').text()).toContain(String(t('v2.cde.errorAt')).replace('{line}', '2'))
    expect(need(w, 'cde-error-line', '错误行徽标').text()).toContain('2')
  })

  it('CM 形态错误行标线：错误行 .cm-line 挂 cde-line-error 类；改正后退场', async () => {
    const w = await cdeFactory({ modelValue: '' })
    await readyIn(w)
    typeIntoView(w, '{"ok":1}\nXX')
    await nextTick()
    const lines = w.findAll('.cm-line')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[1].classes(), '第 2 行需挂 cde-line-error 标线类').toContain('cde-line-error')
    typeIntoView(w, '{"ok":1}')
    await nextTick()
    expect(one(w, 'cde-error').exists()).toBe(false)
    expect(w.findAll('.cm-line')[0].classes()).not.toContain('cde-line-error')
  })

  it('合法输入 → cde-error / cde-error-line 均不渲染、格式化可点；非法→合法过渡后错误退场', async () => {
    const w = await cdeFactory({ modelValue: '' })
    await readyIn(w)
    typeIntoView(w, '{"a":1}')
    await nextTick()
    expect(one(w, 'cde-error').exists()).toBe(false)
    expect(one(w, 'cde-error-line').exists()).toBe(false)
    expect(need(w, 'cde-format', '格式化钮').attributes('disabled')).toBeUndefined()
    typeIntoView(w, 'not-json')
    await nextTick()
    expect(one(w, 'cde-error').exists()).toBe(true)
    typeIntoView(w, '{"ok":2}')
    await nextTick()
    expect(one(w, 'cde-error').exists()).toBe(false)
  })

  it('中性态：空串 → 无错 + 格式化禁用；纯空白（空格/换行/制表）同', async () => {
    const empty = await cdeFactory({ modelValue: '' })
    await readyIn(empty)
    expect(one(empty, 'cde-error').exists()).toBe(false)
    expect(one(empty, 'cde-error-line').exists()).toBe(false)
    expect(need(empty, 'cde-format', '格式化钮').attributes('disabled')).toBeDefined()
    const blank = await cdeFactory({ modelValue: '   \n\t ' })
    await readyIn(blank)
    expect(one(blank, 'cde-error').exists()).toBe(false)
    expect(need(blank, 'cde-format', '格式化钮').attributes('disabled')).toBeDefined()
  })

  it('双语运行时：en-US 下 cde-error 文案走 en 模板（铁律 6 语义同步）', async () => {
    const w = await cdeFactory({ modelValue: '{"ok":1}\nXX' }, i18nEn)
    await readyIn(w)
    const expected = String(dig(enUS, 'v2.cde.errorAt')).replace('{line}', '2')
    expect(need(w, 'cde-error', '解析错误文案条').text()).toContain(expected)
  })

  it('a11y：cde-content 两种形态都有可访问名（aria-label = editorLabel）', async () => {
    const ready = await cdeFactory({ modelValue: '{}' })
    await readyIn(ready)
    expect(areaOf(ready, 'cde-content').attributes('aria-label')).toBe(t('v2.cde.editorLabel'))
    vi.doMock('codemirror', () => {
      throw new Error('down')
    })
    try {
      const fb = await cdeFactory({ modelValue: '{}' })
      await fallbackIn(fb)
      expect(areaOf(fb, 'cde-content').attributes('aria-label')).toBe(t('v2.cde.editorLabel'))
    } finally {
      vi.doUnmock('codemirror')
    }
  })
})

// ── 格式化 ────────────────────────────────────────────────────────────────
describe('OPT-5 — 格式化钮（合法才可点 → pretty print 2 空格 → 回写 modelValue）', () => {
  it('ready 形态：合法 → 点击产出 2 空格 pretty 并回写（emit + 镜像同步）', async () => {
    const w = await cdeFactory({ modelValue: '{"a":1,"b":2}' })
    await readyIn(w)
    await need(w, 'cde-format', '格式化钮').trigger('click')
    const pretty = JSON.stringify(JSON.parse('{"a":1,"b":2}'), null, 2)
    expect(lastEmit(w)).toEqual([pretty])
    expect(areaVal(w, 'cde-content')).toBe(pretty)
    expect(one(w, 'cde-error').exists()).toBe(false)
  })

  it('非法 → 钮禁用（disabled + title=formatInvalidHint）→ 点击零 emit', async () => {
    const w = await cdeFactory({ modelValue: 'not-json' })
    await readyIn(w)
    const btn = need(w, 'cde-format', '格式化钮')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(String(btn.attributes('title') ?? '')).toContain(t('v2.cde.formatInvalidHint'))
    await btn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('降级形态同样可格式化（格式化是组件自持能力，不依赖 CodeMirror）', async () => {
    vi.doMock('@codemirror/lang-json', () => {
      throw new Error('chunk fetch failed')
    })
    try {
      const w = await cdeFactory({ modelValue: '{"a":1,"b":2}' })
      await fallbackIn(w)
      await need(w, 'cde-format', '格式化钮').trigger('click')
      const pretty = JSON.stringify(JSON.parse('{"a":1,"b":2}'), null, 2)
      expect(lastEmit(w)).toEqual([pretty])
      expect(areaVal(w, 'cde-content')).toBe(pretty)
    } finally {
      vi.doUnmock('@codemirror/lang-json')
    }
  })
})

// ── disabled / maxlength ──────────────────────────────────────────────────
describe('OPT-5 — disabled 与 maxlength（fallback 形态 DOM 断言）', () => {
  it('disabled=true → textarea 原生 disabled + 格式化禁用', async () => {
    vi.doMock('codemirror', () => {
      throw new Error('down')
    })
    try {
      const w = await cdeFactory({ modelValue: '{"a":1}', disabled: true })
      await fallbackIn(w)
      expect(areaOf(w, 'cde-content').attributes('disabled')).toBeDefined()
      expect(need(w, 'cde-format', '格式化钮').attributes('disabled')).toBeDefined()
    } finally {
      vi.doUnmock('codemirror')
    }
  })

  it('maxlength 透传 fallback textarea（Editor.vue 传 10000）；rows 缺省 6', async () => {
    vi.doMock('codemirror', () => {
      throw new Error('down')
    })
    try {
      const w = await cdeFactory({ modelValue: '{}', maxlength: 10000 })
      await fallbackIn(w)
      expect(areaOf(w, 'cde-content').attributes('maxlength')).toBe('10000')
      expect(areaOf(w, 'cde-content').attributes('rows')).toBe('6')
    } finally {
      vi.doUnmock('codemirror')
    }
  })
})

// ── fs 源码契约 ───────────────────────────────────────────────────────────
describe('OPT-5 — fs 源码契约（token-only 主题 / SDK 铁律 / 懒加载 specifier）', () => {
  it('token-only：style 块零字面色（hex/rgb/rgba/hsl），颜色一律 var(--app-*)——暗色随 data-theme 零代码翻转', () => {
    const src = readCdeSource()
    const style = src.match(/<style[^>]*>[\s\S]*<\/style>/)?.[0] ?? ''
    expect(style, 'FcCodeEditor.vue 缺少 style 块').not.toBe('')
    expect(style, 'style 块不得出现字面 hex 色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(style, 'style 块不得出现字面 rgb/rgba').not.toMatch(/rgba?\(\s*\d/)
    expect(style, 'style 块不得出现字面 hsl').not.toMatch(/hsl\(\s*\d/)
    expect(style).toMatch(/var\(--app-/)
  })

  it('CM 主题经 EditorView.theme 注入且走 token（值即 CSS 属性值，var 可行）', () => {
    const src = readCdeSource()
    expect(src).toMatch(/EditorView\.theme/)
    expect(src).toMatch(/var\(--app-/)
  })

  it('SDK 铁律：无 <el- 直用；template 块零 CJK（文案一律 t()）', () => {
    const src = readCdeSource()
    expect(src).not.toMatch(/<el-/)
    const template = src.match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
    expect(template).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it('懒加载 specifier 钉死：组件内动态 import 仅 codemirror / @codemirror/lang-json', () => {
    const src = readCdeSource()
    expect(src).toMatch(/import\(\s*['"]codemirror['"]\s*\)/)
    expect(src).toMatch(/import\(\s*['"]@codemirror\/lang-json['"]\s*\)/)
    // 组件静态 import CodeMirror 合法（它整体在动态 chunk 里），但 specifier 必须出自上面两家
    const statics = src.match(/from\s+['"](?:codemirror|@codemirror\/[^'"]+)['"]/g) ?? []
    const allowed = /^['"](?:codemirror|@codemirror\/(?:lang-json|state|view|commands|language|search|autocomplete|lint))['"]$/
    const offenders = statics.filter((s) => !allowed.test(s.replace(/^from\s+/, '')))
    expect(offenders, `静态 import 越界：${offenders.join(', ')}`).toEqual([])
  })
})
