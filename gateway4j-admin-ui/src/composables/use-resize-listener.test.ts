import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useResize, useEventListener } from '@/composables'

describe('useResize — boundary', () => {
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

  it('adds the resize listener with the callback ref passed', () => {
    const cb = vi.fn()
    useResize(cb)
    expect(addSpy).toHaveBeenCalledWith('resize', cb)
  })

  it('stop() removes the exact same callback (referential equality)', () => {
    const cb = vi.fn()
    const { stop } = useResize(cb)
    stop()
    expect(removeSpy).toHaveBeenCalledWith('resize', cb)
  })

  it('stop() called multiple times only removes once per call (idempotent)', () => {
    const cb = vi.fn()
    const { stop } = useResize(cb)
    stop()
    stop()
    stop()
    expect(removeSpy).toHaveBeenCalledTimes(3)
  })

  it('different instances do not interfere with each other', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const a = useResize(cb1)
    const b = useResize(cb2)
    expect(addSpy).toHaveBeenCalledWith('resize', cb1)
    expect(addSpy).toHaveBeenCalledWith('resize', cb2)
    a.stop()
    expect(removeSpy).toHaveBeenCalledWith('resize', cb1)
    // b's listener is still active
    expect(removeSpy).not.toHaveBeenCalledWith('resize', cb2)
    b.stop()
    expect(removeSpy).toHaveBeenCalledWith('resize', cb2)
  })

  it('works with the same callback registered twice (independent subscriptions)', () => {
    const cb = vi.fn()
    const a = useResize(cb)
    const b = useResize(cb)
    // add called twice with same callback (different subscription objects)
    expect(addSpy.mock.calls.filter((c: any[]) => c[1] === cb).length).toBe(2)
    a.stop()
    b.stop()
    expect(removeSpy.mock.calls.filter((c: any[]) => c[1] === cb).length).toBe(2)
  })
})

describe('useEventListener — boundary', () => {
  it('returns undefined (no stop method)', () => {
    const el = { addEventListener: vi.fn() }
    const result = useEventListener(el as any, 'click', () => {})
    expect(result).toBeUndefined()
  })

  it('does not detach the listener (fire-and-forget API)', () => {
    const removeFn = vi.fn()
    const el = { addEventListener: vi.fn(), removeEventListener: removeFn }
    useEventListener(el as any, 'click', () => {})
    // removeListener not called by the hook itself
    expect(removeFn).not.toHaveBeenCalled()
  })

  it('attaches to multiple event types independently', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'click', () => {})
    useEventListener(el as any, 'hover', () => {})
    useEventListener(el as any, 'focus', () => {})
    expect(el.addEventListener).toHaveBeenCalledTimes(3)
  })

  it('attaches to multiple elements independently', () => {
    const el1 = { addEventListener: vi.fn() }
    const el2 = { addEventListener: vi.fn() }
    useEventListener(el1 as any, 'click', () => {})
    useEventListener(el2 as any, 'click', () => {})
    expect(el1.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    expect(el2.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
  })
})
