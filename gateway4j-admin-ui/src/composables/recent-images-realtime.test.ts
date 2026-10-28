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

describe('useRecentImages — getAll() real-time behavior', () => {
  it('getAll() reflects adds after call (live snapshot)', () => {
    const r = useRecentImages('live1')
    expect(r.getAll()).toEqual([])
    r.add('a')
    expect(r.getAll()).toEqual(['a'])
    r.add('b')
    expect(r.getAll()).toEqual(['b', 'a'])
  })

  it('getAll() reflects removes', () => {
    const r = useRecentImages('live2')
    r.add('a')
    r.add('b')
    r.add('c')
    r.remove('b')
    expect(r.getAll()).toEqual(['c', 'a'])
  })

  it('images ref and getAll() stay in sync', () => {
    const r = useRecentImages('sync1')
    r.add('a')
    r.add('b')
    expect(r.images.value).toEqual(r.getAll())
    r.add('c')
    expect(r.images.value).toEqual(r.getAll())
    r.remove('a')
    expect(r.images.value).toEqual(r.getAll())
  })

  it('interleaved add + getAll + remove keeps invariants', () => {
    const r = useRecentImages('inter1')
    r.add('a')
    expect(r.getAll()).toEqual(['a'])
    r.add('b')
    expect(r.getAll()).toEqual(['b', 'a'])
    r.remove('b')
    expect(r.getAll()).toEqual(['a'])
    r.add('c')
    expect(r.getAll()).toEqual(['c', 'a'])
  })
})

describe('useRecentImages — clear() behavior', () => {
  it('clear() makes getAll() return []', () => {
    const r = useRecentImages('clr1')
    r.add('a')
    r.add('b')
    r.clear()
    expect(r.getAll()).toEqual([])
  })

  it('clear() then add() works (state recovery)', () => {
    const r = useRecentImages('clr2')
    r.add('a')
    r.clear()
    r.add('b')
    expect(r.getAll()).toEqual(['b'])
  })

  it('clear() on empty list is a no-op (no error)', () => {
    const r = useRecentImages('clr3')
    expect(() => r.clear()).not.toThrow()
    expect(r.getAll()).toEqual([])
  })
})

describe('useRecentImages — localStorage sync', () => {
  it('add() updates localStorage immediately (eager write)', () => {
    const r = useRecentImages('sync2')
    r.add('a')
    expect(localStorageMock.getItem('sync2')).toBe(JSON.stringify(['a']))
  })

  it('multiple adds update localStorage each time (no batching)', () => {
    const r = useRecentImages('sync3')
    r.add('a')
    expect(localStorageMock.getItem('sync3')).toBe(JSON.stringify(['a']))
    r.add('b')
    expect(localStorageMock.getItem('sync3')).toBe(JSON.stringify(['b', 'a']))
    r.add('c')
    expect(localStorageMock.getItem('sync3')).toBe(JSON.stringify(['c', 'b', 'a']))
  })

  it('remove() updates localStorage immediately', () => {
    const r = useRecentImages('sync4')
    r.add('a')
    r.add('b')
    r.remove('a')
    expect(localStorageMock.getItem('sync4')).toBe(JSON.stringify(['b']))
  })

  it('clear() removes localStorage key', () => {
    const r = useRecentImages('sync5')
    r.add('a')
    expect(localStorageMock.getItem('sync5')).toBeTruthy()
    r.clear()
    expect(localStorageMock.getItem('sync5')).toBeNull()
  })
})
