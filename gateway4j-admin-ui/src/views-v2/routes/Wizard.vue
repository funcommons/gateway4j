<!--
  S4-C：v2 新建路由向导（原型 prototype-v2/03-route-wizard.html）。
  五步：模板 → 匹配 → 目标 → 插件 → 发布；右栏「实时预览 + 配置进度」（纯 CSS 形状，颜色/圆角/阴影全走 token）。

  数据契约（以 src/api/routes.ts createRoute 真实签名为准）：
    route_name ^[a-zA-Z0-9_]{2,50}$；path ^\/[^\s]+$；upstream_url ^https?:\/\/\S+$（仅 BACKEND 必填，
    DISPATCH 不传）；plugin_ids: string[]；environment 不带（后端缺省 default）。

  后端能力缺口（v1 向导裁剪，S4-T 测试头注释同源声明）：
    1. createRoute 单次只建一条路由、无 branches/多分支字段 →「分发路由」模板 v1 仅创建 DISPATCH 父路由
      （第 3 步为分支配置简化形态 wizard-branch），多分支留 S5a 决策树/画布继续补。
    2. 灰度模板后端无专用权重/Header 切流字段、「复制」模板需要先选源路由（向导 v1 无源路由选择器）→
      canary/copy 渲染卡片但创建语义同 basic（BACKEND 单服务），能力补齐后接入。

  草稿：sessionStorage 'v2-wizard-draft'，JSON { step, template, form: { route_name, path, upstream_url, plugins } }；
  底部条手动保存（toast 提示），mount 自动恢复（静默，draftRestored 文案备用）。
-->
<template>
  <div class="wiz-page">
    <!-- 无权限：整页 forbidden，不渲染步骤条与表单 -->
    <div v-if="!canEdit('route')" class="wiz-forbidden" data-testid="wizard-forbidden">
      <FcIcon name="ri-lock-line" :size="28" />
      <p class="wiz-forbidden-text">{{ t('v2.wizard.forbidden') }}</p>
    </div>

    <template v-else>
      <!-- 步骤条：当前步 aria-current="step"，完成态打勾 -->
      <nav class="wiz-steps" :aria-label="t('v2.page.wizard')">
        <template v-for="st in STEPS" :key="st.n">
          <span v-if="st.n > 1" class="wiz-steps-line" aria-hidden="true" />
          <div
            class="wiz-step"
            :class="{ 'is-cur': step === st.n, 'is-done': stepDone(st.n) }"
            :data-testid="`wizard-step-${st.n}`"
            :aria-current="step === st.n ? 'step' : undefined"
          >
            <span class="wiz-step-no">
              <FcIcon v-if="stepDone(st.n) && step !== st.n" name="ri-check-line" :size="12" />
              <template v-else>{{ st.n }}</template>
            </span>
            <span class="wiz-step-label">{{ t(st.key) }}</span>
          </div>
        </template>
      </nav>

      <div class="wiz-grid">
        <div class="wiz-main">
          <!-- 第 1 步：模板卡。原生 button 承载可选卡片语义（List.vue 语义化表格同款 SDK 惯例分支），aria-pressed 同步选中态 -->
          <section v-if="step === 1" class="wiz-pane">
            <h2 class="wiz-pane-title">{{ t('v2.wizard.stepTemplate') }}</h2>
            <div class="wiz-cards">
              <button
                v-for="tpl in TEMPLATES"
                :key="tpl.id"
                type="button"
                class="wiz-card"
                :class="{ 'is-selected': templateId === tpl.id, 'is-wide': tpl.shape === 'blank' }"
                :data-testid="`wizard-template-${tpl.id}`"
                :aria-pressed="templateId === tpl.id ? 'true' : 'false'"
                @click="templateId = tpl.id"
              >
                <b class="wiz-card-title">{{ t(tpl.titleKey) }}</b>
                <span class="wiz-card-desc">{{ t(tpl.descKey) }}</span>
                <!-- 迷你示意：入口点 → 主形态，纯形状无文字，装饰性 -->
                <span class="wiz-diagram" aria-hidden="true">
                  <i class="dg-dot" /><i class="dg-line" />
                  <template v-if="tpl.shape === 'single' || tpl.shape === 'blank'">
                    <i class="dg-box" :class="{ 'is-dashed': tpl.shape === 'blank' }" />
                  </template>
                  <template v-else-if="tpl.shape === 'branch'">
                    <i class="dg-diamond" /><i class="dg-line" />
                    <span class="dg-stack"><i /><i /><i /></span>
                  </template>
                  <template v-else-if="tpl.shape === 'split'">
                    <i class="dg-box" />
                    <span class="dg-split"><i class="is-major" /><i class="is-minor" /></span>
                  </template>
                  <template v-else>
                    <span class="dg-copy"><i /><i /></span>
                  </template>
                </span>
              </button>
            </div>
          </section>

          <!-- 第 2 步：匹配条件（沿用 RouteBasicForm 语义） -->
          <section v-else-if="step === 2" class="wiz-pane">
            <h2 class="wiz-pane-title">{{ t('v2.wizard.stepMatch') }}</h2>
            <div class="wiz-field">
              <label class="wiz-label" for="wiz-route-name">{{ t('v2.wizard.labelName') }}</label>
              <FcInput id="wiz-route-name" v-model="form.route_name" data-testid="route-name" />
            </div>
            <div class="wiz-field">
              <label class="wiz-label" for="wiz-route-path">{{ t('v2.wizard.labelPath') }}</label>
              <FcInput id="wiz-route-path" v-model="form.path" data-testid="route-path" />
            </div>
          </section>

          <!-- 第 3 步：转发目标 -->
          <section v-else-if="step === 3" class="wiz-pane">
            <h2 class="wiz-pane-title">{{ t('v2.wizard.stepTarget') }}</h2>
            <!-- DISPATCH：分支配置简化形态（后端缺口 1：无多分支创建，见文件头） -->
            <div v-if="isDispatch" class="wiz-branch" data-testid="wizard-branch">
              <p class="wiz-branch-title">
                <FcIcon name="ri-share-forward-line" :size="14" />
                <span>{{ t('v2.wizard.branchTitle') }}</span>
              </p>
              <p class="wiz-branch-desc">{{ t('v2.wizard.branchFirst') }}</p>
              <div class="wiz-diagram" aria-hidden="true">
                <i class="dg-dot" /><i class="dg-line" /><i class="dg-diamond" /><i class="dg-line" />
                <span class="dg-stack"><i /><i /><i /></span>
              </div>
            </div>
            <div v-else class="wiz-field">
              <label class="wiz-label" for="wiz-route-upstream">{{ t('v2.wizard.labelUpstream') }}</label>
              <FcInput id="wiz-route-upstream" v-model="form.upstream_url" data-testid="route-upstream" />
            </div>
          </section>

          <!-- 第 4 步：插件链（可跳过：默认继承全局） -->
          <section v-else-if="step === 4" class="wiz-pane">
            <h2 class="wiz-pane-title">{{ t('v2.wizard.stepPlugins') }}</h2>
            <p class="wiz-hint">
              <FcIcon name="ri-information-line" :size="13" />
              <span>{{ t('v2.wizard.pluginsInheritGlobal') }}</span>
            </p>
            <div class="wiz-chips">
              <FcButton
                v-for="p in plugins"
                :key="p.plugin_id"
                variant="secondary"
                size="sm"
                class="wiz-chip"
                :class="{ 'is-on': selectedPlugins.includes(p.plugin_id) }"
                :data-testid="`wizard-plugin-${p.plugin_id}`"
                :aria-pressed="selectedPlugins.includes(p.plugin_id) ? 'true' : 'false'"
                @click="togglePlugin(p.plugin_id)"
              >
                {{ p.plugin_name }}
              </FcButton>
              <span v-if="!plugins.length" class="wiz-chips-empty">{{ t('v2.wizard.placeholder') }}</span>
            </div>
          </section>

          <!-- 第 5 步：发布生效（汇总 + 创建） -->
          <section v-else class="wiz-pane">
            <h2 class="wiz-pane-title">{{ t('v2.wizard.stepPublish') }}</h2>
            <div class="wiz-summary" data-testid="wizard-summary">
              <p class="wiz-summary-title">{{ t('v2.wizard.summaryTitle') }}</p>
              <dl class="wiz-summary-rows">
                <div class="wiz-sum-row">
                  <dt>{{ t('v2.wizard.summaryTemplate') }}</dt>
                  <dd>{{ templateTitle }}</dd>
                </div>
                <div class="wiz-sum-row">
                  <dt>{{ t('v2.wizard.summaryPath') }}</dt>
                  <dd class="wiz-mono">{{ form.path.trim() || '—' }}</dd>
                </div>
                <div class="wiz-sum-row">
                  <dt>{{ t('v2.wizard.summaryUpstream') }}</dt>
                  <dd class="wiz-mono">{{ isDispatch ? t('v2.wizard.placeholder') : form.upstream_url.trim() || '—' }}</dd>
                </div>
                <div class="wiz-sum-row">
                  <dt>{{ t('v2.wizard.summaryPlugins') }}</dt>
                  <dd>{{ selectedPlugins.length }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <!-- 步内校验错误条（当前步阻断原因） -->
          <div v-if="stepError" class="wiz-banner is-error" data-testid="wizard-step-error" role="alert">
            <FcIcon name="ri-error-warning-line" :size="14" />
            <span>{{ stepError }}</span>
          </div>
        </div>

        <!-- 右栏：实时预览 + 配置进度 -->
        <aside class="wiz-rail">
          <FcSectionCard padding="sm" shadow="sm">
            <p class="wiz-rail-title">{{ t('v2.wizard.previewTitle') }}</p>
            <div class="wiz-preview">
              <div class="pv-node">
                <span class="pv-key">{{ t('v2.wizard.stepMatch') }}</span>
                <span class="pv-value wiz-mono" :class="{ 'is-pending': !form.path.trim() }">{{ form.path.trim() || '—' }}</span>
              </div>
              <span class="pv-link" aria-hidden="true" />
              <div class="pv-node">
                <span class="pv-key">{{ t('v2.wizard.stepTarget') }}</span>
                <span class="pv-value wiz-mono" :class="{ 'is-pending': isDispatch || !form.upstream_url.trim() }">
                  {{ isDispatch ? t('v2.wizard.branchTitle') : form.upstream_url.trim() || '—' }}
                </span>
              </div>
              <span class="pv-link" aria-hidden="true" />
              <div class="pv-node">
                <span class="pv-key">{{ t('v2.wizard.stepPlugins') }}</span>
                <span class="pv-value" :class="{ 'is-pending': !selectedPlugins.length }">{{ selectedPlugins.length || '—' }}</span>
              </div>
            </div>
          </FcSectionCard>
          <FcSectionCard padding="sm" shadow="sm">
            <p class="wiz-rail-title">{{ t('v2.wizard.progressTitle') }}</p>
            <ol class="wiz-progress">
              <li v-for="st in STEPS" :key="st.n" :class="{ 'is-done': stepDone(st.n) }">
                <FcIcon :name="stepDone(st.n) ? 'ri-check-line' : 'ri-time-line'" :size="13" />
                <span>{{ t(st.key) }}</span>
              </li>
            </ol>
          </FcSectionCard>
        </aside>
      </div>

      <!-- 创建失败错误条（可重试：停留当前步，submit 不禁用） -->
      <div v-if="submitError" class="wiz-banner is-error" data-testid="wizard-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.wizard.createFailed') }}{{ t('v2.wizard.summarySep') }} {{ submitError }}</span>
      </div>

      <!-- 底部操作条 -->
      <div class="wiz-actions">
        <FcButton variant="secondary" size="sm" data-testid="wizard-draft" @click="saveDraft">
          <FcIcon name="ri-edit-line" :size="13" />
          <span>{{ t('v2.wizard.saveDraft') }}</span>
        </FcButton>
        <div class="wiz-actions-main">
          <FcButton variant="secondary" :disabled="step === 1" data-testid="wizard-prev" @click="prev">
            <FcIcon name="ri-arrow-left-s-line" :size="14" />
            <span>{{ t('v2.wizard.prev') }}</span>
          </FcButton>
          <FcButton v-if="step < 5" variant="primary" :disabled="step === 1 && !templateId" data-testid="wizard-next" @click="next">
            <span>{{ t('v2.wizard.next') }}</span>
            <FcIcon name="ri-arrow-right-s-line" :size="14" />
          </FcButton>
          <FcButton v-else variant="primary" :disabled="submitting" data-testid="wizard-submit" @click="submit">
            <span>{{ t('v2.wizard.submit') }}</span>
          </FcButton>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FcButton, FcIcon, FcInput, FcSectionCard, toast } from '@/components'
import { createRoute } from '@/api/routes'
import { listPlugins, type PluginItem } from '@/api/plugins'
import { usePermission } from '@/composables/usePermission'

/** 模板 id（草稿 template 字段与 payload route_type 的映射见文件头缺口声明） */
type TemplateId = 'basic' | 'dispatch' | 'canary' | 'copy' | 'blank'
/** 模板卡迷你示意形态 */
type DiagramShape = 'single' | 'branch' | 'split' | 'copy' | 'blank'

interface WizardDraftForm {
  route_name?: string
  path?: string
  upstream_url?: string
  plugins?: unknown[]
}

interface WizardDraft {
  step?: number
  template?: TemplateId | null
  form?: WizardDraftForm
}

/** createRoute 入参子集（DISPATCH 不带 upstream_url，见文件头契约） */
interface WizardCreatePayload {
  route_name: string
  route_type: 'DISPATCH' | 'BACKEND'
  path: string
  upstream_url?: string
  plugin_ids: string[]
}

const { t } = useI18n()
const router = useRouter()
const { canEdit } = usePermission()

/** 校验正则（对齐 createRoute 后端契约） */
const NAME_RE = /^[a-zA-Z0-9_]{2,50}$/
const PATH_RE = /^\/[^\s]+$/
const UPSTREAM_RE = /^https?:\/\/\S+$/

const DRAFT_KEY = 'v2-wizard-draft'

const STEPS = [
  { n: 1, key: 'v2.wizard.stepTemplate' },
  { n: 2, key: 'v2.wizard.stepMatch' },
  { n: 3, key: 'v2.wizard.stepTarget' },
  { n: 4, key: 'v2.wizard.stepPlugins' },
  { n: 5, key: 'v2.wizard.stepPublish' }
] as const

const TEMPLATES: Array<{ id: TemplateId; titleKey: string; descKey: string; shape: DiagramShape }> = [
  { id: 'basic', titleKey: 'v2.wizard.tplBasic', descKey: 'v2.wizard.tplBasicDesc', shape: 'single' },
  { id: 'dispatch', titleKey: 'v2.wizard.tplDispatch', descKey: 'v2.wizard.tplDispatchDesc', shape: 'branch' },
  { id: 'canary', titleKey: 'v2.wizard.tplCanary', descKey: 'v2.wizard.tplCanaryDesc', shape: 'split' },
  { id: 'copy', titleKey: 'v2.wizard.tplCopy', descKey: 'v2.wizard.tplCopyDesc', shape: 'copy' },
  { id: 'blank', titleKey: 'v2.wizard.tplBlank', descKey: 'v2.wizard.tplBlankDesc', shape: 'blank' }
]
const TEMPLATE_IDS: TemplateId[] = TEMPLATES.map((tpl) => tpl.id)

const step = ref(1)
const templateId = ref<TemplateId | null>(null)
const form = reactive({ route_name: '', path: '', upstream_url: '' })
const selectedPlugins = ref<string[]>([])
const plugins = ref<PluginItem[]>([])
const stepError = ref('')
const submitError = ref('')
const submitting = ref(false)

const isDispatch = computed(() => templateId.value === 'dispatch')
/** 创建语义：v1 仅 dispatch 模板产出 DISPATCH 父路由；canary/copy 同 basic（文件头缺口 2） */
const routeType = computed<'DISPATCH' | 'BACKEND'>(() => (isDispatch.value ? 'DISPATCH' : 'BACKEND'))
const templateTitle = computed(() => {
  const tpl = TEMPLATES.find((item) => item.id === templateId.value)
  return tpl ? t(tpl.titleKey) : '—'
})

function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === 'string' && TEMPLATE_IDS.some((id) => id === v)
}

function togglePlugin(pluginId: string) {
  selectedPlugins.value = selectedPlugins.value.includes(pluginId)
    ? selectedPlugins.value.filter((id) => id !== pluginId)
    : [...selectedPlugins.value, pluginId]
}

/** 当前步校验：null = 通过（name/path 未填或格式不合 → 同一条必填文案，key 值内含格式提示） */
function validateStep(n: number): string | null {
  if (n === 2) {
    if (!NAME_RE.test(form.route_name.trim())) return t('v2.wizard.nameRequired')
    if (!PATH_RE.test(form.path.trim())) return t('v2.wizard.pathRequired')
  }
  if (n === 3 && !isDispatch.value) {
    const upstream = form.upstream_url.trim()
    if (!upstream) return t('v2.wizard.upstreamRequired')
    if (!UPSTREAM_RE.test(upstream)) return t('v2.wizard.upstreamFormat')
  }
  return null
}

function next() {
  if (step.value === 1 && !templateId.value) return
  const err = validateStep(step.value)
  if (err) {
    stepError.value = err
    return
  }
  stepError.value = ''
  if (step.value < 5) step.value++
}

/** 上一步：仅回退步骤，已填值全部保留 */
function prev() {
  if (step.value > 1) {
    stepError.value = ''
    step.value--
  }
}

/** 右栏进度清单：该步是否已完成（打勾） */
function stepDone(n: number): boolean {
  switch (n) {
    case 1:
      return templateId.value != null
    case 2:
      return NAME_RE.test(form.route_name.trim()) && PATH_RE.test(form.path.trim())
    case 3:
      return isDispatch.value || UPSTREAM_RE.test(form.upstream_url.trim())
    case 4:
      // 插件步可选（默认继承全局）：走过即算完成
      return step.value > 4
    default:
      return false
  }
}

onMounted(() => {
  restoreDraft()
  void loadPlugins()
})

/** 插件数据源：listPlugins 首页全量拉取；chips 仅列 ROUTE 作用域且 ENABLED 状态（GLOBAL 由路由继承，不进选择） */
async function loadPlugins() {
  try {
    const res = await listPlugins({ page: 1, pageSize: 100 })
    plugins.value = (res?.records ?? []).filter((p) => p.scope === 'ROUTE' && p.status === 'ENABLED')
  } catch {
    // 插件列表失败降级为空：第 4 步仍可跳过（默认继承全局）
    plugins.value = []
  }
}

function saveDraft() {
  try {
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: step.value,
        template: templateId.value,
        form: {
          route_name: form.route_name,
          path: form.path,
          upstream_url: form.upstream_url,
          plugins: [...selectedPlugins.value]
        }
      } satisfies WizardDraft)
    )
    toast.success(t('v2.wizard.draftSaved'))
  } catch {
    // sessionStorage 不可用（隐私模式等）：静默
  }
}

/** mount 自动恢复：回到上次步骤 + 值还原；静默（draftRestored 文案备用，v1 不弹 toast） */
function restoreDraft() {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw) as WizardDraft
    if (!draft || typeof draft !== 'object') return
    if (isTemplateId(draft.template)) templateId.value = draft.template
    if (typeof draft.step === 'number' && Number.isFinite(draft.step)) {
      step.value = Math.min(5, Math.max(1, Math.round(draft.step)))
    }
    const f = draft.form
    if (f && typeof f === 'object') {
      if (typeof f.route_name === 'string') form.route_name = f.route_name
      if (typeof f.path === 'string') form.path = f.path
      if (typeof f.upstream_url === 'string') form.upstream_url = f.upstream_url
      if (Array.isArray(f.plugins)) {
        selectedPlugins.value = f.plugins.filter((id): id is string => typeof id === 'string')
      }
    }
  } catch {
    // 脏草稿直接忽略
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // 忽略
  }
}

/** 创建：payload 对齐 createRoute 真实契约；失败停留当前步展示 e.message，可重试 */
async function submit() {
  if (submitting.value) return
  submitError.value = ''
  submitting.value = true
  try {
    const payload: WizardCreatePayload = {
      route_name: form.route_name.trim(),
      route_type: routeType.value,
      path: form.path.trim(),
      plugin_ids: [...selectedPlugins.value]
    }
    // DISPATCH 不带 upstream_url（createRoute 契约）
    if (!isDispatch.value) payload.upstream_url = form.upstream_url.trim()
    await createRoute(payload)
    toast.success(t('v2.wizard.createSuccess'))
    clearDraft()
    await router.push('/v2/routes')
  } catch (e) {
    submitError.value = e instanceof Error && e.message ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
/* 颜色/圆角/阴影全部走 --app-* token；布局类（flex/grid/尺寸）按 SDK 边界允许手写。
   短规则压成单行以守住单步 ≤700 行预算。 */
.wiz-page { display: flex; flex-direction: column; gap: 14px; }

.wiz-forbidden {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  min-height: 320px; color: var(--app-text-secondary);
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-lg);
  .wiz-forbidden-text { margin: 0; font-size: 13px; }
}

.wiz-steps {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-lg);
}

.wiz-step {
  display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--app-text-secondary); white-space: nowrap;
  .wiz-step-no {
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
    font-size: 12px; color: var(--app-text-secondary); background: var(--app-bg-muted); border-radius: var(--app-radius-full);
  }
  &.is-cur {
    color: var(--app-text); font-weight: 600;
    .wiz-step-no { color: var(--app-on-primary); background: var(--app-primary); }
  }
  &.is-done .wiz-step-no {
    color: var(--app-color-success-text);
    background: color-mix(in srgb, var(--app-color-success) 14%, transparent);
  }
}

.wiz-steps-line { flex: 1; min-width: 16px; height: 1px; background: var(--app-separator); }

.wiz-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }

.wiz-main {
  display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-lg);
}

.wiz-rail { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.wiz-pane { display: flex; flex-direction: column; gap: 14px; }
.wiz-pane-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--app-text); }
.wiz-field { display: flex; flex-direction: column; gap: 6px; max-width: 420px; }
.wiz-label { font-size: 12px; color: var(--app-text-secondary); }

.wiz-hint {
  display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--app-text-secondary);
}

/* 错误条（步内校验 / 创建失败）——与 List.vue hint-banner 同一 token 配方 */
.wiz-banner {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; border-radius: var(--app-radius-md);
  &.is-error {
    color: var(--app-color-danger-text-on-tint);
    background: color-mix(in srgb, var(--app-color-danger) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
  }
}

.wiz-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }

.wiz-card {
  display: flex; flex-direction: column; gap: 4px; padding: 14px; text-align: left; cursor: pointer;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light); border-radius: var(--app-radius-lg);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  &:hover { border-color: var(--app-border-strong); box-shadow: var(--app-shadow-sm); }
  &.is-selected {
    border-color: var(--app-primary);
    box-shadow: inset 0 0 0 1px var(--app-primary);
    background: color-mix(in srgb, var(--app-primary) 5%, var(--app-bg-card));
  }
  &:focus-visible { outline: 2px solid var(--app-focus-ring); outline-offset: 2px; }
  /* 空白自建：整行横条形态 */
  &.is-wide {
    grid-column: 1 / -1; flex-direction: row; align-items: center; gap: 12px;
    .wiz-diagram { margin-top: 0; margin-left: auto; }
  }
}

.wiz-card-title { font-size: 14px; color: var(--app-text); }
.wiz-card-desc { font-size: 12px; color: var(--app-text-secondary); }

/* —— 迷你示意（纯形状 token 上色；无对应语义 token 的色相向主题前景混色，light/dark 自动翻转）—— */
.wiz-diagram { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.dg-dot { width: 8px; height: 8px; background: var(--app-text-quaternary); border-radius: var(--app-radius-full); }
.dg-line { width: 16px; height: 1.5px; background: var(--app-text-quaternary); }

.dg-box {
  width: 34px; height: 16px; border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-primary) 35%, transparent);
  &.is-dashed { background: transparent; border-style: dashed; border-color: var(--app-text-quaternary); }
}

.dg-diamond {
  width: 11px; height: 11px; border-radius: var(--app-radius-sm); transform: rotate(45deg);
  background: color-mix(in srgb, var(--app-color-warning) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-warning) 45%, transparent);
}

.dg-stack {
  display: flex; flex-direction: column; gap: 3px;
  i { width: 26px; height: 8px; border-radius: var(--app-radius-sm); background: color-mix(in srgb, var(--app-color-success) 16%, transparent); }
}

.dg-split {
  display: flex; flex-direction: column; gap: 3px;
  i {
    height: 7px; border-radius: var(--app-radius-sm);
    &.is-major { width: 48px; background: color-mix(in srgb, var(--app-primary) 16%, transparent); }
    &.is-minor { width: 20px; background: color-mix(in srgb, var(--app-color-warning) 22%, transparent); }
  }
}

.dg-copy {
  display: flex; flex-direction: column; gap: 4px;
  i { width: 40px; height: 10px; border: 1px solid var(--app-separator); border-radius: var(--app-radius-sm); &:last-child { opacity: 0.55; } }
}

/* —— 第 3 步：DISPATCH 分支简化形态 —— */
.wiz-branch {
  display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--app-radius-lg);
  background: color-mix(in srgb, var(--app-primary) 5%, var(--app-bg-card));
  border: 1px dashed color-mix(in srgb, var(--app-primary) 35%, transparent);
  .wiz-branch-title { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; font-weight: 600; color: var(--app-text); }
  .wiz-branch-desc { margin: 0; font-size: 12px; line-height: 1.7; color: var(--app-text-secondary); }
  .wiz-diagram { margin-top: 0; }
}

/* —— 第 4 步：插件 chips —— */
.wiz-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.wiz-chips-empty { font-size: 13px; color: var(--app-text-quaternary); }

/* 两级类名压过 FcButton 自身同特异性样式，保证选中态可见 */
.wiz-chips .wiz-chip.is-on {
  color: var(--app-primary); border-color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 10%, transparent);
}
.wiz-chip:focus-visible { outline: 2px solid var(--app-focus-ring); outline-offset: 2px; }

/* —— 第 5 步：汇总 —— */
.wiz-summary {
  display: flex; flex-direction: column; gap: 10px; padding: 14px;
  background: var(--app-bg-muted); border-radius: var(--app-radius-lg);
  .wiz-summary-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--app-text); }
}

.wiz-summary-rows { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.wiz-sum-row {
  display: flex; gap: 12px; font-size: 13px;
  dt { flex: 0 0 72px; color: var(--app-text-secondary); }
  dd { flex: 1; margin: 0; color: var(--app-text); word-break: break-all; }
}

.wiz-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* —— 右栏：实时预览 —— */
.wiz-rail-title { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--app-text); }
.wiz-preview { display: flex; flex-direction: column; gap: 4px; }
.pv-node {
  display: flex; align-items: baseline; gap: 8px; padding: 7px 10px; font-size: 12px;
  background: var(--app-bg-muted); border-radius: var(--app-radius-md);
}
.pv-key { flex: 0 0 auto; color: var(--app-text-secondary); }
.pv-value {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--app-text);
  &.is-pending { color: var(--app-text-quaternary); }
}
.pv-link { width: 1.5px; height: 12px; margin-left: 20px; background: var(--app-text-quaternary); }

/* —— 右栏：配置进度 —— */
.wiz-progress {
  display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none;
  li {
    display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--app-text-secondary);
    &.is-done { color: var(--app-text); .fc-icon { color: var(--app-color-success); } }
  }
}

/* —— 底部操作条 —— */
.wiz-actions {
  position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--app-bg-card); border: 1px solid var(--app-border-extra-light);
  border-radius: var(--app-radius-lg); box-shadow: var(--app-shadow-sm);
}
.wiz-actions-main { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* —— 响应式 / PRM —— */
@media (max-width: 1023px) {
  .wiz-grid { grid-template-columns: 1fr; }
}
@media (max-width: 767px) {
  .wiz-cards { grid-template-columns: 1fr; }
  .wiz-steps {
    flex-wrap: wrap;
    .wiz-steps-line { display: none; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .wiz-card { transition: none; }
}
</style>
