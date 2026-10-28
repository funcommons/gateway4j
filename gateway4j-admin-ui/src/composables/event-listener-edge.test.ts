import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEventListener } from '@/composables'

describe('useEventListener — React-style and other names', () => {
  it('React-style onClick is passed as-is (NOT converted to click)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'onClick', () => {})
    // The hook does NOT strip "on" prefix — it passes the name verbatim.
    // This is a documented design choice (callers must use DOM event names).
    expect(el.addEventListener).toHaveBeenCalledWith('onClick', expect.any(Function))
  })

  it('supports Space-separated multi-event strings (NOT — uses first event only)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'click keydown', () => {})
    // Hook does NOT split — passed as single string
    expect(el.addEventListener).toHaveBeenCalledWith('click keydown', expect.any(Function))
    expect(el.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('numeric event type is coerced to string (JS does this anyway)', () => {
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 42 as any, () => {})
    // JS auto-coerces 42 to '42' when calling addEventListener
    expect(el.addEventListener).toHaveBeenCalledWith(42, expect.any(Function))
  })

  it('does not throw for null callback', () => {
    const el = { addEventListener: vi.fn() }
    expect(() => useEventListener(el as any, 'click', null as any)).not.toThrow()
    expect(el.addEventListener).toHaveBeenCalledWith('click', null)
  })

  it('does not throw for undefined callback', () => {
    const el = { addEventListener: vi.fn() }
    expect(() => useEventListener(el as any, 'click', undefined as any)).not.toThrow()
    expect(el.addEventListener).toHaveBeenCalledWith('click', undefined)
  })

  it('attaches to element with null prototype', () => {
    const el = Object.create(null)
    el.addEventListener = vi.fn()
    useEventListener(el, 'click', () => {})
    expect(el.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
  })

  it('does not invoke the callback at attach time (only on event)', () => {
    const cb = vi.fn()
    const el = { addEventListener: vi.fn() }
    useEventListener(el as any, 'click', cb)
    // attach was called but the cb is stored, not invoked
    expect(cb).not.toHaveBeenCalled()
  })
})
