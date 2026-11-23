<script setup lang="ts">
/**
 * S12-4：v2 路由创建【单页】（K8s Ingress 配置页形态，非向导）。
 *
 * 用户指令（2026-11-23）：「路由创建要 100% Spring Cloud Gateway 对齐」+「不要向导，要仿 k8s
 * ingress 配置页」+「同时做 YAML 视图」。契约见 docs/ui-v2/实施契约.md §10。
 *
 * 页面结构（自上而下，K8s Ingress 视觉语法）：
 *   metadata 区：name（必填 ^[a-zA-Z0-9_]{2,50}$）/ environment / remark / tags
 *   spec 区：
 *     rules[]  每条 rule = 一个 host（可空 = 不限域名）+ 若干 paths[]
 *              每条 path = path | pathType(Prefix|Exact|ImplementationSpecific)
 *                        | backend.service | backend.port
 *     filters[]  插件绑定（SCG filters ↔ gateway4j 插件）
 *     predicates[] 高级谓词（SCG 原生定义串，如 Host=**.example.com）
 *   底部：保存 / 取消
 *
 * 双视图：表单 ⇄ YAML（同一份 Ingress 结构的 YAML 表达，双向同步）。
 *   - 切到 YAML：把当前表单（含未保存改动）序列化成 YAML；
 *   - 切回表单：解析 YAML → 回填表单；解析失败给【行号】错误提示并停留 YAML 视图。
 *
 * 载荷（§10 POST /v1/routes/ingress）：
 *   { name, environment, remark, tags,
 *     rules: [{ host, paths: [{ path, pathType, backend: { service, port } }] }],
 *     plugins: [{ plugin_id, binding_config }],
 *     predicates: string[] }
 *   pathType 映射：PREFIX → `/api/**`；EXACT → 原样；IMPLEMENTATION_SPECIFIC → 原样。
 *
 * 依赖分层（避免重依赖进主 bundle）：
 *   - 纯模型层 ./ingressModel（路径翻译 / 载荷构造）静态 import —— 零重依赖；
 *   - YAML 序列化层 ./ingressYaml（js-yaml）动态 import → js-yaml 只进懒加载 chunk；
 *   - YAML 编辑器 @/components-v2/editor/FcYamlEditor.vue 动态 import（CodeMirror 6 同理）。
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FcButton, FcCollapse, FcCollapseItem, FcIcon, FcInput, FcSectionCard, toast } from '@/components'
import { createIngressRoute } from '@/api/routes'
import { listPlugins, type PluginItem } from '@/api/plugins'
import { usePermission } from '@/composables/usePermission'
import {
  buildIngressPayload,
  emptyIngressModel,
  emptyIngressPath,
  INGRESS_NAME_RE,
  type IngressModel,
  type IngressPathType,
  type IngressRuleModel
} from './ingressModel'

/** 名称正则（§10 route_name 约束） */
const NAME_RE = INGRESS_NAME_RE
/** host 宽松格式（允许 *.example.com；空 = 不限域名） */
const HOST_RE = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/
/** 端口：数字（可空） */
const PORT_RE = /^\d+$/

/** SCG 原生谓词类型全集（高级谓词区） */
const PREDICATE_TYPES = ['Host', 'Method', 'Cookie', 'RemoteAddr', 'After', 'Before'] as const
type PredicateType = (typeof PREDICATE_TYPES)[number]

const { t } = useI18n()
const router = useRouter()
const { canEdit } = usePermission()

/* ── 懒加载边界（js-yaml / CodeMirror 都不进主 bundle）──────────────────────── */
const ingressYamlModule = import('./ingressYaml')
const yamlEditorModule = import('@/components-v2/editor/FcYamlEditor.vue')
const yamlChunkReady = ref(false)
void yamlEditorModule.then(() => {
  yamlChunkReady.value = true
}).catch(() => {
  /* chunk 失败：停留过渡期 textarea（降级语义同 FcYamlEditor 内部 fallback） */
})
const FcYamlEditor = defineAsyncComponent(async () => {
  const mod: { default: Component } = await yamlEditorModule
  return mod.default
})

/* ── 状态 ────────────────────────────────────────────────────────────────── */
const model = reactive<IngressModel>(emptyIngressModel())
const view = ref<'form' | 'yaml'>('form')
const yamlText = ref('')
const yamlErrorLine = ref<number | null>(null)
const errors = ref<string[]>([])
const submitError = ref('')
const submitting = ref(false)
const plugins = ref<PluginItem[]>([])
const pluginsFailed = ref(false)
const pluginPick = ref('')
/** 高级谓词行（UI 形态：类型 + 参数；产出 SCG 定义串） */
const predicateRows = ref<Array<{ type: PredicateType; arg: string }>>([])
/** 折叠区展开态（高级谓词区默认收起） */
const openPanels = ref<string[]>([])

/**
 * 已限定域名的规则（高级谓词区的 Host 冲突提示数据源）：
 * rule.host 与高级谓词区的 Host=... 会作为【两个 Host 谓词 AND 组合】同时生效
 * → 几乎必然不命中。UI 只提示不禁用（高级谓词是全局的，可能另有用途）。
 */
const hostScopedHosts = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  model.rules.forEach((r) => {
    const h = String(r.host ?? '').trim()
    if (h && !seen.has(h)) {
      seen.add(h)
      out.push(h)
    }
  })
  return out
})

/** 谓词定义串（`Host=**.example.com` 形态；空参数行不产出） */
const predicateDefs = computed(() =>
  predicateRows.value.map((r) => (r.arg.trim() === '' ? '' : `${r.type}=${r.arg.trim()}`)).filter((s) => s !== '')
)

/** 可选插件（未绑定的 ROUTE + ENABLED） */
const bindablePlugins = computed(() => {
  const bound = new Set(model.plugins.map((p) => p.plugin_id))
  return plugins.value.filter((p) => !bound.has(p.plugin_id))
})

/** 当前模型快照（含派生 predicates；YAML 序列化与载荷构造共用） */
function currentModel(): IngressModel {
  return {
    name: model.name,
    environment: model.environment,
    remark: model.remark,
    tags: model.tags,
    rules: model.rules.map((r) => ({
      host: r.host,
      paths: r.paths.map((p) => ({
        path: p.path,
        pathType: p.pathType,
        backend: { service: p.backend.service, port: p.backend.port }
      }))
    })),
    plugins: model.plugins.map((p) => ({ plugin_id: p.plugin_id, binding_config: p.binding_config })),
    predicates: [...predicateDefs.value]
  }
}

/* ── 行操作 ──────────────────────────────────────────────────────────────── */
function addRule() {
  model.rules.push({ host: '', paths: [emptyIngressPath()] })
}
function removeRule(i: number) {
  model.rules.splice(i, 1)
  if (model.rules.length === 0) model.rules.push({ host: '', paths: [emptyIngressPath()] })
}
function addPath(rule: IngressRuleModel) {
  rule.paths.push(emptyIngressPath())
}
function removePath(rule: IngressRuleModel, j: number) {
  rule.paths.splice(j, 1)
  if (rule.paths.length === 0) rule.paths.push(emptyIngressPath())
}
function bindPlugin() {
  const id = pluginPick.value
  if (!id) return
  if (!model.plugins.some((p) => p.plugin_id === id)) {
    model.plugins.push({ plugin_id: id, binding_config: '{}' })
  }
  pluginPick.value = ''
}
function unbindPlugin(id: string) {
  const idx = model.plugins.findIndex((p) => p.plugin_id === id)
  if (idx >= 0) model.plugins.splice(idx, 1)
}
function addPredicate() {
  predicateRows.value.push({ type: 'Host', arg: '' })
}
function removePredicate(i: number) {
  predicateRows.value.splice(i, 1)
}

/* ── YAML 视图 ───────────────────────────────────────────────────────────── */
/** 定义串 → 谓词行（YAML → 表单的反向映射） */
function parsePredicate(def: string): { type: PredicateType; arg: string } {
  const raw = String(def ?? '')
  const eq = raw.indexOf('=')
  if (eq < 0) return { type: 'Host', arg: raw }
  const type = raw.slice(0, eq)
  const arg = raw.slice(eq + 1)
  const known = (PREDICATE_TYPES as readonly string[]).includes(type)
  return { type: known ? (type as PredicateType) : 'Host', arg: known ? arg : raw }
}

/** 表单 → YAML（未保存的改动一并序列化进去） */
async function switchToYaml() {
  const mod = await ingressYamlModule
  yamlText.value = mod.dumpIngressYaml(currentModel())
  yamlErrorLine.value = null
  view.value = 'yaml'
}

/** YAML → 表单（解析失败给行号并停留 YAML 视图） */
async function switchToForm() {
  const mod = await ingressYamlModule
  const res = mod.loadIngressYaml(yamlText.value)
  if (!res.ok) {
    yamlErrorLine.value = res.line
    return
  }
  yamlErrorLine.value = null
  const next = res.model
  model.name = next.name
  model.environment = next.environment
  model.remark = next.remark
  model.tags = next.tags
  model.rules.splice(0, model.rules.length, ...next.rules)
  model.plugins.splice(0, model.plugins.length, ...next.plugins)
  predicateRows.value = next.predicates.map(parsePredicate)
  view.value = 'form'
}

/* ── 校验 ────────────────────────────────────────────────────────────────── */
function validate(): string[] {
  const errs: string[] = []
  const name = model.name.trim()
  if (!name) errs.push(t('v2.ingress.nameRequired'))
  else if (!NAME_RE.test(name)) errs.push(t('v2.ingress.nameInvalid'))
  if (model.rules.length === 0) errs.push(t('v2.ingress.ruleNeedPath'))
  model.rules.forEach((rule) => {
    const host = rule.host.trim()
    if (host && !HOST_RE.test(host)) errs.push(t('v2.ingress.hostInvalid'))
    if (rule.paths.length === 0) errs.push(t('v2.ingress.ruleNeedPath'))
    rule.paths.forEach((p) => {
      if (!p.path.trim()) errs.push(t('v2.ingress.pathRequired'))
      if (!p.backend.service.trim()) errs.push(t('v2.ingress.serviceRequired'))
      const port = p.backend.port.trim()
      if (port && !PORT_RE.test(port)) errs.push(t('v2.ingress.portInvalid'))
    })
  })
  predicateRows.value.forEach((r) => {
    if (!r.arg.trim()) errs.push(t('v2.ingress.predicateArgRequired'))
  })
  return errs
}

/* ── 提交 ────────────────────────────────────────────────────────────────── */
async function submit() {
  if (submitting.value) return
  errors.value = validate()
  submitError.value = ''
  if (errors.value.length > 0) return
  submitting.value = true
  try {
    await createIngressRoute(buildIngressPayload(currentModel()))
    toast.success(t('v2.ingress.createSuccess'))
    await router.push('/v2/routes')
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

function cancel() {
  void router.push('/v2/routes')
}

onMounted(async () => {
  try {
    const res = await listPlugins({ page: 1, pageSize: 100 })
    plugins.value = (res?.records ?? []).filter((p) => p.scope === 'ROUTE' && p.status === 'ENABLED')
  } catch {
    pluginsFailed.value = true
    plugins.value = []
  }
})

/** pathType 下拉选项（值域钉死三值；label 走 i18n） */
const PATH_TYPE_OPTIONS: Array<{ value: IngressPathType; labelKey: string }> = [
  { value: 'PREFIX', labelKey: 'v2.ingress.pathTypePrefix' },
  { value: 'EXACT', labelKey: 'v2.ingress.pathTypeExact' },
  { value: 'IMPLEMENTATION_SPECIFIC', labelKey: 'v2.ingress.pathTypeImplementationSpecific' }
]
</script>

<template>
  <div class="ing-page" data-testid="ing-root">
    <!-- 无权限：整页 forbidden，不渲染表单 -->
    <div v-if="!canEdit('route')" class="ing-forbidden" data-testid="ing-forbidden">
      <FcIcon name="ri-lock-line" :size="28" />
      <p class="ing-forbidden-text">{{ t('v2.ingress.forbidden') }}</p>
    </div>

    <template v-else>
      <header class="ing-head">
        <h1 class="ing-title">{{ t('v2.ingress.title') }}</h1>
        <div class="ing-views" role="group" :aria-label="t('v2.ingress.title')">
          <button
            type="button"
            class="ing-view-btn"
            data-testid="ing-view-form"
            :aria-pressed="view === 'form' ? 'true' : 'false'"
            :class="{ 'is-on': view === 'form' }"
            @click="switchToForm"
          >
            <FcIcon name="ri-file-list-3-line" :size="13" />
            <span>{{ t('v2.ingress.viewForm') }}</span>
          </button>
          <button
            type="button"
            class="ing-view-btn"
            data-testid="ing-view-yaml"
            :aria-pressed="view === 'yaml' ? 'true' : 'false'"
            :class="{ 'is-on': view === 'yaml' }"
            @click="switchToYaml"
          >
            <FcIcon name="ri-code-box-line" :size="13" />
            <span>{{ t('v2.ingress.viewYaml') }}</span>
          </button>
        </div>
      </header>

      <!-- 表单视图 -->
      <div v-if="view === 'form'" class="ing-body" data-testid="ing-form-view">
        <!-- metadata 区 -->
        <FcSectionCard padding="sm" shadow="sm" class="ing-card">
          <h2 class="ing-section-title">{{ t('v2.ingress.sectionMetadata') }}</h2>
          <div class="ing-grid">
            <div class="ing-field">
              <label class="ing-label" for="ing-name">{{ t('v2.ingress.fieldName') }}</label>
              <FcInput id="ing-name" v-model="model.name" data-testid="ing-name" />
            </div>
            <div class="ing-field">
              <label class="ing-label" for="ing-environment">{{ t('v2.ingress.fieldEnvironment') }}</label>
              <FcInput id="ing-environment" v-model="model.environment" data-testid="ing-environment" />
            </div>
            <div class="ing-field is-wide">
              <label class="ing-label" for="ing-remark">{{ t('v2.ingress.fieldRemark') }}</label>
              <FcInput id="ing-remark" v-model="model.remark" type="textarea" :rows="2" data-testid="ing-remark" />
            </div>
            <div class="ing-field is-wide">
              <label class="ing-label" for="ing-tags">{{ t('v2.ingress.fieldTags') }}</label>
              <FcInput id="ing-tags" v-model="model.tags" data-testid="ing-tags" />
            </div>
          </div>
        </FcSectionCard>

        <!-- spec.rules 区 -->
        <FcSectionCard padding="sm" shadow="sm" class="ing-card">
          <div class="ing-section-head">
            <h2 class="ing-section-title">{{ t('v2.ingress.sectionRules') }}</h2>
            <FcButton variant="secondary" size="sm" data-testid="ing-add-rule" @click="addRule">
              <FcIcon name="ri-add-line" :size="13" />
              <span>{{ t('v2.ingress.addRule') }}</span>
            </FcButton>
          </div>

          <div
            v-for="(rule, ri) in model.rules"
            :key="ri"
            class="ing-rule"
            :data-testid="`ing-rule-${ri}`"
          >
            <div class="ing-rule-head">
              <span class="ing-rule-no">{{ ri + 1 }}</span>
              <div class="ing-field is-grow">
                <label class="ing-label" :for="`ing-host-${ri}`">{{ t('v2.ingress.fieldHost') }}</label>
                <FcInput :id="`ing-host-${ri}`" v-model="rule.host" :data-testid="`ing-host-${ri}`" />
              </div>
              <button
                type="button"
                class="ing-icon-btn"
                :data-testid="`ing-rm-rule-${ri}`"
                :title="t('v2.ingress.removeRule')"
                @click="removeRule(ri)"
              >
                <FcIcon name="ri-delete-bin-6-line" :size="14" />
              </button>
            </div>

            <div
              v-for="(p, pi) in rule.paths"
              :key="pi"
              class="ing-path"
              :data-testid="`ing-path-row-${ri}-${pi}`"
            >
              <div class="ing-field">
                <label class="ing-label" :for="`ing-path-${ri}-${pi}`">{{ t('v2.ingress.fieldPath') }}</label>
                <FcInput :id="`ing-path-${ri}-${pi}`" v-model="p.path" :data-testid="`ing-path-${ri}-${pi}`" />
              </div>
              <div class="ing-field">
                <label class="ing-label" :for="`ing-pathtype-${ri}-${pi}`">{{ t('v2.ingress.fieldPathType') }}</label>
                <select
                  :id="`ing-pathtype-${ri}-${pi}`"
                  class="ing-select"
                  :data-testid="`ing-pathtype-${ri}-${pi}`"
                  v-model="p.pathType"
                >
                  <option v-for="opt in PATH_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </div>
              <div class="ing-field">
                <label class="ing-label" :for="`ing-service-${ri}-${pi}`">{{ t('v2.ingress.fieldService') }}</label>
                <FcInput :id="`ing-service-${ri}-${pi}`" v-model="p.backend.service" :data-testid="`ing-service-${ri}-${pi}`" />
              </div>
              <div class="ing-field">
                <label class="ing-label" :for="`ing-port-${ri}-${pi}`">{{ t('v2.ingress.fieldPort') }}</label>
                <FcInput :id="`ing-port-${ri}-${pi}`" v-model="p.backend.port" :data-testid="`ing-port-${ri}-${pi}`" />
              </div>
              <button
                type="button"
                class="ing-icon-btn is-path"
                :data-testid="`ing-rm-path-${ri}-${pi}`"
                :title="t('v2.ingress.removePath')"
                @click="removePath(rule, pi)"
              >
                <FcIcon name="ri-close-line" :size="14" />
              </button>
            </div>

            <FcButton variant="secondary" size="sm" :data-testid="`ing-add-path-${ri}`" @click="addPath(rule)">
              <FcIcon name="ri-add-line" :size="13" />
              <span>{{ t('v2.ingress.addPath') }}</span>
            </FcButton>
          </div>
        </FcSectionCard>

        <!-- spec.filters 区（插件绑定） -->
        <FcSectionCard padding="sm" shadow="sm" class="ing-card">
          <h2 class="ing-section-title">{{ t('v2.ingress.sectionFilters') }}</h2>
          <div class="ing-bind-row">
            <select class="ing-select is-grow" data-testid="ing-plugin-select" v-model="pluginPick">
              <option value="">{{ t('v2.ingress.addPlugin') }}</option>
              <option v-for="p in bindablePlugins" :key="p.plugin_id" :value="p.plugin_id">
                {{ p.plugin_name }}
              </option>
            </select>
            <FcButton variant="secondary" size="sm" data-testid="ing-add-plugin" @click="bindPlugin">
              <FcIcon name="ri-add-line" :size="13" />
              <span>{{ t('v2.ingress.addPlugin') }}</span>
            </FcButton>
          </div>
          <p v-if="pluginsFailed" class="ing-hint is-error">{{ t('v2.ingress.pluginsLoadFailed') }}</p>
          <p v-else-if="bindablePlugins.length === 0 && model.plugins.length === 0" class="ing-hint">
            {{ t('v2.ingress.pluginsEmpty') }}
          </p>
          <div v-for="p in model.plugins" :key="p.plugin_id" class="ing-bind-row">
            <span class="ing-bind-name">{{ p.plugin_id }}</span>
            <FcInput
              v-model="p.binding_config"
              class="is-grow"
              :data-testid="`ing-plugin-cfg-${p.plugin_id}`"
            />
            <button
              type="button"
              class="ing-icon-btn"
              :data-testid="`ing-rm-plugin-${p.plugin_id}`"
              :title="t('v2.ingress.removePlugin')"
              @click="unbindPlugin(p.plugin_id)"
            >
              <FcIcon name="ri-delete-bin-6-line" :size="14" />
            </button>
          </div>
        </FcSectionCard>

        <!-- spec.predicates 区（SCG 原生谓词；折叠区，默认收起） -->
        <FcSectionCard padding="sm" shadow="sm" class="ing-card">
          <FcCollapse v-model="openPanels" class="ing-collapse">
            <FcCollapseItem name="predicates" :title="t('v2.ingress.sectionPredicates')">
              <p
                v-if="hostScopedHosts.length > 0"
                class="ing-hint is-warn"
                data-testid="ing-pred-host-conflict"
                role="alert"
              >
                {{ t('v2.ingress.predicateHostConflict', { hosts: hostScopedHosts.join(', ') }) }}
              </p>
              <div class="ing-section-head">
                <p class="ing-hint">{{ t('v2.ingress.emptyRuleHint') }}</p>
                <FcButton variant="secondary" size="sm" data-testid="ing-add-predicate" @click="addPredicate">
                  <FcIcon name="ri-add-line" :size="13" />
                  <span>{{ t('v2.ingress.addPredicate') }}</span>
                </FcButton>
              </div>
              <div v-for="(row, pi) in predicateRows" :key="pi" class="ing-pred-row">
                <div class="ing-field">
                  <label class="ing-label" :for="`ing-pred-type-${pi}`">{{ t('v2.ingress.fieldPredicateType') }}</label>
                  <select
                    :id="`ing-pred-type-${pi}`"
                    class="ing-select"
                    :data-testid="`ing-pred-type-${pi}`"
                    v-model="row.type"
                  >
                    <option v-for="pt in PREDICATE_TYPES" :key="pt" :value="pt">{{ pt }}</option>
                  </select>
                </div>
                <div class="ing-field is-grow">
                  <label class="ing-label" :for="`ing-pred-arg-${pi}`">{{ t('v2.ingress.fieldPredicateArg') }}</label>
                  <FcInput :id="`ing-pred-arg-${pi}`" v-model="row.arg" :data-testid="`ing-pred-arg-${pi}`" />
                </div>
                <span class="ing-pred-def" :data-testid="`ing-pred-def-${pi}`">
                  {{ row.arg.trim() === '' ? t('v2.ingress.emptyValue') : `${row.type}=${row.arg.trim()}` }}
                </span>
                <button
                  type="button"
                  class="ing-icon-btn"
                  :data-testid="`ing-rm-predicate-${pi}`"
                  :title="t('v2.ingress.removePredicate')"
                  @click="removePredicate(pi)"
                >
                  <FcIcon name="ri-delete-bin-6-line" :size="14" />
                </button>
              </div>
            </FcCollapseItem>
          </FcCollapse>
        </FcSectionCard>
      </div>

      <!-- YAML 视图 -->
      <div v-else class="ing-body" data-testid="ing-yaml-view">
        <div class="ing-yaml-box" data-testid="ing-yaml">
          <FcYamlEditor v-if="yamlChunkReady" v-model="yamlText" :rows="18" />
          <textarea v-else class="ing-yaml-textarea" v-model="yamlText" spellcheck="false" />
        </div>
        <p v-if="yamlErrorLine !== null" class="ing-hint is-error" data-testid="ing-yaml-error" role="alert">
          {{ t('v2.ingress.yamlInvalid', { line: yamlErrorLine }) }}
        </p>
      </div>

      <!-- 校验错误条 -->
      <div v-if="errors.length > 0" class="ing-banner is-error" data-testid="ing-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <ul class="ing-err-list">
          <li v-for="(e, ei) in errors" :key="ei" class="ing-err-item" :data-testid="`ing-err-${ei}`">{{ e }}</li>
        </ul>
      </div>

      <!-- 提交失败错误条（可重试） -->
      <div v-if="submitError" class="ing-banner is-error" data-testid="ing-submit-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.ingress.createFailed') }} {{ submitError }}</span>
      </div>

      <!-- 底部操作条 -->
      <div class="ing-actions">
        <FcButton variant="secondary" data-testid="ing-cancel" @click="cancel">
          <span>{{ t('v2.ingress.cancel') }}</span>
        </FcButton>
        <FcButton variant="primary" :disabled="submitting" data-testid="ing-submit" @click="submit">
          <FcIcon name="ri-save-3-line" :size="14" />
          <span>{{ t('v2.ingress.save') }}</span>
        </FcButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ing-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  min-width: 0;
}

.ing-forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--app-text-tertiary);
}

.ing-forbidden-text {
  margin: 0;
  font-size: 13px;
}

.ing-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ing-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.ing-views {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
}

.ing-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--app-radius-button);
  cursor: pointer;
}

.ing-view-btn.is-on {
  color: var(--app-text);
  background: var(--app-bg-card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--app-shadow) 12%, transparent);
}

.ing-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.ing-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ing-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ing-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.ing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.ing-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ing-field.is-wide {
  grid-column: 1 / -1;
}

.ing-field.is-grow,
.is-grow {
  flex: 1;
  min-width: 0;
}

.ing-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.ing-rule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
}

.ing-rule-head {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.ing-rule-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  font-size: 11px;
  color: var(--app-text-tertiary);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-chip);
}

.ing-path {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.4fr 0.8fr auto;
  gap: 8px;
  align-items: end;
  padding: 8px;
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
}

.ing-select {
  width: 100%;
  padding: 7px 8px;
  font-size: 13px;
  color: var(--app-text);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
}

.ing-select:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.ing-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--app-text-tertiary);
  background: transparent;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  cursor: pointer;
}

.ing-icon-btn:hover {
  color: var(--app-color-danger-text-on-tint);
  border-color: var(--app-color-danger);
}

.ing-icon-btn.is-path {
  align-self: end;
}

.ing-bind-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.ing-bind-name {
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  color: var(--app-text-secondary);
}

.ing-pred-row {
  display: grid;
  grid-template-columns: 160px 1fr auto auto;
  gap: 8px;
  align-items: end;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border-light);
}

.ing-pred-def {
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.ing-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.ing-hint.is-error {
  color: var(--app-color-danger-text-on-tint);
}

.ing-hint.is-warn {
  color: var(--app-color-warning-text-on-tint, var(--app-text-secondary));
  padding: 6px 8px;
  background: color-mix(in srgb, var(--app-color-warning, var(--app-primary)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-warning, var(--app-primary)) 28%, transparent);
  border-radius: var(--app-radius-sm);
}

.ing-yaml-box {
  min-width: 0;
}

.ing-yaml-textarea {
  width: 100%;
  padding: 10px;
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text);
  background: var(--app-bg-card);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
  resize: vertical;
}

.ing-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
}

.ing-banner.is-error {
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}

.ing-err-list {
  margin: 0;
  padding-left: 16px;
}

.ing-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
