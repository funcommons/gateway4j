import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import FcEmpty from '@/components/display/FcEmpty.vue'
import enUS from '@/locales/en-US'
import zhCN from '@/locales/zh-CN'

function factory(props: Record<string, unknown> = {}, locale = 'zh-CN') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  })
  return mount(FcEmpty, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('FcEmpty — i18n fallbacks', () => {
  it('falls back to emptyState.empty for default type when no title prop (zh-CN)', () => {
    const wrapper = factory({}, 'zh-CN')
    const title = wrapper.find('.fc-empty__title')
    expect(title.text()).not.toBe('emptyState.empty')
    expect(title.text()).toBeTruthy()
  })

  it('falls back to emptyState.empty for default type when no title prop (en-US)', () => {
    const wrapper = factory({}, 'en-US')
    const title = wrapper.find('.fc-empty__title')
    expect(title.text()).not.toBe('emptyState.empty')
    expect(title.text()).toBeTruthy()
  })

  it('uses explicit title prop when provided', () => {
    const wrapper = factory({ title: 'Custom Empty' })
    const title = wrapper.find('.fc-empty__title')
    expect(title.text()).toBe('Custom Empty')
  })

  it('falls back to emptyState.empty for unknown type', () => {
    const wrapper = factory({ type: 'search' })
    const title = wrapper.find('.fc-empty__title')
    // Should not show raw key
    expect(title.text()).not.toBe('emptyState.search')
    expect(title.text()).toBeTruthy()
  })
})
