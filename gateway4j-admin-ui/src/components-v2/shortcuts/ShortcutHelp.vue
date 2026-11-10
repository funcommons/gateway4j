<script setup lang="ts">
defineOptions({ name: 'ShortcutHelp' })
/**
 * ShortcutHelp —— `?` 全局快捷键速查表（LOW-2，v2 优化建议 #8，对标 Kong/Tyk）。
 * 组件契约以 src/components-v2/shortcuts/__tests__/ShortcutHelp.test.ts 头注为准：
 * - 无 props / 无 emits：开合状态自持，与 CommandPalette 的 v-model:open 形态不同
 *   （速查表无顶栏触发器，`?` 是唯一入口）；
 * - window 常驻 keydown 单监听管 `?` toggle 与 Esc 关闭（挂载即监听，与状态无关；
 *   onBeforeUnmount 配对移除，⌘K 先例）；
 * - `?` 仅在无 ctrl/meta/alt 修饰且焦点不在文本输入域时触发（input / textarea /
 *   contenteditable 豁免，防打字误弹；contenteditable 判据兼容 jsdom —— 其
 *   isContentEditable 恒 undefined，用 closest('[contenteditable]') 按属性/祖先判定）；
 * - Esc 仅开着时关闭（闭合态 no-op）；点击遮罩关、面板内不关；
 * - a11y：sc-root role="dialog" aria-modal + :aria-label=v2.sc.title + tabindex="-1"
 *   打开自动聚焦（CommandPalette watch 手法）、关闭焦点归还打开前的触发元素；
 * - 数据全部来自同目录 shortcutRegistry.ts（分组/条目/kbd 均注册表驱动）。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupedShortcuts } from './shortcutRegistry'

const { t } = useI18n()

const open = ref(false)
/** 分组数据是静态注册表，setup 期取一次即可（非响应式常量） */
const groups = groupedShortcuts()

function close() {
  open.value = false
}

/** 焦点是否落在文本输入域（target 自身或祖先是 input/textarea/contenteditable） */
function isTextEntryTarget(e: KeyboardEvent): boolean {
  const el = e.target
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true
  // closest 同时覆盖自身与祖先；jsdom 的 isContentEditable 恒 undefined，按属性判定
  return el.closest('[contenteditable]') != null
}

// —— window 常驻快捷键（挂载即监听，与 open 无关）：`?` toggle、Esc 仅开着时关闭 ——
function onWinKeydown(e: KeyboardEvent) {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextEntryTarget(e)) {
    open.value = !open.value
  } else if (e.key === 'Escape' && open.value) {
    close()
  }
}

// —— 焦点管理：打开接管到 sc-root（tabindex="-1"），关闭归还打开前的触发元素（⌘K 先例）——
const rootEl = ref<HTMLElement | null>(null)
let lastTrigger: HTMLElement | null = null

async function focusRoot() {
  await nextTick()
  rootEl.value?.focus()
}

watch(open, (v) => {
  if (v) {
    lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusRoot()
  } else if (lastTrigger) {
    if (lastTrigger.isConnected) lastTrigger.focus()
    lastTrigger = null
  }
})

onMounted(() => {
  window.addEventListener('keydown', onWinKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWinKeydown)
})
</script>

<template>
  <div
    v-if="open"
    ref="rootEl"
    data-testid="sc-root"
    class="sc-root"
    role="dialog"
    aria-modal="true"
    :aria-label="t('v2.sc.title')"
    tabindex="-1"
  >
    <div data-testid="sc-mask" class="sc-mask" aria-hidden="true" @click="close" />
    <div class="sc-panel">
      <div class="sc-head">
        <h2 class="sc-title">{{ t('v2.sc.title') }}</h2>
      </div>
      <div class="sc-body">
        <section
          v-for="g in groups"
          :key="g.group"
          :data-testid="`sc-group-${g.group}`"
          class="sc-group"
          role="group"
          :aria-label="t(g.labelKey)"
        >
          <div class="sc-group-label">{{ t(g.labelKey) }}</div>
          <div
            v-for="item in g.items"
            :key="item.id"
            :data-testid="`sc-item-${item.id}`"
            class="sc-item"
          >
            <span class="sc-item-desc">{{ t(item.descKey) }}</span>
            <kbd :data-testid="`sc-kbd-${item.id}`" class="sc-kbd">{{ item.keys }}</kbd>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 浮层层级：对齐 .cmd-root（顶栏 10 / scrim 50 / 抽屉 60 之上，Element Plus 浮层基准 2000 起） */
.sc-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 24px;
  outline: none;
}
.sc-root:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: -2px;
}
.sc-mask {
  position: absolute;
  inset: 0;
  background: var(--app-overlay-strong);
}
/* 375 防溢出收口：max-width:90vw（.cmd-panel 先例）+ max-height 内滚（矮屏可滚） */
.sc-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: 90vw;
  max-height: 72vh;
  overflow: hidden;
  background: var(--app-bg-card);
  border: 1px solid var(--app-separator);
  border-radius: var(--app-radius-lg);
  box-shadow: var(--app-shadow-lg);
  color: var(--app-text);
}
.sc-head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--app-separator);
}
.sc-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.sc-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 16px 14px;
}
.sc-group + .sc-group {
  margin-top: 14px;
}
.sc-group-label {
  padding: 6px 0 4px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-text-tertiary);
}
.sc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}
.sc-item:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.sc-item-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text);
}
/* 键位字形走 token（.v2-top-kbd 先例） */
.sc-kbd {
  flex: 0 0 auto;
  padding: 1px 7px;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border: 1px solid var(--app-separator);
  border-radius: var(--app-radius-sm);
}
</style>
