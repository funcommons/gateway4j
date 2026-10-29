import { describe, it, expect, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'

// H7b T2 契约用例：发布变更说明弹窗 —— 必填 1~200 字门控 / 未填禁用确认并提示 /
// 提交随 body（emit desc）/ 成功后清空（重开重置）/ 画布 apply 可选模式
import PublishDescriptionDialog from '@/components/PublishDescriptionDialog.vue'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', confirm: '确认' },
      env: {
        changeDescLabel: '变更说明',
        changeDescPlaceholder: '简要描述本次变更内容（1~200 字）',
        changeDescRequired: '请填写变更说明（1~200 字）',
        changeDescOptional: '选填：画布应用走 diff 流已天然留痕'
      }
    }
  }
})

// el-dialog / el-input 未注册 ElementPlus 时无法交互 —— 用 global.components
// 注册最小可交互桩（v-model 双绑 + 插槽渲染），替代 unresolved 元素。
const ElDialogStub = {
  name: 'el-dialog',
  props: ['modelValue', 'title'],
  template: `<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>`
}
const ElInputStub = {
  name: 'el-input',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<textarea class="desc-input-stub" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
}

function factory(props: Record<string, unknown> = {}) {
  return mount(PublishDescriptionDialog, {
    props: { open: true, title: '发布路由', ...props },
    global: {
      plugins: [i18n],
      components: { 'el-dialog': ElDialogStub, 'el-input': ElInputStub }
    }
  })
}

function input(w: ReturnType<typeof factory>) {
  return w.find('textarea.desc-input-stub')
}

function confirmBtn(w: ReturnType<typeof factory>) {
  return w.find('[data-testid="publish-desc-confirm"]')
}

/** 未注册 ElementPlus 的环境里 :disabled=false 会落成 disabled="false" 属性 */
function confirmDisabled(w: ReturnType<typeof factory>): boolean {
  const v = confirmBtn(w).attributes('disabled')
  return v !== undefined && v !== 'false'
}

beforeEach(() => { installMemoryStorage() })

describe('PublishDescriptionDialog — 必填门控（T2）', () => {
  it('未填：确认按钮禁用（点击不 emit）+ 提示文案可见', async () => {
    const w = factory()
    expect(confirmDisabled(w)).toBe(true)
    expect(w.find('[data-testid="publish-desc-error"]').exists()).toBe(true)
    await confirmBtn(w).trigger('click')
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('填写后：确认可用、提示消失；确认 emit trim 后的说明', async () => {
    const w = factory()
    await input(w).setValue('  发版  ')
    expect(confirmDisabled(w)).toBe(false)
    expect(w.find('[data-testid="publish-desc-error"]').exists()).toBe(false)
    await confirmBtn(w).trigger('click')
    expect(w.emitted('confirm')![0]).toEqual(['发版'])
  })

  it('maxlength=200：1~200 字契约由输入框长度上限兜底', () => {
    const w = factory()
    const el = input(w).element as HTMLTextAreaElement
    expect(el.getAttribute('maxlength')).toBe('200')
  })

  it('关闭重开 → 输入清空（成功后清空口径），回到必填未满足状态', async () => {
    const w = factory({ open: false })
    await w.setProps({ open: true })
    await input(w).setValue('第一次')
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    expect((input(w).element as HTMLTextAreaElement).value).toBe('')
    expect(confirmDisabled(w)).toBe(true)
  })

  it('空白字符（仅空格）仍视为未填', async () => {
    const w = factory()
    await input(w).setValue('   ')
    expect(confirmDisabled(w)).toBe(true)
    expect(w.find('[data-testid="publish-desc-error"]').exists()).toBe(true)
  })

  it('取消按钮 emit update:open=false（关闭弹窗）', async () => {
    const w = factory()
    await w.find('[data-testid="publish-desc-cancel"]').trigger('click')
    expect(w.emitted('update:open')![0]).toEqual([false])
  })
})

describe('PublishDescriptionDialog — 可选模式（画布 apply：diff 流已天然留痕）', () => {
  it('空说明也允许确认（emit 空串），并展示「可选」标注、无必填提示', async () => {
    const w = factory({ optional: true, title: '应用画布到路由树' })
    expect(confirmDisabled(w)).toBe(false)
    expect(w.find('[data-testid="publish-desc-optional-mark"]').exists()).toBe(true)
    expect(w.find('[data-testid="publish-desc-error"]').exists()).toBe(false)
    await confirmBtn(w).trigger('click')
    expect(w.emitted('confirm')![0]).toEqual([''])
  })

  it('必填模式无「可选」标注', () => {
    const w = factory()
    expect(w.find('[data-testid="publish-desc-optional-mark"]').exists()).toBe(false)
  })
})
