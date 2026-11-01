<script setup lang="ts">
defineOptions({ name: 'FcHelpTip' })
/**
 * FcHelpTip — 字段帮助提示 (#18 字段 help).
 *
 * 用法:
 *   <el-form-item label="名称">
 *     <el-input v-model="form.name" />
 *     <FcHelpTip content-key="benefit.help.name" />
 *   </el-form-item>
 *
 *   <FcHelpTip content="请输入 4-20 字符, 不可重复" placement="top" />
 *
 * 默认 ? 圆形图标, hover 弹 popover. content 优先; content-key 走 i18n.
 */

import { useI18n } from 'vue-i18n'
import { computed } from 'vue'

interface Props {
  /** 直接传入文案 */
  content?: string
  /** i18n key, 走 t() 翻译. 优先级低于 content */
  contentKey?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  icon?: string
}
const props = withDefaults(defineProps<Props>(), {
  content: '',
  contentKey: '',
  placement: 'top',
  icon: 'ri-question-line',
})

const { t } = useI18n()

const displayText = computed(() => {
  if (props.content) return props.content
  if (props.contentKey) return t(props.contentKey)
  return ''
})
</script>

<template>
  <el-popover v-if="displayText" trigger="hover" :placement="placement" :width="240">
    <template #reference>
      <span class="fc-help-tip" tabindex="0" role="button" :aria-label="displayText">
        <i :class="icon" />
      </span>
    </template>
    <div class="fc-help-tip__body">{{ displayText }}</div>
  </el-popover>
</template>

<style scoped>
.fc-help-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  border-radius: 50%;
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
  cursor: help;
  font-size: 11px;
  transition: background 0.15s;
}
.fc-help-tip:hover {
  background: var(--app-primary);
  color: var(--app-on-primary);
}
.fc-help-tip:active {
  background: var(--app-primary-active);
  color: var(--app-on-primary);
}
.fc-help-tip:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.fc-help-tip__body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-text-secondary);
}
</style>