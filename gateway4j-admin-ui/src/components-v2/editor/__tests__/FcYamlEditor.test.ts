/**
 * S12-4-T：FcYamlEditor（YAML 编辑器，CodeMirror 6 + js-yaml）组件契约测试。
 * 契约来源：docs/ui-v2/实施契约.md §10 S12 批（用户裁决④「同时做 YAML 视图」）。
 *
 * 组件落点：src/components-v2/editor/FcYamlEditor.vue（与 FcCodeEditor 同目录 —— 该目录
 * 不在 tsconfig exclude 内，vue-tsc 会类型检查）。
 *
 * ══ 组件契约（T 固化，C 不得偏离）══
 * - API：props { modelValue: string; disabled?: boolean; maxlength?: number; rows?: number }
 *   emits ['update:modelValue']（v-model 双向）；defineExpose({ view }) —— view 为
 *   CodeMirror EditorView | null（ready 形态必有实例、fallback 形态恒 null）。
 * - 骨架照抄 FcCodeEditor.vue（懒加载 / fallback / 三形态 / token 主题 / maxlength /
 *   defineExpose），差别只在解析层：JSON → YAML。
 * - 三形态（yde-root 状态类 is-loading / is-ready / is-fallback）：挂载即动态 import；
 *   import('codemirror') / import('@codemirror/lang-yaml') 任一 reject 或 EditorView
 *   构造抛错 → 原生 textarea 顶上。成功/失败都不缓存。
 * - yde-content 恒为真实 textarea：fallback = 交互本体；ready = 单向镜像
 *   （aria-hidden + tabindex=-1，input 不回灌防环路）。
 * - 即时 YAML 解析（无防抖）：合法 → 无错 + 格式化可点；空串/纯空白 = 中性态；
 *   非法 → yde-error（t('v2.yde.errorAt', { line })）+ yde-error-line 行号徽标 +
 *   CM 错误行标线（Decoration.line 自绘 yde-line-error 类）。
 *   行号提取：YAMLException.mark.line（0 基）+1 优先；退化匹配 message 里的
 *   /(\d+):(\d+)/（js-yaml 消息形如 "bad indentation of a mapping entry (2:4)"，1 基）；
 *   再退化第 1 行。
 * - 格式化钮 yde-format：enabled ⇔ 非空且解析合法；点击 → js-yaml dump（2 空格缩进）
 *   回写 update:modelValue；blocked 时 title = t('v2.yde.formatInvalidHint') 且零 emit。
 * - maxlength 仅 fallback textarea 透传；disabled：fallback textarea 原生 disabled、
 *   CM readonly 域。
 * - 懒加载边界：组件内动态 import specifier 钉死 'codemirror' 与 '@codemirror/lang-yaml'。
 * - 主题 token-only：style 块零字面色；SDK 铁律：无 <el- 直用、template 零 CJK。
 *
 * ── i18n 新 key 全表（4 个，v2.yde.* 命名空间，zh-CN/en-US 同步加，铁律 6）──
 * v2.yde.format              格式化 / Format YAML
 * v2.yde.formatInvalidHint   修复 YAML 后才能格式化 / Fix the YAML to enable formatting
 * v2.yde.errorAt             第 {line} 行 YAML 解析失败 / Invalid YAML at line {line}
 * v2.yde.editorLabel         Ingress YAML / Ingress YAML
 *
 * ── testid 全表（新前缀 yde-）──
 * yde-root（根；状态类 is-loading / is-ready / is-fallback）
 * yde-content（编辑区或降级 textarea）
 * yde-format（格式化钮）
 * yde-error（解析错误文案条）
 * yde-error-line（错误行行号徽标）
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

// —— 变量路径动态导入（组件缺失 → 运行时模块解析失败 = 合法 RED，模块收集不炸）——
const YDE_PATH = '@/components-v2/editor/FcYamlEditor.vue'
async function loadEditor(): Promise<any> {
  try {
    const mod = await import(YDE_PATH)
    return mod.default
  } catch {
    return null
  }
}

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
const areaOf = (w: VueWrapper<any>, tid: string) => w.find(`textarea[data-testid="${tid}"]`)
const areaVal = (w: VueWrapper<any>, tid: string) => (areaOf(w, tid).element as HTMLTextAreaElement).value

// —— CM × jsdom shim（沿 FcCodeEditor.test.ts 先例；幂等，只补缺失项）——
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

async function ydeFactory(props: Record<string, unknown> = {}): Promise<VueWrapper<any>> {
  const FcYamlEditor = await loadEditor()
  expect(FcYamlEditor, 'FcYamlEditor 组件缺失（RED 预期）').toBeTruthy()
  const wrapper = mount(FcYamlEditor, { props, global: { plugins: [ElementPlus, i18n] } }) as VueWrapper<any>
  await flushPromises()
  return wrapper
}
const readyIn = (w: VueWrapper<any>) => vi.waitFor(() => expect(one(w, 'yde-root').classes()).toContain('is-ready'))
const fallbackIn = (w: VueWrapper<any>) => vi.waitFor(() => expect(one(w, 'yde-root').classes()).toContain('is-fallback'))
function typeIntoView(w: VueWrapper<any>, text: string) {
  const view = (w.vm as any).view as { state: { doc: { length: number } }; dispatch: (spec: unknown) => void }
  expect(view, 'ready 形态必须暴露 EditorView（defineExpose({ view })）').toBeTruthy()
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}
const lastEmit = (w: VueWrapper<any>): unknown[] | undefined => {
  const emitted = w.emitted('update:modelValue')
  return emitted ? emitted[emitted.length - 1] : undefined
}
function readYdeSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../FcYamlEditor.vue'), 'utf-8')
}

const VALID_YAML = 'metadata:\n  name: api_gateway\nspec:\n  rules: []\n'
/** 非法 YAML：第 3 行缩进错误（js-yaml 报 "(3:7)"，mark.line = 2 → 1 基行号 3） */
const INVALID_YAML = 'metadata:\n  name: api\n   env: default\n'

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = ['format', 'formatInvalidHint', 'errorAt', 'editorLabel'].map((k) => `v2.yde.${k}`)

describe('S12-4 — i18n key 全表双语存在（铁律 6，v2.yde.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 形态与 v-model ────────────────────────────────────────────────────────
describe('S12-4 — 三形态与 v-model', () => {
  it('ready 形态：yde-root 带 is-ready、yde-content 镜像初值、暴露 view、格式化钮可点', async () => {
    const w = await ydeFactory({ modelValue: VALID_YAML })
    await readyIn(w)
    expect(one(w, 'yde-root').classes()).toContain('is-ready')
    expect(areaVal(w, 'yde-content')).toBe(VALID_YAML)
    expect((w.vm as any).view).toBeTruthy()
    expect(one(w, 'yde-format').attributes('disabled')).toBeUndefined()
  })

  it('合法 YAML → 无 yde-error / yde-error-line（中性态之外的合法态）', async () => {
    const w = await ydeFactory({ modelValue: VALID_YAML })
    await readyIn(w)
    expect(one(w, 'yde-error').exists()).toBe(false)
    expect(one(w, 'yde-error-line').exists()).toBe(false)
  })

  it('非法 YAML → yde-error + yde-error-line 行号徽标（1 基行号 3）', async () => {
    const w = await ydeFactory({ modelValue: INVALID_YAML })
    await readyIn(w)
    const err = one(w, 'yde-error')
    expect(err.exists(), '非法 YAML 必须渲染 yde-error').toBe(true)
    expect(err.text()).toContain('3')
    expect(one(w, 'yde-error-line').text()).toContain('3')
    expect(one(w, 'yde-format').attributes('disabled')).toBeDefined()
  })

  it('空串 / 纯空白 = 中性态：无错、格式化禁用', async () => {
    const w = await ydeFactory({ modelValue: '   \n  ' })
    await readyIn(w)
    expect(one(w, 'yde-error').exists()).toBe(false)
    expect(one(w, 'yde-format').attributes('disabled')).toBeDefined()
  })

  it.each(['codemirror', '@codemirror/lang-yaml'])(
    '降级形态（%s 动态 import reject）→ is-fallback + view=null + textarea 交互可用',
    async (specifier) => {
      vi.doMock(specifier, () => {
        throw new Error('chunk fetch failed')
      })
      try {
        const w = await ydeFactory({ modelValue: VALID_YAML })
        await fallbackIn(w)
        expect(one(w, 'yde-root').classes()).not.toContain('is-ready')
        expect(one(w, 'yde-root').classes()).toContain('is-fallback')
        expect((w.vm as any).view).toBeNull()
        await areaOf(w, 'yde-content').setValue('a: 1\n')
        expect(lastEmit(w)).toEqual(['a: 1\n'])
      } finally {
        vi.doUnmock(specifier)
      }
    }
  )

  it('maxlength 仅 fallback textarea 透传', async () => {
    vi.doMock('codemirror', () => {
      throw new Error('chunk fetch failed')
    })
    try {
      const w = await ydeFactory({ modelValue: '', maxlength: 100 })
      await fallbackIn(w)
      expect(areaOf(w, 'yde-content').attributes('maxlength')).toBe('100')
    } finally {
      vi.doUnmock('codemirror')
    }
  })

  it('格式化钮：合法 YAML → dump 2 空格回写 update:modelValue；非法 → 零 emit', async () => {
    const w = await ydeFactory({ modelValue: 'metadata:\n    name: api\n' })
    await readyIn(w)
    await one(w, 'yde-format').trigger('click')
    const emitted = lastEmit(w) as string[]
    expect(emitted[0]).toContain('metadata:')
    expect(emitted[0]).toContain('  name: api')

    const bad = await ydeFactory({ modelValue: INVALID_YAML })
    await readyIn(bad)
    const before = bad.emitted('update:modelValue')?.length ?? 0
    await one(bad, 'yde-format').trigger('click')
    expect(bad.emitted('update:modelValue')?.length ?? 0).toBe(before)
    expect(one(bad, 'yde-format').attributes('title')).toBeTruthy()
  })

  it('入向 v-model 回写：父层改 modelValue → 镜像 textarea 同步', async () => {
    const w = await ydeFactory({ modelValue: VALID_YAML })
    await readyIn(w)
    await w.setProps({ modelValue: 'metadata:\n  name: other\n' })
    await nextTick()
    expect(areaVal(w, 'yde-content')).toBe('metadata:\n  name: other\n')
  })

  it('ready 形态下视图输入 → emit update:modelValue 且镜像 textarea 同步', async () => {
    const w = await ydeFactory({ modelValue: '' })
    await readyIn(w)
    typeIntoView(w, 'metadata:\n  name: typed\n')
    await nextTick()
    expect(lastEmit(w)).toEqual(['metadata:\n  name: typed\n'])
    expect(areaVal(w, 'yde-content')).toBe('metadata:\n  name: typed\n')
  })
})

// ── 源码契约 ──────────────────────────────────────────────────────────────
describe('S12-4 — 源码契约（懒加载边界 / token 主题 / 零 CJK）', () => {
  it("动态 import specifier 钉死 'codemirror' 与 '@codemirror/lang-yaml'", () => {
    const src = readYdeSource()
    expect(src).toContain("import('codemirror')")
    expect(src).toContain("import('@codemirror/lang-yaml')")
  })

  it('主题 token-only：style 块无 hex / rgb / rgba / hsl 字面', () => {
    const src = readYdeSource()
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/\brgba?\(/)
    expect(src).not.toMatch(/\bhsla?\(/)
  })

  it('template 块无 CJK（文案一律 t()）', () => {
    const src = readYdeSource()
    const tpl = src.slice(src.indexOf('<template>'), src.indexOf('</template>'))
    expect(tpl).not.toMatch(/[一-龥]/)
  })

  it('SDK 铁律：无 <el- 直用', () => {
    const src = readYdeSource()
    expect(src).not.toMatch(/<el-[a-z]/i)
  })
})
