<script setup lang="ts">
/**
 * S12-7c：v2 路由创建【单页】——纯 SCG 路由列表编辑器（替代旧 K8s Ingress 表单）。
 *
 * 用户裁决（2026-11-23）：「路由创建要 100% Spring Cloud Gateway 对齐」「不要向导」
 * 「要 spring gateway 1:1 对应填写」「表单主体=纯 SCG 路由列表编辑器」「YAML 输出
 * SCG RouteDefinition YAML（可粘回 SCG 配置用）」。
 *
 * 页面结构（自上而下）：
 *   全局批次区：environment（缺省 default）/ remark / tags —— 应用于本批全部路由；
 *   路由列表区（多条，每条 = 一条 SCG RouteDefinition）：
 *     name（批量 API 字段；YAML 里对应 id）/ uri（完整上游地址，单输入框）
 *     predicates[] 行编辑（每行一个定义串如 `Path=/api/**`；行可增删重排，行序=提交序）
 *     filters[]   行编辑（同上；行序=执行序）
 *     order（数字）/ metadata（JSON 对象文本）
 *   底部：创建 / 取消
 *
 * 双视图：表单 ⇄ YAML（SCG RouteDefinition YAML，双向同步）。
 *   - 切到 YAML：当前路由列表（含未保存改动）序列化为 spring.cloud.gateway.routes[]，
 *     形态与 SCG application.yml 完全一致，可整段粘回 SCG 配置直接用；
 *   - 切回表单：解析 YAML → 回填路由列表；全局三字段不属 SCG 文档、保持表单原值；
 *     解析失败给【行号】错误提示并停留 YAML 视图（不崩不切回）。
 *
 * 提交：POST /v1/routes/batch（S12-7b，@/api/routes#createRoutesBatch）。
 *   - 成功：路由创建为 DRAFT，需发布后才生效 —— 页面出引导条（含「前往路由列表发布」），
 *     不自动跳转（发布是下一步动作，引导用户自己走完链路）；
 *   - 失败：后端 message 原样展示（10100 结构校验文案 / 10609 重名 / 10605 落库失败），可重试。
 *   前端轻校验与后端同口径（scgModel.ts#validateScgModel）：name ^[a-zA-Z0-9_]{2,50}$、
 *   uri ^https?://\S+$、每条路由至多一个 Path= 谓词且 Path=/a,/b 多 pattern 即拒。
 *
 * 依赖分层（避免重依赖进主 bundle，与旧 IngressForm 同法）：
 *   - 纯模型层 ./scgModel（载荷构造 / 校验 / YAML 文档映射）静态 import —— 零重依赖；
 *   - YAML 序列化层 ./scgYaml（js-yaml）动态 import → js-yaml 只进懒加载 chunk；
 *   - YAML 编辑器 @/components-v2/editor/FcYamlEditor.vue 动态 import（CodeMirror 6 同理）。
 */
import { computed, defineAsyncComponent, reactive, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FcButton, FcIcon, FcInput, FcSectionCard, toast } from '@/components'
import { createRoutesBatch } from '@/api/routes'
import { usePermission } from '@/composables/usePermission'
import {
  buildBatchPayload,
  emptyScgModel,
  emptyScgRoute,
  validateScgModel,
  type ScgModel,
  type ScgRouteModel,
  type ScgValidationError
} from './scgModel'

const { t } = useI18n()
const router = useRouter()
const { canEdit } = usePermission()

/* ── 懒加载边界（js-yaml / CodeMirror 都不进主 bundle）──────────────────────── */
const scgYamlModule = import('./scgYaml')
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
const model = reactive<ScgModel>(emptyScgModel())
const view = ref<'form' | 'yaml'>('form')
const yamlText = ref('')
const yamlErrorLine = ref<number | null>(null)
const errors = ref<ScgValidationError[]>([])
const submitError = ref('')
const submitting = ref(false)
const success = ref(false)

/** 当前路由列表快照（含未保存改动；YAML 序列化输入） */
function currentRoutes(): ScgRouteModel[] {
  return model.routes.map((r) => ({
    name: r.name,
    uri: r.uri,
    predicates: [...r.predicates],
    filters: [...r.filters],
    order: r.order,
    metadata: r.metadata
  }))
}

/** 校验错误 → 文案列表（模板渲染用） */
const errorTexts = computed(() =>
  errors.value.map((e) => t(`v2.scg.${e.key}`, e.params ?? {}))
)

/* ── 行操作 ──────────────────────────────────────────────────────────────── */
function addRoute() {
  model.routes.push(emptyScgRoute())
}
function removeRoute(index: number) {
  model.routes.splice(index, 1)
  if (model.routes.length === 0) model.routes.push(emptyScgRoute())
}
function addPredicate(ri: number) {
  model.routes[ri].predicates.push('')
}
function removePredicate(ri: number, pi: number) {
  model.routes[ri].predicates.splice(pi, 1)
}
function movePredicate(ri: number, pi: number, delta: number) {
  const rows = model.routes[ri].predicates
  const next = pi + delta
  if (next < 0 || next >= rows.length) return
  const [row] = rows.splice(pi, 1)
  rows.splice(next, 0, row)
}
function addFilter(ri: number) {
  model.routes[ri].filters.push('')
}
function removeFilter(ri: number, fi: number) {
  model.routes[ri].filters.splice(fi, 1)
}
function moveFilter(ri: number, fi: number, delta: number) {
  const rows = model.routes[ri].filters
  const next = fi + delta
  if (next < 0 || next >= rows.length) return
  const [row] = rows.splice(fi, 1)
  rows.splice(next, 0, row)
}

/* ── order 输入（文本编辑态 → 整数；非法输入存 NaN 交给校验报 orderInvalid）─── */
function orderText(order: number): string {
  return Number.isInteger(order) ? String(order) : ''
}
function setOrder(route: ScgRouteModel, value: unknown) {
  const raw = String(value ?? '').trim()
  if (raw === '') {
    route.order = 0
    return
  }
  route.order = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN
}

/* ── YAML 视图 ───────────────────────────────────────────────────────────── */
/** 表单 → YAML（未保存的改动一并序列化进去；SCG RouteDefinition 形态） */
async function switchToYaml() {
  const mod = await scgYamlModule
  yamlText.value = mod.dumpScgYaml(currentRoutes())
  yamlErrorLine.value = null
  view.value = 'yaml'
}

/** YAML → 表单（解析失败给行号并停留 YAML 视图；全局三字段保持表单原值） */
async function switchToForm() {
  const mod = await scgYamlModule
  const res = mod.loadScgYaml(yamlText.value)
  if (!res.ok) {
    yamlErrorLine.value = res.line
    return
  }
  yamlErrorLine.value = null
  const routes = res.routes.length > 0 ? res.routes : [mod.fallbackRoute()]
  model.routes.splice(0, model.routes.length, ...routes)
  view.value = 'form'
}

/* ── 提交 ────────────────────────────────────────────────────────────────── */
async function submit() {
  if (submitting.value) return
  errors.value = validateScgModel(model)
  submitError.value = ''
  success.value = false
  if (errors.value.length > 0) return
  submitting.value = true
  try {
    await createRoutesBatch(buildBatchPayload(model))
    // 创建即 DRAFT：引导用户去路由列表发布（不自动跳转，见头注）
    success.value = true
    toast.success(t('v2.scg.createSuccess'))
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

function gotoList() {
  void router.push('/v2/routes')
}

function cancel() {
  void router.push('/v2/routes')
}

/**
 * 视图切换器按钮的无障碍名（沿用 S12-6 可发现性语义）：
 * WCAG 2.5.3（Label in Name）要求 aria-label 包含可见文案 —— 故拼成
 * 「可见文案 — 动作提示」。
 */
const viewFormLabel = computed(() => `${t('v2.scg.viewForm')} — ${t('v2.scg.switchToForm')}`)
const viewYamlLabel = computed(() => `${t('v2.scg.viewYaml')} — ${t('v2.scg.switchToYaml')}`)
</script>

<template>
  <div class="scg-page" data-testid="scg-root">
    <!-- 无权限：整页 forbidden，不渲染表单 -->
    <div v-if="!canEdit('route')" class="scg-forbidden" data-testid="scg-forbidden">
      <FcIcon name="ri-lock-line" :size="28" />
      <p class="scg-forbidden-text">{{ t('v2.scg.forbidden') }}</p>
    </div>

    <template v-else>
      <header class="scg-head">
        <div class="scg-head-main">
          <h1 class="scg-title">{{ t('v2.scg.title') }}</h1>
          <p class="scg-hint" data-testid="scg-yaml-hint">{{ t('v2.scg.yamlHint') }}</p>
        </div>
        <div class="scg-views" role="group" :aria-label="t('v2.scg.viewToggle')">
          <span class="scg-views-label">{{ t('v2.scg.viewLabel') }}</span>
          <button
            type="button"
            class="scg-view-btn"
            data-testid="scg-view-form"
            :aria-pressed="view === 'form' ? 'true' : 'false'"
            :aria-label="viewFormLabel"
            :title="t('v2.scg.switchToForm')"
            :class="{ 'is-on': view === 'form' }"
            @click="switchToForm"
          >
            <FcIcon name="ri-file-list-3-line" :size="14" />
            <span>{{ t('v2.scg.viewForm') }}</span>
          </button>
          <button
            type="button"
            class="scg-view-btn"
            data-testid="scg-view-yaml"
            :aria-pressed="view === 'yaml' ? 'true' : 'false'"
            :aria-label="viewYamlLabel"
            :title="t('v2.scg.switchToYaml')"
            :class="{ 'is-on': view === 'yaml' }"
            @click="switchToYaml"
          >
            <FcIcon name="ri-code-line" :size="14" />
            <span>{{ t('v2.scg.viewYaml') }}</span>
          </button>
        </div>
      </header>

      <!-- 表单视图 -->
      <div v-if="view === 'form'" class="scg-body" data-testid="scg-form-view">
        <!-- 全局批次区（应用于本批全部路由） -->
        <FcSectionCard padding="sm" shadow="sm" class="scg-card">
          <h2 class="scg-section-title">{{ t('v2.scg.sectionGlobal') }}</h2>
          <div class="scg-grid">
            <div class="scg-field">
              <label class="scg-label" for="scg-environment">{{ t('v2.scg.fieldEnvironment') }}</label>
              <FcInput id="scg-environment" v-model="model.environment" data-testid="scg-environment" />
            </div>
            <div class="scg-field">
              <label class="scg-label" for="scg-tags">{{ t('v2.scg.fieldTags') }}</label>
              <FcInput id="scg-tags" v-model="model.tags" data-testid="scg-tags" />
            </div>
            <div class="scg-field is-wide">
              <label class="scg-label" for="scg-remark">{{ t('v2.scg.fieldRemark') }}</label>
              <FcInput id="scg-remark" v-model="model.remark" type="textarea" :rows="2" data-testid="scg-remark" />
            </div>
          </div>
        </FcSectionCard>

        <!-- 路由列表区（主体：SCG 路由列表编辑器） -->
        <FcSectionCard padding="sm" shadow="sm" class="scg-card">
          <div class="scg-section-head">
            <h2 class="scg-section-title">{{ t('v2.scg.sectionRoutes') }}</h2>
            <FcButton variant="secondary" size="sm" data-testid="scg-add-route" @click="addRoute">
              <FcIcon name="ri-add-line" :size="13" />
              <span>{{ t('v2.scg.addRoute') }}</span>
            </FcButton>
          </div>

          <div
            v-for="(route, ri) in model.routes"
            :key="ri"
            class="scg-route"
            :data-testid="`scg-route-${ri}`"
          >
            <div class="scg-route-head">
              <span class="scg-route-no">{{ ri + 1 }}</span>
              <div class="scg-field is-grow">
                <label class="scg-label" :for="`scg-name-${ri}`">{{ t('v2.scg.fieldName') }}</label>
                <FcInput :id="`scg-name-${ri}`" v-model="route.name" :data-testid="`scg-name-${ri}`" />
              </div>
              <div class="scg-field is-order">
                <label class="scg-label" :for="`scg-order-${ri}`">{{ t('v2.scg.fieldOrder') }}</label>
                <FcInput
                  :id="`scg-order-${ri}`"
                  :model-value="orderText(route.order)"
                  :data-testid="`scg-order-${ri}`"
                  :title="t('v2.scg.orderHint')"
                  @update:model-value="setOrder(route, $event)"
                />
              </div>
              <button
                type="button"
                class="scg-icon-btn"
                :data-testid="`scg-rm-route-${ri}`"
                :title="t('v2.scg.removeRoute')"
                @click="removeRoute(ri)"
              >
                <FcIcon name="ri-delete-bin-6-line" :size="14" />
              </button>
            </div>

            <div class="scg-field">
              <label class="scg-label" :for="`scg-uri-${ri}`">{{ t('v2.scg.fieldUri') }}</label>
              <FcInput
                :id="`scg-uri-${ri}`"
                v-model="route.uri"
                :placeholder="t('v2.scg.uriPlaceholder')"
                :data-testid="`scg-uri-${ri}`"
              />
            </div>

            <!-- predicates 行编辑（行序 = 提交序） -->
            <div class="scg-rows-head">
              <span class="scg-label">{{ t('v2.scg.fieldPredicates') }}</span>
              <FcButton variant="secondary" size="sm" :data-testid="`scg-add-pred-${ri}`" @click="addPredicate(ri)">
                <FcIcon name="ri-add-line" :size="13" />
                <span>{{ t('v2.scg.addPredicate') }}</span>
              </FcButton>
            </div>
            <p v-if="route.predicates.length > 0" class="scg-hint">{{ t('v2.scg.predOrderHint') }}</p>
            <div
              v-for="(p, pi) in route.predicates"
              :key="pi"
              class="scg-row"
              :data-testid="`scg-pred-row-${ri}-${pi}`"
            >
              <span class="scg-row-no">{{ pi + 1 }}</span>
              <FcInput
                v-model="route.predicates[pi]"
                class="is-grow"
                :placeholder="t('v2.scg.fieldPredicates')"
                :aria-label="t('v2.scg.fieldPredicates')"
                :data-testid="`scg-pred-${ri}-${pi}`"
              />
              <div class="scg-row-ops">
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-pred-up-${ri}-${pi}`"
                  :disabled="pi === 0"
                  :title="t('v2.scg.moveUp')"
                  @click="movePredicate(ri, pi, -1)"
                >
                  <FcIcon name="ri-arrow-up-line" :size="14" />
                </button>
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-pred-down-${ri}-${pi}`"
                  :disabled="pi === route.predicates.length - 1"
                  :title="t('v2.scg.moveDown')"
                  @click="movePredicate(ri, pi, 1)"
                >
                  <FcIcon name="ri-arrow-down-line" :size="14" />
                </button>
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-rm-pred-${ri}-${pi}`"
                  :title="t('v2.scg.removePredicate')"
                  @click="removePredicate(ri, pi)"
                >
                  <FcIcon name="ri-close-line" :size="14" />
                </button>
              </div>
            </div>

            <!-- filters 行编辑（行序 = 执行序） -->
            <div class="scg-rows-head">
              <span class="scg-label">{{ t('v2.scg.fieldFilters') }}</span>
              <FcButton variant="secondary" size="sm" :data-testid="`scg-add-filter-${ri}`" @click="addFilter(ri)">
                <FcIcon name="ri-add-line" :size="13" />
                <span>{{ t('v2.scg.addFilter') }}</span>
              </FcButton>
            </div>
            <div
              v-for="(f, fi) in route.filters"
              :key="fi"
              class="scg-row"
              :data-testid="`scg-filter-row-${ri}-${fi}`"
            >
              <span class="scg-row-no">{{ fi + 1 }}</span>
              <FcInput
                v-model="route.filters[fi]"
                class="is-grow"
                :placeholder="t('v2.scg.fieldFilters')"
                :aria-label="t('v2.scg.fieldFilters')"
                :data-testid="`scg-filter-${ri}-${fi}`"
              />
              <div class="scg-row-ops">
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-filter-up-${ri}-${fi}`"
                  :disabled="fi === 0"
                  :title="t('v2.scg.moveUp')"
                  @click="moveFilter(ri, fi, -1)"
                >
                  <FcIcon name="ri-arrow-up-line" :size="14" />
                </button>
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-filter-down-${ri}-${fi}`"
                  :disabled="fi === route.filters.length - 1"
                  :title="t('v2.scg.moveDown')"
                  @click="moveFilter(ri, fi, 1)"
                >
                  <FcIcon name="ri-arrow-down-line" :size="14" />
                </button>
                <button
                  type="button"
                  class="scg-icon-btn"
                  :data-testid="`scg-rm-filter-${ri}-${fi}`"
                  :title="t('v2.scg.removeFilter')"
                  @click="removeFilter(ri, fi)"
                >
                  <FcIcon name="ri-close-line" :size="14" />
                </button>
              </div>
            </div>

            <!-- metadata（JSON 对象文本） -->
            <div class="scg-field">
              <label class="scg-label" :for="`scg-metadata-${ri}`">{{ t('v2.scg.fieldMetadata') }}</label>
              <FcInput
                :id="`scg-metadata-${ri}`"
                v-model="route.metadata"
                type="textarea"
                :rows="2"
                :placeholder="t('v2.scg.metadataPlaceholder')"
                :data-testid="`scg-metadata-${ri}`"
              />
            </div>
          </div>
        </FcSectionCard>
      </div>

      <!-- YAML 视图 -->
      <div v-else class="scg-body" data-testid="scg-yaml-view">
        <div class="scg-yaml-box" data-testid="scg-yaml">
          <FcYamlEditor v-if="yamlChunkReady" v-model="yamlText" :rows="18" />
          <textarea v-else class="scg-yaml-textarea" v-model="yamlText" spellcheck="false" />
        </div>
        <p v-if="yamlErrorLine !== null" class="scg-hint is-error" data-testid="scg-yaml-error" role="alert">
          {{ t('v2.scg.yamlInvalid', { line: yamlErrorLine }) }}
        </p>
      </div>

      <!-- 校验错误条 -->
      <div v-if="errorTexts.length > 0" class="scg-banner is-error" data-testid="scg-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <ul class="scg-err-list">
          <li v-for="(e, ei) in errorTexts" :key="ei" class="scg-err-item" :data-testid="`scg-err-${ei}`">{{ e }}</li>
        </ul>
      </div>

      <!-- 提交失败错误条（可重试；后端 message 原样展示） -->
      <div v-if="submitError" class="scg-banner is-error" data-testid="scg-submit-error" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span>{{ t('v2.scg.createFailed') }} {{ submitError }}</span>
      </div>

      <!-- 成功引导条：创建即 DRAFT，需发布后生效 -->
      <div v-if="success" class="scg-banner is-success" data-testid="scg-success" role="status">
        <FcIcon name="ri-checkbox-circle-line" :size="14" />
        <span class="is-grow">{{ t('v2.scg.draftGuide') }}</span>
        <FcButton variant="secondary" size="sm" data-testid="scg-goto-list" @click="gotoList">
          <span>{{ t('v2.scg.gotoList') }}</span>
        </FcButton>
      </div>

      <!-- 底部操作条 -->
      <div class="scg-actions">
        <FcButton variant="secondary" data-testid="scg-cancel" @click="cancel">
          <span>{{ t('v2.scg.cancel') }}</span>
        </FcButton>
        <FcButton variant="primary" :disabled="submitting" data-testid="scg-submit" @click="submit">
          <FcIcon name="ri-save-3-line" :size="14" />
          <span>{{ t('v2.scg.create') }}</span>
        </FcButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.scg-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  min-width: 0;
}

.scg-forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--app-text-tertiary);
}

.scg-forbidden-text {
  margin: 0;
  font-size: 13px;
}

.scg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.scg-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scg-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

/* 视图切换器（沿用 S12-6 显著性语义） */
.scg-views {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
}

.scg-views-label {
  padding: 0 6px 0 4px;
  font-size: 12px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}

.scg-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--app-radius-button);
  cursor: pointer;
}

.scg-view-btn:hover {
  color: var(--app-text);
}

.scg-view-btn:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.scg-view-btn.is-on {
  color: var(--app-text);
  font-weight: 600;
  background: var(--app-bg-card);
  border-color: var(--app-border);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--app-shadow) 12%, transparent);
}

.scg-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.scg-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scg-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.scg-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.scg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.scg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.scg-field.is-wide {
  grid-column: 1 / -1;
}

.scg-field.is-grow,
.is-grow {
  flex: 1;
  min-width: 0;
}

.scg-field.is-order {
  max-width: 120px;
}

.scg-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.scg-route {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--app-bg-muted);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-md);
}

.scg-route-head {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.scg-route-no {
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

.scg-rows-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.scg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--app-border-light);
}

.scg-row-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  color: var(--app-text-tertiary);
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-chip);
}

.scg-row-ops {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.scg-icon-btn {
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

.scg-icon-btn:hover:not(:disabled) {
  color: var(--app-color-danger-text-on-tint);
  border-color: var(--app-color-danger);
}

.scg-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scg-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.scg-hint.is-error {
  color: var(--app-color-danger-text-on-tint);
}

.scg-yaml-box {
  min-width: 0;
}

.scg-yaml-textarea {
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

.scg-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: var(--app-radius-md);
}

.scg-banner.is-error {
  color: var(--app-color-danger-text-on-tint);
  background: color-mix(in srgb, var(--app-color-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-danger) 30%, transparent);
}

.scg-banner.is-success {
  color: var(--app-color-success-text-on-tint, var(--app-text-secondary));
  background: color-mix(in srgb, var(--app-color-success, var(--app-primary)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-color-success, var(--app-primary)) 30%, transparent);
}

.scg-banner.is-success .is-grow {
  align-self: center;
}

.scg-err-list {
  margin: 0;
  padding-left: 16px;
}

.scg-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
