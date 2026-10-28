import { describe, it, expect, beforeEach } from 'vitest'
import { useRecentImages } from '@/composables'

const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
  localStorageMock.clear()
})

describe('useRecentImages — snapshot isolation', () => {
  it('getAll() returns a new array (not the internal ref)', () => {
    const r = useRecentImages('snap1')
    r.add('a')
    const snap = r.getAll()
    expect(snap).not.toBe(r.images.value)
  })

  it('mutating getAll() result does not affect internal state', () => {
    const r = useRecentImages('snap2')
    r.add('a')
    r.add('b')
    const snap = r.getAll()
    snap.push('mutated')
    snap.length = 0
    expect(r.images.value).toEqual(['b', 'a'])
  })

  it('mutating getAll() result does not affect localStorage', () => {
    const r = useRecentImages('snap3')
    r.add('a')
    r.add('b')
    const snap = r.getAll()
    snap.length = 0
    expect(localStorageMock.getItem('snap3')).toBe(JSON.stringify(['b', 'a']))
  })

  it('two consecutive getAll() calls return different array instances', () => {
    const r = useRecentImages('snap4')
    r.add('a')
    const a = r.getAll()
    const b = r.getAll()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('add after getAll does not affect previously-returned snapshot', () => {
    const r = useRecentImages('snap5')
    r.add('first')
    const snap = r.getAll()
    expect(snap).toEqual(['first'])
    r.add('second')
    expect(snap).toEqual(['first']) // snap is decoupled
    expect(r.images.value).toEqual(['second', 'first'])
  })
})

describe('useRecentImages — large lists', () => {
  it('handles 50 entries without losing order', () => {
    const r = useRecentImages('large1')
    for (let i = 0; i < 50; i++) {
      r.add(`url-${i}`)
    }
    // head-inserted: most recent (49) first
    expect(r.images.value[0]).toBe('url-49')
    expect(r.images.value.length).toBe(50)
  })

  it('deduplicates 50 inserts of the same url to 1 entry', () => {
    const r = useRecentImages('large2')
    for (let i = 0; i < 50; i++) {
      r.add('same')
    }
    expect(r.images.value).toEqual(['same'])
  })
})