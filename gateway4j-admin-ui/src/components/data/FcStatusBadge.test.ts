import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FcStatusBadge from '@/components/data/FcStatusBadge.vue'

describe('FcStatusBadge — props', () => {
  it('renders label text via :label prop', () => {
    const wrapper = mount(FcStatusBadge, { props: { label: 'Healthy', tone: 'success' } })
    expect(wrapper.text()).toContain('Healthy')
  })

  it('renders label text via default slot', () => {
    const wrapper = mount(FcStatusBadge, {
      props: { tone: 'error' },
      slots: { default: 'Failed' },
    })
    expect(wrapper.text()).toContain('Failed')
  })

  it('applies tone-success CSS class for tone="success"', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'success' } })
    expect(wrapper.find('.tone-success').exists()).toBe(true)
  })

  it('applies tone-error CSS class for tone="error"', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'error' } })
    expect(wrapper.find('.tone-error').exists()).toBe(true)
  })

  it('applies tone-neutral CSS class for tone="neutral"', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'neutral' } })
    expect(wrapper.find('.tone-neutral').exists()).toBe(true)
  })

  it('applies tone-pending CSS class for tone="pending"', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'pending' } })
    expect(wrapper.find('.tone-pending').exists()).toBe(true)
  })

  it('applies tone-processing CSS class for tone="processing"', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'processing' } })
    expect(wrapper.find('.tone-processing').exists()).toBe(true)
  })

  it('shows dot when dot=true', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'success', dot: true } })
    expect(wrapper.find('.fc-status-badge__dot').exists()).toBe(true)
  })

  it('auto-shows dot for tone=processing', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'processing' } })
    expect(wrapper.find('.has-dot').exists()).toBe(true)
  })

  it('does NOT show dot for tone=success by default', () => {
    const wrapper = mount(FcStatusBadge, { props: { tone: 'success' } })
    expect(wrapper.find('.has-dot').exists()).toBe(false)
  })

  it('ignores unknown :status prop (not a real prop)', () => {
    // The old :status prop should have no effect — only :tone works
    const wrapper = mount(FcStatusBadge, {
      props: { tone: 'success', label: 'OK' },
      attrs: { status: 'gray' },
    })
    // Should still use tone=success, not the attr "status"
    expect(wrapper.find('.tone-success').exists()).toBe(true)
    expect(wrapper.find('.tone-neutral').exists()).toBe(false)
  })

  it('ignores unknown :text prop (not a real prop)', () => {
    // The old :text prop should have no effect — only :label works
    const wrapper = mount(FcStatusBadge, {
      props: { tone: 'success', label: 'OK' },
      attrs: { text: 'Ignored' },
    })
    expect(wrapper.text()).toContain('OK')
    expect(wrapper.text()).not.toContain('Ignored')
  })
})
