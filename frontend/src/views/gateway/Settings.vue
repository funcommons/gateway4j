<template>
  <div class="app-page">
    <FcSection>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-general>
          <p v-if="configLoadError" class="load-error" data-testid="config-load-error">{{ configLoadError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="3" />
          <template v-else>
          <el-form :model="generalForm" label-width="160px">
            <el-form-item :label="t('gateway.settings.siteName')">
              <FcInput v-model="generalForm.site_name" maxlength="50" />
            </el-form-item>
            <el-form-item :label="t('gateway.settings.language')">
              <FcSelect v-model="generalForm.language" :options="langOpts" />
            </el-form-item>
          </el-form>
          <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
          <FcButton v-if="canEdit('system')" variant="primary" :loading="saving" @click="saveGeneral">{{ t('gateway.common.save') }}</FcButton>
          </template>
        </template>

        <template #tab-security>
          <p v-if="configLoadError" class="load-error" data-testid="config-load-error">{{ configLoadError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="3" />
          <template v-else>
          <el-form :model="securityForm" :rules="securityFormRules" label-width="160px" ref="securityFormRef">
            <el-form-item :label="t('gateway.settings.tokenExpiry')" prop="token_expiry_hours">
              <el-input-number v-model="securityForm.token_expiry_hours" :min="1" :max="8760" />
            </el-form-item>
            <el-form-item :label="t('gateway.settings.refreshExpiry')" prop="refresh_expiry_days">
              <el-input-number v-model="securityForm.refresh_expiry_days" :min="1" :max="365" />
            </el-form-item>
          </el-form>
          <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
          <FcButton v-if="canEdit('system')" variant="primary" :loading="saving" @click="saveSecurity">{{ t('gateway.common.save') }}</FcButton>
          </template>
        </template>

        <template #tab-dict>
          <FcInput v-model="code" :placeholder="t('gateway.settings.dictPlaceholder')" clearable />
          <FcButton variant="primary" :loading="dictLoading" @click="loadDict" style="margin: 8px 0">{{ t('gateway.settings.dictQuery') }}</FcButton>
          <p v-if="dictError" class="load-error" data-testid="load-error">{{ dictError }}</p>
          <FcTable v-else :data="entries" stripe>
            <el-table-column prop="value" :label="t('gateway.settings.dictValue')" />
            <el-table-column prop="label" :label="t('gateway.settings.dictLabel')" />
          </FcTable>
          <FcEmpty v-if="!dictError && !entries.length" :title="t('gateway.common.empty')" />
        </template>

        <template #tab-theme>
          <p>{{ t('gateway.settings.themeHint') }}</p>
        </template>
      </FcTabsPanel>
    </FcSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcSection, FcTabsPanel, FcInput, FcSelect, FcButton, FcTable, FcEmpty, FcSkeleton
} from '@/components/sdk'
import { getDict, getConfig, saveConfig } from '@/api/gateway/misc'
import { mapFieldErrors } from '@/api/gateway/envelope'

const { t, locale } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const tab = ref('general')
const tabs = computed(() => [
  { value: 'general', label: t('gateway.settings.tabGeneral') },
  { value: 'security', label: t('gateway.settings.tabSecurity') },
  { value: 'dict', label: t('gateway.settings.tabDict') },
  { value: 'theme', label: t('gateway.settings.tabTheme') }
])

const saving = ref(false)
const loading = ref(true)
const saveError = ref('')
const configLoadError = ref('')
const dirty = ref(false)

let dirtyTracking = false

const generalForm = ref<Record<string, any>>({
  site_name: 'Gateway4j',
  language: 'zh-CN'
})

const securityForm = ref<Record<string, any>>({
  token_expiry_hours: 2,
  refresh_expiry_days: 30
})

watch([generalForm, securityForm], () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

const securityFormRef = ref<any>(null)

const securityFormRules = computed(() => ({
  token_expiry_hours: [
    { validator: (_rule: any, value: number, cb: (err?: Error) => void) => {
        if (value !== undefined && value !== null && (value < 1 || value > 720)) {
          cb(new Error(t('gateway.settings.tokenExpiryRange')))
        } else { cb() }
      }, trigger: 'blur' }
  ],
  refresh_expiry_days: [
    { validator: (_rule: any, value: number, cb: (err?: Error) => void) => {
        if (value !== undefined && value !== null && (value < 1 || value > 365)) {
          cb(new Error(t('gateway.settings.refreshExpiryRange')))
        } else { cb() }
      }, trigger: 'blur' }
  ]
}))

const langOpts = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

let loadEpoch = 0

async function loadConfig() {
  const myEpoch = ++loadEpoch
  dirtyTracking = false
  loading.value = true
  configLoadError.value = ''
  try {
    const r = await getConfig('system') as any
    if (myEpoch !== loadEpoch) return
    if (r.site_name) generalForm.value.site_name = r.site_name
    if (r.language) generalForm.value.language = r.language
    if (r.token_expiry_hours != null) securityForm.value.token_expiry_hours = r.token_expiry_hours
    if (r.refresh_expiry_days != null) securityForm.value.refresh_expiry_days = r.refresh_expiry_days
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    configLoadError.value = e?.message || t('gateway.common.loadFailed')
  } finally {
    if (myEpoch === loadEpoch) {
      loading.value = false
      dirty.value = false
      dirtyTracking = true
    }
  }
}

async function saveGeneral() {
  if (!canEdit('system')) return
  if (loading.value) return
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await saveConfig('system', {
      site_name: generalForm.value.site_name,
      language: generalForm.value.language
    })
    ElMessage.success(t('gateway.settings.saveSuccess'))
    dirty.value = false
    locale.value = generalForm.value.language
    localStorage.setItem('gw4j_lang', generalForm.value.language)
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) saveError.value = Object.values(fieldErrs).join('; ')
    else saveError.value = e?.message || t('gateway.common.saveFailed')
  } finally {
    saving.value = false
  }
}

async function saveSecurity() {
  if (!canEdit('system')) return
  if (loading.value) return
  if (saving.value) return
  if (securityFormRef.value) {
    try { await securityFormRef.value.validate() } catch { return }
  }
  saving.value = true
  saveError.value = ''
  try {
    await saveConfig('system', {
      token_expiry_hours: securityForm.value.token_expiry_hours,
      refresh_expiry_days: securityForm.value.refresh_expiry_days
    })
    ElMessage.success(t('gateway.settings.saveSuccess'))
    dirty.value = false
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) saveError.value = Object.values(fieldErrs).join('; ')
    else saveError.value = e?.message || t('gateway.common.saveFailed')
  } finally {
    saving.value = false
  }
}

// Dict tab
const code = ref('ROUTE_TYPE')
const entries = ref<any[]>([])
const dictError = ref('')
const dictLoading = ref(false)

async function loadDict() {
  if (!code.value) return
  dictLoading.value = true
  dictError.value = ''
  try {
    entries.value = (await getDict(code.value)) as any
  } catch (e: any) {
    entries.value = []
    dictError.value = e?.message || t('gateway.common.loadFailed')
  } finally {
    dictLoading.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadDict()
})

onBeforeRouteLeave(async () => {
  if (dirty.value && !saving.value) {
    if (!await confirm({ title: t('gateway.common.unsavedChanges'), variant: 'danger' })) return false
  }
})
</script>

<style scoped>
.save-error, .load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 8px 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
