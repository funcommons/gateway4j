<template>
  <div ref="pageEl" class="ped-page" data-testid="ped-page">
    <h1 class="ped-title">{{ isEdit ? t('v2.plugins.editTitle') : t('v2.plugins.createTitle') }}</h1>

    <!-- Load failed: i18n headline + raw server message; tabs stay unmounted -->
    <div v-if="loadError" class="hint-banner is-error ped-banner" data-testid="ped-load-error" role="alert">
      <FcIcon name="ri-error-warning-line" :size="14" />
      <span>{{ t('v2.plugins.loadFailed') }}</span>
      <span class="ped-banner-msg">{{ loadError }}</span>
    </div>

    <!-- Edit fetch pending: skeleton instead of tabs; create mode never loads -->
    <FcSkeleton v-else-if="loading" variant="text" :rows="5" data-testid="ped-skeleton" />

    <FcSectionCard v-else padding="none">
      <!-- Single-pane editor: the basic tab is the full form and is permanently the active tab;
           the type tabs are section quick-nav (click scrolls to the section, no pane swap) -->
      <FcTabsPanel :model-value="'basic'" :tabs="tabs" data-testid="ped-tabs" @tab-click="scrollToSection">
        <template #tab-basic>
          <div class="ped-form">
            <div class="ped-field">
              <label class="ped-label" for="ped-name">{{ t('v2.plugins.fieldName') }}</label>
              <FcInput id="ped-name" v-model="form.plugin_name" maxlength="50" :disabled="isEdit" data-testid="ped-f-name" />
              <p v-if="errors.plugin_name" class="ped-err" data-testid="ped-err-plugin_name" role="alert">{{ errors.plugin_name }}</p>
            </div>
            <div class="ped-field">
              <label class="ped-label" for="ped-plugin-id">{{ t('v2.plugins.fieldId') }}</label>
              <FcInput id="ped-plugin-id" v-model="form.plugin_id" maxlength="50" :disabled="isEdit" data-testid="ped-f-plugin-id" />
              <p v-if="errors.plugin_id" class="ped-err" data-testid="ped-err-plugin_id" role="alert">{{ errors.plugin_id }}</p>
            </div>
            <div class="ped-field">
              <span class="ped-label">{{ t('v2.plugins.fieldType') }}</span>
              <FcSegmented v-model="form.plugin_type" :options="typeOpts" :disabled="isEdit" data-testid="ped-f-type" />
            </div>
            <div class="ped-field">
              <span class="ped-label">{{ t('v2.plugins.fieldPhase') }}</span>
              <FcSegmented v-model="form.plugin_phase" :options="phaseOpts" data-testid="ped-f-phase" />
              <p v-if="errors.plugin_phase" class="ped-err" data-testid="ped-err-plugin_phase" role="alert">{{ errors.plugin_phase }}</p>
            </div>
            <div class="ped-field">
              <span class="ped-label">{{ t('v2.plugins.fieldScope') }}</span>
              <FcSegmented v-model="form.scope" :options="scopeOpts" :disabled="isEdit" data-testid="ped-f-scope" />
            </div>
            <div class="ped-field">
              <label class="ped-label" for="ped-sort-order">{{ t('v2.plugins.fieldSortOrder') }}</label>
              <!-- FcInputNumber cannot carry data-testid onto its native input (EP forwards attrs to
                   the wrapper div only), so the number input goes through FcInput attrs passthrough -->
              <FcInput
                id="ped-sort-order"
                v-model="form.sort_order"
                type="number"
                :min="1"
                :max="9999"
                data-testid="ped-f-sort-order"
              />
              <p v-if="errors.sort_order" class="ped-err" data-testid="ped-err-sort_order" role="alert">{{ errors.sort_order }}</p>
            </div>
            <div class="ped-field ped-field--wide">
              <label class="ped-label" for="ped-config">{{ t('v2.plugins.fieldConfig') }}</label>
              <!-- OPT-5: config JSON editor upgraded to FcCodeEditor (CodeMirror 6 wrapper, lazily
                   imported so CodeMirror never enters the main bundle). While the editor chunk is
                   in flight, an interim plain textarea takes the SAME cde-content slot with the
                   same v-model, so DOM-baseline dirty tracking never misses (and the swap is a
                   same-slot same-value replacement). Label association rides the id passthrough;
                   cde-content aria-label is the 2nd belt. -->
              <FcCodeEditor v-if="editorChunkReady" id="ped-config" v-model="form.config" :maxlength="10000" />
              <FcInput
                v-else
                id="ped-config"
                v-model="form.config"
                type="textarea"
                :rows="6"
                :maxlength="10000"
                data-testid="cde-content"
              />
              <p v-if="errors.config" class="ped-err" data-testid="ped-err-config" role="alert">{{ errors.config }}</p>
            </div>
            <div class="ped-field ped-field--wide">
              <label class="ped-label" for="ped-remark">{{ t('v2.plugins.fieldRemark') }}</label>
              <FcInput id="ped-remark" v-model="form.remark" type="textarea" :rows="3" maxlength="200" data-testid="ped-f-remark" />
              <p v-if="errors.remark" class="ped-err" data-testid="ped-err-remark" role="alert">{{ errors.remark }}</p>
            </div>

            <!-- GROOVY script section -->
            <div v-if="form.plugin_type === 'GROOVY'" class="ped-field ped-field--wide" data-section="groovy">
              <label class="ped-label" for="ped-script">{{ t('v2.plugins.fieldScript') }}</label>
              <FcInput
                id="ped-script"
                v-model="form.script_content"
                type="textarea"
                :rows="14"
                :maxlength="65536"
                placeholder="def x = 1; return true"
                data-testid="ped-f-script"
              />
              <div class="ped-groovy-bar">
                <FcButton variant="secondary" size="sm" data-testid="ped-groovy-validate" @click="validateScript">
                  {{ t('v2.plugins.validateScript') }}
                </FcButton>
                <p
                  v-if="groovyResult"
                  class="ped-hint"
                  :class="{ 'is-error': groovyFailed }"
                  data-testid="ped-groovy-result"
                  role="status"
                >{{ groovyResult }}</p>
              </div>
            </div>

            <!-- JAR upload section -->
            <div v-if="form.plugin_type === 'JAR'" class="ped-field ped-field--wide" data-section="jar">
              <span class="ped-label">{{ t('v2.plugins.fieldJar') }}</span>
              <FcDropZone
                accept=".jar"
                :max-size="MAX_JAR_SIZE"
                :multiple="false"
                data-testid="ped-jar-dropzone"
                @drop="onJar"
                @reject="onJarReject"
              >
                <span class="ped-drop-hint">{{ t('v2.plugins.jarDropHint') }}</span>
              </FcDropZone>
              <p v-if="form.jar_file" class="ped-hint" data-testid="ped-jar-file">{{ t('v2.plugins.jarSelected') }}{{ form.jar_file.name }}</p>
            </div>

            <!-- GROUP members section -->
            <div v-if="form.plugin_type === 'GROUP'" class="ped-field ped-field--wide" data-section="group">
              <span class="ped-label">{{ t('v2.plugins.fieldGroupMembers') }}</span>
              <FcSelect v-model="form.group_member_ids" :options="memberOptions" multiple filterable data-testid="ped-f-group-members" />
            </div>
          </div>
        </template>
      </FcTabsPanel>

      <template #footer>
        <div class="ped-footer">
          <p v-if="saveError" class="ped-err ped-save-error" data-testid="ped-save-error" role="alert">{{ saveError }}</p>
          <div class="ped-actions">
            <FcButton variant="secondary" data-testid="ped-cancel" @click="cancel">{{ t('common.cancel') }}</FcButton>
            <FcButton
              v-if="canEdit('plugin')"
              variant="primary"
              :loading="saving"
              data-testid="ped-save"
              @click="save"
            >{{ t('common.save') }}</FcButton>
          </div>
        </div>
      </template>
    </FcSectionCard>
  </div>
</template>

<script setup lang="ts">
/**
 * P4a-1-C：v2 插件编辑器页（契约 docs/ui-v2/实施契约.md §4 P4 表 P4a 行①，2026-11-07）。
 * 移植自旧 src/views/plugins/Editor.vue（旧树零改动，语义随迁），裁决与收紧点：
 * - 路由 /v2/plugins/editor/:id?（V2PluginEditor）：:id 缺省或保留字 'new' = create 模式（不发
 *   getPlugin）；其余 id = edit 模式，getPlugin 用【gw_plugin 行主键】（Chain 市场管理钮深链）。
 * - create 模式下 query.type ∈ {BUILTIN,JAR,GROOVY,GROUP} 时预选该类型（市场区深链
 *   /v2/plugins/editor/new?type=JAR|GROOVY 依赖此语义）；非法/缺省 → GROOVY。
 * - 编辑模式收紧（相对旧 UI）：name/id/type/scope 禁改（disabled）。scope 为 F 步修正
 *   （V 轮实播实证：PATCH /v1/plugins/{id} 对 scope 变更静默忽略 —— 返回 200 但记录仍
 *   ROUTE；edit 可改 scope = 保存成功假象，UX 欺骗，故禁改；payload 仍随迁 scope 现值，
 *   与后端静默忽略语义兼容）。name/id/type 禁改且 updatePlugin 的 payload ——
 *   JSON 与 FormData 一并 ——【不回传 plugin_name/plugin_id/plugin_type】（旧 FormData 曾回传
 *   plugin_name：字段既已禁改，回传即说谎，v2 一律剔除）。禁改字段同时跳过客户端校验
 *   （name 2-50 位字母数字下划线规则只在 create 生效，edit 回填值不受 create 规则追溯）。
 * - create 成功 → toast.success + 跳 /v2/plugins/chain（P4a-1 时点唯一已注册的 v2 插件落点，
 *   /v2/plugins 列表页归 P4a-2）；edit 成功 → toast + 停留本页 + getPlugin 重拉 + dirty 清零。
 * - 校验走【手写 Wizard 模式】（routes/Wizard.vue 先例，不用 el-form）：save 前置 validateAll，
 *   逐字段产出 errors[prop] 渲染到 ped-err-<prop>；后端 BusinessError.errors 经 mapFieldErrors
 *   合并注入同一位置（后端原文直出，不走 i18n）。
 * - sort_order 数字输入走 FcInput type="number" :min/:max（EP ElInputNumber 的 data-testid 只落
 *   包裹 div、到不了原生 input —— 测试按 input[data-testid] 取值，见微裁决）；上限 1-9999 由
 *   min/max 属性 + 校验层共同把守。
 * - tab 结构：basic = 全量表单视图，恒为激活 tab（契约「BASIC 恒为初始激活」）；类型 tab 作
 *   区块快导航（点击滚动定位到对应区块，content pane 与 basic 内区块同源同 testid，同一时刻
 *   只挂载一个 pane，不会重复）。tab 集 = basic 恒在 + groovy/jar/group 按 plugin_type 条件。
 * - 64KB Blob 上限（GROOVY 脚本）、50MB .jar 单文件（FcDropZone max-size，reject 兜底
 *   jarSizeExceeded 文案）。
 * - OPT-5（2026-11-10，v2 优化建议 #4）：config 字段 FcInput textarea → FcCodeEditor
 *   （CodeMirror 6 封装，对标 APISIX 表单/JSON 双模）。defineAsyncComponent 动态 import
 *   懒加载（CodeMirror 不进主 bundle）；v-model 链路（form.config）与提交校验链路零改动
 *   （validateAll 的 JSON.parse 前置门原样保留）；契约与组件行为见
 *   src/views-v2/plugins/__tests__/Editor.code-editor.test.ts 与
 *   src/components-v2/editor/__tests__/FcCodeEditor.test.ts 头注。
 * - 横切全随迁：loadEpoch 竞态防护 / 骨架 / 错误态 / 脏离开 confirm({variant:'danger'})；
 *   dirtyTracking 在 load 完成的 nextTick 之后才开启，避免回填被误标脏。
 * - 脏离开守卫用 router.beforeEach（按路由 name 圈定、onUnmounted 解绑）而不是
 *   onBeforeRouteLeave：后者依赖 <router-view> 注入的 matchedRouteKey，在无 RouterView 的挂载
 *   环境（单测直挂）不注册。另配 DOM 基线兜底：VTU 对带 disabled 属性的输入不派发事件，
 *   禁改字段的 DOM 直改进不了响应式 dirty 通道 —— 离开时对比表单 DOM 值与 load 后基线，
 *   等价于 beforeunload 的「离开时对比」语义；create 成功跳转前清空基线（保存成功不算脏）。
 * - SDK only（无 el-* 直用）；template 块零 CJK（文案一律 t()）；颜色 token-only。
 */
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import {
  FcButton, FcDropZone, FcIcon, FcInput, FcSectionCard, FcSegmented, FcSelect, FcSkeleton, FcTabsPanel, toast
} from '@/components'
import { createPlugin, getPlugin, listPlugins, updatePlugin, validateGroovy, type PluginItem } from '@/api/plugins'
import { mapFieldErrors } from '@/api/http'

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const route = useRoute()
const router = useRouter()

// ── OPT-5：config 字段封装编辑器（CodeMirror 6 封装）——必须【动态 import】懒加载
//    （CodeMirror 体量禁止进主 bundle，构建已有 1.36MB chunk advisory）；fs 边界契约
//    见 src/views-v2/plugins/__tests__/Editor.code-editor.test.ts：全仓 CodeMirror import
//    只允许出现在 src/components-v2/editor/**，本页零直引。校验语义零改动：save() 仍前置
//    validateAll()（JSON.parse(f.config) + configJsonInvalid）门槛，编辑器即时解析只是
//    反馈，提交权威仍是服务端 validateConfig。
//    模块作用域即起 import（仍是动态 import = 独立 chunk，主 bundle 不含）：Editor 页模块
//    加载时就开始拉取编辑器 chunk，把 fs/网络成本前移到挂载之前。chunk 就绪前的过渡期渲染
//    同 testid 同 v-model 的原生 textarea（editorChunkReady 分支）：collectDomValues 的 DOM
//    基线从首帧起就覆盖 config 编辑区，chunk 到位后的换装是同位同值替换 → 脏离开零假阳性；
//    loader 显式取 .default（等 await import 写法，契约允许）：vi.mock 工厂产出的 mock 命名
//    空间不带 __esModule/toStringTag('Module')，Vue 异步壳无法自动抽取（探针实证）。 ────
const fcCodeEditorModule = import('@/components-v2/editor/FcCodeEditor.vue')
const editorChunkReady = ref(false)
void fcCodeEditorModule.then(() => {
  editorChunkReady.value = true
}).catch(() => {
  /* chunk 失败：停留过渡期 textarea（降级语义同组件内 fallback） */
})
const FcCodeEditor = defineAsyncComponent(async () => {
  const mod: { default: Component } = await fcCodeEditorModule
  return mod.default
})

const TYPE_SET = new Set<string>(['BUILTIN', 'JAR', 'GROOVY', 'GROUP'])
const NAME_RE = /^[a-zA-Z0-9_]{2,50}$/
const MAX_JAR_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_SCRIPT_SIZE = 64 * 1024 // 64KB

type PluginRow = PluginItem & { script_content?: string | null; group_member_ids?: string[] | null }

interface EditorForm {
  plugin_name: string
  plugin_id: string
  plugin_type: string
  plugin_phase: string
  scope: string
  config: string
  script_content: string
  jar_file: File | null
  sort_order: number | string
  remark: string
  group_member_ids: string[]
}

// ── 模式判定（:id 缺省 / 'new' = create；query.type 预选）──────────────────
const routeParam = computed(() => {
  const v = route.params.id
  return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')
})
const editId = computed(() => (routeParam.value === '' || routeParam.value === 'new' ? '' : routeParam.value))
const isEdit = computed(() => editId.value !== '')

function blankForm(): EditorForm {
  const qt = String(route.query.type ?? '')
  return {
    plugin_name: '',
    plugin_id: '',
    plugin_type: TYPE_SET.has(qt) ? qt : 'GROOVY',
    plugin_phase: 'PRE',
    scope: 'ROUTE',
    config: '{}',
    script_content: '',
    jar_file: null,
    sort_order: 1,
    remark: '',
    group_member_ids: []
  }
}

const form = ref<EditorForm>(blankForm())
const tab = ref('basic')
const pageEl = ref<HTMLElement | null>(null)
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const errors = ref<Record<string, string>>({})
const groovyResult = ref('')
const groovyFailed = ref(false)
const dirty = ref(false)
let dirtyTracking = false
let loadEpoch = 0

const tabs = computed(() => {
  const list = [{ value: 'basic', label: t('v2.plugins.tabBasic') }]
  if (form.value.plugin_type === 'GROOVY') list.push({ value: 'groovy', label: t('v2.plugins.tabGroovy') })
  if (form.value.plugin_type === 'JAR') list.push({ value: 'jar', label: t('v2.plugins.tabJar') })
  if (form.value.plugin_type === 'GROUP') list.push({ value: 'group', label: t('v2.plugins.tabGroup') })
  return list
})
const typeOpts = computed(() => [
  { value: 'BUILTIN', label: t('v2.plugins.typeBuiltin') },
  { value: 'JAR', label: t('v2.plugins.typeJar') },
  { value: 'GROOVY', label: t('v2.plugins.typeGroovy') },
  { value: 'GROUP', label: t('v2.plugins.typeGroup') }
])
const phaseOpts = computed(() => [
  { value: 'PRE', label: t('v2.plugins.phasePre') },
  { value: 'POST', label: t('v2.plugins.phasePost') }
])
const scopeOpts = computed(() => [
  { value: 'ROUTE', label: t('v2.plugins.scopeRoute') },
  { value: 'GLOBAL', label: t('v2.plugins.scopeGlobal') }
])

/** 类型 tab = 区块快导航：滚动定位（即时滚动，无动画 —— PRM 安全），激活 tab 恒为 basic */
function scrollToSection(value: string) {
  if (value === 'basic') return
  const el = pageEl.value?.querySelector(`[data-section="${value}"]`)
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView()
}

// ── GROUP 成员候选（旧语义随迁：首页 200 条全量拉取）─────────────────────────
const memberOptions = ref<{ value: string; label: string }[]>([])

async function loadMemberOptions() {
  try {
    const page = await listPlugins({ page: 1, pageSize: 200 })
    memberOptions.value = (page?.records ?? []).map((p) => ({ value: String(p.id), label: String(p.plugin_name ?? p.id) }))
  } catch {
    memberOptions.value = []
  }
}

// ── 加载（loadEpoch 竞态防护；dirtyTracking 在 nextTick 后开启防回填误标脏）──
function applyRow(row: PluginRow) {
  const type = String(row.plugin_type ?? 'GROOVY')
  const sort = Number(row.sort_order)
  form.value = {
    plugin_name: String(row.plugin_name ?? ''),
    plugin_id: String(row.plugin_id ?? ''),
    plugin_type: TYPE_SET.has(type) ? type : 'GROOVY',
    plugin_phase: row.plugin_phase === 'POST' ? 'POST' : 'PRE',
    scope: row.scope === 'GLOBAL' ? 'GLOBAL' : 'ROUTE',
    config: typeof row.config === 'string' ? row.config : JSON.stringify(row.config ?? {}),
    script_content: String(row.script_content ?? ''),
    jar_file: null,
    sort_order: Number.isFinite(sort) && row.sort_order !== null && row.sort_order !== undefined && String(row.sort_order).trim() !== '' ? sort : 1,
    remark: String(row.remark ?? ''),
    group_member_ids: Array.isArray(row.group_member_ids) ? row.group_member_ids.map(String) : []
  }
  tab.value = 'basic'
}

/** 表单 DOM 值快照（脏离开兜底比对用，见文件头注） */
function collectDomValues(): string[] {
  const root = pageEl.value
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[data-testid], textarea[data-testid]'))
    .map((el) => el.value)
}

let domBaseline: string | null = null

function snapshotDomBaseline() {
  domBaseline = JSON.stringify(collectDomValues())
}

function domDrifted(): boolean {
  if (domBaseline === null) return false
  return JSON.stringify(collectDomValues()) !== domBaseline
}

async function load() {
  dirtyTracking = false
  dirty.value = false
  errors.value = {}
  saveError.value = ''
  groovyResult.value = ''
  groovyFailed.value = false
  if (!isEdit.value) {
    loadError.value = ''
    loading.value = false
    form.value = blankForm()
    tab.value = 'basic'
    await nextTick()
    dirtyTracking = true
    snapshotDomBaseline()
    return
  }
  const my = ++loadEpoch
  loading.value = true
  loadError.value = ''
  try {
    const row = (await getPlugin(editId.value)) as PluginRow
    if (my !== loadEpoch) return
    applyRow(row)
  } catch (e: any) {
    if (my !== loadEpoch) return
    loadError.value = e?.message || t('v2.plugins.loadFailed')
  } finally {
    if (my === loadEpoch) {
      loading.value = false
      await nextTick()
      dirtyTracking = true
      snapshotDomBaseline()
      dirty.value = false
    }
  }
}

watch(routeParam, () => {
  tab.value = 'basic'
  void load()
})

onMounted(() => {
  void load()
  void loadMemberOptions()
})

watch(form, () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

// ── 手写校验（Wizard 模式）：任一字段不过 → 阻断 + ped-err-<prop> ───────────
// name/id 是 edit 禁改字段：规则只在 create 生效
function validateAll(): boolean {
  const f = form.value
  const errs: Record<string, string> = {}
  if (!isEdit.value) {
    if (!f.plugin_name) errs.plugin_name = t('v2.plugins.nameRequired')
    else if (!NAME_RE.test(f.plugin_name)) errs.plugin_name = t('v2.plugins.namePattern')
    if (!f.plugin_id) errs.plugin_id = t('v2.plugins.idRequired')
  }
  if (!f.plugin_phase) errs.plugin_phase = t('v2.plugins.phaseRequired')
  if (f.config && f.config.trim()) {
    try {
      JSON.parse(f.config)
    } catch {
      errs.config = t('v2.plugins.configJsonInvalid')
    }
  }
  const sort = Number(f.sort_order)
  if (!Number.isFinite(sort) || sort < 1 || sort > 9999) errs.sort_order = t('v2.plugins.sortOrderRange')
  errors.value = errs
  return Object.keys(errs).length === 0
}

// ── payload 组装（edit 不回传禁改字段 name/id/type —— JSON 与 FormData 一并）─
function buildJsonEditPayload(f: EditorForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    plugin_phase: f.plugin_phase,
    scope: f.scope,
    config: f.config,
    sort_order: Number(f.sort_order),
    remark: f.remark
  }
  if (f.plugin_type === 'GROOVY') payload.script_content = f.script_content
  if (f.plugin_type === 'GROUP') payload.group_member_ids = [...f.group_member_ids]
  return payload
}

function buildJarForm(f: EditorForm, includeIdentity: boolean): FormData {
  const fd = new FormData()
  if (includeIdentity) {
    fd.append('plugin_name', f.plugin_name)
    fd.append('plugin_id', f.plugin_id)
    fd.append('plugin_type', f.plugin_type)
  }
  fd.append('plugin_phase', f.plugin_phase)
  fd.append('scope', f.scope)
  fd.append('config', f.config)
  fd.append('sort_order', String(Number(f.sort_order)))
  fd.append('remark', f.remark || '')
  fd.append('jar_file', f.jar_file as File)
  return fd
}

async function save() {
  if (!canEdit('plugin')) return
  if (loading.value || saving.value) return
  saveError.value = ''
  if (!validateAll()) return
  const f = form.value
  if (f.plugin_type === 'GROOVY' && new Blob([f.script_content]).size > MAX_SCRIPT_SIZE) {
    saveError.value = t('v2.plugins.scriptSizeExceeded')
    return
  }
  if (!isEdit.value && f.plugin_type === 'JAR' && !f.jar_file) {
    saveError.value = t('v2.plugins.jarRequired')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      if (f.plugin_type === 'JAR' && f.jar_file) {
        await updatePlugin(editId.value, buildJarForm(f, false))
      } else {
        await updatePlugin(editId.value, buildJsonEditPayload(f))
      }
      toast.success(t('v2.plugins.saveSuccess'))
      dirty.value = false
      await load()
    } else {
      if (f.plugin_type === 'JAR' && f.jar_file) {
        await createPlugin(buildJarForm(f, true))
      } else {
        const payload: Record<string, unknown> = {
          plugin_name: f.plugin_name,
          plugin_id: f.plugin_id,
          plugin_type: f.plugin_type,
          plugin_phase: f.plugin_phase,
          scope: f.scope,
          config: f.config,
          sort_order: Number(f.sort_order),
          remark: f.remark
        }
        if (f.plugin_type === 'GROOVY') payload.script_content = f.script_content
        if (f.plugin_type === 'GROUP') payload.group_member_ids = [...f.group_member_ids]
        await createPlugin(payload)
      }
      toast.success(t('v2.plugins.saveSuccess'))
      dirty.value = false
      // create 成功后的跳转是保存的一部分，不算脏离开（清基线，守卫直接放行）
      domBaseline = null
      await router.push('/v2/plugins/chain')
    }
  } catch (e: any) {
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) errors.value = { ...errors.value, ...fieldErrs }
    saveError.value = e?.message || t('v2.plugins.saveFailed')
  } finally {
    saving.value = false
  }
}

// ── Groovy 校验（脚本空 → 不发请求；reject → validateFailed 兜底）───────────
async function validateScript() {
  const script = form.value.script_content ?? ''
  if (!script) {
    groovyResult.value = t('v2.plugins.scriptRequired')
    groovyFailed.value = true
    return
  }
  try {
    const r = await validateGroovy(script)
    groovyFailed.value = !r?.is_valid
    groovyResult.value = r?.is_valid
      ? t('v2.plugins.groovyValid')
      : `${t('v2.plugins.groovyInvalid')}: ${r?.error_message ?? ''}`
  } catch {
    groovyFailed.value = true
    groovyResult.value = t('v2.plugins.validateFailed')
  }
}

// ── JAR 上传（FcDropZone 已过滤超限；reject 兜底文案）──────────────────────
function onJar(files: File[]) {
  const file = files?.[0]
  if (!file) return
  form.value.jar_file = file
  saveError.value = ''
}

function onJarReject() {
  saveError.value = t('v2.plugins.jarSizeExceeded')
}

async function cancel() {
  await router.back()
}

// ── 脏离开确认（router.beforeEach 按 name 圈定 + DOM 基线兜底，见文件头注）───
const removeLeaveGuard = router.beforeEach(async (to, from) => {
  if (String(from.name ?? '') !== 'V2PluginEditor' || String(to.name ?? '') === 'V2PluginEditor') return
  if (saving.value) return
  const dirtyNow = dirty.value || domDrifted()
  if (!dirtyNow) return
  const ok = await confirm({ variant: 'danger', title: t('v2.plugins.unsavedChanges') })
  if (!ok) return false
})

onUnmounted(removeLeaveGuard)
</script>

<style scoped>
.ped-page {
  min-width: 0;
}

.ped-page :deep(:focus-visible) {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.ped-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-text);
}

/* 提示条（加载失败），与 v2 页配方一致 */
.ped-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
}

.ped-banner.is-error {
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}

.ped-banner-msg {
  opacity: 0.85;
}

.ped-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
  padding: 6px 2px 12px;
}

.ped-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ped-field--wide {
  grid-column: 1 / -1;
}

.ped-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
}

.ped-err {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--app-color-danger);
}

.ped-hint {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: var(--app-bg-muted);
  border-radius: var(--app-radius-sm);
}

.ped-hint.is-error {
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
}

.ped-drop-hint {
  padding: 14px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.ped-groovy-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.ped-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ped-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.ped-save-error {
  margin: 0;
}

@media (max-width: 768px) {
  .ped-form {
    grid-template-columns: 1fr;
  }
}
</style>
