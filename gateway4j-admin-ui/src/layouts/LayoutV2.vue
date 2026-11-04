<template>
  <div class="v2-shell">
    <aside class="v2-side">
      <div class="v2-logo">
        <span class="v2-logo-mark" aria-hidden="true"></span>
        <div class="v2-logo-text">
          <b>{{ t('app.shortTitle') }}</b>
          <i>{{ t('v2.nav.subtitle') }}</i>
        </div>
      </div>
      <nav class="v2-nav" :aria-label="t('v2.nav.subtitle')">
        <div v-for="group in navGroups" :key="group.key" class="v2-nav-group">
          <div class="v2-nav-group-label">{{ t(group.labelKey) }}</div>
          <template v-if="group.items.length > 0">
            <a
              v-for="item in group.items"
              :key="item.name"
              class="v2-nav-item"
              :class="{ 'is-active': isActive(item) }"
              :href="item.path"
              :aria-current="isActive(item) ? 'page' : undefined"
              @click.prevent="go(item.path)"
            >
              <FcIcon :name="item.icon" :size="15" />
              <span class="v2-nav-item-label">{{ t(item.labelKey) }}</span>
            </a>
          </template>
          <p v-else class="v2-nav-empty">{{ t('v2.nav.systemEmpty') }}</p>
        </div>
      </nav>
      <div class="v2-side-foot">
        <a class="v2-nav-item" :href="LEGACY_PATH" @click.prevent="goLegacy">
          <FcIcon name="ri-arrow-left-line" :size="15" />
          <span class="v2-nav-item-label">{{ t('v2.layout.backToLegacy') }}</span>
        </a>
      </div>
    </aside>
    <div class="v2-main">
      <header class="v2-top">
        <div class="v2-crumb">
          <span class="v2-crumb-root">{{ t('app.shortTitle') }}</span>
          <span class="v2-crumb-sep" aria-hidden="true"></span>
          <b class="v2-crumb-current" data-testid="v2-breadcrumb-current">{{ crumbTitle }}</b>
        </div>
        <div class="v2-top-search" aria-hidden="true">
          <FcIcon name="ri-search-line" :size="14" />
          <span>{{ t('v2.topbar.searchPlaceholder') }}</span>
          <kbd class="v2-top-kbd">{{ t('v2.topbar.kbd') }}</kbd>
        </div>
        <div class="v2-top-actions">
          <FcButton variant="text" size="sm" :aria-label="t('v2.topbar.notifications')" data-testid="v2-topbar-notice">
            <FcIcon name="ri-notification-line" :size="15" />
          </FcButton>
          <span class="v2-top-avatar" role="img" :aria-label="t('v2.topbar.user')">
            <FcIcon name="ri-user-line" :size="14" />
          </span>
          <FcButton variant="text" size="sm" data-testid="v2-back-legacy" @click="goLegacy">
            {{ t('v2.layout.backToLegacy') }}
          </FcButton>
        </div>
      </header>
      <main class="v2-page">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcButton, FcIcon } from '@/components'
import { usePermission } from '@/composables/usePermission'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { hasPermission } = usePermission()

const LEGACY_PATH = '/routes'

interface V2NavItem {
  /** 路由 name (V2 前缀), active 态按它判断 */
  name: string
  path: string
  labelKey: string
  icon: string
}

interface V2NavGroup {
  key: string
  labelKey: string
  items: V2NavItem[]
}

/**
 * v2 侧栏 IA —— 五组 (总览/路由/插件/可观测/系统), 条目按契约 §1.
 * 带 :id 的页面 (V2RouteDetail / V2DecisionTree / V2Publish) 从路由列表进入,
 * 不做侧栏叶子 —— 与旧版「画布不是侧栏叶子」同一约定 (src/router/index.ts 注释).
 */
const NAV_GROUPS: V2NavGroup[] = [
  {
    key: 'overview',
    labelKey: 'v2.nav.group.overview',
    items: [
      { name: 'V2Overview', path: '/v2/overview', labelKey: 'v2.nav.overview', icon: 'ri-dashboard-line' }
    ]
  },
  {
    key: 'routes',
    labelKey: 'v2.nav.group.routes',
    items: [
      { name: 'V2Routes', path: '/v2/routes', labelKey: 'v2.nav.routes', icon: 'ri-git-branch-line' },
      { name: 'V2RouteWizard', path: '/v2/routes/wizard', labelKey: 'v2.nav.wizard', icon: 'ri-magic-line' }
    ]
  },
  {
    key: 'plugins',
    labelKey: 'v2.nav.group.plugins',
    items: [
      { name: 'V2PluginChain', path: '/v2/plugins/chain', labelKey: 'v2.nav.pluginChain', icon: 'ri-stack-line' }
    ]
  },
  {
    key: 'observability',
    labelKey: 'v2.nav.group.observability',
    items: [
      { name: 'V2Monitor', path: '/v2/monitor', labelKey: 'v2.nav.monitor', icon: 'ri-pulse-line' },
      { name: 'V2Debug', path: '/v2/debug', labelKey: 'v2.nav.debug', icon: 'ri-terminal-line' }
    ]
  },
  {
    key: 'system',
    labelKey: 'v2.nav.group.system',
    items: []
  }
]

/**
 * 侧栏可见性判据与守卫同源 (同 MainLayout 的 canAccessRoute):
 * 从路由自身 meta.permission 推导, 不另写一套权限字符串.
 */
function canAccess(name: string): boolean {
  const record = router.getRoutes().find((r) => String(r.name) === name)
  const perm = record?.meta?.permission as string | undefined
  if (!perm) return true
  return hasPermission(perm)
}

const navGroups = computed(() =>
  NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item.name)) })),
)

/** 参数页高亮归属: 详情/决策树/发布 → 路由列表 (与旧版 SIDEBAR_ROUTE_MAP 同思路). */
const ACTIVE_FALLBACK: Record<string, string> = {
  V2RouteDetail: 'V2Routes',
  V2DecisionTree: 'V2Routes',
  V2Publish: 'V2Routes'
}

const activeName = computed(() => {
  const name = String(route.name ?? '')
  return ACTIVE_FALLBACK[name] ?? name
})

function isActive(item: V2NavItem): boolean {
  return activeName.value === item.name
}

/** 面包屑当前页: 取 route.meta.title (i18n key), 缺省回退 route.name. */
const crumbTitle = computed(() => {
  const key = (route.meta?.title as string | undefined) ?? String(route.name ?? '')
  return key ? t(key) : ''
})

async function go(path: string) {
  await router.push(path)
}

async function goLegacy() {
  await router.push(LEGACY_PATH)
}
</script>

<style scoped>
/* —— 布局骨架 —— */
.v2-shell {
  display: flex;
  min-height: 100vh;
  background: var(--app-bg-page);
  color: var(--app-text);
}
.v2-side {
  flex: 0 0 224px;
  width: 224px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  background: var(--app-sidebar-bg);
  border-right: 1px solid var(--app-separator);
}
.v2-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.v2-page {
  flex: 1;
  padding: 16px 20px;
}
/* —— 侧栏 logo —— */
.v2-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 14px;
}
.v2-logo-mark {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--app-radius-md);
  background: var(--app-primary-fill);
}
.v2-logo-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.v2-logo-text b {
  font-size: 14px;
  color: var(--app-text-primary);
}
.v2-logo-text i {
  font-style: normal;
  font-size: 11.5px;
  color: var(--app-text-secondary);
}
/* —— 侧栏分组导航 —— */
.v2-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px 12px;
  overflow-y: auto;
}
.v2-nav-group + .v2-nav-group {
  margin-top: 10px;
}
.v2-nav-group-label {
  padding: 6px 8px 2px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-text-tertiary);
}
.v2-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: var(--app-text);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}
.v2-nav-item:hover {
  background: var(--app-bg-muted);
}
/* 键盘焦点环: 瞬时出现, 不做渐显 */
.v2-nav-item:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.v2-nav-item.is-active {
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  color: var(--app-accent-text);
  font-weight: 600;
}
.v2-nav-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v2-nav-empty {
  margin: 0;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}
.v2-side-foot {
  padding: 8px;
  border-top: 1px solid var(--app-separator);
}
/* —— 顶栏 —— */
.v2-top {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--app-header-bg);
  border-bottom: 1px solid var(--app-header-border-color);
}
.v2-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}
.v2-crumb-root {
  color: var(--app-text-secondary);
}
.v2-crumb-sep {
  color: var(--app-text-secondary);
  opacity: 0.6;
}
/* 分隔符走 CSS content, 避免 no-raw-text 警告 (见 docs/ui-v2/实施契约.md) */
.v2-crumb-sep::before {
  content: '/';
}
.v2-crumb-current {
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ⌘K 搜索占位 (S1 不可交互, aria-hidden) */
.v2-top-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 260px;
  height: 30px;
  padding: 0 10px;
  margin-left: auto;
  border-radius: var(--app-radius-sm);
  background: var(--app-bg-muted);
  color: var(--app-text-tertiary);
  font-size: 12.5px;
}
.v2-top-search span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v2-top-kbd {
  margin-left: auto;
  padding: 0 5px;
  font-family: inherit;
  font-size: 11px;
  color: var(--app-text-secondary);
  border: 1px solid var(--app-separator);
  border-radius: var(--app-radius-sm);
}
.v2-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.v2-top-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
}
@media (prefers-reduced-motion: reduce) {
  .v2-nav-item {
    transition: none;
  }
}
</style>
