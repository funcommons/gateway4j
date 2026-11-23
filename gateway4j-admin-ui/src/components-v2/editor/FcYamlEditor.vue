<script setup lang="ts">
defineOptions({ name: 'FcYamlEditor', inheritAttrs: false })
/**
 * S12-4：YAML 编辑器 FcYamlEditor（CodeMirror 6 + js-yaml，K8s/kubectl 风味）。
 *
 * 与 FcCodeEditor.vue 同构（骨架 / 三形态 / 懒加载 / fallback / token 主题 / maxlength /
 * defineExpose 全部对齐），差别只在【解析层】：JSON.parse → js-yaml load。
 * 组件契约以 src/components-v2/editor/__tests__/FcYamlEditor.test.ts 头注为准。
 *
 * - props { modelValue, disabled?, maxlength?, rows?=8 } + emit update:modelValue；
 *   defineExpose({ view })（EditorView | null：ready 必有实例、fallback 恒 null）。
 * - 三形态（yde-root 状态类 is-loading / is-ready / is-fallback）：挂载即动态 import；
 *   import('codemirror') / import('@codemirror/lang-yaml') 任一 reject 或 EditorView
 *   构造抛错 → 原生 textarea 顶上。成功/失败都不缓存，每次挂载重新 import。
 * - yde-content 恒为真实 textarea：fallback = 交互本体；ready = 单向镜像
 *   （doc → value 持续同步，aria-hidden + tabindex=-1，input 不回灌防环路）。
 * - 即时 YAML 解析（无防抖）：合法 → 无错 + 格式化可点；空串/纯空白 = 中性态；
 *   非法 → yde-error（t('v2.yde.errorAt', { line })）+ yde-error-line 行号徽标 +
 *   CM 错误行标线（Decoration.line 自绘 yde-line-error 类，不用 @codemirror/lint）。
 *   行号提取：YAMLException.mark.line（0 基）+1 优先 → 退化消息里的 "(line:col)"
 *   → 退化第 1 行。
 * - 格式化钮 yde-format：enabled ⇔ 非空且解析合法；点击 js-yaml dump（2 空格）回写
 *   update:modelValue（两形态都可用）；blocked 时 title = t('v2.yde.formatInvalidHint')。
 * - maxlength 仅 fallback textarea 透传（CM 不硬截断）；disabled：fallback textarea
 *   原生 disabled、CM readonly 域（Compartment 装载，运行期翻转随时重配）。
 * - 懒加载边界：组件内动态 import specifier 钉死 'codemirror' 与 '@codemirror/lang-yaml'；
 *   组件自身整体进动态 chunk（IngressForm defineAsyncComponent 接线），主 bundle 不含。
 * - 主题 token-only：EditorView.theme 值直接引 var(--app-*)；style 块零字面色。
 *   SDK 铁律：无 el-* 直用、template 零 CJK（文案一律 t()）。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { Compartment, EditorState, StateField, type Text } from '@codemirror/state'
import { dump, load } from 'js-yaml'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    maxlength?: number
    rows?: number
  }>(),
  { rows: 8 }
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useI18n()

const hostEl = ref<HTMLElement | null>(null)
const taEl = ref<HTMLTextAreaElement | null>(null)
const mode = ref<'loading' | 'ready' | 'fallback'>('loading')
const view = shallowRef<EditorView | null>(null)
defineExpose({ view })
/** readOnly 域走 Compartment：disabled prop 运行期翻转可重配（实例级） */
const readOnlyCompartment = new Compartment()
/** 逻辑文本（ready=doc 全文、fallback/loading=textarea 值；解析与镜像都从它出发） */
const text = ref(props.modelValue)

// ── 即时 YAML 解析 + 行号提取 ──
function parseErrorLine(source: string): number | null {
  if (!source.trim()) return null // 空串 / 纯空白 = 中性态（无错、格式化禁用）
  try {
    load(source)
    return null
  } catch (e) {
    // YAMLException.mark.line 是 0 基 → 1 基
    const mark = (e as { mark?: { line?: unknown } } | null)?.mark
    if (mark && typeof mark.line === 'number' && Number.isFinite(mark.line)) {
      return Math.max(1, Math.trunc(mark.line) + 1)
    }
    const msg = e instanceof Error ? e.message : String(e)
    const m = msg.match(/\((\d+):(\d+)\)/)
    if (m) return Math.max(1, Number(m[1]))
    return 1
  }
}

const errorLine = computed<number | null>(() => parseErrorLine(text.value))
const canFormat = computed(() => text.value.trim() !== '' && errorLine.value === null)
const formatBlocked = computed(() => props.disabled || !canFormat.value)

// ── CM 错误行标线（Decoration.line 自绘，免 @codemirror/lint）──
function decoFor(doc: Text): DecorationSet {
  const bad = parseErrorLine(doc.toString())
  if (bad === null || bad > doc.lines) return Decoration.none
  return Decoration.set([Decoration.line({ class: 'yde-line-error' }).range(doc.line(bad).from)], true)
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

// disabled 运行期翻转 → CM readonly 域重配
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
  const pretty = dump(load(text.value), { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false })
  text.value = pretty
  emit('update:modelValue', pretty)
  if (mode.value === 'ready') applyDoc(pretty)
  else syncMirror(pretty)
}

async function initEditor() {
  try {
    const [{ EditorView: EV, basicSetup }, { yaml }] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-yaml')
    ])
    const parent = hostEl.value
    if (!parent) return // import 窗口内组件已被卸载
    const v = new EV({
      state: EditorState.create({
        doc: props.modelValue,
        extensions: [
          basicSetup,
          yaml(),
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
  <div data-testid="yde-root" class="yde" :class="'is-' + mode">
    <!-- CM host: mounts the lazily imported CodeMirror 6 view (hidden in fallback form) -->
    <div ref="hostEl" class="yde-host" />
    <!-- Single real textarea across all forms: interactive body in fallback/loading,
         one-way doc mirror in ready (aria-hidden, input never feeds back) -->
    <textarea
      ref="taEl"
      data-testid="yde-content"
      class="yde-textarea"
      :aria-label="t('v2.yde.editorLabel')"
      :aria-hidden="mode === 'ready' ? 'true' : undefined"
      :tabindex="mode === 'ready' ? -1 : undefined"
      :disabled="disabled"
      :maxlength="maxlength"
      :rows="rows"
      v-bind="$attrs"
      @input="onTextareaInput"
    />
    <div class="yde-bar">
      <span v-if="errorLine !== null" class="yde-error" data-testid="yde-error" role="alert">
        <span class="yde-error-line" data-testid="yde-error-line">{{ errorLine }}</span>
        <span>{{ t('v2.yde.errorAt', { line: errorLine }) }}</span>
      </span>
      <span v-else class="yde-bar-spacer" />
      <button
        type="button"
        class="yde-format"
        data-testid="yde-format"
        :disabled="formatBlocked"
        :title="formatBlocked ? t('v2.yde.formatInvalidHint') : undefined"
        @click="onFormat"
      >{{ t('v2.yde.format') }}</button>
    </div>
  </div>
</template>

<style scoped>
.yde {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Form visibility: ready form hides the mirror textarea (CM host takes over);
   fallback form hides the empty CM host (textarea is the body) */
.yde.is-ready .yde-textarea {
  display: none;
}

.yde.is-fallback .yde-host {
  display: none;
}

.yde-textarea {
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

.yde-textarea:disabled {
  color: var(--app-text-quaternary);
  background: var(--app-bg-muted);
  cursor: not-allowed;
}

.yde-textarea:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.yde-host {
  min-width: 0;
}

.yde-host :deep(.cm-editor) {
  font-size: 13px;
}

/* CM error line marker (Decoration.line self-drawn class, no @codemirror/lint) */
.yde-host :deep(.yde-line-error) {
  background: color-mix(in srgb, var(--app-color-danger) 8%, transparent);
}

.yde-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.yde-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--app-color-danger-text-on-tint);
}

.yde-error-line {
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

.yde-bar-spacer {
  flex: 1;
}

.yde-format {
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

.yde-format:hover:not(:disabled) {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-primary) 8%, var(--app-bg-muted));
}

.yde-format:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.yde-format:disabled {
  color: var(--app-text-quaternary);
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
