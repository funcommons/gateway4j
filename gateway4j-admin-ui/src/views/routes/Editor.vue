<template>
  <div class="app-page">
    <div v-if="loadError" class="load-error-state" data-testid="load-error">
      <p>{{ t('route.editorLoadError') }}：{{ loadError }}</p>
      <FcButton @click="goBack">{{ t('common.cancel') }}</FcButton>
    </div>

    <p v-if="routeListError" class="route-list-warning" data-testid="route-list-error">
      {{ t('route.editorRouteListError') }}：{{ routeListError }}（{{ t('route.editorDispatchHint') }}）
    </p>

    <p v-if="secondaryError" class="secondary-error" data-testid="secondary-error">
      {{ t('route.editorSecondaryError') }}：{{ secondaryError }}（{{ t('route.editorDataIntegrityHint') }}）
    </p>

    <FcSectionCard v-if="loading && !loadError" padding="lg">
      <FcSkeleton variant="text" :rows="5" />
    </FcSectionCard>

    <FcSectionCard v-if="routeData && !loadError && !loading" padding="none">
      <!-- P1-5 编辑冲突：不自动覆盖表单，给出显式「刷新」入口重拉服务端数据 -->
      <div v-if="conflict" class="conflict-bar" data-testid="conflict-bar">
        <span class="conflict-text">{{ t('route.conflictModified') }}</span>
        <FcButton variant="secondary" size="sm" data-testid="conflict-refresh" @click="reloadAfterConflict">
          {{ t('common.refresh') }}
        </FcButton>
      </div>
      <FcTabsPanel v-model="tab" :tabs="tabs">
        <template #tab-basic>
          <RouteBasicForm ref="basicFormRef" v-model="formBasic" :route-options="dispatchRouteOptions" />
          <!-- H7b：环境归属（仅环境功能可用时渲染；创建预选顶栏当前环境，编辑可迁移，PATCH 携带才迁移） -->
          <div v-if="envReady" class="env-field" data-testid="route-env-field">
            <span class="env-field__label">{{ t('env.switcherLabel') }}</span>
            <FcSelect
              v-model="formEnv"
              :options="env.options"
              style="max-width: 280px"
              data-testid="route-env-select"
              @change="envTouched = true"
            />
            <span class="env-field__hint">{{ isEdit ? t('env.envMigrateHint') : t('env.envCreateHint') }}</span>
          </div>
        </template>

        <template #tab-conditions>
          <RouteConditionsTable v-model="formConditions" :route-options="routeSelectOptions" />
        </template>

        <template #tab-bindings>
          <RouteBindingsTable v-model="formBindings" :plugin-options="pluginOptions" @bindings-changed="loadChain" />
        </template>

        <template #tab-chain>
          <RouteChainPreview :chain="chain" :bindings-count="form.bindings.length" />
        </template>
      </FcTabsPanel>

      <template #footer>
        <FcStatusBadge
          v-if="routeStatus && isEdit"
          :tone="routeStatus === 'PUBLISHED' ? 'success' : routeStatus === 'CHANGING' ? 'processing' : routeStatus === 'OFFLINE' ? 'neutral' : 'pending'"
          :label="routeStatusLabel"
          :dot="routeStatus === 'PUBLISHED' || routeStatus === 'CHANGING'"
          style="margin-right: auto"
        />
        <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
        <FcButton @click="goBack">{{ t('common.cancel') }}</FcButton>
        <FcButton v-if="canEdit('route') && isEdit && (routeStatus === 'DRAFT' || routeStatus === 'CHANGING' || routeStatus === 'OFFLINE')" variant="secondary" :loading="publishing" @click="publish">{{ routeStatus === 'CHANGING' || routeStatus === 'OFFLINE' ? t('common.republish') : t('common.publish') }}</FcButton>
        <FcButton v-if="canEdit('route') && isEdit && (routeStatus === 'PUBLISHED' || routeStatus === 'CHANGING')" variant="secondary" :loading="offlining" @click="offline">{{ routeStatus === 'CHANGING' ? t('common.abandonChanges') : t('common.offline') }}</FcButton>
        <FcButton v-if="canEdit('route')" variant="primary" :loading="saving" @click="save">{{ t('common.save') }}</FcButton>
      </template>
    </FcSectionCard>

    <!-- P1-3 发布生效确认：放在卡片外，避免发布后 load() 的 loading 切换把轮询状态卸载掉 -->
    <PublishSyncStatus v-if="isEdit" ref="syncStatusRef" class="editor-sync-row" />

    <!-- H7b T2：发布变更说明弹窗（必填 1~200 字，确认门控在弹窗内） -->
    <PublishDescriptionDialog
      v-model:open="publishDialogOpen"
      :title="publishModeLabel"
      @confirm="onPublishConfirm"
    />

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
  FcSectionCard, FcTabsPanel, FcButton, FcStatusBadge, FcSkeleton, FcSelect,
  PublishSyncStatus, PublishDescriptionDialog
} from '@/components'
import type { SelectOption } from '@/components/form/_types'
import RouteBasicForm, { type RouteBasic } from '@/components/RouteBasicForm.vue'
import RouteConditionsTable, { type RouteCondition } from '@/components/RouteConditionsTable.vue'
import RouteBindingsTable, { type PluginBinding } from '@/components/RouteBindingsTable.vue'
import RouteChainPreview, { type ChainItem } from '@/components/RouteChainPreview.vue'
import {
  getRoute, createRoute, updateRoute, publishRoute, offlineRoute,
  listBindings, listRoutes, getPluginChain, validateRoute
} from '@/api/routes'
import { listBuiltinTypes } from '@/api/plugins'
import { mapFieldErrors } from '@/api/http'
import { useEnvironments } from '@/store/environment'
import { DEFAULT_ENV } from '@/utils/environment'

const { t } = useI18n()
const { confirm: fcConfirm } = useFcConfirm()
const { canEdit } = usePermission()
const route = useRoute()
const router = useRouter()
// H7b：环境维度（顶栏共享状态；404 降级 → envReady=false，环境字段整体不渲染）
const env = useEnvironments()
const envReady = computed(() => env.available)
const tabs = computed(() => [
  { value: 'basic', label: t('route.editorTabBasic') },
  { value: 'conditions', label: t('route.editorTabConditions') },
  { value: 'bindings', label: t('route.editorTabBindings') },
  { value: 'chain', label: t('route.editorTabChain') }
])
const tab = ref('basic')

const EMPTY_BASIC = (): RouteBasic => ({
  route_name: '',
  route_type: 'BACKEND',
  path: '',
  upstream_url: '',
  sort_order: 1,
  remark: '',
  parent_route_id: '',
  tags: ''
})

const form = ref<any>({
  ...EMPTY_BASIC(),
  conditions: [],
  bindings: []
})

// v-model bridge: <RouteBasicForm v-model="formBasic" /> — keeps conditions/bindings
// out of the basic sub-form's responsibility
const formBasic = computed<RouteBasic>({
  get: () => ({
    route_name: form.value.route_name ?? '',
    route_type: form.value.route_type ?? 'BACKEND',
    path: form.value.path ?? '',
    upstream_url: form.value.upstream_url ?? '',
    sort_order: form.value.sort_order ?? 1,
    remark: form.value.remark ?? '',
    parent_route_id: form.value.parent_route_id ?? '',
    tags: form.value.tags ?? ''
  }),
  set: (v) => {
    form.value.route_name = v.route_name
    form.value.route_type = v.route_type
    form.value.path = v.path
    form.value.upstream_url = v.upstream_url
    form.value.sort_order = v.sort_order
    form.value.remark = v.remark
    form.value.parent_route_id = v.parent_route_id
    form.value.tags = v.tags
  }
})

const routeId = computed(() => route.params.id as string | undefined)
const isEdit = computed(() => !!routeId.value)
const routeData = ref<any>(null)
const loading = ref(true)
const loadError = ref('')
const routeListError = ref('')
const secondaryError = ref('')
const saving = ref(false)
const saveError = ref('')
const dirty = ref(false)
const publishing = ref(false)
const offlining = ref(false)
const basicFormRef = ref<any>(null)
const syncStatusRef = ref<InstanceType<typeof PublishSyncStatus> | null>(null)

// ===== H7b T2：发布变更说明弹窗状态 =====
const publishDialogOpen = ref(false)
const publishModeLabel = computed(() =>
  (routeStatus.value === 'CHANGING' || routeStatus.value === 'OFFLINE') ? t('common.republish') : t('common.publish'))

// ===== H7b：环境归属（创建预选当前环境；编辑迁移 = PATCH 显式携带 environment）=====
const formEnv = ref<string>(DEFAULT_ENV)
/** 打开编辑器/进入新建时的环境基线：只有用户改动过，PATCH 才携带 environment（契约：缺省保持） */
const initialEnv = ref<string>(DEFAULT_ENV)
const envTouched = ref(false)

// P1-5 编辑冲突：打开编辑器时记录的 config_version（Long→String，随 payload 传 expected_version）
const expectedVersion = ref('')
// 10402 冲突标记：仅提示 + 提供「刷新」，不自动覆盖表单
const conflict = ref(false)

const routeStatus = computed(() => routeData.value?.status as string | undefined)

const routeStatusLabel = computed(() => {
  const map: Record<string, string> = {
    DRAFT: t('route.statusDraft'),
    PUBLISHED: t('route.statusPublished'),
    CHANGING: t('route.statusChanging'),
    OFFLINE: t('route.statusOffline')
  }
  return routeStatus.value ? (map[routeStatus.value] || routeStatus.value) : ''
})

const pluginOptions = ref<SelectOption[]>([])

const chain = ref<any[]>([])

// v-model bridge: <RouteConditionsTable v-model="formConditions" />
const formConditions = computed<RouteCondition[]>({
  get: () => form.value.conditions ?? [],
  set: (v) => { form.value.conditions = v }
})

// v-model bridge: <RouteBindingsTable v-model="formBindings" />
const formBindings = computed<PluginBinding[]>({
  get: () => form.value.bindings ?? [],
  set: (v) => { form.value.bindings = v }
})

const routeSelectOptions = ref<SelectOption[]>([])
const allRoutesFlat = ref<any[]>([])

const dispatchRouteOptions = computed(() => {
  // Only DISPATCH routes can be parent routes; exclude self to prevent circular reference
  const dispatchIds = new Set<string | number>(allRoutesFlat.value.filter(r => r.route_type === 'DISPATCH').map(r => String(r.id)))
  if (routeId.value) dispatchIds.delete(routeId.value)
  return routeSelectOptions.value.filter(opt => dispatchIds.has(opt.value))
})

// Race guard: each load() captures the current routeId and checks it before
// mutating shared state. If routeId changed mid-load (user navigated away),
// the stale load() aborts and does NOT overwrite the form.
let loadEpoch = 0

async function load() {
  const myEpoch = ++loadEpoch
  dirtyTracking = false
  loading.value = true
  loadError.value = ''
  secondaryError.value = ''
  try {
    const allRoutes = await listRoutes()
    if (myEpoch !== loadEpoch) return
    routeSelectOptions.value = (function walk(list: any[]): SelectOption[] {
      return list.flatMap((r) => [
        { value: String(r.id), label: r.route_name },
        ...walk(r.children || [])
      ])
    })(allRoutes)
    allRoutesFlat.value = (function walk(list: any[]): any[] {
      return list.flatMap((r) => [r, ...walk(r.children || [])])
    })(allRoutes)
    routeListError.value = ''
  } catch (e: any) {
    if (myEpoch !== loadEpoch) return
    routeSelectOptions.value = []
    routeListError.value = e?.message || t('route.routeListLoadFailed')
  }
  if (myEpoch !== loadEpoch) return
  const targetId = routeId.value
  if (targetId) {
    try {
      const r = await getRoute(targetId)
      if (myEpoch !== loadEpoch) return
      routeData.value = r
      // P1-5: 记录加载时的版本号，保存时作为 expected_version 传给后端做冲突校验
      expectedVersion.value = r?.config_version != null ? String(r.config_version) : ''
      form.value = {
        route_name: r.route_name,
        route_type: r.route_type,
        path: r.path,
        upstream_url: r.upstream_url,
        sort_order: r.sort_order,
        remark: r.remark,
        parent_route_id: r.parent_route_id ?? '',
        tags: (r as any).tags ?? '',
        conditions: [],
        bindings: []
      }
      // H7b：记录路由当前环境作为迁移基线（PATCH 仅在用户改动时携带）
      initialEnv.value = (r as any).environment || DEFAULT_ENV
      formEnv.value = initialEnv.value
      envTouched.value = false
    } catch (e: any) {
      if (myEpoch !== loadEpoch) return
      routeData.value = null
      loadError.value = e?.message || t('common.loadFailed')
      // On failure: leave loading=true so save stays blocked (nothing meaningful to save)
      return
    }
  } else {
    routeData.value = { id: null }
    // Reset form to empty defaults for "new" mode
    form.value = {
      ...EMPTY_BASIC(),
      conditions: [],
      bindings: []
    }
    // H7b T1：新建预选顶栏当前环境（环境功能降级时保持 default）
    initialEnv.value = env.available ? env.current : DEFAULT_ENV
    formEnv.value = initialEnv.value
    envTouched.value = false
  }
  // Basic form fields are now ready (route_name, route_type, etc.).
  // Unblock save immediately to avoid leaving user staring at a disabled button
  // during the secondary fetch chain. The conditions/bindings fetch chain
  // still has an epoch guard so stale data won't overwrite.
  loading.value = false
  dirty.value = false
  await loadConditions(myEpoch)
  await loadBindings(myEpoch)
  dirtyTracking = true
}

// Mark dirty after initial load completes — any subsequent form change is user input
let dirtyTracking = false
watch(form, () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

async function loadConditions(epoch = loadEpoch) {
  if (!routeId.value) return
  try {
    const r = await getRoute(routeId.value)
    if (epoch !== loadEpoch) return
    form.value.conditions = (r as any).conditions || []
  } catch (e: any) {
    if (epoch !== loadEpoch) return
    // Don't wipe to [] — that would let save() overwrite real server data
    // with empty conditions. Show error so user knows data may be incomplete.
    secondaryError.value = secondaryError.value || `${t('route.conditionsLoadFailed')}: ${e?.message || t('common.failed')}`
  }
}

async function loadBindings(epoch = loadEpoch) {
  if (!routeId.value) {
    chain.value = []
    return
  }
  try {
    const list = await listBindings(routeId.value)
    if (epoch !== loadEpoch) return
    form.value.bindings = list.map((b: any) => ({
      binding_id: b.binding_id,
      plugin_id: b.plugin_id,
      plugin_name: b.plugin_name,
      binding_config: b.binding_config,
      sort_order: b.sort_order
    }))
    await loadChain(epoch)
  } catch (e: any) {
    if (epoch !== loadEpoch) return
    // Don't wipe bindings to []
    secondaryError.value = secondaryError.value || `${t('route.bindingsLoadFailed')}: ${e?.message || t('common.failed')}`
  }
}

async function loadChain(epoch = loadEpoch) {
  if (!routeId.value) {
    chain.value = []
    return
  }
  try {
    const c: any = await getPluginChain(routeId.value)
    if (epoch !== loadEpoch) return
    chain.value = [...(c.pre_chain || []), ...(c.post_chain || [])]
  } catch (e: any) {
    if (epoch !== loadEpoch) return
    secondaryError.value = secondaryError.value || `${t('route.chainLoadFailed')}: ${e?.message || t('common.failed')}`
  }
}

async function loadBuiltinTypes() {
  try {
    const types = await listBuiltinTypes()
    pluginOptions.value = types.map((t) => ({ value: t.plugin_id, label: t.plugin_name }))
  } catch {
    pluginOptions.value = []
  }
}
loadBuiltinTypes()

async function save() {
  if (!canEdit('route')) return
  if (loading.value) return  // don't save until basic form is loaded
  if (saving.value) return
  if (basicFormRef.value) {
    // RouteBasicForm.validate() reports failure as boolean false (it never rejects).
    // Treat false as "abort save"; a rejection (unexpected/mock) also aborts.
    try {
      const ok = await basicFormRef.value.validate?.()
      if (ok === false) return
    } catch { return }
  }
  if (form.value.route_type === 'DISPATCH' && (!form.value.conditions || form.value.conditions.length === 0)) {
    saveError.value = t('route.dispatchNeedsConditions')
    return
  }
  // Validate dispatch route conditions for circular references
  if (form.value.route_type === 'DISPATCH' && form.value.conditions?.length) {
    try {
      await validateRoute({
        route_id: routeId.value || undefined,
        conditions: form.value.conditions.map((c: any) => ({
          condition_type: c.condition_type,
          operator: c.operator,
          condition_key: c.condition_key,
          condition_value: c.condition_value,
          target_route_id: c.target_route_id,
          priority: c.priority
        }))
      })
    } catch (e: any) {
      saveError.value = e?.message || t('route.validationFailed')
      return
    }
  }
  saving.value = true
  saveError.value = ''
  try {
    const payload = {
      route_name: form.value.route_name,
      route_type: form.value.route_type,
      path: form.value.path,
      upstream_url: form.value.upstream_url,
      sort_order: form.value.sort_order,
      remark: form.value.remark,
      tags: form.value.tags || '',
      parent_route_id: form.value.parent_route_id || undefined,
      conditions: (form.value.conditions || []).map((c: any) => ({
        condition_type: c.condition_type,
        operator: c.operator,
        condition_key: c.condition_key,
        condition_value: c.condition_value,
        target_route_id: c.target_route_id,
        priority: c.priority
      })),
      bindings: form.value.bindings.map((b: any, i: number) => ({
        plugin_id: b.plugin_id,
        binding_config: b.binding_config || '{}',
        sort_order: b.sort_order ?? i
      }))
    }
    if (routeId.value) {
      // P1-5 乐观锁：编辑模式携带打开编辑器时的版本号（Long→String 契约），
      // 后端版本不一致时返回 code=10402（见下方 catch 分支）
      // H7b：environment 仅在用户显式改动时携带（PATCH 携带则迁移、缺省保持 —— 契约口径）
      const envChanged = envReady.value && formEnv.value !== initialEnv.value
      const body = {
        ...payload,
        ...(expectedVersion.value ? { expected_version: expectedVersion.value } : {}),
        ...(envChanged ? { environment: formEnv.value } : {})
      }
      await updateRoute(routeId.value, body)
      ElMessage.success(t('route.saveSuccess'))
      dirty.value = false
      await load()
    } else {
      // H7b T1：新建时环境随创建携带（环境功能降级时不传，后端缺省 default）
      const createBody = {
        ...payload,
        ...(envReady.value ? { environment: formEnv.value } : {})
      }
      const r = (await createRoute(createBody)) as any
      ElMessage.success(t('route.saveSuccess'))
      dirty.value = false
      await router.replace(`/routes/${r.id}`)
    }
  } catch (e: any) {
    // P1-5: 10402 编辑冲突 — 独立分支，不落通用错误文案；不自动覆盖表单，
    // 由 conflict-bar 提供「刷新」按钮让用户显式重拉服务端数据
    if (e?.code === 10402) {
      conflict.value = true
      ElMessage.warning(e?.message || t('route.conflictModified'))
      return
    }
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0 && basicFormRef.value?.setFieldErrors) {
      basicFormRef.value.setFieldErrors(fieldErrs)
    }
    saveError.value = e?.message || t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

/** 冲突提示条的「刷新」：重拉服务端数据覆盖表单（用户显式点击才覆盖） */
async function reloadAfterConflict() {
  conflict.value = false
  await load()
}

onMounted(load)

watch(() => routeId.value, () => {
  dirtyTracking = false
  load()
})

// H7b T1：新建模式下顶栏切换环境 → 表单预选跟随（用户已手动改过则不覆盖）
watch(() => env.current, (v) => {
  if (!isEdit.value && !envTouched.value) formEnv.value = v
})

onBeforeRouteLeave(async () => {
  if (dirty.value && !saving.value) {
    if (!await fcConfirm({ title: t('common.unsavedChanges'), variant: 'danger' })) return false
  }
})

/** H7b T2：发布入口 → 打开变更说明弹窗（必填门控在弹窗内），确认后进 onPublishConfirm */
function publish() {
  if (!canEdit('route')) return
  if (!routeId.value) return
  publishDialogOpen.value = true
}

async function onPublishConfirm(description: string) {
  if (!canEdit('route')) return
  if (!routeId.value) return
  if (publishing.value) return
  publishing.value = true
  saveError.value = ''
  try {
    await publishRoute(routeId.value, description)
    ElMessage.success(t('route.publishSuccess'))
    publishDialogOpen.value = false
    // P1-3: 发布成功后轮询配置同步状态，确认网关「已生效」
    syncStatusRef.value?.start()
    await load()
  } catch (e: any) {
    saveError.value = e?.message || t('common.actionFailed')
  } finally {
    publishing.value = false
  }
}

async function offline() {
  if (!canEdit('route')) return
  if (!routeId.value) return
  if (offlining.value) return
  offlining.value = true
  saveError.value = ''
  try {
    await offlineRoute(routeId.value)
    ElMessage.success(t('route.offlineSuccess'))
    await load()
  } catch (e: any) {
    saveError.value = e?.message || t('common.actionFailed')
  } finally {
    offlining.value = false
  }
}

async function goBack() {
  await router.back()
}
</script>
<style scoped>
.form-block { padding: 16px; }
.toolbar { margin-bottom: 12px; }
/* H7b：环境归属字段（基础信息 Tab 底部，仅环境功能可用时渲染） */
.env-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 16px 12px;
}
.env-field__label {
  font-size: 13px;
  color: var(--app-text-primary);
  flex-shrink: 0;
}
.env-field__hint {
  font-size: 12px;
  color: var(--app-text-secondary);
}
.save-error {
  color: var(--app-danger);
  font-size: 13px;
  margin: 0 auto 0 0;
}
.conflict-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 16px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--app-warning, #e6a23c) 8%, transparent);
  border-radius: var(--app-radius-sm);
  font-size: 13px;
  color: var(--app-warning, #e6a23c);
}
.conflict-text { flex: 1; }
.editor-sync-row { margin-top: 8px; }
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
.route-list-warning {
  color: var(--app-warning, #e6a23c);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, #e6a23c 8%, transparent);
  border-radius: var(--app-radius-sm);
}
.secondary-error {
  color: var(--app-warning, #e6a23c);
  font-size: 13px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, #e6a23c 8%, transparent);
  border-radius: var(--app-radius-sm);
}
</style>
