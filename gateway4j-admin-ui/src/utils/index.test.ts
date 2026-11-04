import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle, formatDate, deepMerge, deepClone, resolveIcon, logger } from '@/utils'

describe('utils/debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('defers call until delay elapses', () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)
    d('a')
    d('b')
    d('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('cancels previous timer on each call (last-call-wins)', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('x')
    vi.advanceTimersByTime(50)
    d('y')
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledWith('y')
  })

  it('forwards multiple args', () => {
    const fn = vi.fn()
    const d = debounce(fn, 50)
    d(1, 2, 3)
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledWith(1, 2, 3)
  })
})

describe('utils/throttle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires immediately on first call', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('drops calls within the throttle window', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a')
    t('b')
    t('c')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('allows another call after the window elapses', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a')
    vi.advanceTimersByTime(100)
    t('b')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')
  })
})

describe('utils/formatDate', () => {
  it('formats a Date instance as YYYY-MM-DD HH:mm', () => {
    const d = new Date(2026, 6, 19, 8, 5) // 2026-07-19 08:05
    expect(formatDate(d)).toBe('2026-07-19 08:05')
  })

  it('accepts a number timestamp', () => {
    const d = new Date(2026, 0, 1, 0, 0)
    expect(formatDate(d.getTime())).toBe('2026-01-01 00:00')
  })

  it('accepts an ISO string', () => {
    expect(formatDate('2026-07-19T09:30:00Z').startsWith('2026-07-1')).toBe(true)
  })

  it('zero-pads single-digit month, day, hour, minute', () => {
    const d = new Date(2026, 2, 4, 7, 8)
    expect(formatDate(d)).toBe('2026-03-04 07:08')
  })
})

describe('utils/deepMerge', () => {
  it('merges flat objects with right-precedence', () => {
    const a = { x: 1, y: 2 }
    const b = { y: 99, z: 3 }
    expect(deepMerge(a, b)).toEqual({ x: 1, y: 99, z: 3 })
  })

  it('deep-merges nested objects', () => {
    const a: { config: Record<string, unknown> } = { config: { host: 'h1', port: 80 } }
    const b = { config: { port: 8080, tls: true } }
    expect(deepMerge(a, b)).toEqual({
      config: { host: 'h1', port: 8080, tls: true }
    })
  })

  it('does not mutate the source objects', () => {
    const a: { config: Record<string, unknown> } = { config: { host: 'h1' } }
    const b = { config: { port: 8080 } }
    const merged: any = deepMerge(a, b)
    merged.config.host = 'mutated'
    expect(a.config.host).toBe('h1')
  })

  it('returns source if patch is undefined-like', () => {
    const a = { x: 1 }
    expect(deepMerge(a, undefined as any)).toEqual({ x: 1 })
  })
})

describe('utils/deepClone', () => {
  it('produces a structurally identical but distinct object', () => {
    const a = { x: { y: [1, 2, { z: 3 }] } }
    const c = deepClone(a)
    expect(c).toEqual(a)
    expect(c).not.toBe(a)
    expect(c.x).not.toBe(a.x)
    expect(c.x.y).not.toBe(a.x.y)
  })

  it('round-trips through JSON cleanly', () => {
    const a = { list: [{ id: 1, name: 'a' }, { id: 2 }] }
    const c = deepClone(a)
    expect(c.list[0].name).toBe('a')
    expect(c.list[1].id).toBe(2)
  })
})

describe('utils/resolveIcon', () => {
  it('returns null (icons not registered in this project)', () => {
    expect(resolveIcon('whatever')).toBeNull()
  })
})

describe('utils/logger', () => {
  it('exposes info / warn / error / debug methods', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('prefixes messages with [gw]', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('hello')
    expect(spy).toHaveBeenCalledWith('[gw]', 'hello')
    spy.mockRestore()
  })
})