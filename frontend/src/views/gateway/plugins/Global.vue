<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-PRE>
          <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
          <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="4" />
          <template v-else>
          <div class="plugin-list">
            <div
              v-for="(p, i) in prePlugins"
              :key="p.id"
              class="plugin-row"
              :draggable="hasPermission('plugin:global')"
              @dragstart="hasPermission('plugin:global') && onDragStart($event, i, 'PRE')"
              @dragover.prevent="onDragOver(i, 'PRE')"
              @drop="hasPermission('plugin:global') && onDrop(i, 'PRE')"
              @dragend="onDragEnd"
            >
              <span v-if="hasPermission('plugin:global')" class="drag-handle">⠿</span>
              <span class="plugin-name">{{ p.plugin_name }}</span>
              <FcTag :color="p.plugin_type === 'BUILTIN' ? 'primary' : 'warning'" size="sm">{{ pluginTypeLabel(p.plugin_type) }}</FcTag>
              <FcSwitch v-if="hasPermission('plugin:global')" :model-value="p.status === 'ENABLED'" @update:model-value="togglePlugin(p)" />
            </div>
          </div>
          <FcEmpty v-if="prePlugins.length === 0" :title="t('gateway.common.empty')" />
          </template>
        </template>

        <template #tab-POST>
          <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
          <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="4" />
          <template v-else>
          <div class="plugin-list">
            <div
              v-for="(p, i) in postPlugins"
              :key="p.id"
              class="plugin-row"
              :draggable="hasPermission('plugin:global')"
              @dragstart="hasPermission('plugin:global') && onDragStart($event, i, 'POST')"
              @dragover.prevent="onDragOver(i, 'POST')"
              @drop="hasPermission('plugin:global') && onDrop(i, 'POST')"
              @dragend="onDragEnd"
            >
              <span v-if="hasPermission('plugin:global')" class="drag-handle">⠿</span>
              <span class="plugin-name">{{ p.plugin_name }}</span>
              <FcTag :color="p.plugin_type === 'BUILTIN' ? 'primary' : 'warning'" size="sm">{{ pluginTypeLabel(p.plugin_type) }}</FcTag>
              <FcSwitch v-if="hasPermission('plugin:global')" :model-value="p.status === 'ENABLED'" @update:model-value="togglePlugin(p)" />
            </div>
          </div>
          <FcEmpty v-if="postPlugins.length === 0" :title="t('gateway.common.empty')" />
          </template>
        </template>
      </FcTabsPanel>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcTabsPanel, FcTag, FcSwitch, FcEmpty, FcSkeleton
} from '@/components/sdk'
import { listGlobalPlugins, sortGlobalPlugins, enablePlugin, disablePlugin } from '@/api/gateway/plugins'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { hasPermission } = usePermission()

const pluginTypeMap: Record<string, string> = {
  BUILTIN: 'plugin.typeBuiltin',
  JAR: 'plugin.typeJar',
  GROOVY: 'plugin.typeGroovy',
  GROUP: 'plugin.typeGroup'
}
function pluginTypeLabel(type: string) {
  return t(pluginTypeMap[type] || type)
}
const tab = ref('PRE')
const tabs = computed(() => [
  { value: 'PRE', label: t('gateway.plugin.globalPrePhase') },
  { value: 'POST', label: t('gateway.plugin.globalPostPhase') }
])
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const prePlugins = ref<any[]>([])
const postPlugins = ref<any[]>([])

let dragFrom = -1
let dragPhase = ''
let loadEpoch = 0

async function load() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  actionError.value = ''
  try {
    const list = await listGlobalPlugins() as any[]
    if (myEpoch !== loadEpoch) return
    prePlugins.value = list.filter((p: any) => p.plugin_phase === 'PRE')
    postPlugins.value = list.filter((p: any) => p.plugin_phase === 'POST')
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('gateway.common.loadFailed')
    prePlugins.value = []
    postPlugins.value = []
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}

async function togglePlugin(plugin: any) {
  if (!hasPermission('plugin:global')) return
  if (plugin.status === 'ENABLED' && !await confirm({ title: t('gateway.common.confirmDisablePlugin'), variant: 'danger' })) return
  actionError.value = ''
  try {
    if (plugin.status === 'ENABLED') {
      await disablePlugin(plugin.instance_id || plugin.id)
      ElMessage.success(t('gateway.plugin.disableSuccess'))
    } else {
      await enablePlugin(plugin.instance_id || plugin.id)
      ElMessage.success(t('gateway.plugin.enableSuccess'))
    }
    await load()
  } catch (e: any) {
    actionError.value = e?.message || t('gateway.common.actionFailed')
  }
}

async function saveSort(phase: string, items: any[]) {
  if (!hasPermission('plugin:global')) return
  actionError.value = ''
  const pluginIds = items.map((i: any) => i.instance_id || i.id)
  try {
    await sortGlobalPlugins(phase, pluginIds)
    ElMessage.success(t('gateway.plugin.saveSuccess'))
    await load()
  } catch (e: any) {
    const errMsg = e?.message || t('gateway.common.sortFailed')
    await load()
    actionError.value = errMsg
  }
}

function onDragStart(e: DragEvent, index: number, phase: string) {
  dragFrom = index
  dragPhase = phase
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, phase: string) {
  if (phase !== dragPhase) return
}

function onDrop(index: number, phase: string) {
  if (phase !== dragPhase || dragFrom === -1 || dragFrom === index) return
  const list = phase === 'PRE' ? [...prePlugins.value] : [...postPlugins.value]
  const [moved] = list.splice(dragFrom, 1)
  list.splice(index, 0, moved)
  if (phase === 'PRE') prePlugins.value = list
  else postPlugins.value = list
  saveSort(phase, list)
  dragFrom = -1
}

function onDragEnd() {
  dragFrom = -1
  dragPhase = ''
}

onMounted(load)
</script>

<style scoped>
.plugin-list { display: flex; flex-direction: column; gap: 8px; }
.plugin-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: var(--app-bg-card, #fff);
  border: 1px solid var(--app-border, #e5e5e5); border-radius: 8px;
  cursor: grab; user-select: none;
}
.plugin-row:active { cursor: grabbing; }
.drag-handle { color: var(--app-text-secondary); font-size: 16px; cursor: grab; }
.plugin-name { font-size: 14px; font-weight: 600; color: var(--app-text); flex: 1; }
.load-error, .action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
