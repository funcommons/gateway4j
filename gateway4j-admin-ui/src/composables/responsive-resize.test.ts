import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useResponsive } from '@/composables'

describe('useResponsive — reactive resize', () => {
  const originalWidth = 1280
  const originalHeight = 800

  function setSize(w: number, h: number) {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
    window.dispatchEvent(new Event('resize'))
  }

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true })
  })

  it('static call: returns current dimensions', () => {
    setSize(500, 400)
    const r = useResponsive()
    expect(r.width.value).toBe(500)
    expect(r.height.value).toBe(400)
    expect(r.isMobile.value).toBe(true)
  })

  it('BREAKING POINT: switch from desktop to mobile updates breakpoints', () => {
    setSize(1280, 800)
    const r = useResponsive()
    expect(r.isDesktop.value).toBe(true)
    expect(r.isMobile.value).toBe(false)
    setSize(500, 800)
    expect(r.width.value).toBe(500)
    expect(r.isMobile.value).toBe(true)
    expect(r.isDesktop.value).toBe(false)
  })

  it('BREAKING POINT: switch from mobile to desktop updates breakpoints', () => {
    setSize(500, 800)
    const r = useResponsive()
    expect(r.isMobile.value).toBe(true)
    setSize(1280, 800)
    expect(r.isDesktop.value).toBe(true)
    expect(r.isMobile.value).toBe(false)
  })

  it('crosses mobile/tablet boundary at 768', () => {
    setSize(767, 800)
    const r = useResponsive()
    expect(r.isMobile.value).toBe(true)
    expect(r.isTablet.value).toBe(false)
    setSize(768, 800)
    expect(r.isMobile.value).toBe(false)
    expect(r.isTablet.value).toBe(true)
  })

  it('crosses tablet/desktop boundary at 1024', () => {
    setSize(1023, 800)
    const r = useResponsive()
    expect(r.isTablet.value).toBe(true)
    setSize(1024, 800)
    expect(r.isTablet.value).toBe(false)
    expect(r.isDesktop.value).toBe(true)
  })

  it('only one of mobile/tablet/desktop is true at any time', () => {
    for (const w of [320, 500, 767, 768, 1023, 1024, 1280, 2000]) {
      setSize(w, 800)
      const r = useResponsive()
      const trueCount = [r.isMobile.value, r.isTablet.value, r.isDesktop.value].filter(Boolean).length
      expect(trueCount, `at width ${w}: ${trueCount} flags were true`).toBe(1)
    }
  })

  it('height updates on vertical resize', () => {
    setSize(1024, 600)
    const r = useResponsive()
    expect(r.height.value).toBe(600)
    setSize(1024, 900)
    expect(r.height.value).toBe(900)
  })
})

describe('useResponsive — multiple instances do not interfere', () => {
  const originalWidth = 1280

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  })

  it('two independent calls share the same window state', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    const a = useResponsive()
    const b = useResponsive()
    expect(a.width.value).toBe(500)
    expect(b.width.value).toBe(500)
    expect(a.isMobile.value).toBe(true)
    expect(b.isMobile.value).toBe(true)
  })
})
