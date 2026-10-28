import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FcSectionCard from '@/components/display/FcSectionCard.vue'

describe('FcSectionCard — #footer slot', () => {
  it('renders #default slot content (regression: still works)', () => {
    const wrapper = mount(FcSectionCard, {
      slots: { default: '<p class="body-content">BODY</p>' }
    })
    expect(wrapper.find('.body-content').exists()).toBe(true)
    expect(wrapper.text()).toContain('BODY')
  })

  it('renders #footer slot content when provided', () => {
    const wrapper = mount(FcSectionCard, {
      slots: {
        default: '<p class="body">BODY</p>',
        footer: '<button class="footer-btn">SAVE</button>'
      }
    })
    expect(wrapper.find('.footer-btn').exists()).toBe(true)
    expect(wrapper.text()).toContain('SAVE')
  })

  it('does NOT throw when #footer slot is omitted', () => {
    expect(() => {
      mount(FcSectionCard, {
        slots: { default: '<p>BODY</p>' }
      })
    }).not.toThrow()
  })

  it('footer slot is rendered AFTER the body slot in DOM order', () => {
    const wrapper = mount(FcSectionCard, {
      slots: {
        default: '<p class="body">BODY</p>',
        footer: '<button class="footer-btn">SAVE</button>'
      }
    })
    const body = wrapper.find('.body')
    const footer = wrapper.find('.footer-btn')
    expect(body.exists()).toBe(true)
    expect(footer.exists()).toBe(true)
    // body should appear before footer in DOM
    const bodyIdx = wrapper.html().indexOf('BODY')
    const footerIdx = wrapper.html().indexOf('SAVE')
    expect(bodyIdx).toBeGreaterThan(-1)
    expect(footerIdx).toBeGreaterThan(-1)
    expect(bodyIdx).toBeLessThan(footerIdx)
  })

  it('footer slot preserves complex children (e.g. multiple buttons)', () => {
    const wrapper = mount(FcSectionCard, {
      slots: {
        default: '<p>BODY</p>',
        footer: '<button class="cancel">CANCEL</button><button class="save">SAVE</button>'
      }
    })
    expect(wrapper.find('.cancel').exists()).toBe(true)
    expect(wrapper.find('.save').exists()).toBe(true)
    expect(wrapper.text()).toContain('CANCEL')
    expect(wrapper.text()).toContain('SAVE')
  })

  it('footer slot content is INSIDE the section element (not orphaned)', () => {
    const wrapper = mount(FcSectionCard, {
      slots: {
        default: '<p class="body">BODY</p>',
        footer: '<button class="footer-btn">SAVE</button>'
      }
    })
    const section = wrapper.find('section')
    expect(section.exists()).toBe(true)
    // footer should be a descendant of the section
    expect(section.find('.footer-btn').exists()).toBe(true)
  })
})
