import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDate, logger } from '@/utils'

describe('formatDate — edge cases', () => {
  it('handles Date(0) — 1970-01-01 in local time', () => {
    const d = new Date(0)
    expect(formatDate(d)).toMatch(/^1970-01-01 \d{2}:\d{2}$/)
  })

  it('handles negative timestamp (pre-1970 dates)', () => {
    // -86400000 = one day before epoch
    const result = formatDate(-86400000)
    expect(result).toMatch(/^1969-12-31 \d{2}:\d{2}$/)
  })

  it('handles far-future date', () => {
    const ts = new Date(2099, 11, 31, 23, 59).getTime()
    expect(formatDate(ts)).toBe('2099-12-31 23:59')
  })

  it('accepts ISO string with timezone offset', () => {
    const result = formatDate('2026-07-19T08:00:00+08:00')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('handles Date object input', () => {
    const d = new Date(2026, 0, 1, 0, 0)
    expect(formatDate(d)).toBe('2026-01-01 00:00')
  })

  it('zero-pads single-digit values correctly', () => {
    const d = new Date(2026, 0, 5, 3, 7)
    expect(formatDate(d)).toBe('2026-01-05 03:07')
  })

  it('handles end-of-year (Dec 31 23:59)', () => {
    const d = new Date(2026, 11, 31, 23, 59)
    expect(formatDate(d)).toBe('2026-12-31 23:59')
  })

  it('handles leap year (Feb 29)', () => {
    const d = new Date(2024, 1, 29, 12, 0)
    expect(formatDate(d)).toBe('2024-02-29 12:00')
  })
})

describe('logger', () => {
  let infoSpy: any
  let warnSpy: any
  let errorSpy: any
  let debugSpy: any

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('logger.info delegates to console.info with [gw] prefix', () => {
    logger.info('hello')
    expect(infoSpy).toHaveBeenCalledWith('[gw]', 'hello')
  })

  it('logger.warn delegates to console.warn with [gw] prefix', () => {
    logger.warn('careful')
    expect(warnSpy).toHaveBeenCalledWith('[gw]', 'careful')
  })

  it('logger.error delegates to console.error with [gw] prefix', () => {
    logger.error('boom', { code: 500 })
    expect(errorSpy).toHaveBeenCalledWith('[gw]', 'boom', { code: 500 })
  })

  it('logger.debug delegates to console.debug with [gw] prefix', () => {
    logger.debug('detail')
    expect(debugSpy).toHaveBeenCalledWith('[gw]', 'detail')
  })

  it('logger handles zero args gracefully (no crash)', () => {
    expect(() => logger.info()).not.toThrow()
    expect(() => logger.warn()).not.toThrow()
    expect(() => logger.error()).not.toThrow()
    expect(() => logger.debug()).not.toThrow()
  })

  it('logger handles non-string args (object, number, error)', () => {
    logger.info({ a: 1 })
    expect(infoSpy).toHaveBeenCalledWith('[gw]', { a: 1 })
    logger.info(42)
    expect(infoSpy).toHaveBeenCalledWith('[gw]', 42)
    logger.info(new Error('oops'))
    expect(infoSpy).toHaveBeenCalledWith('[gw]', expect.any(Error))
  })
})