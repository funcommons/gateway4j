<script setup lang="ts">defineOptions({ name: 'FcDialog' })
/**
 * FcDialog — 统一的 el-dialog 包装 (SDK).
 *
 * 用法 A (推荐, v-model 双向绑定):
 *   <FcDialog v-model:open="open" title="确认" @confirm="onConfirm">
 *     <p>内容</p>
 *     <template #footer>
 *       <el-button @click="open = false">取消</el-button>
 *       <el-button type="primary" @click="onConfirm">确认</el-button>
 *     </template>
 *   </FcDialog>
 *
 * 用法 B (active + @toggle, 多 dialog 互斥):
 *   <FcDialog :active="current === 'edit'" @toggle="..." />
 *
 * 内置能力:
 * - v-model:open 与 active+@toggle 双模式, 默认值收敛
 * - 打开时自动锁 body 滚动 (useBodyScrollLock)
 * - 默认居中 (alignCenter=true), 可关
 * - 点遮罩 / ESC 默认**不关闭** (表单类弹窗防误触; 需要旧行为显式传 true) ⚠ 行为变更
 * - 自定义 header / footer slot (header 内注入全屏切换钮)
 * - draggable (头部当拖动手柄) + resizable (四边+四角 8 热区, Windows 窗体式) 可选
 * - 全屏切换钮 (关闭钮左侧): 全屏 = 铺满视口, 还原 = 恢复原几何; 全屏态按 Esc 只退全屏不关窗
 * - appendToBody / destroyOnClose 透传 ElDialog
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBodyScrollLock } from '@/composables'

export interface FcDialogProps {
  /** 方式 A: v-model:open 双向绑定开关状态 */
  open?: boolean
  /** 方式 B: 单向 active prop (配合 @toggle 事件) */
  active?: boolean
  /** 标题 (withHeader=true 时显示) */
  title?: string
  /** 弹窗宽度 (number=px, string=CSS 含百分比). 默认 480. 拖拽调尺寸后转为 px. */
  width?: string | number
  /** 弹窗高度 (number=px, string=CSS). 不传=auto. 设了之后 dialog 整体固定高度, body 用 flex 撑满. */
  height?: number | string
  /** 是否居中, 默认 true */
  alignCenter?: boolean
  /** 点击遮罩是否关闭. 默认 false ⚠ 行为变更 (原 true, 表单弹窗防误触) */
  closeOnClickModal?: boolean
  /** 按 ESC 是否关闭. 默认 false ⚠ 行为变更 (原 true); 全屏态下 ESC 始终只退全屏不关窗 */
  closeOnPressEscape?: boolean
  /** 是否显示关闭按钮, 默认 true */
  showClose?: boolean
  /** 是否显示 header (title 栏), 默认 true. 内容自带标题时设 false. */
  withHeader?: boolean
  /** 顶层 dialog class */
  dialogClass?: string
  /** 顶层 body class */
  bodyClass?: string
  /** 头部当拖动手柄, 默认 true */
  draggable?: boolean
  /** 四边+四角 8 热区拖拽调尺寸, 默认 false */
  resizable?: boolean
  /** resizable 最小宽度 (px). 默认 360 */
  minWidth?: number
  /** resizable 最小高度 (px). 默认 240 */
  minHeight?: number
  /** 全屏铺满视口 (透传 ElDialog). 默认 false; 可用 v-model:fullscreen 双向绑定 */
  fullscreen?: boolean
  /** header 全屏切换钮: 'auto' (默认) = resizable 开启时显示; true/false 显式控制 */
  fullscreenable?: boolean | 'auto'
  /** 透传 ElDialog append-to-body. 默认 false */
  appendToBody?: boolean
  /** 透传 ElDialog destroy-on-close. 默认 false */
  destroyOnClose?: boolean
  /** 透传 ElDialog modal-class (用于自定义遮罩). 默认空 */
  modalClass?: string
}

const props = withDefaults(defineProps<FcDialogProps>(), {
  open: false,
  active: undefined,
  title: '',
  width: 480,
  height: undefined,
  alignCenter: true,
  closeOnClickModal: false,
  closeOnPressEscape: false,
  showClose: true,
  withHeader: true,
  dialogClass: '',
  bodyClass: '',
  draggable: true,
  resizable: false,
  minWidth: 360,
  minHeight: 240,
  fullscreen: false,
  fullscreenable: 'auto',
  appendToBody: false,
  destroyOnClose: false,
  modalClass: '',
})

const emit = defineEmits<{
  'update:open': [boolean]
  /** 方式 B: 状态变化时触发 */
  toggle: [boolean]
  /** 关闭前 (用户点 X / 遮罩 / ESC), 用于阻止关闭 (return false) */
  'before-close': []
  /** 关闭后 */
  close: []
  /** resizable=true 时, 用户拖动热区后触发 */
  resize: [width: number, height: number | '']
  /** 全屏切换时触发 (v-model:fullscreen) */
  'update:fullscreen': [boolean]
}>()

const { t } = useI18n()

const innerOpen = ref(props.active ?? props.open)

watch(() => props.active, v => { if (v !== undefined) innerOpen.value = v })
watch(() => props.open, v => { if (props.active === undefined) innerOpen.value = v })

watch(innerOpen, v => {
  if (v !== props.open) emit('update:open', v)
  if (v !== props.active) emit('toggle', v)
})

function setOpen(v: boolean) { innerOpen.value = v }
function handleClose() { setOpen(false) }
function handleClosed() {
  emit('close')
  // 关闭时若处于全屏态 (用户没关窗只切了全屏), 下次打开恢复非全屏几何
  if (innerFullscreen.value !== props.fullscreen) innerFullscreen.value = props.fullscreen
}

useBodyScrollLock(computed(() => innerOpen.value))

const dialogClassFull = computed(() => ['fc-dialog', props.dialogClass].filter(Boolean).join(' '))

// ===== fullscreen: 内部态 + 双向绑定, 全屏钮 / Esc 退全屏共用 =====
const innerFullscreen = ref(props.fullscreen)
watch(() => props.fullscreen, v => { innerFullscreen.value = v })

const showFullscreenToggle = computed(() =>
  props.fullscreenable === 'auto' ? props.resizable : props.fullscreenable,
)
const fullscreenLabel = computed(() =>
  innerFullscreen.value ? t('common.exit-fullscreen') : t('common.fullscreen'),
)

function setFullscreen(v: boolean) {
  if (innerFullscreen.value === v) return
  innerFullscreen.value = v
  emit('update:fullscreen', v)
}
function toggleFullscreen() { setFullscreen(!innerFullscreen.value) }

/**
 * 全屏态 Esc = 退全屏不关窗.
 * 挂 window 捕获阶段: EP 的 useEscapeKeydown 挂 document 冒泡且注册更早,
 * 同节点上按注册序执行 —— 只有 window 捕获能保证先于它拿到事件并 stopPropagation.
 */
function onDocKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !innerOpen.value || !innerFullscreen.value) return
  e.preventDefault()
  e.stopPropagation()
  setFullscreen(false)
}
onMounted(() => window.addEventListener('keydown', onDocKeydown, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDocKeydown, true)
  // 拖拽途中卸载：移除 document 上的 resize 监听并复位 body 样式
  currentResize?.stop()
  currentResize = null
})

// ===== resizable: 8 方向热区 (四边+四角), 拖拽更新 width/height =====
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type ResizeDir = typeof RESIZE_DIRS[number]
const RESIZE_CURSORS: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
}

const isPercentWidth = typeof props.width === 'string' && props.width.endsWith('%')
const innerWidth = ref<number>(
  typeof props.width === 'number'
    ? props.width
    : (isPercentWidth ? 520 : (parseInt(String(props.width)) || 520)),
)
const innerHeight = ref<number | ''>('')
/** 用户拖过热区后宽度转为 px 锚定 (百分比宽度不具备逐帧改写能力) */
const resized = ref(false)

const dialogWidth = computed(() => {
  // 全屏判 innerFullscreen (钮切换态), 走 EP is-fullscreen 的 100% 几何
  if (innerFullscreen.value) return undefined
  if (resized.value) return innerWidth.value + 'px'
  if (isPercentWidth) return props.width as string
  return innerWidth.value + 'px'
})

// height: resizable 手柄 > prop > auto
const dialogHeightStyle = computed<string | undefined>(() => {
  if (innerFullscreen.value) return undefined
  if (innerHeight.value) return innerHeight.value + 'px'
  if (props.height !== undefined) {
    return typeof props.height === 'number' ? props.height + 'px' : props.height
  }
  return undefined
})

/**
 * Windows 窗体式拖拽: 起拖时量 dialog 实际渲染尺寸 (支持 %/auto 高度),
 * 按方向累计位移后夹到 [min, ∞). 锚定策略 = 跟随 el-dialog 自身定位
 * (alignCenter 下围绕中心缩放, 非 alignCenter 下顶边锚定) —— 布局由 flex/margin
 * 实时收敛, 连续更新不会跳变. 纵向拖拽会把 auto 高度转为定值; 纯横向拖拽不动高度.
 */
/**
 * 当前拖拽会话的清理句柄 —— 组件在拖拽途中卸载时必须移除 document 上的
 * pointermove/up/cancel 监听，否则泄漏（且 onMove 会继续写已销毁组件的 ref）。
 * （gateway4j 早期已修过该缺陷；ldx2 快照版在多方向重构中丢失了卸载清理。）
 */
let currentResize: { stop: () => void } | null = null

function startResize(e: PointerEvent, dir: ResizeDir) {
  if (innerFullscreen.value || e.button !== 0) return
  e.preventDefault()
  const dialogEl = (e.currentTarget as HTMLElement).closest('.el-dialog') as HTMLElement | null
  const rect = dialogEl?.getBoundingClientRect()
  const startW = Math.round(rect?.width || innerWidth.value || props.minWidth)
  const startH = Math.round(rect?.height || 0)
  const startX = e.clientX
  const startY = e.clientY
  resized.value = true
  innerWidth.value = startW
  const touchVertical = dir.includes('n') || dir.includes('s')
  if (touchVertical && startH > 0) innerHeight.value = startH

  // 拖拽期间: 禁选中 + iframe 让事件 + 光标钉死当前方向 (类挂 body, CSS 守护要求 .fc- 前缀选择器)
  const prevCursor = document.body.style.cursor
  document.body.style.cursor = RESIZE_CURSORS[dir]
  document.body.classList.add('fc-resizing')

  function onMove(ev: PointerEvent) {
    let w = startW
    let h = startH
    if (dir.includes('e')) w = startW + (ev.clientX - startX)
    else if (dir.includes('w')) w = startW - (ev.clientX - startX)
    if (dir.includes('s')) h = startH + (ev.clientY - startY)
    else if (dir.includes('n')) h = startH - (ev.clientY - startY)
    innerWidth.value = Math.max(props.minWidth, Math.round(w))
    if (touchVertical) {
      innerHeight.value = Math.max(props.minHeight, Math.round(h))
    }
    emit('resize', innerWidth.value, innerHeight.value)
  }
  function onUp() {
    stopResize()
  }
  function stopResize() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    document.body.style.cursor = prevCursor
    document.body.classList.remove('fc-resizing')
    currentResize = null
  }
  currentResize = { stop: stopResize }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}
</script>

<template>
  <el-dialog
    v-model="innerOpen"
    :title="withHeader ? title : undefined"
    :width="dialogWidth"
    :align-center="alignCenter"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :show-close="showClose"
    :draggable="draggable"
    :fullscreen="innerFullscreen"
    :append-to-body="appendToBody"
    :destroy-on-close="destroyOnClose"
    :modal-class="modalClass"
    :class="dialogClassFull"
    :body-class="bodyClass"
    :style="{ height: dialogHeightStyle }"
    :before-close="(done: () => void) => { emit('before-close'); done() }"
    @closed="handleClosed"
  >
    <!-- 自定义 header: fallback 复刻 EP 标题语义 (id/role/level/class), 并排注入全屏钮 -->
    <template #header="{ titleId, titleClass }">
      <div class="fc-dialog__header" :class="{ 'has-fsbtn': showFullscreenToggle }">
        <slot name="header" :close="handleClose">
          <!-- withHeader=false 时也保留空标题占位: EP 的 aria-labelledby 指向 titleId -->
          <span
            :id="titleId"
            role="heading"
            aria-level="2"
            :class="[titleClass, 'fc-dialog__title']"
          >{{ withHeader ? title : '' }}</span>
        </slot>
        <button
          v-if="showFullscreenToggle"
          type="button"
          class="fc-dialog__fsbtn"
          :aria-label="fullscreenLabel"
          :title="fullscreenLabel"
          @click="toggleFullscreen"
          @mousedown.stop
        >
          <i :class="innerFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'" aria-hidden="true" />
        </button>
      </div>
    </template>
    <slot :close="handleClose" />
    <template v-if="resizable && !innerFullscreen">
      <span
        v-for="dir in RESIZE_DIRS"
        :key="dir"
        class="fc-dialog__resize-handle"
        :data-dir="dir"
        aria-hidden="true"
        @pointerdown="startResize($event, dir)"
        @mousedown.stop
      />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" :close="handleClose" />
    </template>
  </el-dialog>
</template>

<style>
/* 非 scoped: el-dialog teleport 到 body 后 scoped 失效, 用全局选择器 */
.fc-dialog.el-dialog {
  border-radius: var(--brand-radius-lg, var(--app-radius-lg));
  overflow: hidden;
}

/* 全屏: 铺满视口 + 去圆角 + 恢复滚动 (盖过基类的 overflow:hidden, 特异性优先) */
.fc-dialog.el-dialog.is-fullscreen {
  border-radius: 0;
  overflow: auto;
}

.fc-dialog .el-dialog__header {
  padding: var(--space-md) var(--space-lg);
  margin: 0;
  border-bottom: 1px solid var(--app-separator);
}

/* 有全屏钮时标题右让位: 关闭钮 48 + 全屏钮 48 (+header 自身右 padding) */
.fc-dialog .fc-dialog__header.has-fsbtn {
  padding-right: calc(var(--el-dialog-padding-primary, 16px) + 48px);
}

.fc-dialog .el-dialog__title,
.fc-dialog .fc-dialog__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary);
}

.fc-dialog .el-dialog__body {
  padding: var(--space-lg);
  color: var(--app-text-secondary);
}

.fc-dialog .el-dialog__footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--app-separator);
}

/* ===== 全屏切换钮: 与 EP 关闭钮同规格 (48x48), 钉在其左侧 ===== */
.fc-dialog__fsbtn {
  position: absolute;
  top: 0;
  right: 48px;
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  color: var(--app-text-secondary, var(--el-text-color-secondary));
  border-radius: var(--app-radius-sm, 8px);
  z-index: 2;
}
.fc-dialog__fsbtn:hover {
  color: var(--app-primary, var(--el-color-primary));
  background: var(--app-bg-muted);
}
.fc-dialog__fsbtn:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: -2px;
}

/* ===== 拖拽热区: 四边 6px 带 + 四角 16x16 (角压边, 命中优先) ===== */
.fc-dialog__resize-handle {
  position: absolute;
  z-index: 3;
  touch-action: none;
}
.fc-dialog__resize-handle[data-dir='n'] { top: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
.fc-dialog__resize-handle[data-dir='s'] { bottom: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
.fc-dialog__resize-handle[data-dir='e'] { top: 0; bottom: 0; right: 0; width: 6px; cursor: ew-resize; }
.fc-dialog__resize-handle[data-dir='w'] { top: 0; bottom: 0; left: 0; width: 6px; cursor: ew-resize; }
.fc-dialog__resize-handle[data-dir='ne'] { top: 0; right: 0; width: 16px; height: 16px; cursor: nesw-resize; }
.fc-dialog__resize-handle[data-dir='se'] { bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; }
.fc-dialog__resize-handle[data-dir='nw'] { top: 0; left: 0; width: 16px; height: 16px; cursor: nwse-resize; }
.fc-dialog__resize-handle[data-dir='sw'] { bottom: 0; left: 0; width: 16px; height: 16px; cursor: nesw-resize; }

/* 拖拽期间 (body.fc-resizing): 禁止文本选中 + iframe 不抢指针事件 */
.fc-resizing,
.fc-resizing * {
  user-select: none;
  -webkit-user-select: none;
}
.fc-resizing iframe {
  pointer-events: none !important;
}
</style>
