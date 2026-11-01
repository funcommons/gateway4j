<script setup lang="ts">
/**
 * PublishDescriptionDialog — 发布变更说明弹窗（H7b T2）。
 *
 * 契约：POST /v1/routes/{id}/publish 与批量发布 body 可选 change_description，
 * UI 侧必填 1~200 字（未填禁用确认按钮并提示），提交随 body，成功后清空（关闭即重置）。
 *
 * optional=true 模式（画布 apply）：画布走 diff 流已天然留痕，变更说明标注「可选」，
 * 仅填写时随 payload 携带。
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcDialog, FcInput, FcButton } from '@/components'

defineOptions({ name: 'PublishDescriptionDialog' })

const props = withDefaults(defineProps<{
  open: boolean
  /** 弹窗标题（发布 / 批量发布…） */
  title?: string
  /** 确认按钮文案 */
  confirmLabel?: string
  /** 上下文说明（如批量条数） */
  context?: string
  /** true = 变更说明可选（画布 apply）；默认必填 1~200 字 */
  optional?: boolean
}>(), {
  title: '',
  confirmLabel: '',
  context: '',
  optional: false
})

const emit = defineEmits<{
  'update:open': [open: boolean]
  /** 确认：携带当前变更说明（trim 后） */
  confirm: [description: string]
}>()

const { t } = useI18n()

const DESC_MAX = 200
const desc = ref('')

// 打开即重置（T2：成功后清空 —— 关闭重开不残留上次输入）
watch(() => props.open, (v) => {
  if (v) desc.value = ''
})

const trimmed = computed(() => desc.value.trim())
/** 必填模式：1~200 字才允许提交；可选模式：≤200 即可（空 = 不携带） */
const descOk = computed(() => props.optional ? trimmed.value.length <= DESC_MAX : trimmed.value.length >= 1)
/** 未填提示（仅必填模式展示） */
const showRequiredHint = computed(() => props.open && !props.optional && trimmed.value.length === 0)

function close() {
  emit('update:open', false)
}

function onConfirm() {
  if (!descOk.value) return
  emit('confirm', trimmed.value)
}
</script>

<template>
  <FcDialog
    :open="open"
    :title="title"
    width="520"
    :close-on-click-modal="false"
    @update:open="v => emit('update:open', v)"
  >
    <div class="publish-desc" data-testid="publish-desc-dialog">
      <p v-if="context" class="publish-desc__context" data-testid="publish-desc-context">{{ context }}</p>
      <label class="publish-desc__label" for="publish-desc-input">{{ t('env.changeDescLabel') }}</label>
      <FcInput
        id="publish-desc-input"
        v-model="desc"
        type="textarea"
        :rows="3"
        :maxlength="DESC_MAX"
        :placeholder="t('env.changeDescPlaceholder')"
        data-testid="publish-desc-input"
      />
      <p v-if="showRequiredHint" class="publish-desc__hint" data-testid="publish-desc-error">
        {{ t('env.changeDescRequired') }}
      </p>
      <p v-if="optional" class="publish-desc__optional" data-testid="publish-desc-optional-mark">
        {{ t('env.changeDescOptional') }}
      </p>
    </div>
    <template #footer>
      <FcButton variant="secondary" data-testid="publish-desc-cancel" @click="close">{{ t('common.cancel') }}</FcButton>
      <FcButton
        variant="primary"
        :disabled="!descOk"
        data-testid="publish-desc-confirm"
        @click="onConfirm"
      >{{ confirmLabel || t('common.confirm') }}</FcButton>
    </template>
  </FcDialog>
</template>

<style scoped>
.publish-desc__context {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
}
.publish-desc__label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--app-text-primary);
}
.publish-desc__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--app-danger);
}
.publish-desc__optional {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}
</style>
