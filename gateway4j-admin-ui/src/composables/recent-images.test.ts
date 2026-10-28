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

describe('useRecentImages — basic API', () => {
  it('exposes images ref + add/remove/clear/getAll', () => {
    const r = useRecentImages('test:recent')
    expect(r).toHaveProperty('images')
    expect(Array.isArray(r.images.value)).toBe(true)
    expect(typeof r.add).toBe('function')
    expect(typeof r.remove).toBe('function')
    expect(typeof r.clear).toBe('function')
    expect(typeof r.getAll).toBe('function')
  })

  it('starts with empty list (no localStorage entry)', () => {
    const r = useRecentImages('test:empty')
    expect(r.images.value).toEqual([])
    expect(r.getAll()).toEqual([])
  })
})

describe('useRecentImages — add', () => {
  it('add(url) appends a new url to the list', () => {
    const r = useRecentImages('test:add')
    r.add('https://cdn/a.png')
    expect(r.images.value).toEqual(['https://cdn/a.png'])
  })

  it('add(url) deduplicates (moves existing to top, no duplicate)', () => {
    const r = useRecentImages('test:dedup')
    r.add('a')
    r.add('b')
    r.add('a')
    expect(r.images.value).toEqual(['a', 'b'])
  })

  it('add persists to localStorage as JSON array', () => {
    const r = useRecentImages('test:persist')
    r.add('https://cdn/x.png')
    const stored = localStorageMock.getItem('test:persist')
    expect(stored).toBe(JSON.stringify(['https://cdn/x.png']))
  })

  it('read from localStorage on construction (hydration)', () => {
    localStorageMock.setItem('test:hydrate', JSON.stringify(['x', 'y']))
    const r = useRecentImages('test:hydrate')
    expect(r.images.value).toEqual(['x', 'y'])
  })

  it('ignores malformed localStorage JSON', () => {
    localStorageMock.setItem('test:bad', '{not valid')
    const r = useRecentImages('test:bad')
    expect(r.images.value).toEqual([])
  })

  it('ignores non-array localStorage payloads', () => {
    localStorageMock.setItem('test:notarray', JSON.stringify({ a: 1 }))
    const r = useRecentImages('test:notarray')
    expect(r.images.value).toEqual([])
  })
})

describe('useRecentImages — remove', () => {
  it('remove(url) deletes the url from the list', () => {
    const r = useRecentImages('test:rm')
    r.add('a')
    r.add('b')
    r.add('c')
    r.remove('b')
    // adds are head-inserted: ['c', 'b', 'a']; remove 'b' → ['c', 'a']
    expect(r.images.value).toEqual(['c', 'a'])
  })

  it('remove(unknown-url) is a no-op', () => {
    const r = useRecentImages('test:rmnoop')
    r.add('a')
    r.remove('zzz')
    expect(r.images.value).toEqual(['a'])
  })

  it('remove persists updated state to localStorage', () => {
    const r = useRecentImages('test:rmpersist')
    r.add('a')
    r.add('b')
    r.remove('a')
    expect(JSON.parse(localStorageMock.getItem('test:rmpersist')!)).toEqual(['b'])
  })
})

describe('useRecentImages — clear / getAll', () => {
  it('clear() empties the list', () => {
    const r = useRecentImages('test:clear')
    r.add('a')
    r.add('b')
    r.clear()
    expect(r.images.value).toEqual([])
  })

  it('clear() also wipes localStorage entry', () => {
    const r = useRecentImages('test:clearstore')
    r.add('a')
    r.clear()
    expect(localStorageMock.getItem('test:clearstore')).toBeNull()
  })

  it('getAll() returns a snapshot of the current list', () => {
    const r = useRecentImages('test:getall')
    r.add('a')
    r.add('b')
    const snap = r.getAll()
    // head-inserted: ['b', 'a']
    expect(snap).toEqual(['b', 'a'])
    r.add('c')
    expect(snap).toEqual(['b', 'a']) // snapshot is decoupled
  })
})

describe('useRecentImages — key isolation', () => {
  it('different storageKeys keep separate lists', () => {
    const a = useRecentImages('ns:a')
    const b = useRecentImages('ns:b')
    a.add('a-only')
    b.add('b-only')
    expect(a.images.value).toEqual(['a-only'])
    expect(b.images.value).toEqual(['b-only'])
  })
})