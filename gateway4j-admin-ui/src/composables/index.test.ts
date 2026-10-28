import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useResize,
  useEventListener,
  useDocumentVisibility,
  useResponsive,
  useBodyScrollLock
} from '@/composables'

describe('useResponsive', () => {
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight

  function setWindow(w: number, h: number) {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
  }

  afterEach(() => {
    setWindow(originalInnerWidth, originalInnerHeight)
  })

  it('flags isMobile=true for width < 768', () => {
    setWindow(500, 600)
    const r = useResponsive()
    expect(r.isMobile.value).toBe(true)
    expect(r.isTablet.value).toBe(false)
    expect(r.isDesktop.value).toBe(false)
    expect(r.width.value).toBe(500)
    expect(r.height.value).toBe(600)
  })

  it('flags isTablet=true for width 768..1023', () => {
    setWindow(800, 600)
    const r = useResponsive()
    expect(r.isMobile.value).toBe(false)
    expect(r.isTablet.value).toBe(true)
    expect(r.isDesktop.value).toBe(false)
  })

  it('flags isDesktop=true for width >= 1024', () => {
    setWindow(1280, 800)
    const r = useResponsive()
    expect(r.isMobile.value).toBe(false)
    expect(r.isTablet.value).toBe(false)
    expect(r.isDesktop.value).toBe(true)
  })

  it('treats exactly 768 as tablet (boundary)', () => {
    setWindow(768, 600)
    const r = useResponsive()
    expect(r.isTablet.value).toBe(true)
    expect(r.isDesktop.value).toBe(false)
  })

  it('treats exactly 1024 as desktop (boundary)', () => {
    setWindow(1024, 600)
    const r = useResponsive()
    expect(r.isTablet.value).toBe(false)
    expect(r.isDesktop.value).toBe(true)
  })
})

describe('useResize', () => {
  it('subscribes to window resize and returns a stopper', () => {
    const cb = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { stop } = useResize(cb)
    expect(addSpy).toHaveBeenCalledWith('resize', cb)
    stop()
    expect(removeSpy).toHaveBeenCalledWith('resize', cb)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

describe('useEventListener', () => {
  it('attaches the handler to the given element', () => {
    const el = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const cb = vi.fn()
    useEventListener(el as any, 'click', cb)
    expect(el.addEventListener).toHaveBeenCalledWith('click', cb)
  })

  it('no-ops when the element lacks addEventListener', () => {
    const el = {}
    expect(() => useEventListener(el as any, 'click', vi.fn())).not.toThrow()
  })

  it('no-ops when the element is null/undefined', () => {
    expect(() => useEventListener(null, 'click', vi.fn())).not.toThrow()
    expect(() => useEventListener(undefined, 'click', vi.fn())).not.toThrow()
  })
})

describe('useDocumentVisibility', () => {
  it('reflects document.visibilityState', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(useDocumentVisibility()).toBe(true)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    expect(useDocumentVisibility()).toBe(false)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})

describe('useBodyScrollLock', () => {
  const original = document.body.style.overflow

  afterEach(() => {
    document.body.style.overflow = original
  })

  it('lock=true sets body.overflow=hidden', () => {
    document.body.style.overflow = 'auto'
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('lock=false clears body.overflow (back to default)', () => {
    document.body.style.overflow = 'hidden'
    useBodyScrollLock(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('is idempotent — locking twice keeps overflow=hidden', () => {
    useBodyScrollLock(true)
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
  })
})