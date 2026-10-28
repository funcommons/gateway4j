<template>
  <div>
    <FcEmpty v-if="!hasBindings" :title="t('route.noPluginsConfigured')" />
    <FcTable v-else :data="local">
      <el-table-column :label="t('route.phaseLabel')" width="80">
        <template #default="{ row }">
          {{ phaseLabel((row as ChainItem).phase) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('route.pluginNameLabel')" prop="plugin_name" />
      <el-table-column :label="t('route.scopeLabel')" width="80">
        <template #default="{ row }">
          {{ scopeLabel((row as ChainItem).scope) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('route.bindingConfig')" prop="binding_config" />
    </FcTable>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcTable, FcEmpty } from '@/components'

const { t } = useI18n()

const phaseMap: Record<string, string> = { PRE: 'plugin.phasePre', POST: 'plugin.phasePost' }
const scopeMap: Record<string, string> = { GLOBAL: 'plugin.scopeGlobal', ROUTE: 'plugin.scopeRoute' }

function phaseLabel(phase: string) { return phaseMap[phase] ? t(phaseMap[phase]) : phase }
function scopeLabel(scope: string) { return scopeMap[scope] ? t(scopeMap[scope]) : scope }

export interface ChainItem {
  phase: string
  plugin_name: string
  scope: string
  binding_config: string
}

const props = defineProps<{
  chain: ChainItem[]
  bindingsCount: number
}>()

const local = ref<ChainItem[]>(props.chain.map((c) => ({ ...c })))

const hasBindings = computed(() => props.bindingsCount > 0)

watch(
  () => props.chain,
  (v) => { local.value = v.map((c) => ({ ...c })) }
)

defineExpose({ local, hasBindings })
</script>
