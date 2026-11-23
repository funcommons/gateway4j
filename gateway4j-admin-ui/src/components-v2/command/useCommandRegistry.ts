import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDebounce } from '@/composables'
import { usePermission } from '@/composables/usePermission'
import { listRoutes, type RouteNode } from '@/api/routes'
import { listPlugins, type PluginItem } from '@/api/plugins'
import { useAuthStore } from '@/store/auth'

/**
 * OPT-2-C：⌘K 全局命令面板 —— 数据/行为层（useCommandRegistry）。
 *
 * 与同目录 CommandPalette.vue 协作；组件契约见
 * src/components-v2/command/__tests__/CommandPalette.test.ts 头注（行为由该文件覆盖，
 * 本文件不单独建测试）。
 *
 * 职责：
 * - 静态页组 = 侧栏 12 叶子（与 LayoutV2 NAV_GROUPS 同表同序；:id 参数页不入组）。
 *   权限过滤与侧栏 canAccess 同源：优先读路由 meta.permission，缺省回退条目自带码。
 * - 动作组 4 个恒显（无权限门槛）：create-route / import-export / theme-toggle / logout。
 * - 异步搜索：query 非空才发请求（打开/空 query 零调用）；trailing debounce 200ms
 *   （复用 @/composables useDebounce 默认值）；routes 走 listRoutes({ keyword })（S7-5
 *   服务端 route_name/path 过滤，平铺命中列表，树拍平后分发子路由同样可命中）+ 客户端
 *   matches 兜底复滤；plugins 走 listPlugins({ page: 1, pageSize, keyword })（服务端
 *   keyword）+ plugin_name 客户端复滤。
 *   搜索域 = 标题/名称 + path，不含权限码；请求带序号防乱序回填。
 * - 命中片段切分 hitParts：供模板把命中片段包进 class="cmd-hit"。
 * - 组序单一事实源 orderedSegments（P3-a④）：基准 pages→actions→routes→plugins，搜索态
 *   （query 非空）动作组排尾 pages→routes→plugins→actions；groups（DOM 组序，过滤空组）
 *   与 flatOptions（键盘序）同源派生，二者恒一致。
 * - 搜索失败错误态 searchError（P3-a⑤）：allSettled 任一侧 rejected → true（seq 守卫），
 *   部分成功结果保留；!q 分支与 reset() 清场。
 */

export type CmdThemeMode = 'light' | 'dark'
export type CmdActionKey = 'create-route' | 'import-export' | 'theme-toggle' | 'logout'

export const CMD_SEARCH_DEBOUNCE_MS = 200
export const CMD_PLUGIN_PAGE_SIZE = 20

/** 静态页组条目（与 LayoutV2 侧栏 12 叶子一一对应；labelKey 复用 v2.nav.*，不新增 key） */
export interface CmdPageDef {
  /** 路由 name（V2 前缀），同时拼进搜索域与 testid（cmd-item-page-{name}） */
  name: string
  path: string
  labelKey: string
  icon: string
  /** 可见性兜底权限码：路由记录缺 meta（测试桩）时回退，取值与真实路由 meta 一致 */
  permission?: string
}

export const CMD_PAGES: CmdPageDef[] = [
  { name: 'V2Overview', path: '/v2/overview', labelKey: 'v2.nav.overview', icon: 'ri-dashboard-line', permission: 'monitor:read' },
  { name: 'V2Routes', path: '/v2/routes', labelKey: 'v2.nav.routes', icon: 'ri-git-branch-line', permission: 'route:read' },
  // S12-7c：创建入口统一指向纯 SCG 路由列表编辑器（name/path 与 src/router/index.ts 的
  // V2RouteScg 注册行一致）；旧向导 /v2/routes/wizard 路由与页面保留，但不再是导航目标。
  { name: 'V2RouteScg', path: '/v2/routes/new', labelKey: 'v2.nav.routeScg', icon: 'ri-magic-line', permission: 'route:edit' },
  { name: 'V2ImportExport', path: '/v2/import-export', labelKey: 'v2.nav.importExport', icon: 'ri-exchange-line', permission: 'route:edit' },
  { name: 'V2PluginChain', path: '/v2/plugins/chain', labelKey: 'v2.nav.pluginChain', icon: 'ri-stack-line', permission: 'plugin:read' },
  { name: 'V2PluginList', path: '/v2/plugins', labelKey: 'v2.nav.pluginList', icon: 'ri-list-check', permission: 'plugin:read' },
  { name: 'V2PluginEditor', path: '/v2/plugins/editor', labelKey: 'v2.nav.pluginEditor', icon: 'ri-edit-box-line', permission: 'plugin:edit' },
  { name: 'V2Monitor', path: '/v2/monitor', labelKey: 'v2.nav.monitor', icon: 'ri-pulse-line', permission: 'monitor:read' },
  { name: 'V2Debug', path: '/v2/debug', labelKey: 'v2.nav.debug', icon: 'ri-terminal-line', permission: 'route:edit' },
  { name: 'V2Users', path: '/v2/users', labelKey: 'v2.nav.users', icon: 'ri-user-settings-line', permission: 'system:user' },
  { name: 'V2Roles', path: '/v2/roles', labelKey: 'v2.nav.roles', icon: 'ri-shield-user-line', permission: 'user:read' },
  { name: 'V2Settings', path: '/v2/settings', labelKey: 'v2.nav.settings', icon: 'ri-settings-3-line', permission: 'system:read' }
]

/** 动作组条目（顺序固定，末项 logout 是空态浏览高亮回绕的终点） */
export interface CmdActionDef {
  key: CmdActionKey
  labelKey: string
  icon: string
}

export const CMD_ACTIONS: CmdActionDef[] = [
  { key: 'create-route', labelKey: 'v2.cmd.action.createRoute', icon: 'ri-add-line' },
  { key: 'import-export', labelKey: 'v2.cmd.action.importExport', icon: 'ri-exchange-line' },
  { key: 'theme-toggle', labelKey: 'v2.cmd.action.themeToggle', icon: 'ri-contrast-2-line' },
  { key: 'logout', labelKey: 'v2.cmd.action.logout', icon: 'ri-logout-box-line' }
]

/** 命中片段：hit=true 的片段由模板包 class="cmd-hit" */
export interface CmdSeg {
  text: string
  hit: boolean
}

/** 面板条目（role=option；id 同时是 DOM id 与 testid，供 aria-activedescendant 指向） */
export interface CmdOption {
  id: string
  icon: string
  /** 标题（含命中切分） */
  parts: CmdSeg[]
  /** 次级信息（path 等，含命中切分；空数组 = 不渲染） */
  hint: CmdSeg[]
  run: () => unknown
}

export interface CmdGroup {
  testid: string
  labelKey: string
  items: CmdOption[]
}

/** 大小写不敏感的包含匹配 */
function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase())
}

/** 把文本按 query 切成 hit/非 hit 片段（query 空 = 整段非 hit） */
export function hitParts(text: string, query: string): CmdSeg[] {
  const raw = text ?? ''
  const q = query ?? ''
  if (!q) return raw ? [{ text: raw, hit: false }] : []
  const lower = raw.toLowerCase()
  const lowerQ = q.toLowerCase()
  const segs: CmdSeg[] = []
  let from = 0
  while (from <= raw.length) {
    const idx = lower.indexOf(lowerQ, from)
    if (idx === -1) {
      segs.push({ text: raw.slice(from), hit: false })
      break
    }
    if (idx > from) segs.push({ text: raw.slice(from, idx), hit: false })
    segs.push({ text: raw.slice(idx, idx + q.length), hit: true })
    from = idx + q.length
  }
  return segs.filter((s) => s.text.length > 0)
}

/** 路由树拍平（分发父路由 + 后置子路由全部可搜） */
function flattenRoutes(nodes: RouteNode[] | undefined, acc: RouteNode[] = []): RouteNode[] {
  for (const n of nodes ?? []) {
    acc.push(n)
    if (n.children?.length) flattenRoutes(n.children, acc)
  }
  return acc
}

export interface CmdRegistryHooks {
  /** 主题翻转执行器（组件注入：有 fc-theme 上下文走 setTheme，缺落降级） */
  toggleTheme: () => void
}

export function useCommandRegistry(hooks: CmdRegistryHooks) {
  const { t } = useI18n()
  const router = useRouter()
  const { hasPermission } = usePermission()

  const query = ref('')
  const debouncedQuery: Ref<string> = useDebounce(query, CMD_SEARCH_DEBOUNCE_MS)
  const loading = ref(false)
  /** 搜索失败可见错误态（P3-a⑤）：allSettled 任一侧 rejected → true（部分成功不吞结果） */
  const searchError = ref(false)
  const routeHits = ref<RouteNode[]>([])
  const pluginHits = ref<PluginItem[]>([])

  /** 侧栏 canAccess 同源：读路由 meta.permission，缺省回退条目自带码 */
  function canAccessPage(def: CmdPageDef): boolean {
    const record = router.getRoutes().find((r) => String(r.name) === def.name)
    const perm = (record?.meta?.permission as string | undefined) ?? def.permission
    if (!perm) return true
    return hasPermission(perm)
  }

  const allowedPages = computed(() => CMD_PAGES.filter(canAccessPage))

  /** 静态组按 raw query 即时过滤（异步组走 debounced，见 watcher） */
  const visiblePages = computed(() => {
    const q = query.value.trim()
    if (!q) return allowedPages.value
    return allowedPages.value.filter((d) => matches(`${t(d.labelKey)} ${d.name} ${d.path}`, q))
  })

  /** 动作组恒显（无权限门槛、不按 query 过滤）：浏览态保留；命中态（任一组有命中）保留；
   *  仅全空态（cmd-empty）随四组一起退场（契约 H-2 / H-5）。 */
  const visibleActions = computed(() => {
    const q = query.value.trim()
    if (!q) return CMD_ACTIONS
    const otherHits = visiblePages.value.length + routeHits.value.length + pluginHits.value.length
    return otherHits > 0 ? CMD_ACTIONS : []
  })

  function pageOption(def: CmdPageDef): CmdOption {
    const q = query.value.trim()
    return {
      id: `cmd-item-page-${def.name}`,
      icon: def.icon,
      parts: hitParts(t(def.labelKey), q),
      hint: hitParts(def.path, q),
      run: () => router.push(def.path)
    }
  }

  function actionOption(def: CmdActionDef): CmdOption {
    const q = query.value.trim()
    const runners: Record<CmdActionKey, () => unknown> = {
      // S12-7c：创建入口统一指向纯 SCG 路由列表编辑器 /v2/routes/new（用户裁决「不要向导」；
      // 旧 /v2/routes/wizard 路由与页面保留，但不再是任何创建入口的目标）。
      'create-route': () => router.push('/v2/routes/new'),
      'import-export': () => router.push('/v2/import-export'),
      'theme-toggle': () => hooks.toggleTheme(),
      logout: async () => {
        useAuthStore().logout()
        await router.push('/login')
      }
    }
    return {
      id: `cmd-action-${def.key}`,
      icon: def.icon,
      parts: hitParts(t(def.labelKey), q),
      hint: [],
      run: runners[def.key]
    }
  }

  const pageOptions = computed(() => visiblePages.value.map(pageOption))
  const actionOptions = computed(() => visibleActions.value.map(actionOption))
  const routeOptions = computed(() => {
    const q = query.value.trim()
    return routeHits.value.map((r) => ({
      id: `cmd-item-route-${r.id}`,
      icon: 'ri-git-branch-line',
      parts: hitParts(r.route_name, q),
      hint: hitParts(r.path ?? '', q),
      run: () => router.push(`/v2/routes/${r.id}/detail`)
    }))
  })
  const pluginOptions = computed(() => {
    const q = query.value.trim()
    return pluginHits.value.map((p) => ({
      id: `cmd-item-plugin-${p.id}`,
      icon: 'ri-puzzle-line',
      parts: hitParts(p.plugin_name, q),
      hint: [],
      run: () => router.push(`/v2/plugins/editor/${p.id}`)
    }))
  })

  // —— 组序单一事实源：DOM 渲染序（groups 过滤空组）与键盘序（flatOptions 扁平）
  // 同源派生自 orderedSegments，二者恒一致（P3-a④）——
  // 基准序 pages→actions→routes→plugins（空 query 浏览态）；query 非空（搜索态）
  // 动作组排尾 pages→routes→plugins→actions（首项=首个页/路由命中，动作永不居首）。
  const orderedSegments = computed<CmdGroup[]>(() => {
    const pages: CmdGroup = { testid: 'cmd-group-pages', labelKey: 'v2.cmd.group.pages', items: pageOptions.value }
    const actions: CmdGroup = { testid: 'cmd-group-actions', labelKey: 'v2.cmd.group.actions', items: actionOptions.value }
    const routes: CmdGroup = { testid: 'cmd-group-routes', labelKey: 'v2.cmd.group.routes', items: routeOptions.value }
    const plugins: CmdGroup = { testid: 'cmd-group-plugins', labelKey: 'v2.cmd.group.plugins', items: pluginOptions.value }
    return query.value.trim() ? [pages, routes, plugins, actions] : [pages, actions, routes, plugins]
  })

  /** 渲染分组（空组不渲染） */
  const groups = computed<CmdGroup[]>(() => orderedSegments.value.filter((g) => g.items.length > 0))

  /** 键盘导航用的扁平条目序（与分组渲染顺序一致） */
  const flatOptions = computed<CmdOption[]>(() => orderedSegments.value.flatMap((g) => g.items))

  // —— 异步搜索：debounce 到点后仅 query 非空发请求；序号防乱序回填 ——
  // flush:'sync'：debounce 定时器到点（含测试 fake timers 的 advanceTimersByTime）时
  // 请求同步发出，调用方无需额外 flush 即可观察到（契约 H-1 于定时点即时断言）。
  let searchSeq = 0
  watch(
    debouncedQuery,
    async (raw) => {
      const q = raw.trim()
      if (!q) {
        searchSeq++
        loading.value = false
        searchError.value = false // 清空 query 回浏览态：错误态清场
        routeHits.value = []
        pluginHits.value = []
        return
      }
      const seq = ++searchSeq
      loading.value = true
      const [routesRes, pluginsRes] = await Promise.allSettled([
        // S7-5：服务端 keyword 过滤（消全量拉带宽）；下方客户端 matches 过滤保留兜底
        // （服务端漏网行不得透传，LEAK_ROW 守卫钉）
        listRoutes({ keyword: q }),
        listPlugins({ page: 1, pageSize: CMD_PLUGIN_PAGE_SIZE, keyword: q })
      ])
      if (seq !== searchSeq) return
      loading.value = false
      searchError.value = routesRes.status === 'rejected' || pluginsRes.status === 'rejected'
      const routes = routesRes.status === 'fulfilled' ? routesRes.value : []
      const plugins = pluginsRes.status === 'fulfilled' ? pluginsRes.value.records : []
      routeHits.value = flattenRoutes(routes).filter((r) => matches(`${r.route_name} ${r.path ?? ''}`, q))
      pluginHits.value = plugins.filter((p) => matches(p.plugin_name, q))
    },
    { flush: 'sync' },
  )

  /** 打开时复位到浏览态（清 query 与陈旧异步结果，防复开闪旧数据） */
  function reset() {
    searchSeq++ // 作废在途请求：close→reopen 期间晚到的旧响应不得凭 seq 相等回填浏览态
    query.value = ''
    loading.value = false
    searchError.value = false
    routeHits.value = []
    pluginHits.value = []
  }

  // —— 高亮态：默认首项；query 变化重置首项；↑↓ 循环（首↑→末 / 末↓→首）——
  const activeIndex = ref(0)
  watch(query, () => {
    activeIndex.value = 0
  })
  watch(
    () => flatOptions.value.length,
    (n) => {
      if (activeIndex.value >= n) activeIndex.value = 0
    },
  )

  /** delta=+1/−1；空条目集为 no-op（空态 Enter 不执行、不关闭） */
  function moveActive(delta: number) {
    const n = flatOptions.value.length
    if (!n) return
    activeIndex.value = (activeIndex.value + delta + n) % n
  }

  return {
    query,
    loading,
    searchError,
    groups,
    flatOptions,
    activeIndex,
    moveActive,
    reset
  }
}
