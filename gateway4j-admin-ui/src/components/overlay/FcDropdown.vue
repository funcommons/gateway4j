<script setup lang="ts">
/**
 * FcDropdown — el-dropdown 薄封装 (SDK).
 *
 * 替代业务页裸用 EP 下拉菜单（表格行内动作「更多」收成真下拉）。
 *
 * 薄封装原则：
 *  - 触发器由业务侧给（#default 槽），EP 的 el-only-child 会把 role/tabindex
 *    挂到触发器元素上 —— 键盘可达（Tab 能落到触发器，Enter/Space 能打开）；
 *  - 菜单项由 items prop 渲染（业务页不必裸用 el-dropdown-item），
 *    也可以用 #dropdown 槽完全自定义（此时 items 失效，与 EP 语义一致：槽优先）；
 *  - 菜单浮层 teleport 到 body，底色/文字/描边走 --app-* token，深浅色自动跟；
 *  - 触发器与菜单项都有 :focus-visible 焦点环（26a），瞬时出现不渐显。
 *
 * 用法:
 *   <FcDropdown
 *     :items="[{ label: '编辑', command: 'edit', icon: 'ri-edit-line' },
 *               { label: '删除', command: 'delete', danger: true, divided: true }]"
 *     @command="onCommand"
 *   >
 *     <template #default>
 *       <FcButton variant="secondary" size="sm">更多</FcButton>
 *     </template>
 *   </FcDropdown>
 */
import { computed } from 'vue'
import FcIcon from '../display/FcIcon.vue'

defineOptions({ name: 'FcDropdown', inheritAttrs: false })

export type FcDropdownCommand = string | number | object

export interface FcDropdownItem {
  /** 菜单文案。 */
  label: string
  /** 点击后回传给 command 事件的取值。不传则用 label。 */
  command?: FcDropdownCommand
  /** 禁用该项。 */
  disabled?: boolean
  /** 在该项上方画分隔线。 */
  divided?: boolean
  /** 危险项（删除等）—— 文字走危险色 token。 */
  danger?: boolean
  /** 前置图标（remixicon class 名，如 'ri-edit-line'）。 */
  icon?: string
}

export type FcDropdownPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

export interface FcDropdownProps {
  /** 触发方式。默认 'click'。 */
  trigger?: 'hover' | 'click'
  /** 菜单弹出位置。默认 'bottom-start'（菜单左边缘对齐触发器左边缘）。 */
  placement?: FcDropdownPlacement
  /** 点击菜单项后关闭菜单。默认 true。 */
  hideOnClick?: boolean
  /** 浮层是否 teleport 到 body。默认 true。 */
  teleported?: boolean
  /** 禁用整个下拉（触发器不可用）。 */
  disabled?: boolean
  /** 菜单项列表（不给 #dropdown 槽时生效）。 */
  items?: FcDropdownItem[]
  /** 浮层自定义 class（与内置的 fc-dropdown-popper 合并）。 */
  popperClass?: string
}

const props = withDefaults(defineProps<FcDropdownProps>(), {
  trigger: 'click',
  placement: 'bottom-start',
  hideOnClick: true,
  teleported: true,
  disabled: false,
  items: () => [],
  popperClass: '',
})

const emit = defineEmits<{
  /** 选中某个菜单项。command 为该项的 command（没给则回传 label）。 */
  command: [command: FcDropdownCommand, event?: Event]
  /** 菜单展开/收起。 */
  'visible-change': [visible: boolean]
}>()

/** 浮层 class：内置 fc-dropdown-popper + 调用方自定义（两者都生效）。 */
const popperClass = computed(() =>
  ['fc-dropdown-popper', props.popperClass].filter(Boolean).join(' '),
)

/**
 * EP 的 dropdown 发的是 `command(command, instance, event)` —— 这里回传
 * `(command, event)`，业务侧 `@command="onCommand"` 拿到的第一个参数就是取值。
 */
function onCommand(command: FcDropdownCommand, _instance: unknown, event: Event) {
  emit('command', command, event)
}
</script>

<template>
  <ElDropdown
    class="fc-dropdown"
    v-bind="$attrs"
    :trigger="trigger"
    :placement="placement"
    :hide-on-click="hideOnClick"
    :teleported="teleported"
    :disabled="disabled"
    :popper-class="popperClass"
    @command="onCommand"
    @visible-change="(v: boolean) => emit('visible-change', v)"
  >
    <!-- 触发器：EP 的 el-only-child 会把 role/tabindex 挂到这块内容上 -->
    <template #default>
      <slot />
    </template>
    <!-- 菜单：给了 #dropdown 槽就用槽（槽优先），否则按 items prop 渲染 -->
    <template #dropdown>
      <slot name="dropdown">
        <ElDropdownMenu>
          <ElDropdownItem
            v-for="it in items"
            :key="String(it.command ?? it.label)"
            :command="it.command ?? it.label"
            :disabled="it.disabled"
            :divided="it.divided"
            :class="{ 'fc-dropdown__item--danger': it.danger }"
          >
            <FcIcon v-if="it.icon" :name="it.icon" class="fc-dropdown__item-icon" />
            <span class="fc-dropdown__item-label">{{ it.label }}</span>
          </ElDropdownItem>
        </ElDropdownMenu>
      </slot>
    </template>
  </ElDropdown>
</template>

<!-- 非 scoped：下拉菜单浮层 teleport 到 body，scoped 对它失效 -->
<style>
/* ===== 触发器 ===== */

/* 26a：焦点环瞬时出现（outline 无 transition），鼠标点击不闪环。
   el-button 自带焦点环（theme.scss 已把 --el-button-outline-color 接到
   --app-focus-ring），这里排除它避免双环。 */
.fc-dropdown :focus-visible:not(.el-button) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

/* 39a：禁用态不只靠 opacity —— 光标 + 透明度双通道 */
.fc-dropdown.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* ===== 菜单浮层（teleport 到 body） ===== */

/* 浮层底色/描边/阴影接应用主题 token —— 深浅色跟着 data-theme 走 */
.fc-dropdown-popper.el-popper {
  background: var(--app-bg-card);
  border-color: var(--app-border);
  box-shadow: var(--app-shadow-md);
}

.fc-dropdown-popper .el-dropdown-menu {
  background-color: var(--app-bg-card);
}

.fc-dropdown-popper .el-dropdown-menu__item {
  color: var(--app-text);
}

/* 26a：EP 把菜单项的 outline 抹掉了，这里补回键盘焦点环（瞬时出现） */
.fc-dropdown-popper .el-dropdown-menu__item:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: -2px;
}

.fc-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover,
.fc-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):focus {
  background-color: var(--app-bg-muted);
  color: var(--app-accent-text);
}

/* 39a：禁用项不只靠颜色 —— 光标也变 not-allowed */
.fc-dropdown-popper .el-dropdown-menu__item.is-disabled {
  color: var(--app-text-tertiary);
  cursor: not-allowed;
}

.fc-dropdown-popper .el-dropdown-menu__item--divided {
  border-top-color: var(--app-border);
}

/* 危险项（删除等）—— 语义色走 --app-color-danger-text */
.fc-dropdown-popper .el-dropdown-menu__item.fc-dropdown__item--danger {
  color: var(--app-color-danger-text);
}

.fc-dropdown-popper .el-dropdown-menu__item.fc-dropdown__item--danger:not(.is-disabled):hover,
.fc-dropdown-popper .el-dropdown-menu__item.fc-dropdown__item--danger:not(.is-disabled):focus {
  background-color: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  color: var(--app-color-danger-text);
}

/* 菜单项图标：与文字同色，继承 danger 语义 */
.fc-dropdown-popper .fc-dropdown__item-icon {
  margin-right: 8px;
  font-size: 16px;
}
</style>
