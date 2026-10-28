<script setup lang="ts">defineOptions({ name: 'FcMain' })
// FcMain — 应用外壳 (Shell) + 主内容区.
// 三段式布局: #sidebar (左侧导航) / #header (顶栏) / default (主内容).
// host (如 MainLayout) 通过 <template #sidebar> / <template #header> 注入外壳;
// Vue 3 会静默丢弃没有出口的具名插槽, 所以这里必须显式渲染两个 outlet,
// 否则全站侧边栏/顶栏消失 (D1).
// 默认 slot 未传时, 回退到 <router-view> + <keep-alive> + <transition>.

interface Props {
  keepAlive?: boolean
  transitionName?: string
}

const props = withDefaults(defineProps<Props>(), {
  keepAlive: true,
  transitionName: 'fade',
})
</script>

<template>
  <div class="fc-shell">
    <aside v-if="$slots.sidebar" class="fc-shell__aside">
      <slot name="sidebar" />
    </aside>
    <div class="fc-shell__body">
      <header v-if="$slots.header" class="fc-shell__header">
        <slot name="header" />
      </header>
      <main class="fc-main">
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
  background: var(--app-sidebar-bg, var(--el-bg-color, #fff));
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
