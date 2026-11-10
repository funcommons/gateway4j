<template>
  <div class="v2-shell">
    <!-- 窄视口（≤768px）遮罩：点按收抽屉；≥769px 整体 display:none，宽屏零影响 -->
    <div class="v2-scrim" :class="{ 'is-on': sideOpen }" aria-hidden="true" data-testid="v2-scrim" @click="closeSide" />
    <aside id="v2-side" class="v2-side" :class="{ 'is-open': sideOpen }">
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
              @click.prevent="onNav(item.path)"
            >
              <FcIcon :name="item.icon" :size="15" />
              <span class="v2-nav-item-label">{{ t(item.labelKey) }}</span>
            </a>
          </template>
          <p v-else class="v2-nav-empty">{{ t('v2.nav.systemEmpty') }}</p>
        </div>
      </nav>
    </aside>
    <div class="v2-main">
      <header class="v2-top">
        <!-- 窄视口抽屉开关（≥769px display:none） -->
        <FcButton
          class="v2-menu-btn"
          variant="text"
          size="sm"
          :aria-label="t('v2.topbar.menu')"
          :aria-expanded="sideOpen"
          aria-controls="v2-side"
          data-testid="v2-menu-btn"
          @click="sideOpen = !sideOpen"
        >
          <FcIcon name="ri-menu-line" :size="16" />
        </FcButton>
        <div class="v2-crumb">
          <span class="v2-crumb-root">{{ t('app.shortTitle') }}</span>
          <span class="v2-crumb-sep" aria-hidden="true"></span>
          <b class="v2-crumb-current" data-testid="v2-breadcrumb-current">{{ crumbTitle }}</b>
        </div>
        <!-- OPT-2: ⌘K 命令面板触发器（非文本输入形态，内部禁 <input>；面板本体见模板尾部常驻挂载） -->
        <div
          class="v2-top-search"
          data-testid="v2-topbar-search"
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          :aria-expanded="cmdOpen"
          @click="cmdOpen = true"
          @keydown.enter.prevent="cmdOpen = true"
          @keydown.space.prevent="cmdOpen = true"
        >
          <FcIcon name="ri-search-line" :size="14" />
          <span>{{ t('v2.topbar.searchPlaceholder') }}</span>
          <kbd class="v2-top-kbd">{{ t('v2.topbar.kbd') }}</kbd>
        </div>
        <div class="v2-top-actions">
          <FcButton variant="text" size="sm" :aria-label="t('v2.topbar.notifications')" data-testid="v2-topbar-notice">
            <FcIcon name="ri-notification-line" :size="15" />
          </FcButton>
          <!-- P4e-0 顶栏三入口：主题（FcThemeSwitcher，inject Provider）/ 语言 / 登出 -->
          <span class="v2-top-theme" data-testid="v2-theme-switch"><FcThemeSwitcher /></span>
          <FcButton variant="text" size="sm" :aria-label="t('v2.topbar.lang')" data-testid="v2-lang-switch" @click="toggleLocale">
            <FcIcon name="ri-translate-2" :size="15" />
          </FcButton>
          <FcButton variant="text" size="sm" data-testid="v2-logout" @click="onLogout">
            {{ t('v2.topbar.logout') }}
          </FcButton>
          <span class="v2-top-avatar" role="img" :aria-label="t('v2.topbar.user')">
            <FcIcon name="ri-user-line" :size="14" />
          </span>
        </div>
      </header>
      <main class="v2-page">
        <router-view />
      </main>
    </div>
    <!-- OPT-2: ⌘K 命令面板常驻挂载（⌘K/Ctrl+K/Esc 全局开关由面板自身监听 window，布局侧不另建监听） -->
    <CommandPalette v-model:open="cmdOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcButton, FcIcon, FcThemeSwitcher, isValidBrand, type ThemeMode } from '@/components'
import CommandPalette from '@/components-v2/command/CommandPalette.vue'
import { usePermission } from '@/composables/usePermission'
import { useAuthStore } from '@/store/auth'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { hasPermission } = usePermission()

/** OPT-2: ⌘K 命令面板开合（面板组件 v-model:open；⌘K/Esc 全局监听在面板内部） */
const cmdOpen = ref(false)

/**
 * 窄视口（≤768px）侧栏抽屉开关（P1-1）。
 * 仅样式收放，不影响路由与导航判定；跳转入口统一走 onNav（先收抽屉再跳）。
 */
const sideOpen = ref(false)

function closeSide() {
  sideOpen.value = false
}

/** 跳转前先收抽屉（宽视口下 sideOpen=false 无副作用） */
async function onNav(path: string) {
  sideOpen.value = false
  await go(path)
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeSide()
}

/** 回到宽视口时收起抽屉，避免残留展开态（scrim/抽屉样式在 ≥769px 不生效，仅清状态） */
const narrowMq: MediaQueryList | undefined =
  typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : undefined

function onMqChange(e: MediaQueryListEvent) {
  if (!e.matches) closeSide()
}

onMounted(() => {
  window.addEventListener('keydown', onDocKeydown)
  // 可选调用：测试环境（jsdom）的 MediaQueryList 可能未实现 addEventListener
  narrowMq?.addEventListener?.('change', onMqChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDocKeydown)
  narrowMq?.removeEventListener?.('change', onMqChange)
})

interface V2NavItem {
  /** 路由 name (V2 前缀), active 态按它判断 */
  name: string
  path: string
  labelKey: string
  icon: string
  /**
   * 可见性兜底权限码（P4a-1）：正常情况从路由 meta.permission 推导（canAccess 与守卫同源）；
   * 仅当路由记录缺 meta（测试桩路由）时回退到该字段，取值与真实路由 meta 一致。
   */
  permission?: string
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
      { name: 'V2RouteWizard', path: '/v2/routes/wizard', labelKey: 'v2.nav.wizard', icon: 'ri-magic-line' },
      // P4c-1：导入导出叶子（路由组第三叶子，向导之后）。permission 字段 = 路由 meta 的同值兜底
      { name: 'V2ImportExport', path: '/v2/import-export', labelKey: 'v2.nav.importExport', icon: 'ri-exchange-line', permission: 'route:edit' }
    ]
  },
  {
    key: 'plugins',
    labelKey: 'v2.nav.group.plugins',
    items: [
      { name: 'V2PluginChain', path: '/v2/plugins/chain', labelKey: 'v2.nav.pluginChain', icon: 'ri-stack-line' },
      // P4a-2：插件管理（插件组中间叶子 —— 链页保持 S1 首位、编辑器深页殿后）。
      // permission 字段 = 路由 meta.permission 的同值兜底（测试桩路由不带 meta）
      { name: 'V2PluginList', path: '/v2/plugins', labelKey: 'v2.nav.pluginList', icon: 'ri-list-check', permission: 'plugin:read' },
      // P4a-1：插件编辑器叶子。permission 字段 = 路由 meta.permission 的同值兜底（测试桩路由
      // 不带 meta，canAccess 优先读 meta、缺省回退到这里；真实路由表两者一致，判据仍与守卫同源）
      { name: 'V2PluginEditor', path: '/v2/plugins/editor', labelKey: 'v2.nav.pluginEditor', icon: 'ri-edit-box-line', permission: 'plugin:edit' }
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
    items: [
      // P4d-1：用户管理叶子（系统组首叶子 —— 首个可见条目落地后 systemEmpty 占位退场）。
      // permission 字段 = 路由 meta.permission 的同值兜底（测试桩路由不带 meta）
      { name: 'V2Users', path: '/v2/users', labelKey: 'v2.nav.users', icon: 'ri-user-settings-line', permission: 'system:user' },
      // P4d-2：角色权限叶子（系统组第二叶子；permission 与路由 meta 同值兜底）
      { name: 'V2Roles', path: '/v2/roles', labelKey: 'v2.nav.roles', icon: 'ri-shield-user-line', permission: 'user:read' },
      // P4d-3：系统设置叶子（系统组第三叶子；permission 与路由 meta 同值兜底）
      { name: 'V2Settings', path: '/v2/settings', labelKey: 'v2.nav.settings', icon: 'ri-settings-3-line', permission: 'system:read' }
    ]
  }
]

/**
 * 侧栏可见性判据与守卫同源 (同 MainLayout 的 canAccessRoute):
 * 从路由自身 meta.permission 推导, 不另写一套权限字符串.
 * meta 缺失时回退到导航条目自带的 permission 字段 (P4a-1, 取值与真实路由 meta 一致).
 */
function canAccess(name: string, fallbackPerm?: string): boolean {
  const record = router.getRoutes().find((r) => String(r.name) === name)
  const perm = (record?.meta?.permission as string | undefined) ?? fallbackPerm
  if (!perm) return true
  return hasPermission(perm)
}

const navGroups = computed(() =>
  NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item.name, item.permission)) })),
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

/** P4e-0 顶栏·语言：zh-CN↔en-US 双向 toggle，gw4j_lang 持久化（src/i18n.ts 启动恢复同款）。 */
function toggleLocale() {
  const next = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  locale.value = next
  localStorage.setItem('gw4j_lang', next)
}

/** P4e-0 顶栏·登出：纯本地登出（旧树 MainLayout onLogout 同款，无后端 API）——
 *  store.logout() 复位状态并清 gw4j_token/gw4j_refresh，随后跳 /login。 */
async function onLogout() {
  useAuthStore().logout()
  await router.push('/login')
}

// —— P4e-0 顶栏·主题兜底上下文 ——
// FcThemeSwitcher 的色板点击依赖 inject('fc-theme')（App.vue 全局 FcThemeProvider 提供）。
// 无 Provider 祖先的挂载形态（单测直挂 LayoutV2 等）inject 落空时，切换器只剩 emit 无处
// 去顶。这里由 LayoutV2 在 inject 落空时自 provide 一个行为对齐 Provider 的兜底上下文：
// DOM 写入同 FcThemeProvider.applyToRoot，持久化同 key/结构（STORAGE_VERSION=1）。
// 有 Provider 时保持沉默（不遮蔽上游上下文），两种挂载形态下顶栏主题切换都可用。
interface FcThemeContext {
  brand: Ref<string>
  theme: Ref<ThemeMode>
  setBrand: (b: string) => void
  setTheme: (t: ThemeMode) => void
}

const THEME_PERSIST_KEY = 'fc-theme-provider'

function readThemePersisted(): { brand?: string; theme?: ThemeMode } {
  try {
    const raw = localStorage.getItem(THEME_PERSIST_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; brand?: string; theme?: ThemeMode }
    if (parsed.v !== 1) return {}
    return parsed
  } catch {
    return {}
  }
}

function applyThemeToRoot(brand: string, theme: ThemeMode) {
  const html = document.documentElement
  html.setAttribute('data-brand', brand)
  html.setAttribute('data-theme', theme)
  html.classList.toggle('dark', theme !== 'light')
}

if (inject<FcThemeContext | null>('fc-theme', null) == null) {
  const stored = readThemePersisted()
  const storedBrand = stored.brand
  const brand = ref<string>(storedBrand != null && isValidBrand(storedBrand) ? storedBrand : 'ldx2')
  const theme = ref<ThemeMode>(stored.theme === 'dark' ? 'dark' : 'light')
  const saveTheme = () => {
    try {
      localStorage.setItem(THEME_PERSIST_KEY, JSON.stringify({ v: 1, brand: brand.value, theme: theme.value }))
    } catch { /* 隐私模式 / 配额 —— 静默 */ }
  }
  provide('fc-theme', {
    brand,
    theme,
    setBrand(b: string) {
      if (!isValidBrand(b)) return
      brand.value = b
      applyThemeToRoot(brand.value, theme.value)
      saveTheme()
    },
    setTheme(mode: ThemeMode) {
      theme.value = mode
      applyThemeToRoot(brand.value, theme.value)
      saveTheme()
    },
  } satisfies FcThemeContext)
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
  /* P1-2: 顶栏回归浅色（原型 01 白底深字）。--app-header-bg 是品牌可换肤 token
     （如 ldx2 品牌为深色表面），配 --app-text-* 深字会深压深；改用主题卡片底 token，
     light/dark（及品牌层）自动翻转，无需按主题写死。描边同理走主题 separator。 */
  background: var(--app-bg-card);
  border-bottom: 1px solid var(--app-separator);
}
/* P1-2: 面包屑深字压浅底 —— 当前段用强调色 */
.v2-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text-primary);
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
  color: var(--app-accent-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 窄视口抽屉开关：默认隐藏，≤768px 显示（见底部断点） */
.v2-menu-btn {
  display: none;
}
/* ⌘K 搜索触发器 (OPT-2: S1 占位 → 命令面板真实入口; 仍保持非文本输入形态, 内部无 <input>) */
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
  cursor: pointer;
}
.v2-top-search:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
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
/* —— 窄视口（≤768px）抽屉化：遮罩 + 侧栏覆盖（P1-1），≥769px 完全不生效 —— */
.v2-scrim {
  display: none;
}
@media (max-width: 768px) {
  .v2-menu-btn {
    display: inline-flex;
  }
  /* P2: 375 窄视口横向溢出收口 —— ⌘K 搜索触发器窄视口仍隐藏（260px 固定宽会把
     .v2-top-actions 顶出视口；面板本体可经 ⌘K 快捷键到达）。
     面包屑改为主轴伸展 (min-width:0 已有, 截断省略), 顶栏动作区仍贴右缘。 */
  .v2-top-search {
    display: none;
  }
  .v2-crumb {
    flex: 1 1 auto;
  }
  .v2-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--app-overlay-strong);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .v2-scrim.is-on {
    opacity: 1;
    pointer-events: auto;
  }
  /* 侧栏从 sticky 列切为覆盖式抽屉：默认移出屏外并 visibility:hidden（键盘不可达），
     is-open 后滑入。过渡只动 transform/opacity/visibility。 */
  .v2-side {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 60;
    flex: 0 0 auto;
    width: 264px;
    max-width: 82vw;
    transform: translateX(-100%);
    visibility: hidden;
    box-shadow: var(--app-shadow-lg);
    transition: transform 0.2s ease, visibility 0.2s;
  }
  .v2-side.is-open {
    transform: translateX(0);
    visibility: visible;
  }
}
/* —— 手机（≤480px）顶栏收口：P4e 三入口把 .v2-top-actions 内容宽顶到 298px ——
   V 轮 375 实测：动作区右缘 x=388（settings/monitor/overview 三页 scrollWidth
   同值 388）—— 页面内容都在各自横滚容器内，唯一溢出源就是壳层顶栏。
   内容宽 298px 逐项对账（zh-CN，与实测一分不差）：
     通知 37（EP small is-text：11+图标15+11）
   + 主题 82（触发钮 58 = 15+外观26+15+描边2，外衬 +24 = FcThemeSwitcher 根节点
     .fc-theme-switcher 基类自带 padding:12px）
   + 语言 37 + 登出 82（钮 70 = 11+退出登录48+11，再 +12 = EP 相邻钮
     .el-button+.el-button{margin-left:12px} 与 flex gap 叠加）
   + 头像 28 + gap 8×4 = 32。
   修法 = 纯收紧、零入口砍除（五入口全部保留；v2-top-search 的 ≤768 display:none
   既有决策不动）：动作区 gap、EP 相邻 margin、按钮水平 padding、主题外衬 padding
   四路收缩 + 顶栏边距收窄，合计确定性 -108px（动作区 298 → 214，右缘 388 → 280）。
   actions 区保持 flex:0 0 auto：让它收缩只会把内容裁出容器，不如收内容本身。
   规则全部锁在 ≤480 断点，>480px（含 768/1440）渲染零变化。 */
@media (max-width: 480px) {
  .v2-top {
    gap: 8px;
    padding: 0 12px;
  }
  .v2-top-actions {
    gap: 4px;
  }
  /* EP 相邻钮自带 margin-left:12px，手机上间距只留 gap 一份 */
  .v2-top-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  .v2-top-actions :deep(.el-button) {
    padding-right: 8px;
    padding-left: 8px;
  }
  /* 主题切换器根节点外衬 12px（组件 scoped 基类）收平，与相邻钮左缘对齐 */
  .v2-top-theme :deep(.fc-theme-switcher) {
    padding: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .v2-nav-item,
  .v2-side,
  .v2-scrim {
    transition: none;
  }
}
</style>
