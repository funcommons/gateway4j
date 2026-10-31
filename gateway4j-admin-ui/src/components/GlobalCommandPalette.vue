<script setup lang="ts">
defineOptions({ name: 'GlobalCommandPalette' })
/**
 * GlobalCommandPalette — 全局命令面板 (⌘/Ctrl + J).
 *
 * 与 GlobalSearch (⌘K, 数据搜索) 并存 —— 不替换、不改动它:
 *   - GlobalSearch : 搜「数据」(路由 / 插件 / 用户)
 *   - 本面板        : 搜「动作」(页面跳转 + 快捷动作)
 *
 * 特性:
 *  - 快捷键 ⌘/Ctrl + J (与 ⌘K 不冲突); Esc 关闭由 FcCommandPalette 内部处理
 *  - 命令按权限过滤 (usePermission.hasPermission, 与侧栏可见性保持一致)
 *  - 目标路由不存在 (router.hasRoute = false) 的命令自动跳过
 *  - 文案全部走 i18n (labelKey), 面板本体不写死中文
 *
 * 用法 (MainLayout 挂一次):
 *   <GlobalCommandPalette v-model:open="paletteOpen" />
 */
import { computed, inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcCommandPalette, type CommandItem, type ThemeMode } from '@/components'
import { usePermission } from '@/composables/usePermission'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import { listRoutes } from '@/api/routes'

interface ThemeContext {
  brand: Ref<string>
  theme: Ref<ThemeMode>
  setBrand: (b: string) => void
  setTheme: (t: ThemeMode) => void
}

interface CommandDef {
  /** 唯一 id */
  id: string
  /** i18n key (展示文案) */
  labelKey: string
  /** remix-icon class */
  icon: string
  /** 需要的权限码 (与侧栏可见性一致); 空 = 所有人可见 */
  permission?: string
  /** 目标路由名 (router.hasRoute 为 false 时该命令不出现) */
  routeName?: string
  /** 静态目标路径 */
  path?: string
  /** 自定义执行 (优先于 path) */
  run?: () => void | Promise<void>
  /** 搜索关键词 (补充 label 之外的检索入口) */
  keywords?: string[]
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const { t } = useI18n()
const router = useRouter()
const { hasPermission } = usePermission()

// FcThemeProvider 通过 provide('fc-theme') 下发主题上下文; 没有 Provider 时主题命令不出现
const themeCtx = inject<ThemeContext | null>('fc-theme', null)

// ===== 页面跳转 =====
const NAV_COMMANDS: CommandDef[] = [
  { id: 'nav.dashboard', labelKey: 'sidebar.dashboard', icon: 'ri-dashboard-3-line', permission: 'monitor:read', routeName: 'Dashboard', path: '/dashboard', keywords: ['dashboard', 'monitor'] },
  { id: 'nav.routes', labelKey: 'sidebar.routeList', icon: 'ri-list-check-line', permission: 'route:read', routeName: 'Routes', path: '/routes', keywords: ['route', 'list'] },
  { id: 'nav.canvas', labelKey: 'sidebar.routeCanvas', icon: 'ri-share-forward-line', permission: 'route:edit', routeName: 'RouteCanvas', run: openRouteCanvas, keywords: ['canvas', 'flow'] },
  { id: 'nav.importExport', labelKey: 'sidebar.routeImport', icon: 'ri-arrow-left-right-line', permission: 'route:edit', routeName: 'ImportExport', path: '/import-export', keywords: ['import', 'export'] },
  { id: 'nav.plugins', labelKey: 'sidebar.pluginList', icon: 'ri-plug-line', permission: 'plugin:read', routeName: 'Plugins', path: '/plugins', keywords: ['plugin'] },
  { id: 'nav.pluginsGlobal', labelKey: 'sidebar.pluginGlobal', icon: 'ri-global-line', permission: 'plugin:read', routeName: 'GlobalPlugins', path: '/plugins/global', keywords: ['global', 'plugin'] },
  { id: 'nav.pluginsBuiltin', labelKey: 'sidebar.pluginBuiltin', icon: 'ri-stack-line', permission: 'plugin:read', routeName: 'BuiltinPlugins', path: '/plugins/builtin', keywords: ['builtin', 'plugin'] },
  { id: 'nav.users', labelKey: 'sidebar.userList', icon: 'ri-user-3-line', permission: 'user:read', routeName: 'Users', path: '/users', keywords: ['user'] },
  { id: 'nav.roles', labelKey: 'sidebar.rolePerm', icon: 'ri-shield-user-line', permission: 'user:read', routeName: 'Roles', path: '/roles', keywords: ['role', 'permission'] },
  { id: 'nav.settings', labelKey: 'sidebar.settings', icon: 'ri-settings-3-line', permission: 'system:read', routeName: 'Settings', path: '/settings', keywords: ['setting', 'config'] }
]

// ===== 快捷动作 =====
const ACTION_COMMANDS: CommandDef[] = [
  { id: 'action.route.create', labelKey: 'route.createTitle', icon: 'ri-add-line', permission: 'route:edit', routeName: 'RouteNew', path: '/routes/new', keywords: ['new', 'create', 'route'] },
  { id: 'action.plugin.create', labelKey: 'plugin.createTitle', icon: 'ri-add-line', permission: 'plugin:edit', routeName: 'PluginNew', path: '/plugins/new', keywords: ['new', 'create', 'plugin'] }
]

const THEME_COMMAND: CommandDef = {
  id: 'action.theme.toggle',
  labelKey: 'ux.command-palette.toggleTheme',
  icon: 'ri-contrast-2-line',
  run: () => {
    if (!themeCtx) return
    themeCtx.setTheme(themeCtx.theme.value === 'dark' ? 'light' : 'dark')
  }
}

// ===== 路由跳转 =====
async function go(path: string) {
  try {
    await router.push(path)
  } catch {
    // 路由守卫拦截 (无权限 / 重定向) 时静默忽略
  }
}

/** 画布需要具体路由 id: 取第一棵路由的画布; 拉取失败则退回路由列表. */
async function openRouteCanvas() {
  try {
    const tree = (await listRoutes()) as any
    const first = flattenRoutes(tree)[0]
    if (first?.id) {
      await go(`/routes/${first.id}/canvas`)
      return
    }
  } catch {
    // 拉取失败 → 退回路由列表
  }
  await go('/routes')
}

function flattenRoutes(nodes: any, out: any[] = []): any[] {
  for (const n of nodes || []) {
    out.push(n)
    if (Array.isArray(n.children) && n.children.length) flattenRoutes(n.children, out)
  }
  return out
}

// ===== 命令装配 =====
function allowed(c: CommandDef): boolean {
  if (c.permission && !hasPermission(c.permission)) return false
  if (c.routeName && !router.hasRoute(c.routeName)) return false
  return true
}

function toItem(c: CommandDef, group: string): CommandItem {
  return {
    id: c.id,
    label: t(c.labelKey),
    labelKey: c.labelKey,
    icon: c.icon,
    group,
    keywords: c.keywords,
    handler: () => runCommand(c)
  }
}

async function runCommand(c: CommandDef) {
  if (c.run) {
    await c.run()
    return
  }
  if (c.path) await go(c.path)
}

const commands = computed<CommandItem[]>(() => {
  const navGroup = t('ux.command-palette.groupNav')
  const actionGroup = t('ux.command-palette.groupAction')
  const nav = NAV_COMMANDS.filter(allowed).map(c => toItem(c, navGroup))
  const actions = ACTION_COMMANDS.filter(allowed).map(c => toItem(c, actionGroup))
  if (themeCtx) actions.push(toItem(THEME_COMMAND, actionGroup))
  return [...nav, ...actions]
})

// ===== 快捷键 (⌘/Ctrl + J; 不占用 ⌘K) =====
useKeyboardShortcut('mod+j', () => {
  emit('update:open', !props.open)
})
</script>

<template>
  <FcCommandPalette
    :open="open"
    :commands="commands"
    @update:open="emit('update:open', $event)"
  />
</template>
