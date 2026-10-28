<template>
  <div class="app-page">
    <div v-if="loadError" class="load-error-state" data-testid="load-error">
      <p>{{ t('gateway.common.failed') }}：{{ loadError }}</p>
      <FcButton @click="goBack">{{ t('gateway.common.cancel') }}</FcButton>
    </div>

    <FcSectionCard v-if="loading && !loadError" padding="lg">
      <FcSkeleton variant="text" :rows="5" />
    </FcSectionCard>

    <FcSectionCard v-if="!loadError && !loading" padding="none">
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-basic>
          <el-form :model="form" :rules="formRules" label-width="120px" ref="formRef">
            <el-form-item :label="t('gateway.plugin.name')" prop="plugin_name"><FcInput v-model="form.plugin_name" :disabled="isEdit" maxlength="50" /></el-form-item>
            <el-form-item :label="t('gateway.plugin.id')" prop="plugin_id"><FcInput v-model="form.plugin_id" :disabled="isEdit" maxlength="50" /></el-form-item>
            <el-form-item :label="t('gateway.plugin.type')" prop="plugin_type">
              <FcSegmented v-model="form.plugin_type" :options="typeOpts" :disabled="isEdit" />
            </el-form-item>
            <el-form-item :label="t('gateway.plugin.phase')" prop="plugin_phase">
              <FcSegmented v-model="form.plugin_phase" :options="phaseOpts" />
            </el-form-item>
            <el-form-item :label="t('gateway.plugin.scope')">
              <FcSegmented v-model="form.scope" :options="scopeOpts" />
            </el-form-item>
            <el-form-item :label="t('gateway.plugin.editorConfigJson')" prop="config">
              <el-input v-model="form.config" type="textarea" :rows="6" maxlength="10000" />
            </el-form-item>
            <el-form-item :label="t('gateway.plugin.sortOrder')" prop="sort_order">
              <el-input-number v-model="form.sort_order" :min="1" :max="9999" />
            </el-form-item>
            <el-form-item :label="t('gateway.plugin.remark')">
              <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="200" show-word-limit />
            </el-form-item>
          </el-form>
        </template>

        <template #tab-groovy v-if="form.plugin_type === 'GROOVY'">
          <el-input v-model="form.script_content" type="textarea" :rows="14" maxlength="65536" placeholder="def x = 1; return true" />
          <FcButton variant="secondary" style="margin-top: 8px" @click="validateGroovyScript">{{ t('gateway.plugin.validate') }}</FcButton>
          <div v-if="groovyResult" class="hint">{{ groovyResult }}</div>
        </template>

        <template #tab-jar v-if="form.plugin_type === 'JAR'">
          <FcDropZone accept=".jar" :max-size="MAX_JAR_SIZE" :multiple="false" @drop="onJar" data-testid="jar-dropzone" />
          <div v-if="form.jar_file" class="hint">{{ t('gateway.plugin.editorJarSelected') }}：{{ form.jar_file.name }} ({{ Math.round((form.jar_file.size || 0) / 1024) }} KB)</div>
        </template>

        <template #tab-group v-if="form.plugin_type === 'GROUP'">
          <FcSelect v-model="form.group_member_ids" multiple :options="memberOptions" filterable :placeholder="t('gateway.plugin.editorGroupPlaceholder')" />
        </template>
      </FcTabsPanel>

      <template #footer>
        <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
        <FcButton @click="goBack">{{ t('gateway.common.cancel') }}</FcButton>
        <FcButton v-if="canEdit('plugin')" variant="primary" :loading="saving" @click="save">{{ t('gateway.common.save') }}</FcButton>
      </template>
    </FcSectionCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSectionCard, FcTabsPanel, FcInput, FcSegmented, FcButton, FcDropZone, FcSkeleton, FcSelect
} from '@/components/sdk'
import { createPlugin, updatePlugin, getPlugin, validateGroovy, listPlugins } from '@/api/gateway/plugins'
import { mapFieldErrors } from '@/api/gateway/envelope'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const route = useRoute()
const router = useRouter()
const tab = ref('basic')
const tabs = computed(() => [
  { value: 'basic', label: t('gateway.plugin.editorTabBasic') },
  { value: 'groovy', label: t('gateway.plugin.editorTabGroovy') },
  { value: 'jar', label: t('gateway.plugin.editorTabJar') },
  { value: 'group', label: t('gateway.plugin.editorTabGroup') }
])
const form = ref<any>({
  plugin_name: '', plugin_id: '', plugin_type: 'GROOVY', plugin_phase: 'PRE',
  scope: 'ROUTE', config: '{}', script_content: '', jar_file: null,
  sort_order: 1, remark: '', group_member_ids: []
})
const typeOpts = computed(() => [
  { value: 'BUILTIN', label: t('gateway.plugin.typeBuiltin') },
  { value: 'JAR', label: t('gateway.plugin.typeJar') },
  { value: 'GROOVY', label: t('gateway.plugin.typeGroovy') },
  { value: 'GROUP', label: t('gateway.plugin.typeGroup') }
])
const phaseOpts = computed(() => [
  { value: 'PRE', label: t('gateway.plugin.phasePre') },
  { value: 'POST', label: t('gateway.plugin.phasePost') }
])
const scopeOpts = computed(() => [
  { value: 'ROUTE', label: t('gateway.plugin.scopeRoute') },
  { value: 'GLOBAL', label: t('gateway.plugin.scopeGlobal') }
])
const saving = ref(false)
const saveError = ref('')
const loadError = ref('')
const loading = ref(true)
const groovyResult = ref('')
const dirty = ref(false)

const memberOptions = ref<{ value: string; label: string }[]>([])

async function loadMemberOptions() {
  try {
    const r: any = await listPlugins({ page: 1, pageSize: 200 })
    memberOptions.value = (r.records || []).map((p: any) => ({ value: p.id, label: p.plugin_name }))
  } catch {
    memberOptions.value = []
  }
}
loadMemberOptions()

const pluginId = computed(() => route.params.id as string | undefined)
const isEdit = computed(() => !!pluginId.value)

const formRef = ref<any>(null)

let loadEpoch = 0

const MAX_JAR_SIZE = 50 * 1024 * 1024
const MAX_SCRIPT_SIZE = 64 * 1024

const formRules = computed(() => ({
  plugin_name: [
    { required: true, message: () => t('gateway.plugin.nameRequired'), trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{2,50}$/, message: () => t('gateway.plugin.namePattern'), trigger: 'blur' }
  ],
  plugin_id: [
    { required: true, message: () => t('gateway.plugin.idRequired'), trigger: 'blur' }
  ],
  plugin_type: [
    { required: true, message: () => t('gateway.plugin.type'), trigger: 'change' }
  ],
  plugin_phase: [
    { required: true, message: () => t('gateway.plugin.phaseRequired'), trigger: 'change' }
  ],
  sort_order: [
    { validator: (_rule: any, value: number, cb: (err?: Error) => void) => {
        if (value !== undefined && value !== null && (value < 1 || value > 9999)) {
          cb(new Error(t('gateway.plugin.sortOrderRange')))
        } else {
          cb()
        }
      }, trigger: 'blur' }
  ],
  config: [
    { validator: (_rule: any, value: string, cb: (err?: Error) => void) => {
        if (value && value.trim()) {
          try { JSON.parse(value); cb() } catch { cb(new Error(t('gateway.plugin.configJsonInvalid'))) }
        } else { cb() }
      }, trigger: 'blur' }
  ]
}))

function validateJarFile(file: File): boolean {
  if (file && file.size > MAX_JAR_SIZE) {
    saveError.value = t('gateway.plugin.jarSizeExceeded')
    return false
  }
  saveError.value = ''
  return true
}

let dirtyTracking = false
watch(form, () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

async function loadPlugin() {
  dirtyTracking = false
  if (!pluginId.value) {
    resetForm()
    loading.value = false
    dirty.value = false
    dirtyTracking = true
    return
  }
  const myEpoch = ++loadEpoch
  loading.value = true
  try {
    const r: any = await getPlugin(pluginId.value!)
    if (myEpoch !== loadEpoch) return
    if (!r) { loadError.value = t('gateway.plugin.editorLoadError'); loading.value = false; dirtyTracking = true; return }
    form.value = {
      plugin_name: r.plugin_name ?? '',
      plugin_id: r.plugin_id ?? '',
      plugin_type: r.plugin_type ?? 'GROOVY',
      plugin_phase: r.plugin_phase ?? 'PRE',
      scope: r.scope ?? 'ROUTE',
      config: typeof r.config === 'string' ? r.config : JSON.stringify(r.config ?? {}),
      script_content: r.script_content ?? '',
      jar_file: null,
      sort_order: r.sort_order ?? 1,
      remark: r.remark ?? '',
      group_member_ids: r.group_member_ids ?? []
    }
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    loadError.value = e?.message || t('gateway.common.loadFailed')
  } finally {
    if (myEpoch === loadEpoch) {
      loading.value = false
      dirty.value = false
      dirtyTracking = true
    }
  }
}

function onJar(files: File[]) {
  const file = files[0]
  if (!file) return
  if (!validateJarFile(file)) return
  form.value.jar_file = file
}

async function validateGroovyScript() {
  if (!form.value.script_content) { groovyResult.value = t('gateway.plugin.editorScriptRequired'); return }
  try {
    const r: any = await validateGroovy(form.value.script_content)
    groovyResult.value = (r as any).is_valid ? t('gateway.route.groovyValid') : t('gateway.route.groovyInvalid') + ': ' + (r as any).error_message
  } catch {
    groovyResult.value = t('gateway.plugin.editorValidateFailed')
  }
}

async function save() {
  if (!canEdit('plugin')) return
  if (loading.value) return
  if (saving.value) return
  if (formRef.value) {
    try { await formRef.value.validate() } catch { return }
  }
  if (form.value.jar_file && !validateJarFile(form.value.jar_file)) return
  saving.value = true
  saveError.value = ''
  try {
    if (isEdit.value) {
      if (form.value.plugin_type === 'GROOVY' && new Blob([form.value.script_content]).size > MAX_SCRIPT_SIZE) {
        saveError.value = t('gateway.plugin.scriptSizeExceeded')
        saving.value = false
        return
      }
      if (form.value.plugin_type === 'JAR' && form.value.jar_file) {
        const fd = new FormData()
        fd.append('plugin_name', form.value.plugin_name)
        fd.append('plugin_phase', form.value.plugin_phase)
        fd.append('scope', form.value.scope)
        fd.append('config', form.value.config)
        fd.append('sort_order', String(form.value.sort_order))
        fd.append('remark', form.value.remark || '')
        fd.append('jar_file', form.value.jar_file)
        await updatePlugin(pluginId.value!, fd as any)
      } else {
        const payload: Record<string, any> = {
          plugin_name: form.value.plugin_name,
          plugin_phase: form.value.plugin_phase,
          scope: form.value.scope,
          config: form.value.config,
          sort_order: form.value.sort_order,
          remark: form.value.remark
        }
        if (form.value.plugin_type === 'GROOVY') {
          payload.script_content = form.value.script_content
        }
        if (form.value.plugin_type === 'GROUP') {
          payload.group_member_ids = form.value.group_member_ids
        }
        await updatePlugin(pluginId.value!, payload)
      }
      ElMessage.success(t('gateway.plugin.saveSuccess'))
      dirty.value = false
      await loadPlugin()
    } else {
      if (form.value.plugin_type === 'JAR' && !form.value.jar_file) {
        saveError.value = t('gateway.plugin.jarFileRequired')
        saving.value = false
        return
      }
      if (form.value.plugin_type === 'GROOVY' && new Blob([form.value.script_content]).size > MAX_SCRIPT_SIZE) {
        saveError.value = t('gateway.plugin.scriptSizeExceeded')
        saving.value = false
        return
      }
      if (form.value.plugin_type === 'JAR' && form.value.jar_file) {
        const fd = new FormData()
        fd.append('plugin_name', form.value.plugin_name)
        fd.append('plugin_id', form.value.plugin_id)
        fd.append('plugin_type', form.value.plugin_type)
        fd.append('plugin_phase', form.value.plugin_phase)
        fd.append('scope', form.value.scope)
        fd.append('config', form.value.config)
        fd.append('sort_order', String(form.value.sort_order))
        fd.append('remark', form.value.remark || '')
        fd.append('jar_file', form.value.jar_file)
        await createPlugin(fd)
      } else {
        await createPlugin({
          plugin_name: form.value.plugin_name,
          plugin_id: form.value.plugin_id,
          plugin_type: form.value.plugin_type,
          plugin_phase: form.value.plugin_phase,
          scope: form.value.scope,
          config: form.value.config,
          sort_order: form.value.sort_order,
          remark: form.value.remark,
          script_content: form.value.plugin_type === 'GROOVY' ? form.value.script_content : undefined,
          group_member_ids: form.value.plugin_type === 'GROUP' ? form.value.group_member_ids : undefined
        })
      }
      ElMessage.success(t('gateway.plugin.saveSuccess'))
      await router.push('/plugins')
    }
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0 && formRef.value) {
      const fields = (formRef.value as any).fields || {}
      for (const [prop, msg] of Object.entries(fieldErrs)) {
        const item = fields[prop]
        if (item) {
          item.validateState = 'error'
          item.validateMessage = msg
        }
      }
    }
    saveError.value = e?.message || t('gateway.common.saveFailed')
  } finally {
    saving.value = false
  }
}

onMounted(loadPlugin)

function resetForm() {
  form.value = {
    plugin_name: '', plugin_id: '', plugin_type: 'GROOVY', plugin_phase: 'PRE',
    scope: 'ROUTE', config: '{}', script_content: '', jar_file: null,
    sort_order: 1, remark: '', group_member_ids: []
  }
  loadError.value = ''
  saveError.value = ''
  groovyResult.value = ''
}

watch(() => pluginId.value, () => {
  dirtyTracking = false
  loadPlugin()
})

onBeforeRouteLeave(async () => {
  if (dirty.value && !saving.value) {
    if (!await confirm({ title: t('gateway.common.unsavedChanges'), variant: 'danger' })) return false
  }
})

async function goBack() {
  await router.back()
}
</script>

<style scoped>
.hint { padding: 8px 12px; background: var(--app-bg-muted); border-radius: 6px; font-size: 13px; }
.save-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0 auto 0 0;
}
.load-error-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
  color: var(--app-danger);
  font-size: 14px;
}
.load-error-state p { margin: 0; }
</style>
