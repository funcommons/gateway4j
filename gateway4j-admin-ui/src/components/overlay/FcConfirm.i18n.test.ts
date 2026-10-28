import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import FcConfirm from '@/components/overlay/FcConfirm.vue'
import enUS from '@/locales/en-US'
import zhCN from '@/locales/zh-CN'

function factory(props: Record<string, unknown> = {}, locale = 'zh-CN') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  })
  return mount(FcConfirm, {
    props: { open: true, ...props },
    global: {
      plugins: [i18n],
      stubs: {
        FcDialog: {
          template: '<div class="fc-dialog-stub" :title="$attrs.title"><slot /><slot name="footer" /></div>',
        },
        'el-button': {
          template: '<button :type="type" :disabled="disabled"><slot /></button>',
          props: ['type', 'disabled', 'loading'],
        },
      },
    },
  })
}

describe('FcConfirm — i18n fallbacks', () => {
  it('falls back to common.tip for title when no title prop (zh-CN)', () => {
    const wrapper = factory({ content: 'test content' }, 'zh-CN')
    const title = wrapper.find('.fc-dialog-stub').attributes('title')
    expect(title).not.toBe('common.tip')
    expect(title).toBeTruthy()
  })

  it('falls back to common.tip for title when no title prop (en-US)', () => {
    const wrapper = factory({ content: 'test content' }, 'en-US')
    const title = wrapper.find('.fc-dialog-stub').attributes('title')
    expect(title).not.toBe('common.tip')
    expect(title).toBeTruthy()
  })

  it('uses explicit title prop when provided', () => {
    const wrapper = factory({ title: 'Custom Title', content: 'test' })
    const title = wrapper.find('.fc-dialog-stub').attributes('title')
    expect(title).toBe('Custom Title')
  })

  it('falls back to common.confirm for confirm button when no confirmText', () => {
    const wrapper = factory({ content: 'test' })
    // The confirm button is the second el-button, which has type="primary"
    // Check that the resolved text is not the raw key
    const vm = wrapper.vm as any
    expect(vm.resolvedConfirm).not.toBe('common.confirm')
    expect(vm.resolvedConfirm).toBeTruthy()
  })

  it('falls back to common.cancel for cancel button when no cancelText', () => {
    const wrapper = factory({ content: 'test' })
    const vm = wrapper.vm as any
    expect(vm.resolvedCancel).not.toBe('common.cancel')
    expect(vm.resolvedCancel).toBeTruthy()
  })
})
