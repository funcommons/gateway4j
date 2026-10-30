import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FcInput from './FcInput.vue'

/**
 * FcInput rows 透传回归（2026-10-30 SDK 缺陷修复）：
 * Props 里声明了 rows 但模板从未绑定到内部 el-input，
 * 导致所有 textarea 塌成 EP 默认 2 行（发布弹窗 3 行、导入 JSON 框 12 行）。
 */

const ElInputStub = {
  props: { type: { default: 'text' }, rows: { type: [Number, String], default: undefined } },
  template: `<textarea v-if="type === 'textarea'" :rows="rows" data-testid="stub-textarea" />`,
}

function mountInput(props: Record<string, unknown>) {
  return mount(FcInput, {
    props: props as never,
    global: { slots: {}, components: { 'el-input': ElInputStub } },
  })
}

describe('FcInput rows 透传', () => {
  it('type=textarea 时 rows 绑定到内部 el-input', () => {
    const w = mountInput({ modelValue: '', type: 'textarea', rows: 12 })
    const textarea = w.find('[data-testid="stub-textarea"]')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('rows')).toBe('12')
  })

  it('rows 缺省时 textarea 不带 rows 属性（走 EP 默认）', () => {
    const w = mountInput({ modelValue: '', type: 'textarea' })
    expect(w.find('[data-testid="stub-textarea"]').attributes('rows')).toBeUndefined()
  })

  it('type=text 时不渲染 textarea', () => {
    const w = mountInput({ modelValue: '' })
    expect(w.find('[data-testid="stub-textarea"]').exists()).toBe(false)
  })
})
