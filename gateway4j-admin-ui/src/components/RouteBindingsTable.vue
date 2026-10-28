<template>
  <div>
    <div class="toolbar">
      <FcButton variant="primary" @click="dialogOpen = true">{{ t('route.bindPlugin') }}</FcButton>
    </div>
    <FcTable :data="local">
      <el-table-column :label="t('route.bindPluginLabel')" prop="plugin_name" />
      <el-table-column :label="t('route.bindingConfig')" prop="binding_config" />
      <el-table-column :label="t('route.sortLabel')" prop="sort_order" width="80" />
      <el-table-column :label="t('route.actionLabel')" width="120">
        <template #default="{ $index }">
          <FcButton variant="text" size="sm" type="danger" @click="removeBinding($index)">{{ t('route.unbind') }}</FcButton>
        </template>
      </el-table-column>
    </FcTable>

    <FcDialog v-model:open="dialogOpen" :title="t('route.bindDialogTitle')" width="560px">
      <el-form label-width="100px">
        <el-form-item :label="t('route.bindPluginLabel')">
          <FcSelect v-model="bindingForm.plugin_id" :options="pluginOptions" filterable />
        </el-form-item>
        <el-form-item :label="t('route.bindingConfig')">
          <el-input v-model="bindingForm.binding_config" type="textarea" :rows="3" maxlength="10000" placeholder='{"key":"value"}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <FcButton @click="dialogOpen = false">{{ t('common.cancel') }}</FcButton>
        <FcButton variant="primary" @click="addBinding">{{ t('route.bindPlugin') }}</FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { FcTable, FcButton, FcDialog, FcSelect } from '@/components'
import type { SelectOption } from '@/components/form/_types'

const { t } = useI18n()

const MAX_BINDINGS = 20

export interface PluginBinding {
  plugin_id: string
  plugin_name?: string
  binding_config: string
  sort_order?: number
}

const props = defineProps<{
  modelValue: PluginBinding[]
  pluginOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: PluginBinding[]): void
  (e: 'bindings-changed'): void
}>()

const local = ref<PluginBinding[]>(props.modelValue.map((b) => ({ ...b })))
const dialogOpen = ref(false)
const bindingForm = ref<{ plugin_id: string; binding_config: string }>({
  plugin_id: '',
  binding_config: '{}'
})

let syncingFromProp = false
let userAction = false

watch(
  () => props.modelValue,
  (v) => { syncingFromProp = true; local.value = v.map((b) => ({ ...b })); syncingFromProp = false },
  { deep: true }
)

watch(
  local,
  (v) => {
    if (!syncingFromProp) {
      emit('update:modelValue', v.map((b) => ({ ...b })))
      if (userAction) {
        emit('bindings-changed')
        userAction = false
      }
    }
  },
  { deep: true }
)

function addBinding() {
  if (!bindingForm.value.plugin_id) return
  if (local.value.length >= MAX_BINDINGS) {
    ElMessage.warning(t('route.maxBindingsReached'))
    return
  }
  const opt = props.pluginOptions.find((o) => o.value === bindingForm.value.plugin_id)
  userAction = true
  local.value = [
    ...local.value,
    {
      plugin_id: bindingForm.value.plugin_id,
      plugin_name: opt?.label ?? '',
      binding_config: bindingForm.value.binding_config || '{}',
      sort_order: local.value.length
    }
  ]
  dialogOpen.value = false
  bindingForm.value = { plugin_id: '', binding_config: '{}' }
}

function removeBinding(index: number) {
  userAction = true
  local.value = local.value.filter((_, i) => i !== index)
}

defineExpose({ addBinding, removeBinding, dialogOpen, bindingForm, local })
</script>

<style scoped>
.toolbar { margin-bottom: 12px; }
</style>
