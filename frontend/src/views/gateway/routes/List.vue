<template>
  <div class="app-page">
    <FcSection>
      <FcFilterBar>
        <FcFilterButton v-for="t in tabs" :key="t.value" :active="filter === t.value" @click="filter = t.value">
          {{ t.label }}
        </FcFilterButton>
        <FcFilterBarDivider />
        <FcInput v-model="keyword" :placeholder="t('gateway.route.searchPlaceholder')" clearable @enter="reload" />
        <template #actions>
          <FcButton v-if="canEdit('route')" variant="primary" @click="onNav('/routes/new')">{{ t('gateway.common.create') }}</FcButton>
          <FcButton v-if="canEdit('route')" variant="secondary" @click="onNav('/import-export')">{{ t('gateway.common.import') }}</FcButton>
        </template>
      </FcFilterBar>

      <div v-if="flatRows.length > 0" class="tree-toolbar">
        <FcButton variant="text" size="sm" @click="expandAll">{{ t('gateway.route.expandAll') }}</FcButton>
        <FcButton variant="text" size="sm" @click="collapseAll">{{ t('gateway.route.collapseAll') }}</FcButton>
      </div>

      <FcSkeleton v-if="loading" variant="text" :rows="6" />
      <template v-else>
      <FcTable :data="flatRows as any" stripe>
        <el-table-column prop="route_name" :label="t('gateway.route.name')">
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
        <el-table-column :label="t('gateway.route.type')">
          <template #default="{ row }">
            <FcTag :color="(row as any).route_type === 'DISPATCH' ? 'primary' : 'success'" size="sm">
              {{ (row as any).route_type === 'DISPATCH' ? t('gateway.route.typeDispatch') : t('gateway.route.typeBackend') }}
            </FcTag>
          </template>
        </el-table-column>
        <el-table-column prop="path" :label="t('gateway.route.path')" />
        <el-table-column :label="t('gateway.route.status')">
          <template #default="{ row }">
            <FcStatusBadge
              :tone="(row as any).status === 'PUBLISHED' ? 'success' : (row as any).status === 'CHANGING' ? 'processing' : (row as any).status === 'OFFLINE' ? 'neutral' : 'pending'"
              :label="(row as any).status === 'DRAFT' ? t('gateway.route.statusDraft') : (row as any).status === 'PUBLISHED' ? t('gateway.route.statusPublished') : (row as any).status === 'CHANGING' ? t('gateway.route.statusChanging') : (row as any).status === 'OFFLINE' ? t('gateway.route.statusOffline') : (row as any).status"
              :dot="(row as any).status === 'PUBLISHED' || (row as any).status === 'CHANGING'"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('gateway.common.more')" width="320" fixed="right">
          <template #default="{ row }">
            <FcButton v-if="canEdit('route')" variant="text" size="sm" @click="onNav(`/routes/${(row as any).id}`)">{{ t('gateway.common.edit') }}</FcButton>
            <FcButton v-if="canEdit('route')" variant="text" size="sm" @click="onNav(`/routes/${(row as any).id}/canvas`)">{{ t('gateway.route.canvas') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'DRAFT'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('gateway.common.publish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'CHANGING'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('gateway.common.republish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'OFFLINE'" variant="text" size="sm" @click="publish(row as RouteNode)">{{ t('gateway.common.republish') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'PUBLISHED'" variant="text" size="sm" @click="offline(row as RouteNode)">{{ t('gateway.common.offline') }}</FcButton>
            <FcButton v-if="canEdit('route') && (row as any).status === 'CHANGING'" variant="text" size="sm" @click="offline(row as RouteNode)">{{ t('gateway.common.abandonChanges') }}</FcButton>
            <FcConfirm v-if="canEdit('route') && ((row as any).status === 'DRAFT' || (row as any).status === 'OFFLINE')" :content="t('gateway.route.confirmDelete')" @confirm="del(row as RouteNode)">
              <FcButton variant="text" size="sm" type="danger">{{ t('gateway.common.delete') }}</FcButton>
            </FcConfirm>
          </template>
        </el-table-column>
      </FcTable>

      <FcEmpty v-if="flatRows.length === 0" :title="t('gateway.common.empty')" />
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
} from '@/components/sdk'
import { listRoutes, publishRoute, offlineRoute, deleteRoute } from '@/api/gateway/routes'
import type { RouteNode } from '@/api/gateway/routes'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const router = useRouter()
const loading = ref(false)
const filter = ref<string>('ALL')
const keyword = ref('')
const rows = ref<RouteNode[]>([])
const expandedKeys = ref<string[]>([])

const tabs = computed(() => [
  { value: 'ALL', label: t('gateway.route.statusAll') },
  { value: 'DRAFT', label: t('gateway.route.statusDraft') },
  { value: 'PUBLISHED', label: t('gateway.route.statusPublished') },
  { value: 'CHANGING', label: t('gateway.route.statusChanging') },
  { value: 'OFFLINE', label: t('gateway.route.statusOffline') }
])

const loadError = ref('')
let loadEpoch = 0

async function reload() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const data = await listRoutes()
    if (myEpoch !== loadEpoch) return
    rows.value = data
    collectDispatchIds(rows.value)
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('gateway.common.loadFailed')
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
  if (!await confirm({ title: t('gateway.common.confirmPublish') })) return
  actionError.value = ''
  try {
    await publishRoute(r.id)
    ElMessage.success(t('gateway.route.publishSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}
async function offline(r: RouteNode) {
  if (!canEdit('route')) return
  if (!await confirm({ title: t('gateway.common.confirmOffline'), variant: 'danger' })) return
  actionError.value = ''
  try {
    await offlineRoute(r.id)
    ElMessage.success(t('gateway.route.offlineSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}
async function del(r: RouteNode) {
  if (!canEdit('route')) return
  actionError.value = ''
  try {
    await deleteRoute(r.id)
    ElMessage.success(t('gateway.route.deleteSuccess'))
    reload()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}

async function onNav(p: string) {
  await router.push(p)
}
</script>

<style scoped>
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
.tree-toolbar { display: flex; gap: 4px; margin-bottom: 8px; }
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
