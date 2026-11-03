<template>
  <el-form :model="local" :rules="formRules" label-width="120px" class="form-block" ref="formRef">
    <FcFormItem :label="t('route.name')" prop="route_name">
      <template #label>
        <span>{{ t('route.name') }}</span>
        <FcHelpTip content-key="route.help.name" />
      </template>
      <FcInput v-model="local.route_name" maxlength="50" />
    </FcFormItem>
    <FcFormItem :label="t('route.type')" prop="route_type">
      <FcSegmented v-model="local.route_type" :options="typeOptions" />
    </FcFormItem>
    <FcFormItem v-if="local.route_type === 'DISPATCH' && routeOptions?.length" :label="t('route.parentRoute')">
      <FcSelect v-model="local.parent_route_id" :options="routeOptions" clearable :placeholder="t('route.parentRoutePlaceholder')" />
    </FcFormItem>
    <FcFormItem v-if="local.route_type === 'BACKEND'" :label="t('route.path')" prop="path">
      <template #label>
        <span>{{ t('route.path') }}</span>
        <FcHelpTip content-key="route.help.path" />
      </template>
      <FcInput v-model="local.path" placeholder="/api/example" maxlength="500" />
    </FcFormItem>
    <FcFormItem v-if="local.route_type === 'BACKEND'" :label="t('route.upstream')" prop="upstream_url">
      <template #label>
        <span>{{ t('route.upstream') }}</span>
        <FcHelpTip content-key="route.help.upstream" />
      </template>
      <FcInput v-model="local.upstream_url" placeholder="http://backend:8080" maxlength="500" />
    </FcFormItem>
    <FcFormItem :label="t('route.sort')" prop="sort_order">
      <FcInputNumber v-model="local.sort_order" :min="1" :max="9999" />
    </FcFormItem>
    <FcFormItem :label="t('route.remark')" prop="remark">
      <FcInput v-model="local.remark" type="textarea" :rows="3" maxlength="200" />
    </FcFormItem>
    <FcFormItem :label="t('route.tags')" prop="tags">
      <FcInput v-model="local.tags" :placeholder="t('route.tagsPlaceholder')" maxlength="200" />
    </FcFormItem>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcInput, FcFormItem, FcSegmented, FcSelect, FcHelpTip, FcInputNumber } from '@/components'
import type { SelectOption } from '@/components/form/_types'

export interface RouteBasic {
  route_name: string
  route_type: 'BACKEND' | 'DISPATCH'
  path: string
  upstream_url: string
  sort_order: number
  remark: string
  parent_route_id?: string
  /** 逗号分隔的标签，如 "prod,core" */
  tags?: string
}

const { t } = useI18n()

const props = defineProps<{ modelValue: RouteBasic; routeOptions?: SelectOption[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: RouteBasic): void }>()

const local = ref<RouteBasic>({ ...props.modelValue })
let syncingFromProp = false
watch(() => props.modelValue, (v) => { syncingFromProp = true; local.value = { ...v }; syncingFromProp = false }, { deep: true })
watch(local, (v) => { if (!syncingFromProp) emit('update:modelValue', { ...v }) }, { deep: true })

const typeOptions = computed(() => [
  { value: 'BACKEND', label: t('route.typeBackend') },
  { value: 'DISPATCH', label: t('route.typeDispatch') }
])

const formRef = ref<any>(null)

const formRules = computed(() => {
  const isBackend = local.value.route_type === 'BACKEND'
  return {
    route_name: [
      { required: true, message: () => t('route.nameRequired'), trigger: 'blur' },
      { pattern: /^[a-zA-Z0-9_]{2,50}$/, message: () => t('route.namePattern'), trigger: 'blur' }
    ],
    route_type: [
      { required: true, message: () => t('route.type'), trigger: 'change' }
    ],
    ...(isBackend ? {
      path: [
        { required: true, message: () => t('route.pathRequired'), trigger: 'blur' },
        { pattern: /^\/[^\s]+$/, message: () => t('route.pathPattern'), trigger: 'blur' }
      ],
      upstream_url: [
        { required: true, message: () => t('route.upstreamRequired'), trigger: 'blur' },
        { pattern: /^https?:\/\/\S+$/, message: () => t('route.upstreamPattern'), trigger: 'blur' }
      ]
    } : {}),
    sort_order: [
      { type: 'number' as const, min: 1, max: 9999, message: () => t('route.sortOrderRange'), trigger: 'blur' }
    ],
    remark: [
      { max: 200, message: () => t('route.remarkMaxLength'), trigger: 'blur' }
    ]
  }
})

async function validate(): Promise<boolean> {
  if (!formRef.value) return true
  try {
    await formRef.value.validate()
    return true
  } catch {
    return false
  }
}

function setFieldErrors(errors: Record<string, string>) {
  if (!formRef.value) return
  const fields = (formRef.value as any).fields || {}
  for (const [prop, msg] of Object.entries(errors)) {
    const item = fields[prop]
    if (item) {
      item.validateState = 'error'
      item.validateMessage = msg
    }
  }
}

defineExpose({ validate, setFieldErrors })
</script>
