<template>
  <div class="ref-edit" data-testid="ref-form">
    <h1 class="ref-title">{{ t('v2.edit.title') }}</h1>

    <!-- getRoute failed: error state + retry; the three sections stay unmounted -->
    <div v-if="loadError" class="ref-banner is-error" data-testid="ref-load-error" role="alert">
      <FcIcon name="ri-error-warning-line" :size="14" />
      <span class="ref-banner-text">{{ t('v2.edit.loadFailed') }}</span>
      <FcButton variant="secondary" size="sm" data-testid="ref-retry" @click="retry">{{ t('v2.edit.retry') }}</FcButton>
    </div>

    <!-- fetch pending: skeleton; save stays absent (loading gate, old Editor semantics) -->
    <FcSkeleton v-else-if="loading" variant="text" :rows="6" data-testid="ref-skeleton" />

    <template v-else>
      <FcFormDraftBanner :visible="dirty" data-testid="ref-dirty-banner" @discard="discardChanges" />

      <!-- listRoutes failed: parent candidates degrade, the form itself still works -->
      <div v-if="parentError" class="ref-banner is-warn" data-testid="ref-parent-error" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span class="ref-banner-text">{{ t('v2.edit.parentOptionsError') }}</span>
      </div>

      <!-- bindings / chain secondary failures: warn bar, loaded data never wiped -->
      <div v-if="secondaryError" class="ref-banner is-warn" data-testid="ref-secondary-error" role="status">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span class="ref-banner-text">{{ secondaryError }}</span>
      </div>

      <!-- 10402 conflict: standalone branch, form values untouched until explicit refresh -->
      <div v-if="conflict" class="ref-banner is-warn" data-testid="ref-conflict-bar" role="alert">
        <FcIcon name="ri-error-warning-line" :size="14" />
        <span class="ref-banner-text">{{ t('v2.edit.conflictModified') }}</span>
        <FcButton variant="secondary" size="sm" data-testid="ref-conflict-refresh" @click="reloadAfterConflict">
          {{ t('v2.edit.conflictRefresh') }}
        </FcButton>
      </div>

      <!-- three sections (basic / conditions / bindings); chain lives below as a resident read-only block.
           FcTabsPanel serves as the section nav only: the three panes stay mounted (v-show) so unsaved
           edits in non-active sections are never unmounted away. -->
      <FcTabsPanel v-model="activeTab" :tabs="tabItems" data-testid="ref-section-nav" />

      <div v-show="activeTab === 'basic'" class="ref-pane" data-testid="ref-section-basic">
            <div class="ref-grid">
              <div class="ref-field">
                <label class="ref-label" for="ref-f-route-name">{{ t('v2.edit.fieldRouteName') }}</label>
                <FcInput
                  id="ref-f-route-name"
                  v-model="form.route_name"
                  maxlength="50"
                  data-testid="ref-input-route_name"
                />
                <p v-if="fieldErrors.route_name" class="ref-err" data-testid="ref-field-error-route_name" role="alert">
                  {{ fieldErrors.route_name }}
                </p>
              </div>

              <div class="ref-field">
                <span class="ref-label">{{ t('v2.edit.fieldType') }}</span>
                <FcSegmented
                  v-model="form.route_type"
                  :options="typeOptions"
                  data-testid="ref-input-route_type"
                />
                <p v-if="fieldErrors.route_type" class="ref-err" data-testid="ref-field-error-route_type" role="alert">
                  {{ fieldErrors.route_type }}
                </p>
                <p class="ref-hint">{{ form.route_type === 'DISPATCH' ? t('v2.edit.typeDispatch') : t('v2.edit.typeBackend') }}</p>
              </div>

              <div class="ref-field">
                <span class="ref-label">{{ t('v2.edit.fieldParent') }}</span>
                <FcSelect
                  v-model="form.parent_route_id"
                  :options="parentOptions"
                  clearable
                  data-testid="ref-input-parent_route_id"
                />
                <p v-if="fieldErrors.parent_route_id" class="ref-err" data-testid="ref-field-error-parent_route_id" role="alert">
                  {{ fieldErrors.parent_route_id }}
                </p>
                <p class="ref-hint">{{ t('v2.edit.parentHint') }}</p>
              </div>

              <div class="ref-field">
                <label class="ref-label" for="ref-f-path">{{ t('v2.edit.fieldPath') }}</label>
                <FcInput
                  id="ref-f-path"
                  v-model="form.path"
                  maxlength="500"
                  data-testid="ref-input-path"
                />
                <p v-if="fieldErrors.path" class="ref-err" data-testid="ref-field-error-path" role="alert">
                  {{ fieldErrors.path }}
                </p>
              </div>

              <div class="ref-field">
                <label class="ref-label" for="ref-f-upstream">{{ t('v2.edit.fieldUpstream') }}</label>
                <FcInput
                  id="ref-f-upstream"
                  v-model="form.upstream_url"
                  maxlength="500"
                  data-testid="ref-input-upstream_url"
                />
                <p v-if="fieldErrors.upstream_url" class="ref-err" data-testid="ref-field-error-upstream_url" role="alert">
                  {{ fieldErrors.upstream_url }}
                </p>
              </div>

              <div class="ref-field">
                <label class="ref-label" for="ref-f-sort">{{ t('v2.edit.fieldSortOrder') }}</label>
                <FcInput
                  id="ref-f-sort"
                  v-model="form.sort_order"
                  type="number"
                  :min="1"
                  :max="9999"
                  data-testid="ref-input-sort_order"
                />
                <p v-if="fieldErrors.sort_order" class="ref-err" data-testid="ref-field-error-sort_order" role="alert">
                  {{ fieldErrors.sort_order }}
                </p>
              </div>

              <div v-if="envReady" class="ref-field">
                <span class="ref-label">{{ t('v2.edit.fieldEnvironment') }}</span>
                <FcSelect
                  v-model="formEnvironment"
                  :options="envOptions"
                  data-testid="ref-input-environment"
                />
                <p v-if="fieldErrors.environment" class="ref-err" data-testid="ref-field-error-environment" role="alert">
                  {{ fieldErrors.environment }}
                </p>
              </div>

              <div class="ref-field ref-field--wide">
                <label class="ref-label" for="ref-f-tags">{{ t('v2.edit.fieldTags') }}</label>
                <FcInput
                  id="ref-f-tags"
                  v-model="form.tags"
                  maxlength="200"
                  data-testid="ref-input-tags"
                />
                <p v-if="fieldErrors.tags" class="ref-err" data-testid="ref-field-error-tags" role="alert">
                  {{ fieldErrors.tags }}
                </p>
              </div>

              <div class="ref-field ref-field--wide">
                <label class="ref-label" for="ref-f-remark">{{ t('v2.edit.fieldRemark') }}</label>
                <FcInput
                  id="ref-f-remark"
                  v-model="form.remark"
                  type="textarea"
                  :rows="3"
                  maxlength="200"
                  data-testid="ref-input-remark"
                />
                <p v-if="fieldErrors.remark" class="ref-err" data-testid="ref-field-error-remark" role="alert">
                  {{ fieldErrors.remark }}
                </p>
              </div>
            </div>
      </div>

      <div v-show="activeTab === 'conditions'" class="ref-pane" data-testid="ref-section-conditions">
            <!-- DISPATCH rule-card only: domain field (sugar layer, translated to a
                 HEADER+Host+EQ condition row at save; the translation row itself is
                 never rendered in the condition row area) -->
            <div v-if="isDispatch" class="ref-field ref-field--wide" data-testid="ref-domain-field">
              <label class="ref-label" for="ref-f-domain">{{ t('v2.edit.domainField') }}</label>
              <FcInput
                id="ref-f-domain"
                v-model="domain"
                maxlength="200"
                data-testid="ref-domain-input"
              />
              <p class="ref-hint">{{ t('v2.edit.domainHint') }}</p>
            </div>

            <!-- DISPATCH rule-card only: path mapping rows (source = listRouteChildren;
                 row save = createRoute/updateRoute/deleteRoute per-row batch; degraded
                 load keeps the rest of the form fully usable) -->
            <div v-if="isDispatch" class="ref-paths" data-testid="ref-paths">
              <b class="ref-paths-title">{{ t('v2.edit.pathsTitle') }}</b>
              <div v-if="pathsError" class="ref-banner is-warn" data-testid="ref-paths-error" role="status">
                <FcIcon name="ri-error-warning-line" :size="14" />
                <span class="ref-banner-text">{{ pathsError }}</span>
              </div>
              <div
                v-for="(r, i) in pathRows"
                :key="r.id || `new-${i}`"
                class="ref-path-row"
                :data-testid="`ref-path-row-${i}`"
              >
                <div class="ref-cond-cell ref-cond-cell--path">
                  <span class="ref-cond-label">{{ t('v2.edit.pathCol') }}</span>
                  <FcInput
                    v-model="r.path"
                    :data-testid="`ref-path-path-${i}`"
                  />
                </div>
                <div class="ref-cond-cell">
                  <span class="ref-cond-label">{{ t('v2.edit.ruleCol') }}</span>
                  <FcSelect
                    v-model="r.rule"
                    :options="pathRuleOptions"
                    :data-testid="`ref-path-rule-${i}`"
                  />
                </div>
                <div class="ref-cond-cell">
                  <span class="ref-cond-label">{{ t('v2.edit.serviceCol') }}</span>
                  <FcInput
                    v-model="r.service"
                    :data-testid="`ref-path-service-${i}`"
                  />
                </div>
                <div class="ref-cond-cell ref-cond-cell--narrow">
                  <span class="ref-cond-label">{{ t('v2.edit.portCol') }}</span>
                  <FcInput
                    v-model="r.port"
                    :data-testid="`ref-path-port-${i}`"
                  />
                </div>
                <div class="ref-cond-cell ref-cond-cell--act">
                  <FcButton variant="text" size="sm" :data-testid="`ref-path-remove-${i}`" @click="removePathRow(i)">
                    <FcIcon name="ri-delete-bin-line" :size="13" />
                    {{ t('v2.edit.pathRemove') }}
                  </FcButton>
                </div>
              </div>
              <div class="ref-pane-head">
                <FcButton variant="secondary" size="sm" data-testid="ref-path-add" @click="addPathRow">
                  <FcIcon name="ri-add-line" :size="13" />
                  {{ t('v2.edit.pathAdd') }}
                </FcButton>
              </div>
            </div>

            <div class="ref-pane-head">
              <FcButton variant="secondary" size="sm" data-testid="ref-cond-add" @click="addCondition">
                <FcIcon name="ri-add-line" :size="13" />
                {{ t('v2.edit.condAdd') }}
              </FcButton>
            </div>

            <div
              v-for="(c, i) in conditions"
              :key="i"
              class="ref-cond-row"
              :data-testid="`ref-cond-row-${i}`"
            >
              <div class="ref-cond-cell">
                <span class="ref-cond-label">{{ t('v2.edit.condType') }}</span>
                <FcSelect
                  v-model="c.condition_type"
                  :options="condTypeOptions"
                  :data-testid="`ref-cond-type-${i}`"
                />
              </div>
              <div class="ref-cond-cell">
                <span class="ref-cond-label">{{ t('v2.edit.condOperator') }}</span>
                <FcSelect
                  v-model="c.operator"
                  :options="operatorOptions"
                  :disabled="c.condition_type === 'WEIGHT'"
                  :data-testid="`ref-cond-operator-${i}`"
                />
              </div>
              <div class="ref-cond-cell">
                <span class="ref-cond-label">{{ t('v2.edit.condKey') }}</span>
                <FcInput
                  v-model="c.condition_key"
                  :type="c.condition_type === 'WEIGHT' ? 'number' : 'text'"
                  :disabled="condKeyDisabled(c.condition_type)"
                  :placeholder="condKeyPlaceholder(c.condition_type)"
                  :data-testid="`ref-cond-key-${i}`"
                />
              </div>
              <div class="ref-cond-cell">
                <span class="ref-cond-label">{{ t('v2.edit.condValue') }}</span>
                <FcInput
                  v-model="c.condition_value"
                  :disabled="c.condition_type === 'WEIGHT'"
                  :placeholder="condValuePlaceholder(c.condition_type)"
                  :data-testid="`ref-cond-value-${i}`"
                />
              </div>
              <div class="ref-cond-cell">
                <span class="ref-cond-label">{{ t('v2.edit.condTarget') }}</span>
                <FcSelect
                  v-model="c.target_route_id"
                  :options="targetOptions"
                  clearable
                  :data-testid="`ref-cond-target-${i}`"
                />
              </div>
              <div class="ref-cond-cell ref-cond-cell--narrow">
                <span class="ref-cond-label">{{ t('v2.edit.condPriority') }}</span>
                <FcInput
                  v-model="c.priority"
                  type="number"
                  :min="1"
                  :data-testid="`ref-cond-priority-${i}`"
                />
              </div>
              <div class="ref-cond-cell ref-cond-cell--act">
                <FcButton variant="text" size="sm" :data-testid="`ref-cond-remove-${i}`" @click="removeCondition(i)">
                  <FcIcon name="ri-delete-bin-line" :size="13" />
                  {{ t('v2.edit.condRemove') }}
                </FcButton>
              </div>
              <p
                v-if="condErrors[i]"
                class="ref-err ref-cond-err"
                :data-testid="`ref-cond-error-${i}`"
                role="alert"
              >{{ condErrors[i] }}</p>
            </div>
      </div>

      <div v-show="activeTab === 'bindings'" class="ref-pane" data-testid="ref-section-bindings">
            <div class="ref-pane-head">
              <FcButton variant="secondary" size="sm" data-testid="ref-binding-add" @click="openBindingDialog()">
                <FcIcon name="ri-add-line" :size="13" />
                {{ t('v2.edit.bindingAdd') }}
              </FcButton>
              <p v-if="bindingMaxHit" class="ref-err" data-testid="ref-binding-max" role="status">
                {{ t('v2.edit.bindingMax') }}
              </p>
            </div>

            <div
              v-for="(b, i) in bindings"
              :key="String(b.binding_id)"
              class="ref-binding-row"
              :data-testid="`ref-binding-row-${b.binding_id}`"
            >
              <span class="ref-binding-name">{{ b.plugin_name || b.plugin_id }}</span>
              <span class="ref-binding-config">{{ b.binding_config }}</span>
              <span class="ref-binding-actions">
                <FcButton variant="text" size="sm" :data-testid="`ref-binding-edit-${b.binding_id}`" @click="openBindingDialog(b)">
                  {{ t('v2.edit.bindingEdit') }}
                </FcButton>
                <FcButton variant="text" size="sm" :data-testid="`ref-binding-remove-${b.binding_id}`" @click="removeBinding(i)">
                  {{ t('v2.edit.bindingRemove') }}
                </FcButton>
                <FcButton
                  variant="text"
                  size="sm"
                  :disabled="i === 0"
                  :data-testid="`ref-binding-up-${b.binding_id}`"
                  @click="moveBinding(i, -1)"
                >
                  <FcIcon name="ri-arrow-up-line" :size="13" />
                  {{ t('v2.edit.bindingUp') }}
                </FcButton>
                <FcButton
                  variant="text"
                  size="sm"
                  :disabled="i === bindings.length - 1"
                  :data-testid="`ref-binding-down-${b.binding_id}`"
                  @click="moveBinding(i, 1)"
                >
                  <FcIcon name="ri-arrow-down-line" :size="13" />
                  {{ t('v2.edit.bindingDown') }}
                </FcButton>
              </span>
            </div>
      </div>

      <!-- plugin chain: resident read-only preview, NOT a tab (contract: three sections only) -->
      <div class="ref-chain" data-testid="ref-chain">
        <div class="ref-chain-h"><b>{{ t('v2.edit.chainTitle') }}</b></div>
        <p v-if="chain.length === 0" class="ref-chain-empty" data-testid="ref-chain-empty">{{ t('v2.edit.chainEmpty') }}</p>
        <ol v-else class="ref-chain-list">
          <li
            v-for="(p, i) in chain"
            :key="`${p.plugin_id}-${i}`"
            class="ref-chain-row"
            :data-testid="`ref-chain-row-${i}`"
          >
            <span class="ref-chain-idx">{{ i + 1 }}</span>
            <span class="ref-chain-name">{{ p.plugin_name || p.plugin_id }}</span>
            <span class="ref-chain-phase">{{ p.phase }}</span>
          </li>
        </ol>
      </div>

      <!-- actions + feedback (conflict bar sits above, near the sections it guards) -->
      <div class="ref-actions">
        <p v-if="saveError" class="ref-err" data-testid="ref-save-error" role="alert">{{ saveError }}</p>
        <span
          v-if="toastFeedback"
          class="ref-toast-mirror"
          :data-testid="toastFeedback.kind === 'success' ? 'ref-toast-success' : 'ref-toast-error'"
          role="status"
        >{{ toastFeedback.text }}</span>
        <p v-if="!canEditRoute" class="ref-hint" data-testid="ref-readonly-hint">{{ t('v2.edit.readonlyHint') }}</p>
        <div class="ref-actions-row">
          <FcButton variant="secondary" data-testid="ref-action-cancel" @click="cancel">{{ t('v2.edit.cancel') }}</FcButton>
          <FcButton
            v-if="canEditRoute"
            variant="primary"
            :loading="saving"
            data-testid="ref-action-save"
            @click="save"
          >{{ t('v2.edit.save') }}</FcButton>
        </div>
      </div>
    </template>

    <!-- binding add/edit dialog (shared FcDialog; v-if wrapper so close fully unmounts) -->
    <FcDialog
      v-if="dialogOpen"
      :open="true"
      :title="t('v2.edit.bindingDialogTitle')"
      data-testid="ref-binding-dialog"
      @update:open="dialogOpen = false"
    >
      <div class="ref-dialog-body">
        <div class="ref-field">
          <span class="ref-label">{{ t('v2.edit.bindingPlugin') }}</span>
          <FcSelect
            v-model="bindingForm.plugin_id"
            :options="pluginOptions"
            :data-testid="`ref-binding-plugin-${editingBindingId || 'new'}`"
          />
        </div>
        <div class="ref-field">
          <label class="ref-label" for="ref-f-binding-config">{{ t('v2.edit.bindingConfig') }}</label>
          <FcInput
            id="ref-f-binding-config"
            v-model="bindingForm.binding_config"
            type="textarea"
            :rows="6"
            :maxlength="10000"
            :data-testid="`ref-binding-config-${editingBindingId || 'new'}`"
          />
        </div>
        <p v-if="dialogError" class="ref-err" role="alert">{{ dialogError }}</p>
      </div>
      <template #footer>
        <FcButton variant="secondary" @click="dialogOpen = false">{{ t('v2.edit.cancel') }}</FcButton>
        <FcButton variant="primary" data-testid="ref-binding-dialog-save" @click="confirmBinding">
          {{ t('v2.edit.bindingDialogSave') }}
        </FcButton>
      </template>
    </FcDialog>
  </div>
</template>

<script setup lang="ts">
/**
 * P4c-2-C：路由编辑表单组件（嵌入 Detail 页 dtl-edit-panel；契约 §4.5 P4c 行）。
 * 语义权威 = 旧 src/views/routes/Editor.vue（661 行四 Tab 收敛为 basic/conditions/bindings
 * 三区 FcTabsPanel + chain 常驻只读段，本文件不整块复用旧 el-form/el-table 子组件）：
 * - 组件仅编辑态：props.routeId 必填；新建走既有 /v2/wizard；不含 publish/offline。
 * - 五源并行装载（getRoute 一次取全 conditions + listRoutes 父候选 + listBindings +
 *   getPluginChain + listBuiltinTypes），loadEpoch 竞态守卫；getRoute 失败 = 错误态 +
 *   保存阻断；listRoutes 失败 = ref-parent-error 降级；bindings/chain 失败 =
 *   ref-secondary-error 不清数据。
 * - 校验硬数字（旧 RouteBasicForm rules 逐字随迁）：name ^[a-zA-Z0-9_]{2,50}$；
 *   path/upstream 仅 BACKEND 必填（^\/[^\s]+$ / ^https?:\/\/\S+$，maxlength 500）；
 *   sort 1-9999；remark/tags 200。字段错误位 ref-field-error-{field}（客户端校验与
 *   服务端 mapFieldErrors 共用通道）。
 * - conditions 13 谓词下拉（SCG predicate 对齐，引擎 S10-1 同名）：既有 5（HEADER/PATH/
 *   QUERY/BODY/GROOVY）+ 新七（HOST/METHOD/COOKIE/REMOTE_ADDR/AFTER/BEFORE/BETWEEN）+
 *   WEIGHT 恒收尾；新七类型化提示——禁键六类型 key 输入禁用且校验豁免、COOKIE key 可编辑
 *   仍必填、value 恒可编辑（禁 value 是 WEIGHT 独占），placeholder 双语随
 *   v2.edit.condKeyCookie / condValueHost 等七 key。
 * - conditions 七 operator EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT；WEIGHT 行 operator/value
 *   禁用 + key 走权重数字（旧语义随迁）；键值校验 v2 增量：key 必填（禁键六类型豁免）、
 *   value 必填但 EXISTS/WEIGHT 行可空，错误位 ref-cond-error-{n}。
 * - bindings 增改删 + 上下移排序（sort_order 0 起重排；旧页无上下移为 v2 增量、无启停
 *   禁臆造）；MAX 20 超限 ref-binding-max；增改走 FcDialog（插件选项 = listBuiltinTypes）。
 * - 保存时序（旧 Editor.save 逐字随迁）：canEdit/loading/saving 双击防重 → 字段校验 →
 *   DISPATCH 空 conditions 客户端预检阻断 → DISPATCH validateRoute 服务端预检（先于
 *   updateRoute）→ payload（conditions 映射 6 字段；bindings 映射 plugin_id/
 *   binding_config||'{}'/sort_order ?? index）→ edit 模式追加 expected_version=
 *   String(config_version) + environment（envReady 且显式改动才携带，缺省保持）。
 *   成功 = toast + dirty 清零 + emit saved + 自 load() 重拉（留在编辑态）。
 * - 10402 独立分支：ref-conflict-bar + toast.warning，不落 ref-save-error、不覆盖表单；
 *   conflict-refresh 显式点击才重拉。
 * - 脏离开：dirtyTracking 载入完成后才开 + watch(form, deep) + FcFormDraftBanner
 *   (visible=dirty) + 组件自带 onBeforeRouteLeave（vue-router；dirty && !saving →
 *   confirm(danger) → false 阻断）；cancel 自带 confirm → emit close（宿主无条件收起）。
 * - SDK only（无 el-* 直用）；template 块零 CJK（文案一律 t()）；i18n 独立树 v2.edit.*。
 * - S10-4 规则卡（分发路由形态，MSE 口径）：域名段（语法糖层 → HEADER+Host+EQ 翻译行）
 *   + 路径映射段（行式编辑，数据源=listRouteChildren；行保存 create/update/delete 逐行
 *   批量，时序 行提交→父 updateRoute→deleteRoute）落 ref-section-conditions 面板内，
 *   段序 域名→路径映射→分发条件行；三 tab 骨架与后置路由形态零变化。子路由 CRUD 走
 *   ./routePathMapping 独立通道（主组件 @/api/routes import 白名单 6 成员不变，被既有
 *   源码契约测试钉死）；正则行翻译语义/降级守卫详见该模块头注。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { useFcConfirm } from '@/composables/useFcConfirm'
import { usePermission } from '@/composables/usePermission'
import { useEnvironments } from '@/store/environment'
import { DEFAULT_ENV } from '@/utils/environment'
import {
  FcButton, FcDialog, FcFormDraftBanner, FcIcon, FcInput, FcSegmented, FcSelect, FcSkeleton, FcTabsPanel, toast
} from '@/components'
import { getRoute, listRoutes, updateRoute, validateRoute, listBindings, getPluginChain } from '@/api/routes'
import { listBuiltinTypes } from '@/api/plugins'
import { BusinessError, mapFieldErrors } from '@/api/http'
import {
  buildPathRow, createChildRoute, fetchRouteChildren, mergeUpstream, removeChildRoute,
  takeHostCondition, takeRegexConditions, translatedPath, synthesizeRowName
} from './routePathMapping'
import type { ConditionRow, PathRow } from './routePathMapping'

const props = defineProps<{ routeId: string }>()
const emit = defineEmits<{ saved: []; close: []; 'dirty-change': [isDirty: boolean] }>()

const { t } = useI18n()
const { confirm } = useFcConfirm()
const { canEdit } = usePermission()
const env = useEnvironments()

/** bindings 上限（旧 RouteBindingsTable 同款） */
const MAX_BINDINGS = 20
const NAME_RE = /^[a-zA-Z0-9_]{2,50}$/
const PATH_RE = /^\/[^\s]+$/
const UPSTREAM_RE = /^https?:\/\/\S+$/
/** 七 operator（顺序照旧表） */
const OPERATORS = ['EQ', 'NE', 'CONTAINS', 'REGEX', 'EXISTS', 'GT', 'LT'] as const

interface EditForm {
  route_name: string
  route_type: string
  parent_route_id: string
  path: string
  upstream_url: string
  sort_order: number | string
  remark: string
  tags: string
}

interface EditCondition {
  condition_type: string
  operator: string
  condition_key: string
  condition_value: string
  target_route_id: string
  priority: number | string
}

interface EditBinding {
  binding_id: string
  plugin_id: string
  plugin_name: string
  binding_config: string
  sort_order?: number
}

interface SelectOpt {
  value: string
  label: string
}

function blankForm(): EditForm {
  return {
    route_name: '',
    route_type: 'BACKEND',
    parent_route_id: '',
    path: '',
    upstream_url: '',
    sort_order: 1,
    remark: '',
    tags: ''
  }
}

// ── 状态（vm 通道：form/conditions/bindings/chain/parentOptions/operatorOptions/
//    expectedVersion/dirty/conflict/tabs/formEnvironment/save/addCondition/
//    removeCondition/dialogOpen/bindingForm 需经 wrapper.vm 访问）──────────────
const form = ref<EditForm>(blankForm())
const conditions = ref<EditCondition[]>([])
const bindings = ref<EditBinding[]>([])
const chain = ref<Array<{ plugin_id: string; plugin_name: string; phase: string }>>([])
const parentOptions = ref<SelectOpt[]>([])
const routeRows = ref<Array<{ id: string; route_name: string }>>([])
const pluginOptions = ref<SelectOpt[]>([])
const expectedVersion = ref('')
const formEnvironment = ref(DEFAULT_ENV)
const initialEnvironment = ref(DEFAULT_ENV)
const activeTab = ref('basic')
const loading = ref(false)
const loadError = ref('')
const parentError = ref(false)
const secondaryError = ref('')
const saving = ref(false)
const saveError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const condErrors = ref<Record<number, string>>({})
const dirty = ref(false)
const conflict = ref(false)
const dialogOpen = ref(false)
const dialogError = ref('')
const bindingMaxHit = ref(false)
const editingBindingId = ref('')
const bindingForm = ref({ plugin_id: '', binding_config: '' })
const toastFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
let dirtyTracking = false
let loadEpoch = 0
let newBindingSeq = 0

// ── S10-4 规则卡状态（仅分发路由形态；域名/正则翻译行是语法糖隐藏层，不进条件行区）──
const domain = ref('')
/** 回显摘除的 Host 翻译行（改域名更新该行、清空移除；target/priority 等其余字段保留） */
const domainCond = ref<ConditionRow | null>(null)
/** 路径映射行（回显行 id=子路由 id，新行 id=''；baseline 定桩供保存脏判） */
const pathRows = ref<PathRow[]>([])
/** 回显摘除的正则翻译行（按 target=子路由 id 索引；保存时随行更新/废弃） */
const regexCondsByTarget = ref<Map<string, ConditionRow>>(new Map())
/** 本次会话被删的回显行 id（保存末尾 deleteRoute，在父路由保存之后） */
let removedChildIds: string[] = []
const pathsError = ref('')
let newPathRowSeq = 0

const canEditRoute = computed(() => canEdit('route'))
const envReady = computed(() => env.available)
const envOptions = computed<SelectOpt[]>(() => (env.options ?? []) as SelectOpt[])

/** 三区导航（契约「三区」：chain 不是 Tab，常驻只读段在面板外） */
const tabs = ['basic', 'conditions', 'bindings']
const SECTION_KEY: Record<string, string> = {
  basic: 'sectionBasic',
  conditions: 'sectionConditions',
  bindings: 'sectionBindings'
}
const tabItems = computed<SelectOpt[]>(() =>
  tabs.map((v) => ({ value: v, label: t(`v2.edit.${SECTION_KEY[v]}`) }))
)

const typeOptions = computed<SelectOpt[]>(() => [
  { value: 'BACKEND', label: t('v2.edit.typeBackend') },
  { value: 'DISPATCH', label: t('v2.edit.typeDispatch') }
])

const OPERATOR_KEY: Record<string, string> = {
  EQ: 'operatorEq',
  NE: 'operatorNe',
  CONTAINS: 'operatorContains',
  REGEX: 'operatorRegex',
  EXISTS: 'operatorExists',
  GT: 'operatorGt',
  LT: 'operatorLt'
}
const operatorOptions = computed<SelectOpt[]>(() =>
  OPERATORS.map((op) => ({ value: op, label: t(`v2.edit.${OPERATOR_KEY[op]}`) }))
)

// 13 谓词（SCG predicate 对齐，引擎票 S10-1 同名）：既有 5 在前 + 新七居中 + WEIGHT 恒收尾
const COND_TYPES = [
  'HEADER', 'PATH', 'QUERY', 'BODY', 'GROOVY',
  'HOST', 'METHOD', 'COOKIE', 'REMOTE_ADDR', 'AFTER', 'BEFORE', 'BETWEEN',
  'WEIGHT'
]
const condTypeOptions = computed<SelectOpt[]>(() => COND_TYPES.map((v) => ({ value: v, label: v })))

/** 无需 condition_key 的六类型：key 输入禁用 + 键值校验豁免（COOKIE key 可编辑，不在此列） */
const KEY_DISABLED_TYPES = new Set(['HOST', 'METHOD', 'REMOTE_ADDR', 'AFTER', 'BEFORE', 'BETWEEN'])

/** 新七谓词的类型化占位（用户可见文案一律 t()；i18n key 双语随 zh-CN/en-US v2.edit.*） */
const COND_KEY_PLACEHOLDER: Record<string, string> = {
  COOKIE: 'v2.edit.condKeyCookie'
}
const COND_VALUE_PLACEHOLDER: Record<string, string> = {
  HOST: 'v2.edit.condValueHost',
  METHOD: 'v2.edit.condValueMethod',
  REMOTE_ADDR: 'v2.edit.condValueRemoteAddr',
  AFTER: 'v2.edit.condValueAfter',
  BEFORE: 'v2.edit.condValueBefore',
  BETWEEN: 'v2.edit.condValueBetween'
}

function condKeyDisabled(type: string): boolean {
  return KEY_DISABLED_TYPES.has(type)
}

function condKeyPlaceholder(type: string): string | undefined {
  const key = COND_KEY_PLACEHOLDER[type]
  return key ? t(key) : undefined
}

function condValuePlaceholder(type: string): string | undefined {
  const key = COND_VALUE_PLACEHOLDER[type]
  return key ? t(key) : undefined
}

/** 分发目标候选 = 路由树全量（排除自己）；候选降级时为空 */
const targetOptions = computed<SelectOpt[]>(() =>
  routeRows.value
    .filter((r) => r.id !== props.routeId)
    .map((r) => ({ value: r.id, label: r.route_name }))
)

/** 分发路由形态（规则卡）：域名段/路径映射段仅此形态渲染与装载 */
const isDispatch = computed(() => form.value.route_type === 'DISPATCH')

/** 匹配规则三枚举（值域钉死 PREFIX|EXACT|REGEX；label 走 i18n，value 原样枚举） */
const pathRuleOptions = computed<SelectOpt[]>(() => [
  { value: 'PREFIX', label: t('v2.edit.rulePrefix') },
  { value: 'EXACT', label: t('v2.edit.ruleExact') },
  { value: 'REGEX', label: t('v2.edit.ruleRegex') }
])

// ── 装载（五源并行；loadEpoch 竞态守卫：陈旧成功不覆写表单、陈旧失败不复活错误条）──
async function load() {
  dirtyTracking = false
  dirty.value = false
  loading.value = true
  loadError.value = ''
  parentError.value = false
  secondaryError.value = ''
  saveError.value = ''
  fieldErrors.value = {}
  condErrors.value = {}
  const my = ++loadEpoch
  const routeId = props.routeId
  const [routeRes, treeRes, bindingsRes, chainRes, typesRes] = await Promise.allSettled([
    getRoute(routeId),
    listRoutes(),
    listBindings(routeId),
    getPluginChain(routeId),
    listBuiltinTypes()
  ])
  if (my !== loadEpoch) return

  // getRoute = 主数据源：失败即错误态（三区不渲染、保存阻断）
  if (routeRes.status === 'rejected') {
    loadError.value = (routeRes.reason as Error)?.message || t('v2.edit.loadFailed')
    loading.value = false
    return
  }
  applyRoute(routeRes.value as unknown as Record<string, unknown>)

  if (treeRes.status === 'fulfilled') {
    parentError.value = false
    applyParentOptions(Array.isArray(treeRes.value) ? (treeRes.value as unknown as Record<string, unknown>[]) : [])
  } else {
    parentError.value = true
    parentOptions.value = []
  }

  // bindings/chain 失败只挂降级警告条，已有数据不清空（旧 Editor 语义）
  let secondary = ''
  if (bindingsRes.status === 'fulfilled') {
    bindings.value = ((bindingsRes.value ?? []) as unknown as Record<string, unknown>[]).map((b) => ({
      binding_id: String(b.binding_id ?? ''),
      plugin_id: String(b.plugin_id ?? ''),
      plugin_name: String(b.plugin_name ?? ''),
      binding_config: String(b.binding_config ?? ''),
      sort_order: b.sort_order as number | undefined
    }))
  } else {
    secondary = t('v2.edit.bindingsLoadFailed')
  }
  if (chainRes.status === 'fulfilled') {
    const c = (chainRes.value ?? {}) as { pre_chain?: Record<string, unknown>[]; post_chain?: Record<string, unknown>[] }
    const pre = Array.isArray(c.pre_chain) ? c.pre_chain : []
    const post = Array.isArray(c.post_chain) ? c.post_chain : []
    chain.value = [...pre, ...post].map((p, i) => ({
      plugin_id: String(p.plugin_id ?? ''),
      plugin_name: String(p.plugin_name ?? ''),
      phase: i < pre.length ? 'PRE' : 'POST'
    }))
  } else {
    chain.value = []
    secondary = secondary ? `${secondary} | ${t('v2.edit.chainLoadFailed')}` : t('v2.edit.chainLoadFailed')
  }
  secondaryError.value = secondary

  if (typesRes.status === 'fulfilled') {
    const list = (Array.isArray(typesRes.value) ? typesRes.value : []) as unknown as Record<string, unknown>[]
    pluginOptions.value = list.map((p) => ({ value: String(p.plugin_id ?? ''), label: String(p.plugin_name ?? p.plugin_id ?? '') }))
  } else {
    pluginOptions.value = []
  }

  // S10-4 规则卡装载（仅分发路由形态）：域名/正则翻译行回显摘除 + 子路由行模型组装。
  // 降级守卫：listRouteChildren 失败（含旧 mock 工厂缺成员的同步 TypeError——async 边界
  // 转为 rejected promise）只挂 ref-paths-error，表单其余照常（含保存），不抛未处理异常。
  resetPathMappingState()
  if (form.value.route_type === 'DISPATCH') {
    const hostTake = takeHostCondition(conditions.value as ConditionRow[])
    conditions.value = hostTake.rows as EditCondition[]
    domainCond.value = hostTake.host
    domain.value = hostTake.host ? String(hostTake.host.condition_value ?? '') : ''
    try {
      const children = await fetchRouteChildren(routeId)
      if (my !== loadEpoch) return
      const regexTake = takeRegexConditions(
        conditions.value as ConditionRow[],
        new Set(children.map((c) => String(c.id ?? '')))
      )
      conditions.value = regexTake.rows as EditCondition[]
      regexCondsByTarget.value = regexTake.byTarget
      pathRows.value = children.map((ch) => buildPathRow(ch, regexTake.byTarget.get(String(ch.id ?? '')) ?? null))
    } catch {
      if (my !== loadEpoch) return
      pathsError.value = t('v2.edit.pathsLoadFailed')
    }
  }

  loading.value = false
  await nextTick()
  // dirtyTracking 在装载完成的 nextTick 之后才开启：回显本身不误报脏
  dirtyTracking = true
}

function applyRoute(row: Record<string, unknown>) {
  form.value = {
    route_name: String(row.route_name ?? ''),
    route_type: String(row.route_type ?? 'BACKEND'),
    parent_route_id: String(row.parent_route_id ?? ''),
    path: String(row.path ?? ''),
    upstream_url: String(row.upstream_url ?? ''),
    sort_order: (row.sort_order as number | string) ?? 1,
    remark: String(row.remark ?? ''),
    tags: String(row.tags ?? '')
  }
  conditions.value = (Array.isArray(row.conditions) ? row.conditions : []) as EditCondition[]
  expectedVersion.value = row.config_version != null ? String(row.config_version) : ''
  initialEnvironment.value = String(row.environment ?? '') || (envReady.value ? env.current : DEFAULT_ENV)
  formEnvironment.value = initialEnvironment.value
}

function applyParentOptions(nodes: Record<string, unknown>[]) {
  const flat: Record<string, unknown>[] = []
  const walk = (list: Record<string, unknown>[]) => {
    for (const n of list) {
      flat.push(n)
      if (Array.isArray(n.children)) walk(n.children as Record<string, unknown>[])
    }
  }
  walk(nodes)
  routeRows.value = flat.map((r) => ({ id: String(r.id ?? ''), route_name: String(r.route_name ?? r.id ?? '') }))
  parentOptions.value = flat
    .filter((r) => r.route_type === 'DISPATCH' && String(r.id) !== props.routeId)
    .map((r) => ({ value: String(r.id), label: String(r.route_name ?? r.id) }))
}

function retry() {
  void load()
}

watch(() => props.routeId, () => {
  void load()
})

onMounted(() => {
  void load()
})

watch(form, () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

// 规则卡编辑同样计入脏态（回显写值发生在 dirtyTracking 开启前，不误报）
watch([domain, pathRows], () => {
  if (dirtyTracking) dirty.value = true
}, { deep: true })

// 卸载即清理未保存翻译行的悬挂状态（切路由走 load() 内 resetPathMappingState）
onBeforeUnmount(resetPathMappingState)

watch(dirty, (v) => {
  emit('dirty-change', v)
})

// bindings 硬上限：任何时刻超过 MAX_BINDINGS 都截回（上限不是提示而是约束）
watch(bindings, () => {
  if (bindings.value.length > MAX_BINDINGS) {
    bindings.value.splice(MAX_BINDINGS)
    bindingMaxHit.value = true
  }
}, { deep: true })

// ── 校验（旧 RouteBasicForm rules 硬数字逐字随迁；字段错误位与 mapFieldErrors 共用）──
function validateBasic(): boolean {
  const f = form.value
  const errs: Record<string, string> = {}
  const invalid = t('v2.edit.validationFailed')
  if (!f.route_name || !NAME_RE.test(f.route_name)) errs.route_name = invalid
  if (f.route_type === 'BACKEND') {
    if (!f.path || !PATH_RE.test(f.path)) errs.path = invalid
    if (!f.upstream_url || !UPSTREAM_RE.test(f.upstream_url)) errs.upstream_url = invalid
  }
  const sort = Number(f.sort_order)
  if (!Number.isFinite(sort) || sort < 1 || sort > 9999) errs.sort_order = invalid
  if (f.remark && f.remark.length > 200) errs.remark = invalid
  if (f.tags && f.tags.length > 200) errs.tags = invalid
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}

/** 键值校验（v2 增量）：key 必填（禁键六类型豁免）；value 必填但 EXISTS/WEIGHT 行可空；WEIGHT 行整行豁免 */
function validateConditions(): boolean {
  const errs: Record<number, string> = {}
  conditions.value.forEach((c, i) => {
    if (c.condition_type === 'WEIGHT') return
    // 禁键六类型 key 留空豁免（HOST/METHOD/REMOTE_ADDR/AFTER/BEFORE/BETWEEN 不需 key）；
    // COOKIE key 未禁用 → 仍必填，不得过度豁免
    const keyBlank = !String(c.condition_key ?? '').trim()
    if (keyBlank && !KEY_DISABLED_TYPES.has(c.condition_type)) errs[i] = t('v2.edit.keyRequired')
    else if (!String(c.condition_value ?? '').trim() && c.operator !== 'EXISTS') errs[i] = t('v2.edit.valueRequired')
  })
  condErrors.value = errs
  return Object.keys(errs).length === 0
}

// 返回宽类型（字符串字段）：validateRoute/updateRoute 的 DTO 字面量联合类型由调用侧收窄
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConditions(): any[] {
  return conditions.value.map((c) => ({
    condition_type: c.condition_type,
    operator: c.operator,
    condition_key: c.condition_key,
    condition_value: c.condition_value,
    target_route_id: c.target_route_id,
    priority: c.priority
  }))
}

// ── S10-4 规则卡：行提交与合并条件（翻译层）────────────────────────────────
/** 将提交的脏行（新行 + 与回显基线有差异的行）；未动行零调用（不重写 path，往返安全，
 * `/*` 单段宽容回显亦不回退）。翻译按行当前状态重跑（改端口不得回退路径翻译）。 */
function collectPendingRows(): Array<{ row: PathRow; isNew: boolean; childPath: string; upstream: string }> {
  const out: Array<{ row: PathRow; isNew: boolean; childPath: string; upstream: string }> = []
  for (const row of pathRows.value) {
    const b = row.baseline
    const dirty = !b || b.path !== row.path || b.rule !== row.rule || b.service !== row.service || b.port !== row.port
    if (!dirty) continue
    out.push({
      row,
      isNew: !row.id,
      childPath: translatedPath(row.path, row.rule),
      upstream: mergeUpstream(row.service, row.port)
    })
  }
  return out
}

/** 父路由 conditions 合并（预检与保存共用）：渲染行 + 域名翻译行（非空恰一条
 * HEADER+Host+EQ，更新回显行或追加新行；清空则不含）+ 正则翻译行（恰为当前 REGEX
 * 规则行，target=行子路由 id——挂分发路由是引擎活语义，后置路由条件引擎不评估）。
 * 翻译行恒六字段（id 等回显杂字段不透传，与 mapConditions 口径一致）。 */
function mergedConditions(): ConditionRow[] {
  const out: ConditionRow[] = mapConditions()
  if (form.value.route_type !== 'DISPATCH') return out
  const d = domain.value.trim()
  if (d) {
    const prev = domainCond.value
    out.push(prev
      ? {
          condition_type: prev.condition_type,
          operator: prev.operator,
          condition_key: prev.condition_key,
          condition_value: d,
          target_route_id: prev.target_route_id,
          priority: prev.priority
        }
      : { condition_type: 'HEADER', operator: 'EQ', condition_key: 'Host', condition_value: d, target_route_id: '', priority: 1 })
  }
  for (const row of pathRows.value) {
    if (row.rule !== 'REGEX') continue
    const prev = row.id ? regexCondsByTarget.value.get(row.id) : undefined
    out.push(prev
      ? {
          condition_type: prev.condition_type,
          operator: prev.operator,
          condition_key: prev.condition_key,
          condition_value: row.path,
          target_route_id: prev.target_route_id,
          priority: prev.priority
        }
      : { condition_type: 'PATH', operator: 'REGEX', condition_key: '', condition_value: row.path, target_route_id: row.id, priority: 1 })
  }
  return out
}

// ── 保存（旧 Editor.save 时序逐字随迁 + S10-4 批量时序：行提交 → 父收尾 → 删行收尾）──
async function save() {
  if (!canEditRoute.value) return
  if (loading.value || saving.value) return
  saveError.value = ''
  if (!validateBasic()) return
  if (!validateConditions()) return
  const dispatch = form.value.route_type === 'DISPATCH'
  // 行级预检（仅将提交的脏行）：后端 createRoute 硬拒 BACKEND 空 path（正则行 path 列
  // 存正则原文非空），upstream 同为 BACKEND 必填；未动行不预检
  const pending = dispatch ? collectPendingRows() : []
  for (const p of pending) {
    if (!p.childPath || !p.upstream) {
      const idx = pathRows.value.indexOf(p.row) + 1
      saveError.value = `${t('v2.edit.pathsTitle')} #${idx}: ${t('v2.edit.pathCol')}/${t('v2.edit.serviceCol')} ${t('v2.edit.validationFailed')}`
      return
    }
  }
  // DISPATCH 有效条件数（渲染行 + 域名翻译行 + 正则翻译行）为空 = 客户端预检阻断（不调任何 API）
  const effectiveConds = dispatch
    ? conditions.value.length
      + (domain.value.trim() ? 1 : 0)
      + pathRows.value.filter((r) => r.rule === 'REGEX').length
    : conditions.value.length
  if (dispatch && effectiveConds === 0) {
    saveError.value = t('v2.edit.dispatchNeedsConditions')
    return
  }
  // DISPATCH 且有条件 = validateRoute 服务端预检（先于一切写操作，失败阻断）
  if (dispatch) {
    try {
      // 宽类型（字符串字段）→ DTO 字面量联合由调用侧收窄（mapConditions 先例同款）
      await validateRoute({ route_id: props.routeId, conditions: mergedConditions() as never })
    } catch (e) {
      saveError.value = (e as Error)?.message || t('v2.edit.validationFailed')
      return
    }
  }
  saving.value = true
  try {
    // ① 行提交（create→update；create 先行拿回填 id 供正则翻译行 target 引用；
    //    行级乐观锁随行 expected_version=子 config_version）
    for (const p of pending) {
      if (p.isNew) {
        const created = await createChildRoute({
          route_name: synthesizeRowName(newPathRowSeq, p.row.path),
          route_type: 'BACKEND',
          path: p.childPath,
          upstream_url: p.upstream,
          parent_route_id: props.routeId
        })
        p.row.id = String((created as { id?: unknown })?.id ?? '')
      } else {
        const childPayload: Record<string, unknown> = { path: p.childPath, upstream_url: p.upstream }
        if (p.row.childVersion) childPayload.expected_version = p.row.childVersion
        await updateRoute(p.row.id, childPayload)
      }
    }
    const f = form.value
    const payload: Record<string, unknown> = {
      route_name: f.route_name,
      route_type: f.route_type,
      path: f.path,
      upstream_url: f.upstream_url,
      sort_order: Number(f.sort_order),
      remark: f.remark,
      tags: f.tags || '',
      parent_route_id: f.parent_route_id || undefined,
      conditions: mergedConditions(),
      bindings: bindings.value.map((b, i) => ({
        plugin_id: b.plugin_id,
        binding_config: b.binding_config || '{}',
        sort_order: b.sort_order ?? i
      }))
    }
    // 乐观锁（Long→String 契约）+ 环境仅在显式改动时携带（缺省保持）
    if (expectedVersion.value) payload.expected_version = expectedVersion.value
    if (envReady.value && formEnvironment.value !== initialEnvironment.value) payload.environment = formEnvironment.value
    // ② 父路由收尾（翻译行随父保存落库；后端 deleteRoute 引用守卫由此先行解除）
    await updateRoute(props.routeId, payload)
    // ③ 删行收尾（恒在父保存之后；此时被删行的正则翻译条件已随父保存移除）
    for (const id of removedChildIds) {
      await removeChildRoute(id)
    }
    toast.success(t('v2.edit.saveSuccess'))
    toastFeedback.value = { kind: 'success', text: t('v2.edit.saveSuccess') }
    dirty.value = false
    conflict.value = false
    emit('saved')
    await load()
  } catch (e) {
    // 10402 编辑冲突 = 独立分支：不落通用错误、不覆盖表单，等用户显式刷新
    if (e instanceof BusinessError && Number(e.code) === 10402) {
      conflict.value = true
      toast.warning((e as Error).message || t('v2.edit.conflictModified'))
      return
    }
    const fieldErrs = mapFieldErrors(e)
    if (Object.keys(fieldErrs).length > 0) fieldErrors.value = { ...fieldErrors.value, ...fieldErrs }
    saveError.value = (e as Error)?.message || t('v2.edit.saveFailed')
    toastFeedback.value = { kind: 'error', text: saveError.value }
  } finally {
    saving.value = false
  }
}

/** 冲突条「刷新」：显式点击才重拉服务端数据覆盖表单 */
async function reloadAfterConflict() {
  conflict.value = false
  await load()
}

/** FcFormDraftBanner「放弃修改」：confirm(danger) 通过才重拉重置 */
async function discardChanges() {
  if (loading.value) return
  if (!await confirm({ title: t('v2.edit.discardChanges'), variant: 'danger' })) return
  conflict.value = false
  await load()
}

/** 取消 = 收起请求：脏时 confirm(danger) 通过才 emit close；宿主收到 close 无条件收起 */
async function cancel() {
  if (dirty.value) {
    const ok = await confirm({ title: t('v2.edit.discardChanges'), variant: 'danger' })
    if (!ok) return
  }
  emit('close')
}

// 路由级脏离开由组件自带（vue-router onBeforeRouteLeave；单测直挂环境不注册，无害）
onBeforeRouteLeave(async () => {
  if (dirty.value && !saving.value) {
    const ok = await confirm({ title: t('v2.edit.discardChanges'), variant: 'danger' })
    if (!ok) return false
  }
})

// ── S10-4 规则卡：路径映射行操作与悬挂状态清理 ────────────────────────────
/** 清理未保存翻译行的悬挂状态（切路由 load() / 卸载 onBeforeUnmount 双通道） */
function resetPathMappingState() {
  domain.value = ''
  domainCond.value = null
  pathRows.value = []
  regexCondsByTarget.value = new Map()
  removedChildIds = []
  pathsError.value = ''
}

/** 添加路径：新行 id=''（未保存态），默认前缀规则；route_name 序号随行合成 */
function addPathRow() {
  newPathRowSeq += 1
  pathRows.value.push({ id: '', path: '', rule: 'PREFIX', service: '', port: '', baseline: null, childVersion: '' })
}

/** 删行：回显行记入待删清单（保存末尾 deleteRoute），新行直接移除 */
function removePathRow(index: number) {
  const row = pathRows.value[index]
  if (!row) return
  if (row.id) removedChildIds.push(row.id)
  pathRows.value.splice(index, 1)
}

// ── conditions 行操作（默认形态照旧表：HEADER/EQ/键值空/priority 1）──────────
function addCondition() {
  conditions.value.push({
    condition_type: 'HEADER',
    operator: 'EQ',
    condition_key: '',
    condition_value: '',
    target_route_id: '',
    priority: 1
  })
  condErrors.value = {}
}

function removeCondition(index: number) {
  conditions.value.splice(index, 1)
  condErrors.value = {}
}

// ── bindings 增改删 + 上下移（sort_order 0 起重排；MAX 20；无启停——旧页没有，禁臆造）──
function reindexBindings() {
  bindings.value.forEach((b, i) => {
    b.sort_order = i
  })
}

function openBindingDialog(row?: EditBinding) {
  if (!row && bindings.value.length >= MAX_BINDINGS) {
    bindingMaxHit.value = true
    return
  }
  bindingMaxHit.value = false
  dialogError.value = ''
  editingBindingId.value = row ? String(row.binding_id) : ''
  bindingForm.value = {
    plugin_id: row ? row.plugin_id : '',
    binding_config: row ? row.binding_config : ''
  }
  dialogOpen.value = true
}

function confirmBinding() {
  if (!bindingForm.value.plugin_id) {
    dialogError.value = t('v2.edit.validationFailed')
    return
  }
  const pluginLabel = pluginOptions.value.find((o) => o.value === bindingForm.value.plugin_id)?.label ?? ''
  if (editingBindingId.value) {
    const row = bindings.value.find((b) => String(b.binding_id) === editingBindingId.value)
    if (row) {
      row.plugin_id = bindingForm.value.plugin_id
      row.plugin_name = pluginLabel || row.plugin_name
      row.binding_config = bindingForm.value.binding_config
    }
  } else {
    newBindingSeq += 1
    bindings.value.push({
      binding_id: `new-${newBindingSeq}`,
      plugin_id: bindingForm.value.plugin_id,
      plugin_name: pluginLabel,
      binding_config: bindingForm.value.binding_config,
      sort_order: bindings.value.length
    })
  }
  dialogOpen.value = false
}

function removeBinding(index: number) {
  bindings.value.splice(index, 1)
  bindingMaxHit.value = false
  reindexBindings()
}

function moveBinding(index: number, dir: -1 | 1) {
  const target = index + dir
  if (target < 0 || target >= bindings.value.length) return
  const [row] = bindings.value.splice(index, 1)
  bindings.value.splice(target, 0, row)
  reindexBindings()
}
</script>

<style scoped>
.ref-edit { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ref-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--app-text-primary); }
.ref-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--app-radius-sm, 6px); font-size: 13px; }
.ref-banner.is-error { color: var(--app-danger); background: color-mix(in srgb, var(--app-danger) 8%, transparent); }
.ref-banner.is-warn { color: var(--app-warning); background: color-mix(in srgb, var(--app-warning) 8%, transparent); }
.ref-banner-text { flex: 1; min-width: 0; }
.ref-pane { display: flex; flex-direction: column; gap: 12px; }
.ref-pane-head { display: flex; align-items: center; gap: 12px; }
.ref-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.ref-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ref-field--wide { grid-column: 1 / -1; }
.ref-label { font-size: 12.5px; color: var(--app-text-secondary); }
.ref-hint { margin: 0; font-size: 12px; color: var(--app-text-tertiary); }
.ref-err { margin: 0; font-size: 12px; color: var(--app-danger); }
.ref-cond-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; padding: 10px 12px; border: 1px solid var(--app-border, var(--el-border-color)); border-radius: var(--app-radius-sm, 6px); }
.ref-cond-cell { display: flex; flex-direction: column; gap: 4px; flex: 1 1 150px; min-width: 120px; }
.ref-cond-cell--narrow { flex: 0 1 110px; }
.ref-cond-cell--act { flex: 0 0 auto; }
.ref-cond-label { font-size: 11.5px; color: var(--app-text-tertiary); }
.ref-cond-err { flex-basis: 100%; }
.ref-paths { display: flex; flex-direction: column; gap: 8px; }
.ref-paths-title { font-size: 13px; font-weight: 600; color: var(--app-text-primary); }
.ref-path-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; padding: 10px 12px; border: 1px solid var(--app-border, var(--el-border-color)); border-radius: var(--app-radius-sm, 6px); }
.ref-cond-cell--path { flex: 1 1 180px; }
.ref-binding-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--app-border, var(--el-border-color)); border-radius: var(--app-radius-sm, 6px); }
.ref-binding-name { flex: 0 0 auto; font-size: 13px; font-weight: 600; color: var(--app-text-primary); }
.ref-binding-config { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--app-font-mono, monospace); font-size: 12px; color: var(--app-text-secondary); }
.ref-binding-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; }
.ref-chain { padding: 12px 16px; border: 1px solid var(--app-border, var(--el-border-color)); border-radius: var(--app-radius-sm, 6px); }
.ref-chain-h { margin-bottom: 8px; font-size: 13px; color: var(--app-text-primary); }
.ref-chain-empty { margin: 0; font-size: 12.5px; color: var(--app-text-tertiary); }
.ref-chain-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ref-chain-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--app-text-secondary); }
.ref-chain-idx { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: color-mix(in srgb, var(--app-primary, var(--el-color-primary)) 12%, transparent); font-size: 11px; color: var(--app-text-primary); }
.ref-chain-name { font-weight: 600; color: var(--app-text-primary); }
.ref-chain-phase { font-size: 11px; color: var(--app-text-tertiary); }
.ref-actions { display: flex; flex-direction: column; gap: 8px; }
.ref-actions-row { display: flex; justify-content: flex-end; gap: 8px; }
.ref-toast-mirror { font-size: 12px; color: var(--app-text-tertiary); }
.ref-dialog-body { display: flex; flex-direction: column; gap: 12px; }
</style>
