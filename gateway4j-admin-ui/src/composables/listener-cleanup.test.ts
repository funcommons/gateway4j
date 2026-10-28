import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useEventListener, useResponsive, useBodyScrollLock } from '@/composables'

describe('useEventListener — unmount cleanup', () => {
  it('removes listener on component unmount', () => {
    const el = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    const cb = () => {}
    const Comp = defineComponent({
      setup() {
        useEventListener(el as any, 'click', cb)
        return () => h('div')
      }
    })
    const wrapper = mount(Comp)
    expect(el.addEventListener).toHaveBeenCalledWith('click', cb)
    expect(el.removeEventListener).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(el.removeEventListener).toHaveBeenCalledWith('click', cb)
  })
})

describe('useEventListener — case sensitivity', () => {
  it('preserves event name as-is (does not lowercase)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'Click', () => {})
    expect(el.addEventListener).toHaveBeenCalledWith('Click', expect.any(Function))
  })

  it('supports event names with dots and colons (custom events)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'my:custom.event', () => {})
    expect(el.addEventListener).toHaveBeenCalledWith('my:custom.event', expect.any(Function))
  })

  it('supports empty event name (no-op for the addEventListener call)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, '', () => {})
    expect(el.addEventListener).toHaveBeenCalledWith('', expect.any(Function))
  })
})

describe('useResponsive — unmount cleanup', () => {
  let addSpy: any
  let removeSpy: any

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('removes resize listener on unmount', () => {
    const Comp = defineComponent({
      setup() {
        useResponsive()
        return () => h('div')
      }
    })
    const wrapper = mount(Comp)
    const addCalls = addSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    expect(addCalls).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
    const removeCalls = removeSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    expect(removeCalls).toBeGreaterThanOrEqual(1)
  })

  it('multiple consumer components each register and clean up independently', () => {
    const Comp = defineComponent({
      setup() {
        useResponsive()
        return () => h('div')
      }
    })
    const a = mount(Comp)
    const b = mount(Comp)
    const c = mount(Comp)
    const beforeUnmount = addSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    expect(beforeUnmount).toBe(3)
    a.unmount()
    b.unmount()
    c.unmount()
    const afterUnmount = removeSpy.mock.calls.filter((c: any[]) => c[0] === 'resize').length
    expect(afterUnmount).toBe(3)
  })
})

describe('useBodyScrollLock — SSR fallback', () => {
  it('does not throw when document is undefined (SSR)', () => {
    const d = (globalThis as any).document
    delete (globalThis as any).document
    try {
      expect(() => useBodyScrollLock(true)).not.toThrow()
      expect(() => useBodyScrollLock(false)).not.toThrow()
    } finally {
      ;(globalThis as any).document = d
    }
  })
})
