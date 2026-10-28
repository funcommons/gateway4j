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

describe('useRecentImages — storageKey edge cases', () => {
  it('handles empty storageKey (default)', () => {
    const r = useRecentImages('')
    r.add('a')
    expect(localStorageMock.getItem('')).toBe(JSON.stringify(['a']))
  })

  it('handles storageKey with special characters', () => {
    const r = useRecentImages('ns:with/colon?and&symbols')
    r.add('a')
    expect(localStorageMock.getItem('ns:with/colon?and&symbols')).toBe(JSON.stringify(['a']))
  })

  it('handles storageKey with unicode characters', () => {
    const r = useRecentImages('命名空间:最近图片')
    r.add('a')
    expect(localStorageMock.getItem('命名空间:最近图片')).toBe(JSON.stringify(['a']))
  })

  it('handles very long storageKey', () => {
    const longKey = 'a'.repeat(1000)
    const r = useRecentImages(longKey)
    r.add('x')
    expect(localStorageMock.getItem(longKey)).toBe(JSON.stringify(['x']))
  })

  it('two instances with different keys do not interfere', () => {
    const a = useRecentImages('a')
    const b = useRecentImages('b')
    a.add('url-1')
    b.add('url-2')
    a.add('url-3')
    expect(a.images.value).toEqual(['url-3', 'url-1'])
    expect(b.images.value).toEqual(['url-2'])
    // Cross-instance reads via separate key
    expect(localStorageMock.getItem('a')).toBe(JSON.stringify(['url-3', 'url-1']))
    expect(localStorageMock.getItem('b')).toBe(JSON.stringify(['url-2']))
  })

  it('re-creating instance with same key reads from localStorage (hydration)', () => {
    localStorageMock.setItem('shared', JSON.stringify(['persisted-1']))
    const a = useRecentImages('shared')
    expect(a.images.value).toEqual(['persisted-1'])
    // Add to it
    a.add('persisted-2')
    // Re-create — should see both
    const b = useRecentImages('shared')
    expect(b.images.value).toEqual(['persisted-2', 'persisted-1'])
  })
})

describe('useRecentImages — add edge cases', () => {
  it(`add empty string is a no-op (invalid URL)`, () => {
    const r = useRecentImages('add1')
    r.add('')
    expect(r.images.value).toEqual([])
  })

  it('add() of duplicate URL moves it to head (not duplicate)', () => {
    const r = useRecentImages('dup1')
    r.add('a')
    r.add('b')
    r.add('a')
    expect(r.images.value).toEqual(['a', 'b'])
  })

  it('add() of the same URL many times keeps it as single entry', () => {
    const r = useRecentImages('dup2')
    for (let i = 0; i < 100; i++) r.add('same')
    expect(r.images.value).toEqual(['same'])
  })
})

describe('useRecentImages — remove edge cases', () => {
  it('remove() of empty string is a no-op', () => {
    const r = useRecentImages('rm1')
    r.add('a')
    r.remove('')
    expect(r.images.value).toEqual(['a'])
  })

  it('remove() of URL not in list is a no-op (no localStorage write)', () => {
    const r = useRecentImages('rm2')
    r.add('a')
    r.remove('z')
    // localStorage should not be written again
    const before = localStorageMock.getItem('rm2')
    r.remove('z')
    const after = localStorageMock.getItem('rm2')
    expect(before).toBe(after)
  })
})