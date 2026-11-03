<template>
  <div class="fc-tabs-panel" :class="{ 'fc-tabs-panel--card': card }">
    <!-- Tab 栏：窄屏不折行（gate 49a），改为横向滑动 -->
    <div v-if="showTabsBar" class="fc-tabs-bar">
      <div ref="tabsEl" class="fc-tabs" :class="{ 'fc-tabs--scrollable': scrollable }">
        <button
          v-for="t in tabs"
          :key="t.value"
          class="fc-tab"
          :class="{ active: modelValue === t.value, disabled: t.disabled }"
          :disabled="t.disabled"
          @click="onTabClick(t)"
        >
          <i v-if="t.icon" :class="t.icon" />
          <span>{{ t.label }}</span>
        </button>
      </div>
    </div>

    <!-- 内容区:每个 tab 一一对应 #tab-{value} slot;未匹配时显示 #default -->
    <div class="fc-tabs-content">
      <template v-for="t in tabs" :key="t.value">
        <div v-if="modelValue === t.value" class="fc-tab-pane">
          <slot :name="`tab-${t.value}`" />
        </div>
      </template>
      <slot v-if="!hasActiveSlot" name="default" />
    </div>

    <!-- 底部 slot -->
    <div v-if="$slots.footer" class="fc-tabs-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'FcTabsPanel' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface TabItem {
  value: string
  label: string
  icon?: string
  disabled?: boolean
}

export interface FcTabsPanelProps {
  /** tab 列表 */
  tabs: TabItem[]
  /** 当前激活的 tab value (v-model) */
  modelValue: string
  /** 是否显示 tab 栏 (单 tab 时可隐藏) */
  showTabsBar?: boolean
  /**
   * 是否启用卡片视觉 (与 FcSection 同等).
   * true 时:
   *   - tab 行与 content 之间多 12px 间距
   *   - .fc-tabs-content 加 bg + border-radius + box-shadow + border (标准卡片)
   *   - .fc-tab-pane padding=0 (内部卡片自己决定)
   * 默认 false (保留原裸样式, 不破坏其它页面).
   */
  card?: boolean
}

const props = withDefaults(defineProps<FcTabsPanelProps>(), {
  showTabsBar: true,
  card: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'tab-click': [value: string]
}>()

const hasActiveSlot = computed(() =>
  props.tabs.some(t => t.value === props.modelValue)
)

function onTabClick(t: TabItem) {
  if (t.disabled || t.value === props.modelValue) return
  emit('update:modelValue', t.value)
  emit('tab-click', t.value)
}

// ===== 横向可滑动检测（窄屏下 tab 不折行，改为横滑）=====
// 背景：.fc-tab 是 <button> 且默认 white-space: normal，容器 flex-wrap: nowrap ——
// 375 宽时每个 tab 被压到 67×52，标签折成两行（「通用/设置」读成「通用」「设置」），
// 违反 gate 49a（长可点击文案在 320–1920 任一宽度折行 = Floor）。
// 现在：.fc-tab 固定 nowrap + 不收缩，容器 overflow-x: auto 横滑。
// 只有「真的还能滑」时才在右侧加渐隐提示（mask），避免内容刚好铺满时把最后一个 tab 抹灰。

const tabsEl = ref<HTMLElement | null>(null)
const scrollable = ref(false)

function measureScrollable() {
  const el = tabsEl.value
  if (!el) {
    scrollable.value = false
    return
  }
  scrollable.value = el.scrollWidth > el.clientWidth + 1
}

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

onMounted(() => {
  nextTick(measureScrollable)
  const el = tabsEl.value
  if (!el) return
  // 容器尺寸变化（窗口/侧栏折叠）→ 可滑动性变化
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measureScrollable())
    ro.observe(el)
    // 标签文案变化 → 按钮宽度变化 → 也可能改变可滑动性
    el.querySelectorAll('.fc-tab').forEach(node => ro!.observe(node))
  }
  // 兜底：DOM 结构变化（动态增删 tab）后重测
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => measureScrollable())
    mo.observe(el, { childList: true, subtree: true, characterData: true })
  }
  window.addEventListener('resize', measureScrollable)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  mo?.disconnect()
  mo = null
  window.removeEventListener('resize', measureScrollable)
})

watch(() => props.tabs, () => nextTick(measureScrollable), { deep: true })
</script>

<style scoped lang="scss">
.fc-tabs-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

/* tab 栏外壳：底部分隔线放这里（不放在滚动容器里，
   否则右侧渐隐 mask 会把分隔线右端一起抹掉） */
.fc-tabs-bar {
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  border-bottom: 1px solid var(--app-separator);
}

.fc-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  flex-shrink: 0;
  min-width: 0;
  /* 窄屏不折行 → 横向滑动（滚动条隐藏但滚动保留） */
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;        /* Firefox：隐藏滚动条但保留滚动 */
  -ms-overflow-style: none;
}

.fc-tabs::-webkit-scrollbar {  /* Chromium / Safari */
  display: none;
}

/* 还能滑时：右侧渐隐，告诉用户「右边还有内容」 */
.fc-tabs--scrollable {
  -webkit-mask-image: linear-gradient(to right, var(--app-text) calc(100% - 28px), transparent 100%);
  mask-image: linear-gradient(to right, var(--app-text) calc(100% - 28px), transparent 100%);
}

.fc-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--app-radius-sm);
  transition: background 0.15s, color 0.15s;
  /* gate 49a：tab 标签永不折行；窄屏靠容器横滑 */
  white-space: nowrap;
  flex-shrink: 0;
  scroll-snap-align: start;

  i {
    font-size: 16px;
  }

  &:focus-visible {
    outline: 2px solid var(--app-focus-ring);
    outline-offset: 2px;
  }

  &:hover:not(:disabled) {
    background: var(--app-bg-muted);
    color: var(--app-text-primary);
  }

  &:active:not(:disabled) {
    opacity: 0.85;
  }

  &.active {
    background: color-mix(in srgb, var(--app-primary) 12%, transparent);
    color: var(--app-accent-text);
  }

  &:disabled,
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.fc-tabs-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.fc-tab-pane {
  padding: var(--space-md, 12px);
}

.fc-tabs-footer {
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  border-top: 1px solid var(--app-separator);
  background: var(--app-bg-page);
  flex-shrink: 0;
}

/* ---- opt-in: 卡片视觉 (与 FcSection 同等) ---- */
.fc-tabs-panel--card .fc-tabs-bar {
  margin-bottom: 12px;       // tab 行 ↔ content 间距
}

.fc-tabs-panel--card .fc-tabs-content {
  background: var(--el-bg-color);
  border-radius: var(--app-radius-card, 8px);
  box-shadow: var(--app-shadow-md);
  border: 1px solid var(--el-border-color-extra-light);
  overflow: hidden;
  min-height: 200px;
}

.fc-tabs-panel--card .fc-tab-pane {
  padding: 0;                // 内部卡片自带 padding (FcSection padding="none" 接管), 不叠
}
</style>
