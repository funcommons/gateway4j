<script setup lang="ts">
defineOptions({ name: 'FcCodeEditor', inheritAttrs: false })
/**
 * OPT-5-C：插件 config 编辑器 FcCodeEditor（CodeMirror 6 封装，v2 优化建议 #4，
 * 对标 APISIX 表单/JSON 双模）。组件契约以
 * src/components-v2/editor/__tests__/FcCodeEditor.test.ts 头注为准（25 用例）：
 * - props { modelValue, disabled?, maxlength?, rows?=6 } + emit update:modelValue；
 *   defineExpose({ view })（EditorView | null：ready 必有实例、fallback 恒 null）。
 * - 三形态（cde-root 状态类 is-loading / is-ready / is-fallback）：挂载即动态 import；
 *   import('codemirror') / import('@codemirror/lang-json') 任一 reject 或 EditorView
 *   构造抛错 → 原生 textarea 顶上。成功/失败都不缓存，每次挂载重新 import
 *   （esm 模块缓存兜底成功路径成本，降级与恢复可逆，测试可先 ready 后 doMock-reject）。
 * - cde-content 恒为真实 textarea：fallback = 交互本体（setValue 即用户输入路径）；
 *   ready = 单向镜像（doc → value 持续同步，aria-hidden + tabindex=-1，input 不回灌
 *   防环路）。value 走 imperative 写（模板不绑 :value），仅供断言与 Editor.vue
 *   collectDomValues DOM 基线快照。
 * - 即时 JSON 解析（无防抖，computed）：合法 → 无错 + 格式化可点；空串/纯空白 = 中性态；
 *   非法 → cde-error（t('v2.cde.errorAt', { line })）+ cde-error-line 行号徽标 + CM 错误行
 *   标线（Decoration.line 自绘 cde-line-error 类，不用 @codemirror/lint）。
 *   行号提取：error.message 优先 /line (\d+) column (\d+)/，退化 /position (\d+)/
 *   按前缀数换行，再退化第 1 行。
 * - 格式化钮 cde-format：enabled ⇔ 非空且解析合法；点击 2 空格 pretty 回写
 *   update:modelValue（组件自持能力，不依赖 CodeMirror——两形态都可用）；
 *   blocked（解析非法 / disabled）时 title = t('v2.cde.formatInvalidHint') 且点击零 emit。
 * - maxlength 仅 fallback textarea 透传（CM 不硬截断——长度约束仍由提交时服务端
 *   validateConfig 权威把守）；disabled：fallback textarea 原生 disabled、CM readonly 域
 *   （Compartment 装载，disabled 运行期翻转随时重配，三处 disabled 面零脱节）。
 * - 懒加载边界：组件内动态 import specifier 钉死 'codemirror' 与 '@codemirror/lang-json'；
 *   组件自身整体进动态 chunk（Editor.vue defineAsyncComponent 接线），主 bundle 不含。
 * - 主题 token-only：EditorView.theme 值直接引 var(--app-*)（CM6 theme 值即 CSS 属性值，
 *   暗色随 data-theme 翻转零额外代码）；style 块零字面色。SDK 铁律：无 el-* 直用、
 *   template 零 CJK（文案一律 t()）。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { Compartment, EditorState, StateField, type Text } from '@codemirror/state'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    maxlength?: number
    rows?: number
  }>(),
  { rows: 6 }
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useI18n()

const hostEl = ref<HTMLElement | null>(null)
const taEl = ref<HTMLTextAreaElement | null>(null)
const mode = ref<'loading' | 'ready' | 'fallback'>('loading')
const view = shallowRef<EditorView | null>(null)
defineExpose({ view })
/** readOnly 域走 Compartment：disabled prop 运行期翻转可重配（OPT-5 验票修复，实例级） */
const readOnlyCompartment = new Compartment()
/** 逻辑文本（ready=doc 全文、fallback/loading=textarea 值；解析与镜像都从它出发） */
const text = ref(props.modelValue)

// ── 即时 JSON 解析 + 行号提取（契约：line/column 优先 → position 兜底按前缀数换行 → 第 1 行）──
function parseErrorLine(source: string): number | null {
  if (!source.trim()) return null // 空串 / 纯空白 = 中性态（无错、格式化禁用）
  try {
    JSON.parse(source)
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const lc = msg.match(/line (\d+) column (\d+)/)
    if (lc) return Math.max(1, Number(lc[1]))
    const pos = msg.match(/position (\d+)/)
    if (pos) {
      const at = Math.min(Number(pos[1]), source.length)
      let line = 1
      for (let i = 0; i < at; i++) if (source[i] === '\n') line++
      return line
    }
    return 1
  }
}

const errorLine = computed<number | null>(() => parseErrorLine(text.value))
const canFormat = computed(() => text.value.trim() !== '' && errorLine.value === null)
const formatBlocked = computed(() => props.disabled || !canFormat.value)

// ── CM 错误行标线（Decoration.line 自绘，免 @codemirror/lint）：StateField 随事务
//    自解析（与 Vue 层 computed 共用 parseErrorLine），改正后随下一次 docChanged 自动退场 ──
function decoFor(doc: Text): DecorationSet {
  const bad = parseErrorLine(doc.toString())
  if (bad === null || bad > doc.lines) return Decoration.none
  return Decoration.set([Decoration.line({ class: 'cde-line-error' }).range(doc.line(bad).from)], true)
}

const errorLineDeco = StateField.define<DecorationSet>({
  create: (state) => decoFor(state.doc),
  update: (value, tr) => (tr.docChanged ? decoFor(tr.state.doc) : value),
  provide: (field) => EditorView.decorations.from(field)
})

// ── 主题：token 直接作 theme 值（暗色随 data-theme 翻转零代码）──
const cmTheme = EditorView.theme({
  '&': {
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-bg-card)',
    border: '1px solid var(--app-border-light)',
    borderRadius: 'var(--app-radius-md)',
    fontSize: '13px'
  },
  '&.cm-focused': {
    outline: '2px solid var(--app-focus-ring)',
    outlineOffset: '2px'
  },
  '.cm-content': {
    caretColor: 'var(--app-text)',
    padding: '8px 0'
  },
  '.cm-scroller': {
    fontFamily: 'var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
    lineHeight: '1.5'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--app-bg-muted)',
    color: 'var(--app-text-tertiary)',
    border: 'none',
    borderRight: '1px solid var(--app-border-light)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--app-primary) 6%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--app-primary) 10%, transparent)'
  },
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--app-primary) 18%, transparent) !important'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--app-text)'
  }
})

function syncMirror(value: string) {
  const el = taEl.value
  if (el && el.value !== value) el.value = value
}

let silent = false // 程序性 applyDoc（入向回写/格式化）期间不回 emit（防 v-model 环路与双发）

function onViewUpdate(u: ViewUpdate) {
  if (!u.docChanged) return
  const next = u.state.doc.toString()
  text.value = next
  syncMirror(next)
  if (!silent && next !== props.modelValue) emit('update:modelValue', next)
}

function applyDoc(next: string) {
  const v = view.value
  if (!v) return
  silent = true
  try {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } })
  } finally {
    silent = false
  }
  syncMirror(next)
}

// ── 入向（父层 v-model 回写）：值相等即短路（防环路 + 光标跳动）──
watch(
  () => props.modelValue,
  (next) => {
    if (next === text.value) return
    text.value = next
    if (mode.value === 'ready') applyDoc(next)
    else syncMirror(next)
  }
)

// disabled 运行期翻转 → CM readonly 域重配（fallback textarea / 格式化钮本就响应式，
// 无此 watch 则 ready 形态三处 disabled 面脱节：CM 仍可编辑、镜像与钮已禁用）
watch(
  () => props.disabled,
  (d) => {
    view.value?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(d)) })
  }
)

function onTextareaInput(e: Event) {
  if (mode.value === 'ready') return // 镜像形态 input 不回灌（防环路）
  const next = (e.target as HTMLTextAreaElement).value
  text.value = next
  emit('update:modelValue', next)
}

function onFormat() {
  if (formatBlocked.value) return // disabled / 解析非法 → 零 emit
  const pretty = JSON.stringify(JSON.parse(text.value), null, 2)
  text.value = pretty
  emit('update:modelValue', pretty)
  if (mode.value === 'ready') applyDoc(pretty)
  else syncMirror(pretty)
}

async function initEditor() {
  try {
    const [{ EditorView: EV, basicSetup }, { json }] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-json')
    ])
    const parent = hostEl.value
    if (!parent) return // import 窗口内组件已被卸载
    const v = new EV({
      state: EditorState.create({
        doc: props.modelValue,
        extensions: [
          basicSetup,
          json(),
          cmTheme,
          errorLineDeco,
          readOnlyCompartment.of(EditorState.readOnly.of(props.disabled)),
          EV.updateListener.of(onViewUpdate)
        ]
      }),
      parent
    })
    view.value = v
    mode.value = 'ready'
    syncMirror(v.state.doc.toString())
  } catch {
    // 任一 import reject / 构造抛错 → 原生 textarea 顶上（失败不缓存，textarea 值保持）。
    view.value = null
    mode.value = 'fallback'
    syncMirror(text.value)
  }
}

onMounted(() => {
  syncMirror(props.modelValue)
  void initEditor()
})

onBeforeUnmount(() => {
  silent = true
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div data-testid="cde-root" class="cde" :class="'is-' + mode">
    <!-- CM host: mounts the lazily imported CodeMirror 6 view (hidden in fallback form) -->
    <div ref="hostEl" class="cde-host" />
    <!-- Single real textarea across all forms: interactive body in fallback/loading,
         one-way doc mirror in ready (aria-hidden, input never feeds back) -->
    <textarea
      ref="taEl"
      data-testid="cde-content"
      class="cde-textarea"
      :aria-label="t('v2.cde.editorLabel')"
      :aria-hidden="mode === 'ready' ? 'true' : undefined"
      :tabindex="mode === 'ready' ? -1 : undefined"
      :disabled="disabled"
      :maxlength="maxlength"
      :rows="rows"
      v-bind="$attrs"
      @input="onTextareaInput"
    />
    <div class="cde-bar">
      <span v-if="errorLine !== null" class="cde-error" data-testid="cde-error" role="alert">
        <span class="cde-error-line" data-testid="cde-error-line">{{ errorLine }}</span>
        <span>{{ t('v2.cde.errorAt', { line: errorLine }) }}</span>
      </span>
      <span v-else class="cde-bar-spacer" />
      <button
        type="button"
        class="cde-format"
        data-testid="cde-format"
        :disabled="formatBlocked"
        :title="formatBlocked ? t('v2.cde.formatInvalidHint') : undefined"
        @click="onFormat"
      >{{ t('v2.cde.format') }}</button>
    </div>
  </div>
</template>

<style scoped>
.cde {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Form visibility: ready form hides the mirror textarea (CM host takes over);
   fallback form hides the empty CM host (textarea is the body) */
.cde.is-ready .cde-textarea {
  display: none;
}

.cde.is-fallback .cde-host {
  display: none;
}

.cde-textarea {
  width: 100%;
  padding: 8px 10px;
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
  resize: vertical;
}

.cde-textarea:disabled {
  color: var(--app-text-quaternary);
  background: var(--app-bg-muted);
  cursor: not-allowed;
}

.cde-textarea:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.cde-host {
  min-width: 0;
}

.cde-host :deep(.cm-editor) {
  font-size: 13px;
}

/* CM error line marker (Decoration.line self-drawn class, no @codemirror/lint) */
.cde-host :deep(.cde-line-error) {
  background: color-mix(in srgb, var(--app-color-danger) 8%, transparent);
}

.cde-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.cde-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--app-color-danger-text-on-tint);
}

.cde-error-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border-radius: var(--app-radius-chip);
}

.cde-bar-spacer {
  flex: 1;
}

.cde-format {
  margin-left: auto;
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-button);
  cursor: pointer;
}

.cde-format:hover:not(:disabled) {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-primary) 8%, var(--app-bg-muted));
}

.cde-format:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.cde-format:disabled {
  color: var(--app-text-quaternary);
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
