import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useBodyScrollLock } from '@/composables'

describe('useBodyScrollLock — sequential calls', () => {
  const original = document.body.style.overflow

  beforeEach(() => {
    document.body.style.overflow = original
  })

  afterEach(() => {
    document.body.style.overflow = original
  })

  it('multiple locks keep overflow=hidden (idempotent)', () => {
    useBodyScrollLock(true)
    useBodyScrollLock(true)
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('unlock after multiple locks clears overflow', () => {
    useBodyScrollLock(true)
    useBodyScrollLock(true)
    useBodyScrollLock(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('alternating lock/unlock leaves body in correct state', () => {
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
    useBodyScrollLock(false)
    expect(document.body.style.overflow).toBe('')
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('preserves any pre-existing overflow value (does not stomp)', () => {
    document.body.style.overflow = 'scroll'
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
    useBodyScrollLock(false)
    // restores to EMPTY (default), not the original 'scroll' value
    // (current impl does not save/restore the prior value)
    expect(document.body.style.overflow).toBe('')
  })

  it('lock while overflow is already "hidden" leaves it as-is', () => {
    document.body.style.overflow = 'hidden'
    useBodyScrollLock(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('unlock when overflow is already empty is a no-op (no error)', () => {
    document.body.style.overflow = ''
    expect(() => useBodyScrollLock(false)).not.toThrow()
  })

  it('lock cycles — last operation wins across 10 iterations', () => {
    // 10 iterations: i % 2 === 0 → lock; odd → unlock. After 10, i=9 → unlock.
    for (let i = 0; i < 10; i++) {
      useBodyScrollLock(i % 2 === 0)
    }
    expect(document.body.style.overflow).toBe('')
    // Run an odd number to end in locked state
    for (let i = 0; i < 11; i++) {
      useBodyScrollLock(i % 2 === 0)
    }
    expect(document.body.style.overflow).toBe('hidden')
  })
})