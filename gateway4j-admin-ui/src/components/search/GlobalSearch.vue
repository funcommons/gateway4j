<script setup lang="ts">
defineOptions({ name: 'GlobalSearch' })
/**
 * GlobalSearch — 顶栏全局搜索 (⌘K / Ctrl+K).
 *
 * 三类结果并发查询、分组展示：
 *  - 路由：GET /v1/routes 全量拉取后前端过滤（树拍平，含子路由）
 *  - 插件：GET /v1/plugins?keyword=
 *  - 用户：GET /v1/users?keyword=
 *
 * 权限遵循：无 route:read / plugin:read / user:read 对应权限的分组不查不显示。
 * 键盘：↑↓ 循环高亮、Enter 跳转、Esc 关闭；无结果时空态。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FcInput, FcEmpty } from '@/components'
import { usePermission } from '@/composables/usePermission'
import { useDebounce } from '@/composables'
import { listRoutes } from '@/api/routes'
import { listPlugins } from '@/api/plugins'
import { listUsers } from '@/api/misc'

type GroupKey = 'route' | 'plugin' | 'user'

interface SearchHit {
  group: GroupKey
  id: string
  name: string
  meta: string
  to: string
}

const MAX_PER_GROUP = 8

const { t } = useI18n()
const router = useRouter()
const { hasPermission } = usePermission()

const canSearchRoutes = computed(() => hasPermission('route:read'))
const canSearchPlugins = computed(() => hasPermission('plugin:read'))
const canSearchUsers = computed(() => hasPermission('user:read'))

const query = ref('')
const debouncedQuery = useDebounce(query, 300)
const open = ref(false)
const searching = ref(false)
const searched = ref(false)
const activeIndex = ref(0)

const routeHits = ref<SearchHit[]>([])
const pluginHits = ref<SearchHit[]>([])
const userHits = ref<SearchHit[]>([])

const inputWrapRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const groups = computed(() => {
  const g: Array<{ key: GroupKey; title: string; items: SearchHit[] }> = []
  if (routeHits.value.length) g.push({ key: 'route', title: t('common.gsGroupRoutes'), items: routeHits.value })
  if (pluginHits.value.length) g.push({ key: 'plugin', title: t('common.gsGroupPlugins'), items: pluginHits.value })
  if (userHits.value.length) g.push({ key: 'user', title: t('common.gsGroupUsers'), items: userHits.value })
  return g
})

const flatItems = computed<SearchHit[]>(() => groups.value.flatMap(g => g.items))

// ===== 状态文案 =====
const ROUTE_STATUS_KEY: Record<string, string> = {
  DRAFT: 'route.statusDraft',
  PUBLISHED: 'route.statusPublished',
  CHANGING: 'route.statusChanging',
  OFFLINE: 'route.statusOffline'
}
function statusLabel(status: string): string {
  const key = ROUTE_STATUS_KEY[status]
  if (key) return t(key)
  if (status === 'ENABLED') return t('common.enabled')
  if (status === 'DISABLED') return t('common.disabled')
  return status
}

// ===== 路由：全量缓存 + 前端过滤 =====
const routeCache = ref<any[] | null>(null)

function flattenRouteTree(nodes: any[], out: any[] = []): any[] {
  for (const n of nodes || []) {
    out.push(n)
    if (Array.isArray(n.children) && n.children.length) flattenRouteTree(n.children, out)
  }
  return out
}

// ===== 搜索（epoch 防竞态，单组失败静默置空，不崩页）=====
let searchEpoch = 0

function toHit(n: any): SearchHit {
  const meta = [n.path || n.upstream_url || '', statusLabel(n.status)].filter(Boolean).join(' · ')
  return { group: 'route', id: String(n.id), name: String(n.route_name || n.id), meta, to: `/routes/${n.id}` }
}

async function searchRoutes(kw: string, my: number) {
  try {
    if (!routeCache.value) {
      const tree = (await listRoutes()) as any
      routeCache.value = flattenRouteTree(Array.isArray(tree) ? tree : [])
    }
    const k = kw.toLowerCase()
    const list = routeCache.value
      .filter((n: any) =>
        String(n.route_name || '').toLowerCase().includes(k) ||
        String(n.path || '').toLowerCase().includes(k) ||
        String(n.upstream_url || '').toLowerCase().includes(k))
      .slice(0, MAX_PER_GROUP)
      .map(toHit)
    if (my === searchEpoch) routeHits.value = list
  } catch {
    if (my === searchEpoch) routeHits.value = []
  }
}

async function searchPlugins(kw: string, my: number) {
  try {
    const r: any = await listPlugins({ page: 1, pageSize: MAX_PER_GROUP, keyword: kw })
    const list = (r?.records || []).map((p: any): SearchHit => ({
      group: 'plugin',
      id: String(p.id),
      name: String(p.plugin_name || p.plugin_id || p.id),
      meta: [p.plugin_type, statusLabel(p.status)].filter(Boolean).join(' · '),
      to: `/plugins/${p.id}/edit`
    }))
    if (my === searchEpoch) pluginHits.value = list
  } catch {
    if (my === searchEpoch) pluginHits.value = []
  }
}

async function searchUsers(kw: string, my: number) {
  try {
    const r: any = await listUsers({ page: 1, pageSize: MAX_PER_GROUP, keyword: kw })
    const list = (r?.records || []).map((u: any): SearchHit => ({
      group: 'user',
      id: String(u.id),
      name: String(u.username || u.id),
      meta: String(u.real_name || ''),
      to: '/users'
    }))
    if (my === searchEpoch) userHits.value = list
  } catch {
    if (my === searchEpoch) userHits.value = []
  }
}

function resetResults() {
  routeHits.value = []
  pluginHits.value = []
  userHits.value = []
  activeIndex.value = 0
  searched.value = false
}

async function runSearch(kw: string) {
  const my = ++searchEpoch
  resetResults()
  searching.value = true
  const jobs: Promise<void>[] = []
  if (canSearchRoutes.value) jobs.push(searchRoutes(kw, my))
  if (canSearchPlugins.value) jobs.push(searchPlugins(kw, my))
  if (canSearchUsers.value) jobs.push(searchUsers(kw, my))
  await Promise.all(jobs)
  if (my === searchEpoch) {
    searching.value = false
    searched.value = true
  }
}

watch(debouncedQuery, (kw) => {
  const k = kw.trim()
  if (!k) {
    resetResults()
    open.value = false
    return
  }
  open.value = true
  runSearch(k)
})

// ===== 键盘交互 =====
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (flatItems.value.length) activeIndex.value = (activeIndex.value + 1) % flatItems.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const n = flatItems.value.length
    if (n) activeIndex.value = (activeIndex.value - 1 + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flatItems.value[activeIndex.value]
    if (item) go(item)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

async function go(item: SearchHit) {
  open.value = false
  try {
    await router.push(item.to)
  } catch {
    // 导航被路由守卫拦截时静默忽略
  }
}

function flatIndexOf(group: GroupKey, id: string): number {
  return flatItems.value.findIndex(it => it.group === group && it.id === id)
}

// ===== ⌘K / Ctrl+K 聚焦 + 外点关闭 =====
function focusInput() {
  const el = inputWrapRef.value?.querySelector('input') as HTMLInputElement | null
  if (el) el.focus()
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    focusInput()
    if (query.value.trim()) open.value = true
  }
}

function onDocClick(e: MouseEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}

function onFocus() {
  if (query.value.trim()) open.value = true
}

function onClear() {
  query.value = ''
  resetResults()
  open.value = false
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('click', onDocClick)
})

defineExpose({ query, open, groups, flatItems, activeIndex, runSearch, flatIndexOf })
</script>

<template>
  <div ref="rootRef" class="global-search" data-testid="global-search" @keydown="onKeydown">
    <div ref="inputWrapRef" class="global-search__input-wrap">
      <FcInput
        v-model="query"
        :placeholder="t('common.globalSearchPlaceholder')"
        clearable
        size="small"
        data-testid="global-search-input"
        @focus="onFocus"
        @clear="onClear"
      >
        <template #prefix><i class="ri-search-line global-search__icon" /></template>
      </FcInput>
    </div>

    <div v-if="open" class="global-search__panel" data-testid="global-search-panel">
      <template v-if="flatItems.length">
        <div v-for="g in groups" :key="g.key" class="global-search__group" :data-testid="`gs-group-${g.key}`">
          <div class="global-search__group-title">{{ g.title }}</div>
          <button
            v-for="item in g.items"
            :key="item.group + item.id"
            type="button"
            class="global-search__item"
            :class="{ 'is-active': flatIndexOf(item.group, item.id) === activeIndex }"
            :data-testid="`gs-item-${item.group}`"
            @click="go(item)"
            @mouseenter="activeIndex = flatIndexOf(item.group, item.id)"
          >
            <span class="global-search__item-name">{{ item.name }}</span>
            <span v-if="item.meta" class="global-search__item-meta">{{ item.meta }}</span>
          </button>
        </div>
      </template>
      <FcEmpty
        v-else-if="searched && !searching"
        type="no-result"
        :span-full="false"
        data-testid="global-search-empty"
      />
    </div>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  width: 360px;
  max-width: 100%;
}
.global-search__icon {
  font-size: 14px;
  color: var(--app-text-secondary);
}
.global-search__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 420px;
  overflow-y: auto;
  background: var(--app-bg-card, var(--app-bg));
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-md, var(--app-shadow-sm));
  z-index: 2100;
  padding: 4px;
}
.global-search__group + .global-search__group {
  margin-top: 4px;
}
.global-search__group-title {
  font-size: 12px;
  color: var(--app-text-secondary);
  padding: 4px 8px 2px;
}
.global-search__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: var(--app-text);
}
.global-search__item.is-active {
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
}
/* 键盘焦点环: 瞬时出现, 不做渐显 */
.global-search__item:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
/* 鼠标按下: 比键盘高亮更重一档, 二者分工 */
.global-search__item:active:not(:disabled) {
  background: color-mix(in srgb, var(--app-primary) 18%, transparent);
}
/* 禁用态三通道: 透明 + 光标 + 原生 disabled */
.global-search__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.global-search__item-name {
  flex-shrink: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-search__item-meta {
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
