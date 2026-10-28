<template>
  <div class="app-page">
    <FcSection>
      <FcFilterBar>
        <FcFilterButton v-for="t in tabs" :key="t.value" :active="filter === t.value" @click="filter = t.value">
          {{ t.label }}
        </FcFilterButton>
        <FcFilterBarDivider />
        <FcInput v-model="keyword" :placeholder="t('route.searchPlaceholder')" clearable @enter="reload" />
        <FcInput
          v-model="tagFilter"
          :placeholder="t('route.tagFilterPlaceholder')"
          clearable
          style="max-width: 200px"
          @enter="reload"
          @clear="reload"
        />
        <template #actions>
          <FcButton v-if="canEdit('route')" variant="primary" @click="onNav('/routes/new')">{{ t('common.create') }}</FcButton>
          <FcButton v-if="canEdit('route')" variant="secondary" @click="onNav('/import-export')">{{ t('common.import') }}</FcButton>
        </template>
      </FcFilterBar>

      <p v-if="!canEdit('route')" class="readonly-hint" data-testid="readonly-hint">当前账号为只读权限，如需操作请联系管理员</p>

      <div v-if="flatRows.length > 0" class="tree-toolbar">
        <FcButton variant="text" size="sm" @click="expandAll">{{ t('route.expandAll') }}</FcButton>
        <FcButton variant="text" size="sm" @click="collapseAll">{{ t('route.collapseAll') }}</FcButton>
        <template v-if="canEdit('route') && selectedRows.length > 0">
          <span class="bulk-selected" data-testid="bulk-selected-count">{{ t('route.bulkSelected', { n: selectedRows.length }) }}</span>
          <FcButton variant="secondary" size="sm" data-testid="bulk-publish" @click="runBulk('publish')">{{ t('route.bulkPublish') }}</FcButton>
          <FcButton variant="secondary" size="sm" data-testid="bulk-offline" @click="runBulk('offline')">{{ t('route.bulkOffline') }}</FcButton>
          <FcButton variant="danger" size="sm" data-testid="bulk-delete" @click="runBulk('delete')">{{ t('route.bulkDelete') }}</FcButton>
        </template>
      </div>

      <FcSkeleton v-if="loading" variant="text" :rows="6" />
      <template v-else>
      <FcTable :data="flatRows as any" stripe @selection-change="onSelectionChange">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="route_name" :label="t('route.name')">
          <template #default="{ row }">
            <div class="tree-cell" :style="{ paddingLeft: (row as any)._depth * 24 + 'px' }">
              <span
                v-if="(row as any)._hasChildren"
                class="toggle-icon"
                :class="{ expanded: expandedKeys.includes((row as any).id) }"
                @click.stop="toggleExpand((row as any).id)"
              >▶</span>
              <span v-else class="toggle-placeholder" />
              <span>{{ (row as any).route_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('route.type')">
          <template #default="{ row }">
            <FcTag :color="(row as any).route_type === 'DISPATCH' ? 'primary' : 'success'" size="sm">
              {{ (row as any).route_type === 'DISPATCH' ? t('route.typeDispatch') : t('route.typeBackend') }}
            </FcTag>
          </template>
        </el-table-column>
        <el-table-column prop="path" :label="t('route.path')" />
        <el-table-column :label="t('route.tags')" min-width="140">
          <template #default="{ row }">
            <span class="tags-cell" :data-testid="`tags-${(row as any).id}`">
              <template v-if="splitTags((row as any).tags).length">
                <FcTag v-for="tg in splitTags((row as any).tags)" :key="tg" color="gray" size="sm">{{ tg }}</FcTag>
              </template>
              <template v-else>—</template>
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('route.status')">
          <template #default="{ row }">
            <FcStatusBadge
              :tone="(row as any).status === 'PUBLISHED' ? 'success' : (row as any).status === 'CHANGING' ? 'processing' : (row as any).status === 'OFFLINE' ? 'neutral' : 'pending'"
              :label="(row as any).status === 'DRAFT' ? t('route.statusDraft') : (row as any).status === 'PUBLISHED' ? t('route.statusPublished') : (row as any).status === 'CHANGING' ? t('route.statusChanging') : (row as any).status === 'OFFLINE' ? t('route.statusOffline') : (row as any).status"
              :dot="(row as any).status === 'PUBLISHED' || (row as any).status === 'CHANGING'"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.more')" width="380" fixed="right">
          <template #default="{ row }">
            <FcButton v-if="canEdit('route')" variant="text" size="sm" @click="onNav(`/routes/${(row as any).id}`)">{{ t('common.edit') }}</FcButton>
            <FcButton v-if="canEdit('route')" variant="text" size="sm" @click="onNav(`/routes/${(row as any).id}/canvas`)">{{ t('route.canvas') }}</FcButton>
            <FcButton v-if="canEdit('route')" variant="text" size="sm" data-testid="duplicate-btn" @click="duplicate(row as RouteNode)">{{ t('route.duplicate') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'DRAFT'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('common.publish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'CHANGING'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('common.republish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'OFFLINE'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('common.republish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'PUBLISHED'" variant="text" size="sm" @click="offline(row as RouteNode)">{{ t('common.offline') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'CHANGING'" variant="text" size="sm" @click="offline(row as RouteNode)">{{ t('common.abandonChanges') }}</FcButton>
            <FcConfirm v-if="canEdit('route') && ((row as any).status === 'DRAFT' || (row as any).status === 'OFFLINE')" :content="t('route.confirmDelete')" @confirm="del(row as RouteNode)">
              <FcButton variant="text" size="sm" type="danger">{{ t('common.delete') }}</FcButton>
            </FcConfirm>
          </template>
        </el-table-column>
      </FcTable>

      <FcEmpty v-if="flatRows.length === 0" :title="t('common.empty')" />
      </template>
    </FcSection>

    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { useRouter } from 'vue-router'
import {
  FcSection, FcFilterBar, FcFilterBarDivider, FcFilterButton,
  FcTable, FcTag, FcStatusBadge, FcInput, FcButton, FcConfirm, FcEmpty, FcSkeleton
} from '@/components'
import { listRoutes, publishRoute, offlineRoute, deleteRoute, duplicateRoute, bulkPublishRoutes, bulkOfflineRoutes, bulkDeleteRoutes } from '@/api/routes'
import type { RouteNode, BulkResult } from '@/api/routes'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const router = useRouter()
const loading = ref(false)
const filter = ref<string>('ALL')
const keyword = ref('')
const tagFilter = ref('')
const rows = ref<RouteNode[]>([])
const expandedKeys = ref<string[]>([])
const selectedRows = ref<RouteNode[]>([])

/** 'a, b,,c' → ['a','b','c']；空串/undefined → [] */
function splitTags(tags?: string): string[] {
  return (tags || '').split(',').map(s => s.trim()).filter(Boolean)
}

/** 聚合批量结果：成功数 / 失败数 / 失败原因拼接（供提示与单测复用） */
function summarizeBulk(res: BulkResult | null | undefined): { ok: number; fail: number; reasons: string } {
  const ok = res?.succeeded?.length ?? 0
  const failed = res?.failed ?? []
  return { ok, fail: failed.length, reasons: failed.map(f => f?.reason).filter(Boolean).join('；') }
}

function onSelectionChange(rows: unknown[]) {
  selectedRows.value = rows as RouteNode[]
}

const tabs = computed(() => [
  { value: 'ALL', label: t('route.statusAll') },
  { value: 'DRAFT', label: t('route.statusDraft') },
  { value: 'PUBLISHED', label: t('route.statusPublished') },
  { value: 'CHANGING', label: t('route.statusChanging') },
  { value: 'OFFLINE', label: t('route.statusOffline') }
])

const loadError = ref('')
let loadEpoch = 0

async function reload() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const tag = tagFilter.value.trim()
    const data = await listRoutes(tag ? { tag } : undefined)
    if (myEpoch !== loadEpoch) return
    rows.value = data
    // Auto-expand all dispatch nodes on load
    collectDispatchIds(rows.value)
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('common.loadFailed')
    rows.value = []
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}
reload()

function collectDispatchIds(list: RouteNode[]) {
  const ids: string[] = []
  function walk(nodes: RouteNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        ids.push(n.id)
        walk(n.children)
      }
    }
  }
  walk(list)
  expandedKeys.value = ids
}

function toggleExpand(id: string) {
  const idx = expandedKeys.value.indexOf(id)
  if (idx >= 0) {
    expandedKeys.value.splice(idx, 1)
  } else {
    expandedKeys.value.push(id)
  }
}

function expandAll() {
  const ids: string[] = []
  function walk(nodes: RouteNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        ids.push(n.id)
        walk(n.children)
      }
    }
  }
  walk(rows.value)
  expandedKeys.value = ids
}

function collapseAll() {
  expandedKeys.value = []
}

const flatRows = computed(() => {
  const out: (RouteNode & { _depth: number; _hasChildren: boolean })[] = []
  function hasMatchingDescendant(node: RouteNode): boolean {
    if (!node.children?.length) return false
    for (const child of node.children) {
      if (matchesFilter(child)) return true
      if (hasMatchingDescendant(child)) return true
    }
    return false
  }
  function matchesFilter(r: RouteNode): boolean {
    if (filter.value !== 'ALL' && r.status !== filter.value) return false
    if (keyword.value && !r.route_name.toLowerCase().includes(keyword.value.toLowerCase())) return false
    return true
  }
  function walk(list: RouteNode[], depth: number) {
    for (const r of list) {
      const selfMatch = matchesFilter(r)
      const childMatch = hasMatchingDescendant(r)
      if (!selfMatch && !childMatch) continue
      const hasChildren = !!(r.children && r.children.length > 0)
      out.push({ ...r, _depth: depth, _hasChildren: hasChildren })
      // Only recurse into children if this node is expanded
      if (hasChildren && expandedKeys.value.includes(r.id)) {
        walk(r.children, depth + 1)
      }
    }
  }
  walk(rows.value, 0)
  return out
})

const actionError = ref('')

async function publish(r: RouteNode) {
  if (!canEdit('route')) return
  if (!await confirm({ title: t('common.confirmPublish') })) return
  actionError.value = ''
  try {
    await publishRoute(r.id)
    ElMessage.success(t('route.publishSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}
async function offline(r: RouteNode) {
  if (!canEdit('route')) return
  if (!await confirm({ title: t('common.confirmOffline'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await offlineRoute(r.id)
    ElMessage.success(t('route.offlineSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}
async function del(r: RouteNode) {
  if (!canEdit('route')) return
  actionError.value = ''
  try {
    await deleteRoute(r.id)
    ElMessage.success(t('route.deleteSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}

/** 行内「复制」：调 duplicate 接口，成功后刷新并提示新路由名 */
async function duplicate(r: RouteNode) {
  if (!canEdit('route')) return
  actionError.value = ''
  try {
    const created = await duplicateRoute(r.id) as any
    ElMessage.success(t('route.duplicateSuccess', { name: created?.route_name || r.route_name }))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}

/** 批量发布/下线/删除：确认 → 调批量接口 → 聚合结果提示 */
async function runBulk(kind: 'publish' | 'offline' | 'delete') {
  if (!canEdit('route')) return
  const ids = selectedRows.value.map(r => r.id)
  if (ids.length === 0) return
  const titles: Record<typeof kind, string> = {
    publish: t('route.bulkPublish'),
    offline: t('route.bulkOffline'),
    delete: t('route.bulkDelete')
  }
  if (!await confirm({
    title: titles[kind],
    content: t('route.bulkConfirmContent', { n: ids.length }),
    variant: kind === 'publish' ? 'default' : 'danger'
  })) return
  actionError.value = ''
  try {
    const fn = kind === 'publish' ? bulkPublishRoutes : kind === 'offline' ? bulkOfflineRoutes : bulkDeleteRoutes
    const res = await fn(ids)
    const { ok, fail, reasons } = summarizeBulk(res)
    if (fail === 0) {
      ElMessage.success(t('route.bulkResultAll', { n: ok }))
    } else {
      ElMessage.warning(t('route.bulkResultPartial', { ok, fail, reasons }))
      actionError.value = t('route.bulkResultPartial', { ok, fail, reasons })
    }
    selectedRows.value = []
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}

async function onNav(p: string) {
  await router.push(p)
}
</script>

<style scoped>
.readonly-hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted, #f5f7fa);
  border-radius: var(--app-radius-sm);
}
.tree-cell { display: flex; align-items: center; gap: 6px; }
.toggle-icon {
  cursor: pointer;
  font-size: 10px;
  color: var(--app-text-secondary);
  transition: transform 0.15s ease;
  display: inline-block;
  width: 16px;
  text-align: center;
  user-select: none;
}
.toggle-icon.expanded { transform: rotate(90deg); }
.toggle-placeholder { display: inline-block; width: 16px; }
.tree-toolbar { display: flex; gap: 4px; margin-bottom: 8px; align-items: center; }
.bulk-selected { font-size: 13px; color: var(--app-text-secondary); margin-left: 8px; }
.tags-cell { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
