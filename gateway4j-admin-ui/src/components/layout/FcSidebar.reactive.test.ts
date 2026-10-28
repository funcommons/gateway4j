import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { mount } from '@vue/test-utils'
import { useResponsive } from '@/composables'

function setSize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

const originalWidth = 1280
const originalHeight = 800

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true })
})

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true })
})

// Simulate a component that consumes isMobile — the pattern FcSidebar uses.
const Comp = defineComponent({
  setup() {
    const { isMobile } = useResponsive()
    return { isMobile }
  },
  template: '<div class="indicator">{{ isMobile ? "mobile" : "desktop" }}</div>'
})

describe('useResponsive consumer pattern (FcSidebar-style)', () => {
  it('starts in desktop state at 1280px', () => {
    setSize(1280, 800)
    const wrapper = mount(Comp)
    expect(wrapper.find('.indicator').text()).toBe('desktop')
  })

  it('switches to mobile when window shrinks below 768', async () => {
    setSize(1280, 800)
    const wrapper = mount(Comp)
    expect(wrapper.find('.indicator').text()).toBe('desktop')
    setSize(500, 800)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.indicator').text()).toBe('mobile')
  })

  it('switches back to desktop when window grows above 1024', async () => {
    setSize(500, 800)
    const wrapper = mount(Comp)
    expect(wrapper.find('.indicator').text()).toBe('mobile')
    setSize(1280, 800)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.indicator').text()).toBe('desktop')
  })

  it('crosses 768 boundary both ways', async () => {
    setSize(800, 800)
    const wrapper = mount(Comp)
    expect(wrapper.find('.indicator').text()).toBe('desktop') // 800 → tablet but not mobile; template uses isMobile only
    setSize(767, 800)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.indicator').text()).toBe('mobile')
    setSize(800, 800)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.indicator').text()).toBe('desktop')
  })

  it('multiple consumer components all react to the same resize event', async () => {
    setSize(1280, 800)
    const a = mount(Comp)
    const b = mount(Comp)
    expect(a.find('.indicator').text()).toBe('desktop')
    expect(b.find('.indicator').text()).toBe('desktop')
    setSize(500, 800)
    await a.vm.$nextTick()
    await b.vm.$nextTick()
    expect(a.find('.indicator').text()).toBe('mobile')
    expect(b.find('.indicator').text()).toBe('mobile')
  })

  it('clean up resize listener on unmount (no leak)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    setSize(1280, 800)
    const wrapper = mount(Comp)
    const addCallsBefore = addSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    wrapper.unmount()
    const removeCalls = removeSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    expect(removeCalls).toBeGreaterThanOrEqual(1)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})