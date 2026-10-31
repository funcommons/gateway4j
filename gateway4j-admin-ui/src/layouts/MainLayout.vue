<template>
  <FcMain>
    <template #sidebar>
      <FcSidebar :collapse="collapsed">
        <FcSidebarNav
          :items="navItems"
          :active-path="activePath"
          :collapse="collapsed"
          @select="onNavSelect"
        />
      </FcSidebar>
    </template>
    <template #header>
      <FcHeader :title="t('app.title')" :collapse="collapsed" @toggle="collapsed = !collapsed">
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
import { useRouter, useRoute } from 'vue-router'
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
import GlobalSearch from '@/components/search/GlobalSearch.vue'
import GlobalCommandPalette from '@/components/GlobalCommandPalette.vue'
import PasswordStaleBanner from '@/components/PasswordStaleBanner.vue'
import { Operation, Connection, Share, Histogram, User, Lock, Box, Grid, Setting } from '@element-plus/icons-vue'

const { t } = useI18n()
const auth = useAuthStore()
const { hasPermission } = usePermission()
const router = useRouter()
const route = useRoute()
const collapsed = ref(false)
/** 命令面板开关 (⌘/Ctrl + J 或顶栏按钮唤起) */
const paletteOpen = ref(false)

const SIDEBAR_ROUTE_MAP: Record<string, string> = {
  Dashboard: '/dashboard',
  Routes: '/routes',
  RouteNew: '/routes',
  RouteEdit: '/routes',
  RouteCanvas: '/routes/:id/canvas',
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

const navItems = useSidebarNavItems({
  groups: [
    { id: 'monitor', labelKey: 'sidebar.dashboard', icon: Histogram, routeNames: ['Dashboard'], visible: () => hasPermission('monitor:read') },
    { id: 'route', labelKey: 'sidebar.routeList', icon: Connection, routeNames: ['Routes'], visible: () => hasPermission('route:read') },
    { id: 'canvas', labelKey: 'sidebar.routeCanvas', icon: Share, routeNames: ['RouteCanvas'], visible: () => hasPermission('route:edit') },
    { id: 'import', labelKey: 'sidebar.routeImport', icon: Operation, routeNames: ['ImportExport'], visible: () => hasPermission('route:edit') },
    { id: 'plugin', labelKey: 'sidebar.pluginList', icon: Box, routeNames: ['Plugins'], visible: () => hasPermission('plugin:read') },
    { id: 'plugin-global', labelKey: 'sidebar.pluginGlobal', icon: Box, routeNames: ['GlobalPlugins'], visible: () => hasPermission('plugin:read') },
    { id: 'user', labelKey: 'sidebar.userList', icon: User, routeNames: ['Users'], visible: () => hasPermission('user:read') },
    { id: 'role', labelKey: 'sidebar.rolePerm', icon: Lock, routeNames: ['Roles'], visible: () => hasPermission('user:read') },
    { id: 'settings', labelKey: 'sidebar.settings', icon: Setting, routeNames: ['Settings'], visible: () => hasPermission('system:read') }
  ]
})

async function onLogout() {
  auth.logout()
  await router.push('/login')
}

async function onNavSelect(p: string) {
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
  gap: 6px;
}
.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 6px;
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
  color: var(--app-primary);
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
