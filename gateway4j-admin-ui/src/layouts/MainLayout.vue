<template>
  <FcMain :drawer-open="drawerOpen" @drawer-close="drawerOpen = false">
    <template #sidebar>
      <FcSidebar :collapse="isMobile ? false : collapsed" @update:collapsed="collapsed = $event">
        <FcSidebarNav
          :items="navItems"
          :active-path="activePath"
          :collapse="isMobile ? false : collapsed"
          @select="onNavSelect"
        />
      </FcSidebar>
    </template>
    <template #header>
      <FcHeader :title="t('app.title')" :collapse="isMobile ? !drawerOpen : collapsed" @toggle-sidebar="onToggleSidebar">
        <template #search>
          <GlobalSearch />
        </template>
        <template #actions>
          <!-- H7b T1：环境切换器（外观按钮旁；404 降级时整体不渲染） -->
          <EnvironmentSwitcher />
          <!-- 命令面板入口（⌘/Ctrl + J，与 ⌘K 全局搜索并存） -->
          <FcButton
            variant="secondary"
            class="command-palette-trigger"
            data-testid="command-palette-trigger"
            @click="paletteOpen = true"
          >
            <span class="command-palette-trigger__content">
              <FcIcon name="ri-command-line" />
              <span>{{ t('ux.command-palette.trigger') }}</span>
            </span>
          </FcButton>
          <FcThemeSwitcher />
          <FcButton variant="text" @click="onLogout">{{ t('auth.logout') }}</FcButton>
        </template>
      </FcHeader>
    </template>
    <!-- P2-9 弱口令横幅：顶栏下方常驻，不阻断导航 -->
    <PasswordStaleBanner />
    <nav
      v-if="$route.meta.titleKey"
      class="breadcrumb-bar"
      data-testid="breadcrumb"
    >
      <a class="breadcrumb-bar__home" data-testid="breadcrumb-home" @click.prevent="goHome">{{ t('common.home') }}</a>
      <span class="breadcrumb-bar__sep">/</span>
      <span class="breadcrumb-bar__current" data-testid="breadcrumb-current">{{ t(($route.meta.titleKey as string)) }}</span>
    </nav>
    <FcSectionHeader v-if="$route.meta.titleKey" :title="t(($route.meta.titleKey as string))" :back="false" />
    <router-view />
  </FcMain>
  <!-- 命令面板挂在 FcMain 之外 (fixed 定位, 不受 .fc-main 的 overflow 影响) -->
  <GlobalCommandPalette v-model:open="paletteOpen" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { RouteRecordNormalized } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  FcMain,
  FcSidebar,
  FcSidebarNav,
  FcHeader,
  FcSectionHeader,
  FcButton,
  FcIcon,
  FcThemeSwitcher,
  EnvironmentSwitcher,
  useSidebarNavItems
} from '@/components'
import { useAuthStore } from '@/store/auth'
import { usePermission } from '@/composables/usePermission'
import { useResponsive } from '@/components/utils/useResponsive'
import GlobalSearch from '@/components/search/GlobalSearch.vue'
import GlobalCommandPalette from '@/components/GlobalCommandPalette.vue'
import PasswordStaleBanner from '@/components/PasswordStaleBanner.vue'
import {
  Operation, Connection, Share, Histogram, User, UserFilled, Lock, Box, Grid, Setting,
  Tickets, Files, Cpu
} from '@element-plus/icons-vue'

const { t } = useI18n()
const auth = useAuthStore()
const { hasPermission } = usePermission()
const router = useRouter()
const route = useRoute()
const collapsed = ref(false)
/**
 * 窄屏抽屉侧栏开关。
 * 之前顶栏的汉堡按钮（FcHeader 发的 toggle-sidebar）与侧栏自身的折叠按钮
 * （FcSidebar 发的 update:collapsed）都没有人接 —— 侧栏折叠完全失灵；
 * 窄屏下常驻 240px 侧栏又把内容压到 166px。现在两条线都接上：
 * 窄屏开抽屉，桌面切图标轨。
 */
const drawerOpen = ref(false)
const { isMobile } = useResponsive()

function onToggleSidebar() {
  if (isMobile.value) drawerOpen.value = !drawerOpen.value
  else collapsed.value = !collapsed.value
}
/** 命令面板开关 (⌘/Ctrl + J 或顶栏按钮唤起) */
const paletteOpen = ref(false)

const SIDEBAR_ROUTE_MAP: Record<string, string> = {
  Dashboard: '/dashboard',
  Routes: '/routes',
  RouteNew: '/routes',
  RouteEdit: '/routes',
  // 画布是「某一条路由」的编辑器 (URL 必须带真实 route id), 不是顶层菜单项.
  // 侧栏没有对应叶子, 高亮归属到「路由列表」, 与 RouteNew / RouteEdit 一致.
  RouteCanvas: '/routes',
  ImportExport: '/import-export',
  Plugins: '/plugins',
  PluginNew: '/plugins',
  PluginEdit: '/plugins',
  GlobalPlugins: '/plugins/global',
  BuiltinPlugins: '/plugins/builtin',
  Users: '/users',
  Roles: '/roles',
  Settings: '/settings'
}

const activePath = computed(() => SIDEBAR_ROUTE_MAP[String(route.name)] ?? route.path)

/**
 * 侧栏图标表: meta.icon / group.iconName 里写的名字 -> EP 图标组件.
 * 只在这里维护一份, 路由表里存的是字符串 (见 src/router/index.ts 的 meta.icon).
 */
const SIDEBAR_ICONS: Record<string, Component> = {
  Histogram, Connection, Share, Operation, Box, Grid, Setting, Tickets, Files, Cpu, User, UserFilled, Lock
}

const iconResolver = (name: string): Component | null => SIDEBAR_ICONS[name] ?? null

/**
 * 侧栏可见性判据 —— 与路由守卫 **同源** (src/router/index.ts 的 beforeEach).
 *
 * 守卫的判据是:
 *   const perm = to.meta.permission
 *   if (perm && !auth.permissions.some(p => p.permission_code === perm)) return false  // 中止跳转
 * 侧栏的判据必须与它逐字一致, 否则会出现「侧栏看得见, 点进去被守卫弹『无权限』」的假入口
 * (历史上就踩过: 用户组按 user:read 放行, 而 /users 路由要 system:user).
 *
 * 因此侧栏 **不再另写一套权限字符串**: 一律从路由自己的 meta.permission 推导.
 * - 路由声明了 permission -> 必须持有该权限码, 否则不可见;
 * - 路由没声明 permission -> 守卫也不拦它, 侧栏同样不拦.
 */
function canAccessRoute(route: RouteRecordNormalized | undefined): boolean {
  if (!route) return false
  const perm = (route.meta as { permission?: string } | undefined)?.permission
  if (!perm) return true
  return hasPermission(perm)
}

/** 按 route.name 取路由记录 (组级 visible 判定用). */
function routeByName(name: string): RouteRecordNormalized | undefined {
  return router.getRoutes().find((r) => String(r.name) === name)
}

/** 组 / 顶层规则可见 = 其叶子中「至少一个」对当前用户可进入 (OR). */
function anyAccessible(names: string[]): boolean {
  return names.some((n) => canAccessRoute(routeByName(n)))
}

/**
 * 侧栏信息架构 (IA) —— 5 个顶层项 / 9 个叶子:
 *
 *   监控大盘            (叶子)
 *   路由管理            (组) 路由列表 / 导入导出
 *   插件管理            (组) 插件列表 / 全局插件 / 内置插件
 *   用户管理            (组) 用户列表 / 角色权限
 *   系统设置            (叶子)
 *
 * 说明:
 * - 组名与叶子名不再重名 (组名用 sidebar.route / sidebar.plugin / sidebar.user).
 * - 「路由编排画布」**不在侧栏**: 画布是某一条路由的编辑器, URL 必须带真实 route id
 *   (/routes/:id/canvas 里的 :id 是路径模板, 不是真实 id), 作为顶层菜单项是概念错误.
 *   正路是路由列表行内的「画布」按钮, 路由本身 (RouteCanvas) 完全保留.
 * - order 让顶层叶子与分组混合排序 (否则 SDK 默认「叶子全在前、分组全在后」,
 *   叶子就夹不到分组中间). 未声明 order 的规则排最后.
 * - 可见性一律走 canAccessRoute (路由 meta.permission), 与守卫同源:
 *   路由列表 route:read / 导入导出 route:edit / 插件三个 plugin:read /
 *   用户列表 system:user / 角色权限 user:read / 监控大盘 monitor:read / 系统设置 system:read.
 */
const navItems = useSidebarNavItems({
  iconResolver,
  topLevels: [
    { routeNames: ['Dashboard'], visible: () => anyAccessible(['Dashboard']), leafFilter: canAccessRoute, order: 10 },
    { routeNames: ['Settings'], visible: () => anyAccessible(['Settings']), leafFilter: canAccessRoute, order: 50 }
  ],
  groups: [
    {
      id: 'route',
      labelKey: 'sidebar.route',
      iconName: 'Connection',
      routeNames: ['Routes', 'ImportExport'],
      visible: () => anyAccessible(['Routes', 'ImportExport']),
      leafFilter: canAccessRoute,
      order: 20
    },
    {
      id: 'plugin',
      labelKey: 'sidebar.plugin',
      iconName: 'Box',
      routeNames: ['Plugins', 'GlobalPlugins', 'BuiltinPlugins'],
      visible: () => anyAccessible(['Plugins', 'GlobalPlugins', 'BuiltinPlugins']),
      leafFilter: canAccessRoute,
      order: 30
    },
    {
      id: 'user',
      labelKey: 'sidebar.user',
      iconName: 'User',
      routeNames: ['Users', 'Roles'],
      visible: () => anyAccessible(['Users', 'Roles']),
      leafFilter: canAccessRoute,
      order: 40
    }
  ]
})

async function onLogout() {
  auth.logout()
  await router.push('/login')
}

async function onNavSelect(p: string) {
  // 窄屏抽屉：选完就收起，否则抽屉盖住刚跳过去的页面
  if (isMobile.value) drawerOpen.value = false
  await router.push(p)
}

// T2: 面包屑「首页」点击回路由列表
async function goHome() {
  try {
    await router.push('/routes')
  } catch {
    // 导航被路由守卫拦截时静默忽略
  }
}
</script>

<style scoped>
.command-palette-trigger__content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--app-text-secondary);
  margin: 0 0 8px;
}
.breadcrumb-bar__home {
  cursor: pointer;
  color: var(--app-text-secondary);
  text-decoration: none;
  transition: color 0.2s;
}
.breadcrumb-bar__home:hover {
  color: var(--app-accent-text);
}
/* 键盘焦点环: 瞬时出现, 不做渐显 */
.breadcrumb-bar__home:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
/* 按下反馈 */
.breadcrumb-bar__home:active {
  color: var(--app-primary-active);
}
.breadcrumb-bar__sep {
  color: var(--app-text-secondary);
  opacity: 0.6;
}
.breadcrumb-bar__current {
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
