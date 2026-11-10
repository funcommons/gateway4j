<template>
  <div class="set-page" data-testid="set-page">
    <!-- Section nav (P4c-1 ImportExport-style FcTabsPanel): SDK tabs prop has no testid
         channel, testid sits on the panel root (set-section-nav); the four section panels
         live in this component with v-show (all panels must coexist in the DOM) -->
    <FcTabsPanel v-model="tab" :tabs="tabs" data-testid="set-section-nav" />

    <!-- ══ general site settings (legacy general/security tabs merged: one 4-field form) ═══ -->
    <div v-show="tab === 'general'" class="set-section" data-testid="set-section-general">
      <!-- Loading skeleton: getConfig pending shows skeleton, form and error bar absent -->
      <div v-if="loading && canEdit('system') && !loadError" class="set-skeleton" data-testid="set-skeleton">
        <FcSkeleton variant="text" :rows="6" />
      </div>
      <!-- Page-level error bar + retry button (v2 adds the retry, group-wide precedent) -->
      <div v-else-if="loadError" class="set-hint is-danger" role="alert" data-testid="set-error">
        <i class="ri-error-warning-line" aria-hidden="true"></i>
        <span>{{ t('v2.settings.loadFailed') }}{{ loadError ? ': ' + loadError : '' }}</span>
        <FcButton variant="text" size="sm" data-testid="set-retry" @click="onRetry">
          <FcIcon name="ri-refresh-line" :size="14" />
        </FcButton>
      </div>
      <template v-else>
        <p v-if="!canEdit('system')" class="set-hint" data-testid="set-readonly-hint" role="status">
          <i class="ri-lock-2-line" aria-hidden="true"></i>
          <span>{{ t('v2.settings.readonlyHint') }}</span>
        </p>
        <div class="set-form">
          <div class="set-field">
            <label class="set-label" for="set-f-site-name">{{ t('v2.settings.fSiteName') }}</label>
            <FcInput
              id="set-f-site-name"
              v-model="form.site_name"
              maxlength="50"
              data-testid="set-input-site_name"
            />
            <p v-if="fieldErrors.site_name" class="set-err" role="alert" data-testid="set-field-error-site_name">
              {{ fieldErrors.site_name }}
            </p>
          </div>
          <div class="set-field">
            <span class="set-label">{{ t('v2.settings.fLanguage') }}</span>
            <FcSelect
              v-model="form.language"
              :options="languageOptions"
              data-testid="set-input-language"
            />
            <p v-if="fieldErrors.language" class="set-err" role="alert" data-testid="set-field-error-language">
              {{ fieldErrors.language }}
            </p>
          </div>
          <div class="set-field">
            <label class="set-label" for="set-f-token-expiry">{{ t('v2.settings.fTokenExpiry') }}</label>
            <FcInput
              id="set-f-token-expiry"
              v-model="form.token_expiry_hours"
              type="number"
              :min="1"
              :max="8760"
              data-testid="set-input-token_expiry_hours"
              @blur="validateNumeric('token_expiry_hours')"
            />
            <p v-if="fieldErrors.token_expiry_hours" class="set-err" role="alert" data-testid="set-field-error-token_expiry_hours">
              {{ fieldErrors.token_expiry_hours }}
            </p>
          </div>
          <div class="set-field">
            <label class="set-label" for="set-f-refresh-expiry">{{ t('v2.settings.fRefreshExpiry') }}</label>
            <FcInput
              id="set-f-refresh-expiry"
              v-model="form.refresh_expiry_days"
              type="number"
              :min="1"
              :max="365"
              data-testid="set-input-refresh_expiry_days"
              @blur="validateNumeric('refresh_expiry_days')"
            />
            <p v-if="fieldErrors.refresh_expiry_days" class="set-err" role="alert" data-testid="set-field-error-refresh_expiry_days">
              {{ fieldErrors.refresh_expiry_days }}
            </p>
          </div>
          <div class="set-actions">
            <FcButton
              v-if="canEdit('system')"
              variant="primary"
              :loading="saving"
              data-testid="set-submit"
              @click="onSave"
            >
              {{ t('v2.settings.save') }}
            </FcButton>
          </div>
          <!-- Non-field save error bar (field errors go to set-field-error-{field}) -->
          <p v-if="saveError" class="set-hint is-danger" role="alert" data-testid="set-save-error">
            <i class="ri-error-warning-line" aria-hidden="true"></i>
            <span>{{ t('v2.settings.saveFailed') }}{{ saveError ? ': ' + saveError : '' }}</span>
          </p>
          <!-- Dirty banner (dirtyTracking enabled only after the first load) -->
          <p v-if="dirty" class="set-hint is-warning" data-testid="set-dirty-banner">
            <i class="ri-edit-2-line" aria-hidden="true"></i>
            <span data-testid="set-leave-confirm">{{ t('v2.settings.dirtyBanner') }}{{ ' ' }}{{ t('v2.settings.unsavedChanges') }}</span>
          </p>
        </div>
      </template>
    </div>

    <!-- ══ dict section (independent downgrade: failure clears rows, no cross-section fallback) ══ -->
    <div v-show="tab === 'dict'" class="set-section" data-testid="set-section-dict">
      <div class="set-filters">
        <label class="set-field set-field--inline" for="set-f-dict-code">
          <span class="set-label">{{ t('v2.settings.dictPlaceholder') }}</span>
          <FcInput
            id="set-f-dict-code"
            v-model="dictCode"
            :placeholder="t('v2.settings.dictPlaceholder')"
            data-testid="set-dict-input"
          />
        </label>
        <FcButton variant="primary" :loading="dictLoading" data-testid="set-dict-submit" @click="onDictQuery">
          {{ t('v2.settings.dictQuery') }}
        </FcButton>
      </div>
      <div v-if="dictError" class="set-hint is-danger" role="alert" data-testid="set-dict-error">
        <i class="ri-error-warning-line" aria-hidden="true"></i>
        <span>{{ t('v2.settings.loadFailed') }}{{ dictError ? ': ' + dictError : '' }}</span>
      </div>
      <table v-if="dictEntries.length > 0" class="set-table" data-testid="set-dict-table">
        <thead>
          <tr>
            <th>{{ t('v2.settings.dictValue') }}</th>
            <th>{{ t('v2.settings.dictLabel') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, i) in dictEntries" :key="entry.value" :data-testid="`set-dict-row-${i}`">
            <td class="set-mono">{{ entry.value }}</td>
            <td>{{ entry.label }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="!dictError" class="set-empty" data-testid="set-dict-empty">
        <FcEmpty type="empty" :title="t('v2.settings.dictQuery')" />
      </div>
    </div>

    <!-- ══ changes section (listChanges(50); failure shows unavailable empty state) ═══ -->
    <div v-show="tab === 'changes'" class="set-section" data-testid="set-section-changes">
      <div class="set-filters">
        <FcButton variant="text" size="sm" data-testid="set-changes-refresh" @click="reloadChanges">
          <FcIcon name="ri-refresh-line" :size="14" />
        </FcButton>
      </div>
      <div v-if="changesUnavailable" class="set-hint is-danger" role="alert" data-testid="set-changes-unavailable">
        <i class="ri-error-warning-line" aria-hidden="true"></i>
        <span>{{ t('v2.settings.changesUnavailable') }}</span>
      </div>
      <div v-else-if="changes.length > 0" class="set-table-scroll">
        <table class="set-table set-table--wide" data-testid="set-changes-list">
          <thead>
            <tr>
              <th>{{ t('v2.settings.changeTime') }}</th>
              <th>{{ t('v2.settings.changeType') }}</th>
              <th>{{ t('v2.settings.changeName') }}</th>
              <th>{{ t('v2.settings.changeVersion') }}</th>
              <th>{{ t('v2.settings.colResult') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in changes" :key="`${row.name}-${i}`" :data-testid="`set-change-${i}`">
              <td class="set-mono">{{ formatChangeTime(row.updated_at) }}</td>
              <td>
                <span class="set-tag" :class="row.type === 'plugin' ? 'is-success' : 'is-brand'" :data-testid="`set-change-type-${row.type}`">
                  {{ changeTypeText(row.type) }}
                </span>
              </td>
              <td class="set-mono">{{ row.name }}</td>
              <td class="set-mono">{{ row.config_version }}</td>
              <td>{{ changeStatusText(row.status) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="set-empty" data-testid="set-changes-empty">
        <FcEmpty type="empty" :title="t('v2.settings.changesEmpty')" />
      </div>
    </div>

    <!-- ══ audit section (envelope paging; +8h debt kept as-is: raw same-form time render) ═══ -->
    <div v-show="tab === 'audit'" class="set-section" data-testid="set-section-audit">
      <div class="set-filters" data-testid="set-audit-filters">
        <label class="set-field set-field--inline">
          <span class="set-label">{{ t('v2.settings.colAction') }}</span>
          <FcSelect
            v-model="auditAction"
            :options="auditActionOptions"
            :placeholder="t('v2.settings.auditActionAll')"
            clearable
            data-testid="set-audit-filter-action"
            @change="onAuditFilterChange"
          />
        </label>
        <label class="set-field set-field--inline">
          <span class="set-label">{{ t('v2.settings.auditActor') }}</span>
          <FcInput
            v-model="auditActor"
            :placeholder="t('v2.settings.auditActor')"
            clearable
            data-testid="set-audit-filter-actor"
            @change="onAuditFilterChange"
          />
        </label>
        <label class="set-field set-field--inline">
          <span class="set-label">{{ t('v2.settings.auditTarget') }}</span>
          <FcInput
            v-model="auditTarget"
            :placeholder="t('v2.settings.auditTarget')"
            clearable
            data-testid="set-audit-filter-target"
            @change="onAuditFilterChange"
          />
        </label>
        <label class="set-field set-field--inline set-field--range" data-testid="set-audit-filter-range">
          <span class="set-label">{{ t('v2.settings.auditRange') }}</span>
          <FcDatePicker
            v-model="auditRange"
            type="daterange"
            value-format="YYYY-MM-DD HH:mm:ss"
            @change="onAuditFilterChange"
          />
        </label>
      </div>
      <div class="set-table-scroll">
        <table class="set-table set-table--wide" data-testid="set-audit-table">
          <thead>
            <tr>
              <th>{{ t('v2.settings.colTime') }}</th>
              <th>{{ t('v2.settings.colAction') }}</th>
              <th>{{ t('v2.settings.colActor') }}</th>
              <th>{{ t('v2.settings.colTarget') }}</th>
              <th>{{ t('v2.settings.colResult') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in auditRows" :key="String(row.id)" :data-testid="`set-audit-row-${row.id}`">
              <td class="set-mono">{{ formatChangeTime(row.created_at) }}</td>
              <td><code class="set-mono" :data-testid="`set-audit-action-${row.action}`">{{ row.action }}</code></td>
              <td>
                <button
                  v-if="row.actor"
                  type="button"
                  class="set-audit-btn"
                  :data-testid="`set-audit-actor-btn-${row.id}`"
                  :aria-label="t('v2.settings.auditFilterByValue', { value: String(row.actor) })"
                  @click="onAuditValueClick('actor', String(row.actor))"
                  @keydown.enter.prevent="onAuditValueClick('actor', String(row.actor))"
                >{{ row.actor }}</button>
                <template v-else>{{ row.actor || '-' }}</template>
              </td>
              <td class="set-mono">
                <button
                  v-if="auditTargetPayload(row)"
                  type="button"
                  class="set-audit-btn"
                  :data-testid="`set-audit-target-btn-${row.id}`"
                  :aria-label="t('v2.settings.auditFilterByValue', { value: auditTargetPayload(row) })"
                  @click="onAuditValueClick('target', auditTargetPayload(row))"
                  @keydown.enter.prevent="onAuditValueClick('target', auditTargetPayload(row))"
                >{{ auditTargetText(row) }}</button>
                <template v-else>{{ auditTargetText(row) }}</template>
              </td>
              <td>
                <span class="set-tag" :class="`is-${auditResultColor(row.result)}`" :data-testid="`set-audit-result-${row.id}`">
                  {{ row.result }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="auditRows.length === 0" class="set-empty" data-testid="set-audit-empty">
        <FcEmpty type="empty" :title="t('v2.settings.auditEmpty')" />
      </div>
      <div class="set-pager" data-testid="set-audit-pagination">
        <FcPagination
          :current-page="auditPage"
          :page-size="auditPageSize"
          :total="auditTotal"
          @change="onAuditPageChange"
        />
      </div>
    </div>

    <!-- Toast feedback mirror (set-toast-success / set-toast-error a11y live region, P4d-2 precedent) -->
    <div aria-live="polite">
      <p v-if="toastFeedback && toastFeedback.kind === 'success'" class="set-toast" data-testid="set-toast-success">
        {{ toastFeedback.text }}
      </p>
      <p v-else-if="toastFeedback && toastFeedback.kind === 'error'" class="set-toast is-error" data-testid="set-toast-error">
        {{ toastFeedback.text }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { matchedRouteKey, onBeforeRouteLeave, useRouter } from 'vue-router'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcButton, FcDatePicker, FcEmpty, FcIcon, FcInput, FcPagination, FcSelect,
  FcSkeleton, FcTabsPanel, toast
} from '@/components'
import { getDict, getConfig, saveConfig, listChanges, listAuditLogs } from '@/api/misc'
import type { AuditLogItem, AuditLogQuery } from '@/api/misc'
import { mapFieldErrors } from '@/api/http'
import { formatDate } from '@/utils'

/**
 * 系统设置 v2（旧 src/views/Settings.vue 等价迁移，语义权威 = /tmp/p4d3-notes.md）：
 * 四分区 = general 站点配置 / dict 字典 / changes 变更流 / audit 审计日志（旧 5 Tab 中
 * theme 砍除；旧「changes Tab 内 audit 优先 + 404 回退 compat 徽标」合并模式随分区拆分
 * 消亡 —— 各分区独立降级互不回退）。
 * 旧 general/security 双 Tab 双表单 → 合一单表单四字段（site_name maxlength50 /
 * language zh-CN|en-US / token_expiry_hours 1-8760 校验 1-720 / refresh_expiry_days
 * 1-365 校验 1-365），保存 payload 合并为一次 saveConfig('system', 四字段全量)。
 * loadEpoch 竞态守卫（陈旧成功不覆写、陈旧拒绝不复活错误条）；dirtyTracking 载入完成
 * 后才开（程序化回填不算脏），脏离开走 onBeforeRouteLeave + confirm(danger)。
 * +8h 债不订正（契约原文）：audit 时间列与 formatChangeTime 同式直渲，源码禁订正常数。
 */

interface ChangeRow {
  name: string
  type: string
  status: string
  config_version: string
  updated_at: number | string
}

const { t, locale } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()

// 数字输入裁决：不走 FcInputNumber —— EP el-input-number 的 attrs 落在包装 div，
// 原生 input 携带不了 data-testid（plugins/Editor.vue 同款裁决），故数字字段用
// FcInput type=number + :min/:max 原生属性（token 1-8760 / refresh 1-365）。

// —— toast 反馈镜像（set-toast-success / set-toast-error a11y live region）——
const toastFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
function notifySuccess(msg: string) {
  toastFeedback.value = { kind: 'success', text: msg }
  toast.success(msg)
}
function notifyError(msg: string) {
  toastFeedback.value = { kind: 'error', text: msg }
  toast.error(msg)
}

// —— 分区导航（面板本组件 v-show 承载，见模板注）——
type SectionValue = 'general' | 'dict' | 'changes' | 'audit'
const tab = ref<SectionValue>('general')
const tabs = computed(() => [
  { value: 'general', label: t('v2.settings.tabGeneral') },
  { value: 'dict', label: t('v2.settings.tabDict') },
  { value: 'changes', label: t('v2.settings.tabChanges') },
  { value: 'audit', label: t('v2.settings.tabAudit') }
])

// —— general 站点配置（合一表单四字段）——
const form = reactive({
  site_name: 'Gateway4j',
  language: 'zh-CN',
  token_expiry_hours: 2,
  refresh_expiry_days: 30
})
// 语言选项文案是字面值（「简体中文」「English」不入 i18n，旧页随迁）；放 script 避模板 CJK
const languageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const saveError = ref('')
const dirty = ref(false)
/** 载入完成后才开脏跟踪（dirtyTracking）：程序化回填不触发 dirty */
let dirtyTracking = false
/** loadEpoch 竞态守卫（旧页同名机制随迁） */
let loadEpoch = 0

watch(form, () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true, flush: 'sync' })

function errMsg(e: unknown): string {
  return (e as { message?: string } | undefined)?.message || ''
}

/** 回填：字符串 truthy 注入、数字 != null 注入（0 是合法值不得当空丢弃，falsy-zero 坑） */
function applyConfig(cfg: Record<string, unknown>) {
  if (cfg.site_name) form.site_name = String(cfg.site_name)
  if (cfg.language) form.language = String(cfg.language)
  if (cfg.token_expiry_hours != null) form.token_expiry_hours = Number(cfg.token_expiry_hours)
  if (cfg.refresh_expiry_days != null) form.refresh_expiry_days = Number(cfg.refresh_expiry_days)
  dirtyTracking = true
  dirty.value = false
}

async function loadConfig() {
  const myEpoch = ++loadEpoch
  loading.value = true
  try {
    const cfg = await getConfig('system')
    if (myEpoch !== loadEpoch) return
    applyConfig(cfg ?? {})
    loadError.value = ''
  } catch (e) {
    if (myEpoch !== loadEpoch) return
    loadError.value = errMsg(e) || t('v2.settings.loadFailed')
  } finally {
    if (myEpoch === loadEpoch) loading.value = false
  }
}

/**
 * 重试重入（竞态用例契约）：重试钮可重入；上一轮仍在飞时本轮立即补发一轮
 * 「新值立回」，在飞旧轮由 loadEpoch 守卫丢弃（陈旧拒绝不复活错误条、陈旧成功
 * 不覆写新值）。
 */
function onRetry() {
  const wasBusy = loading.value
  void loadConfig()
  if (wasBusy) void loadConfig()
}

// 客户端校验（set-field-error-{field} 通道，与 mapFieldErrors 服务端注入共用）
function validateNumeric(field: 'token_expiry_hours' | 'refresh_expiry_days') {
  const raw = Number(form[field])
  const ok = field === 'token_expiry_hours' ? raw >= 1 && raw <= 720 : raw >= 1 && raw <= 365
  if (Number.isFinite(raw) && ok) {
    const { [field]: _omit, ...rest } = fieldErrors.value
    fieldErrors.value = rest
  } else {
    const key = field === 'token_expiry_hours' ? 'v2.settings.ruleTokenExpiryRange' : 'v2.settings.ruleRefreshExpiryRange'
    fieldErrors.value = { ...fieldErrors.value, [field]: t(key) }
  }
}

/** 保存：三重 gate（canEdit → loading → saving 双击防重）；成功 toast+脏清除+locale 切换 */
async function onSave() {
  if (!canEdit('system')) return
  if (loading.value) return
  if (saving.value) return
  validateNumeric('token_expiry_hours')
  validateNumeric('refresh_expiry_days')
  if (fieldErrors.value.token_expiry_hours || fieldErrors.value.refresh_expiry_days) return
  saving.value = true
  saveError.value = ''
  // 成功提示文案先取（locale 切换随保存生效，toast 仍是切换前语言，旧页 lang-switch 随迁）
  const successMsg = t('v2.settings.saveSuccess')
  try {
    await saveConfig('system', {
      site_name: form.site_name,
      language: form.language,
      token_expiry_hours: Number(form.token_expiry_hours),
      refresh_expiry_days: Number(form.refresh_expiry_days)
    })
    fieldErrors.value = {}
    dirty.value = false
    locale.value = form.language
    localStorage.setItem('gw4j_lang', form.language)
    notifySuccess(successMsg)
  } catch (e) {
    // 服务端字段错误逐字段注入同一通道；非字段错 → set-save-error
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) {
      fieldErrors.value = { ...fieldErrors.value, ...fieldErrs }
    } else {
      saveError.value = errMsg(e) || t('v2.settings.saveFailed')
    }
    notifyError(t('v2.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}

// 脏离开：async confirm（variant danger）→ false 阻断（旧页 dirty-leave 随迁）。
// RouterView 内挂载走组件内 onBeforeRouteLeave；直挂（无 RouterView）时该 API 拿不到
// matchedRouteKey 是 no-op，此时以全局 beforeEach 兜底（二者互斥，不会双弹确认）。
async function guardDirtyLeave(): Promise<boolean> {
  if (!dirty.value) return true
  const ok = await confirm({
    variant: 'danger',
    title: t('v2.settings.unsavedChanges'),
    content: t('v2.settings.dirtyBanner')
  })
  return ok
}

const router = useRouter()
const inRouterView = inject(matchedRouteKey, null) !== null
if (inRouterView) {
  onBeforeRouteLeave(async () => guardDirtyLeave())
} else {
  const removeGlobalGuard = router.beforeEach(async (_to, from) => {
    if (from.path !== '/v2/settings') return true
    return (await guardDirtyLeave()) ? true : false
  })
  onUnmounted(removeGlobalGuard)
}

// —— dict 字典分区（code 默认 ROUTE_TYPE，挂载即查；空 code 早退不调 API）——
const dictCode = ref('ROUTE_TYPE')
const dictEntries = ref<{ value: string; label: string }[]>([])
const dictLoading = ref(false)
const dictError = ref('')

async function loadDict() {
  const code = dictCode.value.trim()
  if (!code) return
  dictLoading.value = true
  try {
    const entries = await getDict(code)
    dictEntries.value = entries ?? []
    dictError.value = ''
  } catch (e) {
    dictEntries.value = []
    dictError.value = errMsg(e) || t('v2.settings.loadFailed')
  } finally {
    dictLoading.value = false
  }
}
const onDictQuery = () => void loadDict()

// —— changes 变更流分区（listChanges(50)；失败 → 不可用空态）——
const changes = ref<ChangeRow[]>([])
const changesUnavailable = ref(false)

async function reloadChanges() {
  try {
    const rows = await listChanges(50)
    changes.value = rows ?? []
    changesUnavailable.value = false
  } catch {
    changes.value = []
    changesUnavailable.value = true
  }
}

function changeTypeText(type: string): string {
  if (type === 'plugin') return t('v2.settings.changeTypePlugin')
  if (type === 'route') return t('v2.settings.changeTypeRoute')
  return type
}

function changeStatusText(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'v2.settings.statusDraft',
    PUBLISHED: 'v2.settings.statusPublished',
    CHANGING: 'v2.settings.statusChanging',
    OFFLINE: 'v2.settings.statusOffline'
  }
  const key = map[status]
  return key ? t(key) : status
}

// —— audit 审计日志分区（信封分页；筛选变化重置回第 1 页）——
const auditRows = ref<AuditLogItem[]>([])
const auditTotal = ref(0)
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditAction = ref('')
const auditActor = ref('')
const auditTarget = ref('')
const auditRange = ref<string[] | null>(null)

const auditActionOptions = computed(() => {
  const seen = new Set<string>()
  for (const r of auditRows.value) {
    if (r?.action) seen.add(String(r.action))
  }
  return Array.from(seen).map((a) => ({ value: a, label: a }))
})

async function loadAuditPage() {
  const params: AuditLogQuery = { page: auditPage.value, pageSize: auditPageSize.value }
  if (auditAction.value) params.action = auditAction.value
  const actor = auditActor.value.trim()
  if (actor) params.actor = actor
  const target = auditTarget.value.trim()
  if (target) params.target = target
  if (auditRange.value?.[0]) params.from = auditRange.value[0]
  if (auditRange.value?.[1]) params.to = auditRange.value[1]
  try {
    const page = await listAuditLogs(params)
    auditRows.value = page?.records ?? []
    // total Long→String 契约：字符串到达时 Number() 兜底（非字符串拼接）
    auditTotal.value = Number(page?.total ?? 0) || 0
  } catch {
    auditRows.value = []
    auditTotal.value = 0
  }
}

function onAuditFilterChange() {
  auditPage.value = 1
  void loadAuditPage()
}

/**
 * 行内值点击填充（LOW-1：actor/target 列可点筛选，上下文断裂修复）：填入筛选值 +
 * onAuditFilterChange()（页码重置回 1 + 重查）。幂等判词：重复点击同值 = 筛选状态
 * 幂等（不 toggle 反选、不清空、无 no-op guard），每次点击恰发一次同参查询
 * （重查兼作刷新 affordance）。@keydown.enter.prevent 挂同一 handler：原生 button 的
 * Enter 默认动作会再合成一次 click（真实浏览器双发同参查询，违「每击恰一次」判词），
 * .prevent 截断之；显式挂 keydown 卫 jsdom（不实现默认动作）键盘等价（Login
 * enter-key 契约同款；Monitor/Overview 的裸 keydown.enter 落在 div 上，无默认动作可防）。
 */
function onAuditValueClick(field: 'actor' | 'target', value: string) {
  if (field === 'actor') auditActor.value = value
  else auditTarget.value = value
  onAuditFilterChange()
}

function onAuditPageChange(page: number, size: number) {
  auditPage.value = page
  auditPageSize.value = size
  void loadAuditPage()
}

/** 目标渲染：草稿 target 字段优先展示，回落 target_type+target_id 组合，全空 '-' */
function auditTargetText(row: Partial<AuditLogItem>): string {
  if (row.target) return String(row.target)
  const combo = [row.target_type, row.target_id]
    .filter((p) => p != null && String(p) !== '')
    .map((p) => String(p))
    .join(':')
  return combo || '-'
}

/**
 * target 查询载荷（LOW-1 核心裁决，随 auditTargetText 同序草稿字段优先）：
 * row.target || row.target_id —— 不是单元格显示文本（'ROUTE:3001' 拿去后端
 * LIKE target_id 一行不中，防假成功）。仅 target_type 无 target_id 的行没有
 * 可查载荷 → 返回 ''，单元格保持纯文本、不渲染按钮（LIKE 无从命中）。
 */
function auditTargetPayload(row: Partial<AuditLogItem>): string {
  if (row.target) return String(row.target)
  if (row.target_id != null && String(row.target_id) !== '') return String(row.target_id)
  return ''
}

/** 结果着色词表（宽松匹配常见 SUCCESS/FAIL 词表，未知值中性灰） */
function auditResultColor(result?: string): string {
  const r = String(result ?? '').toUpperCase()
  if (r === 'SUCCESS' || r === 'OK' || r === '0' || r === 'ALLOWED') return 'success'
  if (r === 'FAILURE' || r === 'FAIL' || r === 'ERROR' || r === 'DENIED') return 'danger'
  return 'gray'
}

/**
 * 时间辅助（旧 formatChangeTime 同式随迁；+8h 债不订正，显示原样）：
 * 秒级数字 ×1000、纯数字串同、其余 Date.parse、NaN 原样字符串、空 '-'。
 */
function formatChangeTime(v?: number | string | null): string {
  if (v === '' || v === null || v === undefined) return '-'
  let ms: number
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v)
    ms = n < 1e12 ? n * 1000 : n
  } else {
    ms = Date.parse(String(v))
  }
  if (!Number.isFinite(ms)) return String(v)
  return formatDate(new Date(ms))
}

// —— 挂载：四分区数据各发一次（getConfig / getDict / listChanges / listAuditLogs）——
void loadConfig()
void loadDict()
void reloadChanges()
void loadAuditPage()
</script>

<style scoped lang="scss">
.set-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
  min-height: 0;
}

.set-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
}

.set-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-md, 12px);
}

.set-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 420px;
}

.set-field--inline {
  min-width: 180px;
}

.set-label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.set-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
  max-width: 520px;
}

.set-actions {
  display: flex;
  gap: var(--space-sm, 8px);
}

/* —— 宽表横滚容器（token only；375 无页面级横向溢出，rol/usr-table-scroll 同款）—— */
.set-table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.set-table--wide {
  min-width: 560px;
}

/* —— 日期范围控件窄视口可收缩（EP daterange 固有宽 370px 会顶破 375，V 轮 P1 收口）——
   definite flex-basis 让 label 脱离内容固有宽链，picker width:100% 填满 label（token only） */
.set-field--range {
  flex: 1 1 240px;
  min-width: 0;
  max-width: 100%;
}

.set-field--range :deep(.el-date-editor--daterange) {
  width: 100%;
  max-width: 100%;
}

.set-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--app-separator);
  }

  th {
    color: var(--app-text-secondary);
    font-weight: 500;
  }
}

.set-mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}

/* —— LOW-1 审计行内可点值：仅指针语义一条扁平规则（本票不另立样式体系、不动既有规则；
   键盘焦点圈由原生 button UA 默认 outline 兜底，token 化 focus-ring 归 Hallmark V 轮门禁）—— */
.set-audit-btn { cursor: pointer; }

.set-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--app-radius-sm);
  font-size: 12px;

  &.is-success {
    color: var(--app-success, #67c23a);
  }

  &.is-danger {
    color: var(--app-danger, #f56c6c);
  }

  &.is-gray {
    color: var(--app-text-secondary);
  }

  &.is-brand {
    color: var(--app-accent-text);
  }
}

.set-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  background: var(--app-bg-muted);

  &.is-danger {
    color: var(--app-danger, #f56c6c);
  }

  &.is-warning {
    color: var(--app-warning, #e6a23c);
  }
}

.set-empty {
  padding: var(--space-lg, 16px) 0;
}

.set-pager {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-sm, 8px);
}

.set-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  margin: 0;
  padding: 8px 14px;
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: var(--app-success, #67c23a);
  background: var(--el-bg-color);
  box-shadow: var(--app-shadow-md);

  &.is-error {
    color: var(--app-danger, #f56c6c);
  }
}
</style>
