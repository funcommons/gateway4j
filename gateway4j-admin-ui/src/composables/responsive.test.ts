import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useResponsive, useEventListener, useDocumentVisibility } from '@/composables'

describe('useResponsive — SSR fallback', () => {
  const originalWindow = (globalThis as any).window
  const originalInnerWidth = 1280
  const originalInnerHeight = 800

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('returns safe defaults when window is undefined (SSR)', async () => {
    // Simulate SSR by removing window
    const w = (globalThis as any).window
    delete (globalThis as any).window
    try {
      // Re-import the function so it captures the current env
      vi.resetModules()
      const { useResponsive: useRespFresh } = await import('@/composables')
      const r = useRespFresh()
      expect(r.width.value).toBe(0)
      expect(r.height.value).toBe(0)
      expect(r.isMobile.value).toBe(false)
      expect(r.isTablet.value).toBe(false)
      expect(r.isDesktop.value).toBe(true)
    } finally {
      ;(globalThis as any).window = w
    }
  })

  it('isDesktop=true is the safe SSR default (renders desktop layout)', async () => {
    const w = (globalThis as any).window
    delete (globalThis as any).window
    try {
      vi.resetModules()
      const { useResponsive: useRespFresh } = await import('@/composables')
      const r = useRespFresh()
      expect(r.isDesktop.value).toBe(true)
    } finally {
      ;(globalThis as any).window = w
    }
  })
})

describe('useEventListener — no-op when element is missing addEventListener', () => {
  it('does not throw for null', () => {
    expect(() => useEventListener(null, 'click', () => {})).not.toThrow()
  })

  it('does not throw for undefined', () => {
    expect(() => useEventListener(undefined, 'click', () => {})).not.toThrow()
  })

  it('does not throw for object literal without addEventListener', () => {
    expect(() => useEventListener({}, 'click', () => {})).not.toThrow()
  })

  it('does not throw for primitive values', () => {
    expect(() => useEventListener(42 as any, 'click', () => {})).not.toThrow()
    expect(() => useEventListener('el' as any, 'click', () => {})).not.toThrow()
    expect(() => useEventListener(true as any, 'click', () => {})).not.toThrow()
  })
})

describe('useDocumentVisibility — fallback when document is missing', () => {
  it('returns true when document is undefined (SSR safe default)', async () => {
    const d = (globalThis as any).document
    delete (globalThis as any).document
    try {
      vi.resetModules()
      const { useDocumentVisibility: useDvFresh } = await import('@/composables')
      expect(useDvFresh()).toBe(true)
    } finally {
      ;(globalThis as any).document = d
    }
  })
})