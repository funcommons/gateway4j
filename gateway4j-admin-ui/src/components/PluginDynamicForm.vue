<template>
  <div v-if="loading" class="loading">{{ t('route.schemaLoading') }}</div>
  <FcEmpty v-else-if="!schema?.config_schema?.properties || Object.keys(schema.config_schema.properties).length === 0" :title="t('route.noSchema')" />
  <div v-else>
    <div v-for="(value, key) in schema.config_schema.properties" :key="key">
      <FcFormItem :label="value.title || key">
        <FcSelect
          v-if="value.type === 'string' && value.enum"
          v-model="model[key]"
          :options="value.enum.map((o: string) => ({ value: o, label: o }))"
        />
        <FcInput v-else-if="(value.type || 'string') === 'string'" v-model="model[key]" :placeholder="value.title" maxlength="500" />
        <el-input-number v-else-if="value.type === 'integer' || value.type === 'number'" v-model="model[key]" :min="value.minimum" :max="value.maximum" :step="value.type === 'number' ? 0.01 : 1" style="width: 100%" />
        <FcSwitch v-else-if="value.type === 'boolean'" v-model="model[key]" />
        <FcSelect
          v-else-if="value.type === 'array'"
          v-model="model[key]"
          filterable multiple
          :options="(value.items?.enum || []).map((v: string) => ({ value: v, label: v }))"
        />
        <FcInput
          v-else-if="value.type === 'object'"
          v-model="model[key]"
          type="textarea"
          :rows="3"
          placeholder='{"key":"value"}'
        />
        <FcInput v-else v-model="model[key]" maxlength="500" />
      </FcFormItem>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcFormItem, FcInput, FcEmpty, FcSelect, FcSwitch } from '@/components'
import { getBuiltinSchema } from '@/api/plugins'

const { t } = useI18n()

const props = defineProps<{
  pluginId: string
  modelValue?: Record<string, any>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>()

const model = ref<Record<string, any>>({ ...(props.modelValue ?? {}) })
const schema = ref<any>(null)
const loading = ref(false)
let syncingFromProp = false

watch(() => props.modelValue, (v) => {
  if (v && typeof v === 'object') {
    syncingFromProp = true
    model.value = { ...v }
    syncingFromProp = false
  }
}, { deep: true })

watch(model, (v) => {
  if (!syncingFromProp) emit('update:modelValue', v)
}, { deep: true })

onMounted(async () => {
  if (!props.pluginId) return
  loading.value = true
  try {
    schema.value = await getBuiltinSchema(props.pluginId)
    const propsSchema = schema.value?.config_schema?.properties || {}
    for (const k of Object.keys(propsSchema)) {
      if (model.value[k] === undefined) {
        const prop = propsSchema[k]
        if (prop.default !== undefined) {
          model.value[k] = prop.default
        } else {
          switch (prop.type) {
            case 'integer': model.value[k] = 0; break
            case 'number': model.value[k] = 0; break
            case 'boolean': model.value[k] = false; break
            case 'array': model.value[k] = []; break
            case 'object': model.value[k] = '{}'; break
            default: model.value[k] = ''
          }
        }
      }
    }
  } catch {
    schema.value = null
  } finally {
    loading.value = false
  }
})
</script>
<style scoped>
.loading { padding: 16px; color: var(--app-text-secondary); }
</style>
