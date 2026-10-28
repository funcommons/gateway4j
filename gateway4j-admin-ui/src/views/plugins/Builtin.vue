<template>
  <div class="app-page">
    <FcSection>
      <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
      <FcInput v-model="keyword" :placeholder="t('common.search')" clearable style="width: 240px; margin-bottom: 12px" />
      <div v-for="cat in visibleCategories" :key="cat.key" class="category-section">
        <h4 class="category-title">{{ t(cat.i18nKey) }}</h4>
        <div class="grid">
          <FcSectionCard v-for="item in cat.plugins" :key="item.plugin_id" class="type-card">
            <div class="card-header">
              <h3>{{ item.plugin_name }}</h3>
              <FcTag :color="item.plugin_phase === 'PRE' ? 'primary' : 'success'" size="sm">{{ item.plugin_phase === 'PRE' ? t('plugin.phasePre') : t('plugin.phasePost') }}</FcTag>
              <FcStatusBadge
                :tone="item.status === 'ENABLED' ? 'success' : 'neutral'"
                :label="item.status === 'ENABLED' ? t('common.enabled') : t('common.disabled')"
                :dot="item.status === 'ENABLED'"
              />
            </div>
            <p class="desc">{{ item.description }}</p>
            <div class="card-actions">
              <FcButton v-if="canEdit('plugin')" variant="primary" size="sm" @click="openConfig(item)">{{ t('plugin.configForm') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && item.status !== 'ENABLED'" variant="secondary" size="sm" @click="toggleStatus(item)">{{ t('common.enable') }}</FcButton>
              <FcButton v-if="canEdit('plugin') && item.status === 'ENABLED'" variant="secondary" size="sm" @click="toggleStatus(item)">{{ t('common.disable') }}</FcButton>
            </div>
          </FcSectionCard>
        </div>
      </div>
      <FcSkeleton v-if="loading" variant="text" :rows="4" />
      <FcEmpty v-else-if="filtered.length === 0" :title="t('common.empty')" />
    </FcSection>

    <p v-if="actionError" class="action-error" data-testid="action-error">{{ actionError }}</p>

    <FcDialog v-model:open="dialog" :title="selected ? t('plugin.configForm') + '：' + selected.plugin_name : ''" width="640px">
      <PluginDynamicForm v-if="selected" :plugin-id="selected.plugin_id" v-model="config" />
      <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
      <template #footer>
        <FcButton @click="dialog = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" :loading="saving" @click="saveConfig">{{ t('common.save') }}</FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcSectionCard, FcInput, FcTag, FcButton, FcEmpty, FcDialog, FcSkeleton, FcStatusBadge
} from '@/components'
import PluginDynamicForm from '@/components/PluginDynamicForm.vue'
import { listBuiltinTypes, updatePlugin, enablePlugin, disablePlugin, validateConfig } from '@/api/plugins'
import { getBuiltinCategory, BUILTIN_CATEGORIES, type BuiltinCategoryKey } from './builtinCategories'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const keyword = ref('')
const loading = ref(false)
const loadError = ref('')
const types = ref<any[]>([])
const actionError = ref('')

const filtered = computed(() => types.value.filter((p) =>
  !keyword.value || p.plugin_id.toLowerCase().includes(keyword.value.toLowerCase()) || p.plugin_name.toLowerCase().includes(keyword.value.toLowerCase())
))

const CATEGORY_KEYS = new Set<string>(BUILTIN_CATEGORIES.map(c => c.key))

const visibleCategories = computed(() => {
  const grouped = new Map<BuiltinCategoryKey, any[]>()
  for (const item of filtered.value) {
    const serverCat = item.category as string | undefined
    const cat: BuiltinCategoryKey = (serverCat && CATEGORY_KEYS.has(serverCat)) ? serverCat as BuiltinCategoryKey : getBuiltinCategory(item.plugin_id)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(item)
  }
  return BUILTIN_CATEGORIES
    .filter(c => grouped.has(c.key))
    .map(c => ({ key: c.key, i18nKey: c.i18nKey, plugins: grouped.get(c.key)! }))
})

const dialog = ref(false)
const selected = ref<any>(null)
const config = ref<any>({})
const saving = ref(false)
const saveError = ref('')
let loadEpoch = 0

async function load() {
  const myEpoch = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const data = (await listBuiltinTypes()) as any
    if (myEpoch !== loadEpoch) return
    types.value = data
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    types.value = []
    loadError.value = e?.message || t('common.loadFailed')
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}
load()

function openConfig(plugin: any) {
  selected.value = plugin
  try {
    config.value = typeof plugin.config === 'string' ? JSON.parse(plugin.config) : (plugin.config || {})
  } catch {
    config.value = {}
  }
  saveError.value = ''
  dialog.value = true
}

async function saveConfig() {
  if (!canEdit('plugin')) return
  if (!selected.value?.instance_id && !selected.value?.id) return
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const configStr = JSON.stringify(config.value)
    const validation = await validateConfig(selected.value.plugin_id, configStr) as any
    if (!validation.is_valid) {
      saveError.value = validation.error_message || t('plugin.configJsonInvalid')
      return
    }
    await updatePlugin(selected.value.instance_id || selected.value.id, { config: configStr })
    ElMessage.success(t('plugin.saveSuccess'))
    dialog.value = false
  } catch (e: any) {
    saveError.value = e?.message || t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(plugin: any) {
  if (!canEdit('plugin')) return
  if (plugin.status === 'ENABLED' && !await confirm({ title: t('common.confirmDisablePlugin'), variant: 'danger' })) return
  actionError.value = ''
  try {
    if (plugin.status === 'ENABLED') {
      await disablePlugin(plugin.instance_id || plugin.id)
      ElMessage.success(t('plugin.disableSuccess'))
    } else {
      await enablePlugin(plugin.instance_id || plugin.id)
      ElMessage.success(t('plugin.enableSuccess'))
    }
    await load()
  } catch (e: any) {
    actionError.value = e?.message || t('common.actionFailed')
  }
}
</script>

<style scoped>
.category-section { margin-bottom: 24px; }
.category-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.type-card { display: flex; flex-direction: column; gap: 8px; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card-header h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--app-text); }
.card-actions { display: flex; gap: 8px; }
.desc { color: var(--app-text-secondary); font-size: 13px; line-height: 1.5; flex: 1; }
.load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.save-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 8px 0 0;
}
.action-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
