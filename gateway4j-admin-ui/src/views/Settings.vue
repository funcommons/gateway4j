<template>
  <div class="app-page">
    <FcSection>
      <p v-if="!canEdit('system')" class="readonly-hint" data-testid="readonly-hint">当前账号为只读权限，如需操作请联系管理员</p>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-general>
          <p v-if="configLoadError" class="load-error" data-testid="config-load-error">{{ configLoadError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="3" />
          <template v-else>
          <el-form :model="generalForm" label-width="160px">
            <el-form-item :label="t('settings.siteName')">
              <FcInput v-model="generalForm.site_name" maxlength="50" />
            </el-form-item>
            <el-form-item :label="t('settings.language')">
              <FcSelect v-model="generalForm.language" :options="langOpts" />
            </el-form-item>
          </el-form>
          <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
          <FcButton v-if="canEdit('system')" variant="primary" :loading="saving" @click="saveGeneral">{{ t('common.save') }}</FcButton>
          </template>
        </template>

        <template #tab-security>
          <p v-if="configLoadError" class="load-error" data-testid="config-load-error">{{ configLoadError }}</p>
          <FcSkeleton v-if="loading" variant="text" :rows="3" />
          <template v-else>
          <el-form :model="securityForm" :rules="securityFormRules" label-width="160px" ref="securityFormRef">
            <el-form-item :label="t('settings.tokenExpiry')" prop="token_expiry_hours">
              <el-input-number v-model="securityForm.token_expiry_hours" :min="1" :max="8760" />
            </el-form-item>
            <el-form-item :label="t('settings.refreshExpiry')" prop="refresh_expiry_days">
              <el-input-number v-model="securityForm.refresh_expiry_days" :min="1" :max="365" />
            </el-form-item>
          </el-form>
          <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
          <FcButton v-if="canEdit('system')" variant="primary" :loading="saving" @click="saveSecurity">{{ t('common.save') }}</FcButton>
          </template>
        </template>

        <template #tab-dict>
          <FcInput v-model="code" :placeholder="t('settings.dictPlaceholder')" clearable />
          <FcButton variant="primary" :loading="dictLoading" @click="loadDict" style="margin: 8px 0">{{ t('settings.dictQuery') }}</FcButton>
          <p v-if="dictError" class="load-error" data-testid="load-error">{{ dictError }}</p>
          <FcTable v-else :data="entries" stripe>
            <el-table-column prop="value" :label="t('settings.dictValue')" />
            <el-table-column prop="label" :label="t('settings.dictLabel')" />
          </FcTable>
          <FcEmpty v-if="!dictError && !entries.length" :title="t('common.empty')" />
        </template>

        <template #tab-theme>
          <p>{{ t('settings.themeHint') }}</p>
        </template>

        <template #tab-changes>
          <div class="changes-toolbar">
            <FcButton variant="primary" size="sm" :loading="changesLoading" data-testid="changes-refresh" @click="loadChanges">{{ t('common.refresh') }}</FcButton>
          </div>
          <!-- 接口 404 / 失败时显示不可用空态而非报错崩页 -->
          <FcEmpty v-if="changesUnavailable" type="error" :title="t('settings.changesUnavailable')" data-testid="changes-unavailable" />
          <template v-else>
            <FcTable :data="changes" :loading="changesLoading" stripe>
              <el-table-column :label="t('settings.changeTime')" width="180">
                <template #default="{ row }">{{ formatChangeTime((row as any).updated_at) }}</template>
              </el-table-column>
              <el-table-column :label="t('settings.changeType')" width="100">
                <template #default="{ row }">
                  <FcTag :color="(row as any).type === 'plugin' ? 'success' : 'brand'" size="sm" :data-testid="`changes-type-${(row as any).type}`">
                    {{ (row as any).type === 'plugin' ? t('settings.changeTypePlugin') : t('settings.changeTypeRoute') }}
                  </FcTag>
                </template>
              </el-table-column>
              <el-table-column prop="name" :label="t('settings.changeName')" />
              <el-table-column :label="t('route.status')" width="120">
                <template #default="{ row }">
                  <FcStatusBadge :tone="changeStatusTone((row as any).status)" :label="changeStatusLabel((row as any).status)" />
                </template>
              </el-table-column>
              <el-table-column prop="config_version" :label="t('settings.changeVersion')" width="140" />
            </FcTable>
            <FcEmpty v-if="!changesLoading && !changes.length" :title="t('settings.changesEmpty')" data-testid="changes-empty" />
          </template>
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
  FcSection, FcTabsPanel, FcInput, FcSelect, FcButton, FcTable, FcEmpty, FcSkeleton,
  FcTag, FcStatusBadge
} from '@/components'
import { getDict, getConfig, saveConfig, listChanges, type ChangeItem } from '@/api/misc'
import { mapFieldErrors } from '@/api/http'
import { formatDate } from '@/utils'

const { t, locale } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const tab = ref('general')
const tabs = computed(() => [
  { value: 'general', label: t('settings.tabGeneral') },
  { value: 'security', label: t('settings.tabSecurity') },
  { value: 'dict', label: t('settings.tabDict') },
  { value: 'theme', label: t('settings.tabTheme') },
  { value: 'changes', label: t('settings.tabChanges') }
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
          cb(new Error(t('settings.tokenExpiryRange')))
        } else { cb() }
      }, trigger: 'blur' }
  ],
  refresh_expiry_days: [
    { validator: (_rule: any, value: number, cb: (err?: Error) => void) => {
        if (value !== undefined && value !== null && (value < 1 || value > 365)) {
          cb(new Error(t('settings.refreshExpiryRange')))
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
    configLoadError.value = e?.message || t('common.loadFailed')
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
    ElMessage.success(t('settings.saveSuccess'))
    dirty.value = false
    locale.value = generalForm.value.language
    localStorage.setItem('gw4j_lang', generalForm.value.language)
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) saveError.value = Object.values(fieldErrs).join('; ')
    else saveError.value = e?.message || t('common.saveFailed')
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
    ElMessage.success(t('settings.saveSuccess'))
    dirty.value = false
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) saveError.value = Object.values(fieldErrs).join('; ')
    else saveError.value = e?.message || t('common.saveFailed')
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
    dictError.value = e?.message || t('common.loadFailed')
  } finally {
    dictLoading.value = false
  }
}

// ===== 变更记录 Tab（T3）=====
const changes = ref<ChangeItem[]>([])
const changesLoading = ref(false)
const changesUnavailable = ref(false)

async function loadChanges() {
  changesLoading.value = true
  try {
    const r = (await listChanges(50)) as ChangeItem[]
    changes.value = Array.isArray(r) ? r : []
    changesUnavailable.value = false
  } catch {
    // 404 / 失败：显示「接口暂不可用」空态，不崩页
    changes.value = []
    changesUnavailable.value = true
  } finally {
    changesLoading.value = false
  }
}

const CHANGE_STATUS_KEY: Record<string, string> = {
  DRAFT: 'route.statusDraft',
  PUBLISHED: 'route.statusPublished',
  CHANGING: 'route.statusChanging',
  OFFLINE: 'route.statusOffline',
  ENABLED: 'common.enabled',
  DISABLED: 'common.disabled'
}

function changeStatusLabel(status: string): string {
  const key = CHANGE_STATUS_KEY[status]
  return key ? t(key) : status
}

function changeStatusTone(status: string): 'success' | 'processing' | 'error' | 'pending' | 'neutral' {
  switch (status) {
    case 'PUBLISHED':
    case 'ENABLED':
      return 'success'
    case 'CHANGING':
      return 'processing'
    case 'DRAFT':
      return 'pending'
    default:
      return 'neutral'
  }
}

function formatChangeTime(v: number | string | undefined | null): string {
  if (v === undefined || v === null || v === '') return '-'
  let ms: number
  if (typeof v === 'number') {
    ms = v < 1e12 ? v * 1000 : v
  } else if (/^\d+$/.test(v)) {
    const n = Number(v)
    ms = n < 1e12 ? n * 1000 : n
  } else {
    ms = Date.parse(v)
  }
  const d = new Date(ms)
  return isNaN(d.getTime()) ? String(v) : formatDate(d)
}

onMounted(() => {
  loadConfig()
  loadDict()
  loadChanges()
})

onBeforeRouteLeave(async () => {
  if (dirty.value && !saving.value) {
    if (!await confirm({ title: t('common.unsavedChanges'), variant: 'danger' })) return false
  }
})
</script>

<style scoped>
.readonly-hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--app-bg-muted, #f5f7fa);
  border-radius: var(--app-radius-sm);
}
.save-error, .load-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 8px 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-danger) 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.changes-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
</style>
