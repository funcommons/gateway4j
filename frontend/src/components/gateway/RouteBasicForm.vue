<template>
  <el-form :model="local" :rules="formRules" label-width="120px" class="form-block" ref="formRef">
    <el-form-item :label="t('gateway.route.name')" prop="route_name">
      <FcInput v-model="local.route_name" maxlength="50" />
    </el-form-item>
    <el-form-item :label="t('gateway.route.type')" prop="route_type">
      <FcSegmented v-model="local.route_type" :options="typeOptions" />
    </el-form-item>
    <el-form-item v-if="local.route_type === 'DISPATCH' && routeOptions?.length" :label="t('gateway.route.parentRoute')">
      <FcSelect v-model="local.parent_route_id" :options="routeOptions" clearable :placeholder="t('gateway.route.parentRoutePlaceholder')" />
    </el-form-item>
    <el-form-item v-if="local.route_type === 'BACKEND'" :label="t('gateway.route.path')" prop="path">
      <FcInput v-model="local.path" placeholder="/api/example" maxlength="500" />
    </el-form-item>
    <el-form-item v-if="local.route_type === 'BACKEND'" :label="t('gateway.route.upstream')" prop="upstream_url">
      <FcInput v-model="local.upstream_url" placeholder="http://backend:8080" maxlength="500" />
    </el-form-item>
    <el-form-item :label="t('gateway.route.sort')" prop="sort_order">
      <el-input-number v-model="local.sort_order" :min="1" :max="9999" />
    </el-form-item>
    <el-form-item :label="t('gateway.route.remark')" prop="remark">
      <el-input v-model="local.remark" type="textarea" :rows="3" maxlength="200" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcInput, FcSegmented, FcSelect } from '@/components/sdk'
import type { SelectOption } from '@/components/sdk'

export interface RouteBasic {
  route_name: string
  route_type: 'BACKEND' | 'DISPATCH'
  path: string
  upstream_url: string
  sort_order: number
  remark: string
  parent_route_id?: string
}

const { t } = useI18n()

const props = defineProps<{ modelValue: RouteBasic; routeOptions?: SelectOption[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: RouteBasic): void }>()

const local = ref<RouteBasic>({ ...props.modelValue })
let syncingFromProp = false
watch(() => props.modelValue, (v) => { syncingFromProp = true; local.value = { ...v }; syncingFromProp = false }, { deep: true })
watch(local, (v) => { if (!syncingFromProp) emit('update:modelValue', { ...v }) }, { deep: true })

const typeOptions = computed(() => [
  { value: 'BACKEND', label: t('gateway.route.typeBackend') },
  { value: 'DISPATCH', label: t('gateway.route.typeDispatch') }
])

const formRef = ref<any>(null)

const formRules = computed(() => {
  const isBackend = local.value.route_type === 'BACKEND'
  return {
    route_name: [
      { required: true, message: () => t('gateway.route.nameRequired'), trigger: 'blur' },
      { pattern: /^[a-zA-Z0-9_]{2,50}$/, message: () => t('gateway.route.namePattern'), trigger: 'blur' }
    ],
    route_type: [
      { required: true, message: () => t('gateway.route.type'), trigger: 'change' }
    ],
    ...(isBackend ? {
      path: [
        { required: true, message: () => t('gateway.route.pathRequired'), trigger: 'blur' },
        { pattern: /^\/[^\s]+$/, message: () => t('gateway.route.pathPattern'), trigger: 'blur' }
      ],
      upstream_url: [
        { required: true, message: () => t('gateway.route.upstreamRequired'), trigger: 'blur' },
        { pattern: /^https?:\/\/\S+$/, message: () => t('gateway.route.upstreamPattern'), trigger: 'blur' }
      ]
    } : {}),
    sort_order: [
      { type: 'number' as const, min: 1, max: 9999, message: () => t('gateway.route.sortOrderRange'), trigger: 'blur' }
    ],
    remark: [
      { max: 200, message: () => t('gateway.route.remarkMaxLength'), trigger: 'blur' }
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
