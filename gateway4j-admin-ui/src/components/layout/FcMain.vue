<script setup lang="ts">defineOptions({ name: 'FcMain' })
// FcMain — 应用外壳 (Shell) + 主内容区.
// 三段式布局: #sidebar (左侧导航) / #header (顶栏) / default (主内容).
// host (如 MainLayout) 通过 <template #sidebar> / <template #header> 注入外壳;
// Vue 3 会静默丢弃没有出口的具名插槽, 所以这里必须显式渲染两个 outlet,
// 否则全站侧边栏/顶栏消失 (D1).
// 默认 slot 未传时, 回退到 <router-view> + <keep-alive> + <transition>.
// 默认 slot (或内置 router-view 回退) 整体包在 FcErrorBoundary 里:
// 业务视图渲染异常时展示兜底 UI (重试/重置), 而不是整页白屏.

import FcErrorBoundary from '../utils/FcErrorBoundary.vue'

export interface FcMainProps {
  keepAlive?: boolean
  transitionName?: string
  /**
   * 窄屏（≤768px）抽屉侧栏是否展开。桌面端忽略该值 ——
   * 桌面是常驻侧栏 + 图标轨折叠，不需要抽屉。
   */
  drawerOpen?: boolean
}

const props = withDefaults(defineProps<FcMainProps>(), {
  keepAlive: true,
  transitionName: 'fade',
  drawerOpen: false,
})

const emit = defineEmits<{
  /** 窄屏点遮罩时关闭抽屉. */
  'drawer-close': []
}>()
</script>

<template>
  <div class="fc-shell" :class="{ 'is-drawer-open': drawerOpen }">
    <aside v-if="$slots.sidebar" class="fc-shell__aside">
      <slot name="sidebar" />
    </aside>
    <div v-if="drawerOpen" class="fc-shell__scrim" @click="emit('drawer-close')" />
    <div class="fc-shell__body">
      <header v-if="$slots.header" class="fc-shell__header">
        <slot name="header" />
      </header>
      <main class="fc-main">
        <FcErrorBoundary class="fc-main__boundary">
          <slot>
            <router-view v-slot="{ Component }">
              <transition :name="transitionName" mode="out-in">
                <keep-alive v-if="keepAlive">
                  <component :is="Component" />
                </keep-alive>
                <component v-else :is="Component" />
              </transition>
            </router-view>
          </slot>
        </FcErrorBoundary>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fc-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  /* 主题感知底色, 避免侧栏下方空隙露出白底 */
  background: var(--app-bg-page);
}
.fc-shell__aside {
  flex-shrink: 0;
  /* 与 .fc-sidebar 同底色, 兜住 sidebar 定高 (calc(100vh - 56px)) 下方留白 */
  display: flex;
  flex-direction: column;
  background: var(--app-sidebar-bg, var(--el-bg-color));
}
.fc-shell__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.fc-shell__header {
  flex-shrink: 0;
}
.fc-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  /* 主题感知背景, 跟着 html[data-theme] 切换; --app-main-bg 在 brands/_*.scss 里定义,
     缺省回退到 --app-bg-page (light/dark/orange-black 各自的 page 底色). */
  background: var(--app-main-bg, var(--app-bg-page));
  color: var(--app-text);
  transition: background 0.25s ease, color 0.25s ease;
}
/* 错误边界包裹层: 撑满主内容区 (flex:1 + min-height:0), 让业务页的
   百分比高度 (如 404 页 min-height:100%) 仍能解析; 内部 DOM 类名不变. */
.fc-main__boundary {
  flex: 1;
  min-height: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.js .fade-enter-from,
.js .fade-leave-to {
  opacity: 0;
}

/* ---- 窄屏（≤768px）：侧栏改成抽屉 ----
 * 桌面是常驻侧栏（240px）+ 64px 图标轨；手机上常驻 240px 会把内容压到
 * 166px，表格与表单全废。改成覆盖式抽屉：默认滑出屏外，顶栏汉堡按钮
 * （FcHeader 的 toggle-sidebar）打开，点遮罩关闭。 */
@media (max-width: 768px) {
  .fc-shell {
    position: relative;
  }

  .fc-shell__aside {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 40;
    width: min(280px, 82vw);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: var(--app-shadow-lg);
  }

  .fc-shell.is-drawer-open .fc-shell__aside {
    transform: none;
  }

  .fc-shell__scrim {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: var(--app-overlay-softer);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fc-shell__aside {
    transition: none;
  }
}
</style>
