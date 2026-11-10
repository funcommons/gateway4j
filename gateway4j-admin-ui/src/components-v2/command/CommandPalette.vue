<script setup lang="ts">
defineOptions({ name: 'CommandPalette' })
/**
 * CommandPalette —— ⌘K 全局命令面板（OPT-2，v2 优化建议 #1，对标 Kong Konnect）。
 * 组件契约以 src/components-v2/command/__tests__/CommandPalette.test.ts 头注为准
 * （P3-a 打磨五项见同目录 __tests__/CommandPalette.polish.test.ts 头注）：
 * - props { open }（v-model:open）；window 常驻监听 ⌘K/Ctrl+K toggle 与 Esc 关闭
 *   （挂载即监听，与 open 状态无关）；条目执行成功后 emit update:open=false
 *   （P3-a②：run() 失败 → ElMessage.error 兜底且面板保持打开，可重试）。
 * - 分组序由 useCommandRegistry orderedSegments 单源派生：基准 pages→actions→routes→plugins，
 *   搜索态（query 非空）动作组排尾；空组不渲染；DOM 组序 = 键盘序。
 * - a11y：dialog/listbox/option 语义 + aria-activedescendant + 打开聚焦输入框 /
 *   关闭焦点归还触发元素 + :focus-visible 焦点环（Hallmark 门槛）；
 *   P3-a①：打开期间 Tab/Shift+Tab 焦点陷阱（cmd-root 级自实现循环哨兵，关闭即解除）；
 *   P3-a③：cmd-root 带 DOM id="cmd-palette"（顶栏触发器 aria-controls 指向）。
 * - P3-a⑤：异步搜索任一侧失败 → cmd-error（role=alert）可见错误态，部分成功结果保留；
 *   错误态优先于空态，下次输入自然重查、清空 query 回浏览态清场。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { FcIcon } from '@/components'
import { useCommandRegistry, type CmdOption, type CmdThemeMode } from './useCommandRegistry'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
const { t } = useI18n()

// —— 主题动作上下文：App.vue FcThemeProvider / LayoutV2 兜底 provide 同形；
// 无 Provider 祖先（inject 落空）时降级直切 documentElement 的 dark class，不炸 ——
interface CmdThemeContext {
  theme: Ref<CmdThemeMode>
  setTheme: (mode: CmdThemeMode) => void
}
const themeCtx = inject<CmdThemeContext | null>('fc-theme', null)

function toggleTheme() {
  const next: CmdThemeMode = themeCtx?.theme.value === 'dark' ? 'light' : 'dark'
  if (themeCtx) themeCtx.setTheme(next)
  else document.documentElement.classList.toggle('dark', next === 'dark')
}

const { query, loading, searchError, groups, flatOptions, activeIndex, moveActive, reset } = useCommandRegistry({
  toggleTheme
})

/** 当前高亮项（空态/索引越界为 null → 无 aria-selected=true，Enter no-op） */
const activeOption = computed<CmdOption | null>(() => flatOptions.value[activeIndex.value] ?? null)
const activeId = computed(() => activeOption.value?.id)

function close() {
  emit('update:open', false)
}

/** 执行条目：run() 成功才关面板；失败 toast 兜底且保持打开（activeIndex 不动，可重试）。
 *  必须 catch 而非 finally——finally 会在失败时误关面板，且重抛会以 unhandled rejection 逃逸。 */
async function execute(opt: CmdOption) {
  try {
    await opt.run()
  } catch {
    ElMessage.error(t('v2.cmd.execError'))
    return
  }
  close()
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveActive(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveActive(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeOption.value) void execute(activeOption.value)
  }
}

// —— 焦点陷阱（P3-a①）：面板打开期间 Tab/Shift+Tab 首尾环绕在 cmd-root 内，不逸出背景
// 页面。自实现循环哨兵而非 SDK useFocusTrap：后者 deactivate 与关闭归还 lastTrigger
// 两路同时抢焦点，行为不可控。cmd-root 关闭即随 v-if 卸载，陷阱随之解除。——
const rootEl = ref<HTMLDivElement | null>(null)
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function onRootKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const root = rootEl.value
  if (!root) return
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (focusables.length === 0) return
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const idx = active ? focusables.indexOf(active) : -1
  e.preventDefault() // 陷阱生效：焦点由面板自派，不交给浏览器默认环游
  if (idx === -1) {
    // 焦点在面板外（或落在面板内非可聚焦节点）：拉回面板内
    ;(e.shiftKey ? focusables[focusables.length - 1] : focusables[0]).focus()
    return
  }
  if (e.shiftKey) focusables[idx === 0 ? focusables.length - 1 : idx - 1].focus()
  else focusables[idx === focusables.length - 1 ? 0 : idx + 1].focus()
}

// —— window 常驻快捷键（挂载即监听，与 open 无关）：⌘K/Ctrl+K toggle、Esc 关闭 ——
function onWinKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    emit('update:open', !props.open)
  } else if (e.key === 'Escape' && props.open) {
    close()
  }
}

// —— 焦点管理：打开接管到 cmd-input，关闭归还给打开前的触发元素 ——
const inputEl = ref<HTMLInputElement | null>(null)
let lastTrigger: HTMLElement | null = null

async function focusInput() {
  await nextTick()
  inputEl.value?.focus()
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
      reset()
      void focusInput()
    } else if (lastTrigger) {
      if (lastTrigger.isConnected) lastTrigger.focus()
      lastTrigger = null
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onWinKeydown)
  if (props.open) {
    reset()
    void focusInput()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWinKeydown)
})
</script>

<template>
  <div
    v-if="open"
    id="cmd-palette"
    ref="rootEl"
    data-testid="cmd-root"
    class="cmd-root"
    role="dialog"
    aria-modal="true"
    :aria-label="t('v2.cmd.placeholder')"
    @keydown="onRootKeydown"
  >
    <div data-testid="cmd-mask" class="cmd-mask" aria-hidden="true" @click="close" />
    <div class="cmd-panel">
      <div class="cmd-head">
        <FcIcon class="cmd-head-icon" name="ri-search-line" :size="15" />
        <input
          ref="inputEl"
          v-model="query"
          data-testid="cmd-input"
          class="cmd-input"
          type="text"
          :placeholder="t('v2.cmd.placeholder')"
          @keydown="onInputKeydown"
        />
      </div>
      <div
        data-testid="cmd-listbox"
        class="cmd-listbox"
        role="listbox"
        :aria-activedescendant="activeId"
      >
        <!-- 搜索失败横幅（P3-a⑤）：独立于下方 loading/empty 链——部分成功时错误横幅与结果组并存；
             全空时 empty 条件被 !searchError 拦下，错误态优先于空态（二者不同时渲染） -->
        <div v-if="searchError" data-testid="cmd-error" role="alert" class="cmd-state">
          {{ t('v2.cmd.searchError') }}
        </div>
        <div v-if="loading" data-testid="cmd-loading" class="cmd-state">{{ t('v2.cmd.loading') }}</div>
        <div v-else-if="flatOptions.length === 0 && !searchError" data-testid="cmd-empty" class="cmd-state">
          {{ t('v2.cmd.empty') }}
        </div>
        <template v-else-if="flatOptions.length > 0">
          <div
            v-for="g in groups"
            :key="g.testid"
            :data-testid="g.testid"
            class="cmd-group"
            role="group"
            :aria-label="t(g.labelKey)"
          >
            <div class="cmd-group-label">{{ t(g.labelKey) }}</div>
            <div
              v-for="o in g.items"
              :id="o.id"
              :key="o.id"
              :data-testid="o.id"
              class="cmd-item"
              role="option"
              :aria-selected="o.id === activeId"
              :class="{ 'is-active': o.id === activeId }"
              @click="execute(o)"
            >
              <FcIcon class="cmd-item-icon" :name="o.icon" :size="14" />
              <span class="cmd-item-title">
                <template v-for="(seg, i) in o.parts" :key="i">
                  <span v-if="seg.hit" class="cmd-hit">{{ seg.text }}</span>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </span>
              <span v-if="o.hint.length" class="cmd-item-hint">
                <template v-for="(seg, i) in o.hint" :key="i">
                  <span v-if="seg.hit" class="cmd-hit">{{ seg.text }}</span>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </span>
            </div>
          </div>
        </template>
      </div>
      <div class="cmd-footer">{{ t('v2.cmd.footer') }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 浮层层级：顶栏 10 / scrim 50 / 抽屉 60 之上，对齐 Element Plus 浮层基准（2000 起） */
.cmd-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 24px;
}
.cmd-mask {
  position: absolute;
  inset: 0;
  background: var(--app-overlay-strong);
}
.cmd-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: 90vw;
  max-height: 68vh;
  overflow: hidden;
  background: var(--app-bg-card);
  border: 1px solid var(--app-separator);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-lg);
  color: var(--app-text);
}
.cmd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-separator);
}
.cmd-head-icon {
  flex: 0 0 auto;
  color: var(--app-text-tertiary);
}
.cmd-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--app-text-primary);
}
.cmd-input::placeholder {
  color: var(--app-text-tertiary);
}
.cmd-listbox {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px 10px;
}
.cmd-state {
  padding: 28px 16px;
  font-size: 13px;
  color: var(--app-text-tertiary);
  text-align: center;
}
.cmd-group + .cmd-group {
  margin-top: 6px;
}
.cmd-group-label {
  padding: 8px 10px 4px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-text-tertiary);
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: var(--app-text);
  cursor: pointer;
}
.cmd-item:hover {
  background: var(--app-bg-muted);
}
.cmd-item:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: -2px;
}
.cmd-item.is-active {
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  color: var(--app-accent-text);
}
.cmd-item-icon {
  flex: 0 0 auto;
  color: var(--app-text-secondary);
}
.cmd-item.is-active .cmd-item-icon {
  color: var(--app-accent-text);
}
.cmd-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmd-item-hint {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: auto;
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}
.cmd-hit {
  color: var(--app-accent-text);
  font-weight: 600;
}
.cmd-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--app-separator);
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}
</style>
