<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import FcIcon from './FcIcon.vue'

defineOptions({ name: 'FcCollapseItem', inheritAttrs: false })
/**
 * FcCollapseItem — EP 折叠项薄封装 (SDK).
 *
 * 配套 FcCollapse 使用。与裸 EP 折叠项的差别：
 *  - 折叠箭头改用 FcIcon(remixicon `ri-arrow-down-s-line`) 渲染 ——
 *    装饰性图标不用 emoji（Hallmark 30a），也不依赖 EP 图标包的箭头形状;
 *  - 箭头展开时旋转 180°，只动 transform（10a），并带 prefers-reduced-motion 兜底（27）;
 *  - 箭头是纯装饰，标 aria-hidden（33），读屏只读到标题文字。
 *
 * 用法:
 *   <FcCollapseItem name="a" title="标题">内容</FcCollapseItem>
 *   <FcCollapseItem name="b">
 *     <template #title>自定义标题</template>
 *     内容
 *   </FcCollapseItem>
 *   <!-- #title 槽会拿到 EP 的 { isActive }，可据此做展开态样式 -->
 *   <FcCollapseItem name="c">
 *     <template #title="{ isActive }">{{ isActive ? '收起' : '展开' }}</template>
 *     内容
 *   </FcCollapseItem>
 */
export interface FcCollapseItemProps {
  /** 折叠项标识（对应 FcCollapse 的 modelValue 元素）。 */
  name?: string | number
  /** 折叠标题。 */
  title?: string
  /** 禁用该项。 */
  disabled?: boolean
}

const props = defineProps<FcCollapseItemProps>()

const attrs = useAttrs()

const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...(attrs as Record<string, unknown>),
  name: props.name,
  disabled: props.disabled,
}))
</script>

<template>
  <ElCollapseItem class="fc-collapse-item" v-bind="bindAttrs">
    <!--
      title 槽的 slot props 原样转发给业务侧的 #title 槽 ——
      EP 的 collapse-item 会给 title 槽 `{ isActive }`，不转发的话
      业务侧写 `<template #title="{ isActive }">` 永远拿到 undefined。
    -->
    <template #title="slotProps">
      <span class="fc-collapse-item__title">
        <slot name="title" v-bind="slotProps">{{ title }}</slot>
      </span>
    </template>
    <!-- 装饰性箭头：remixicon，不是 emoji；aria-hidden 让读屏跳过 -->
    <template #icon="{ isActive }">
      <!--
        同时挂上 EP 的 `el-collapse-item__arrow` 类 —— 自定义箭头替换掉
        EP 默认箭头后，EP 那个类名就丢了，外部/e2e 按 EP 类名定位会找不到。
        挂上后「EP 默认箭头 / 自定义 FcIcon 箭头」两条路径的类名契约一致。
      -->
      <FcIcon
        name="ri-arrow-down-s-line"
        class="fc-collapse-item__arrow el-collapse-item__arrow"
        :class="{ 'is-active': isActive }"
        aria-hidden="true"
      />
    </template>
    <slot />
  </ElCollapseItem>
</template>

<style scoped lang="scss">
.fc-collapse-item__title {
  /* 长标题不把箭头挤出可视区（49：长文案不折行也不溢出） */
  overflow-wrap: break-word;
  min-width: 0;
}

/* 箭头：自定义 FcIcon 箭头与 EP 默认箭头共用同一套旋转动画。
   （自定义箭头元素同时挂了 `el-collapse-item__arrow`，两条路径类名一致。） */
.fc-collapse-item__arrow {
  font-size: 16px;
  color: var(--app-text-secondary);
  /* 只动 transform —— 不动画 width/height/top/left（10a） */
  transition: transform 0.2s ease;

  &.is-active {
    transform: rotate(180deg);
  }
}

/* 动效兜底（27）：用户关闭动效时箭头不旋转过渡 */
@media (prefers-reduced-motion: reduce) {
  .fc-collapse-item__arrow {
    transition: none;
  }
}
</style>
