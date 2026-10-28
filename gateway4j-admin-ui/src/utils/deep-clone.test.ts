import { describe, it, expect } from 'vitest'
import { deepClone } from '@/utils'

describe('utils/deepClone', () => {
  it('returns a new reference for the top-level value', () => {
    const a = { x: 1 }
    const b = deepClone(a)
    expect(b).not.toBe(a)
    expect(b).toEqual(a)
  })

  it('deep-clones nested objects (no shared references)', () => {
    const inner = { y: 2 }
    const a = { x: inner }
    const b = deepClone(a)
    expect(b.x).not.toBe(inner)
    expect(b.x).toEqual(inner)
  })

  it('deep-clones arrays (no shared array reference)', () => {
    const arr = [{ k: 1 }, { k: 2 }]
    const a = { list: arr }
    const b = deepClone(a)
    expect(b.list).not.toBe(arr)
    expect(b.list[0]).not.toBe(arr[0])
    expect(b.list).toEqual(arr)
  })

  it('mutating the clone does not affect the source', () => {
    const a = { x: { y: 1 } }
    const b = deepClone(a)
    b.x.y = 999
    expect(a.x.y).toBe(1)
  })

  it('handles primitives unchanged', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('hello')).toBe('hello')
    expect(deepClone(null)).toBeNull()
    expect(deepClone(undefined)).toBeUndefined()
    expect(deepClone(true)).toBe(true)
  })

  it('handles Date by serializing (date becomes string)', () => {
    // Note: current impl uses JSON.parse(JSON.stringify(...)) which serializes
    // Date to ISO string. This is documented behavior, not a bug.
    const d = new Date('2026-01-01T00:00:00Z')
    const c = deepClone(d) as any
    expect(c).not.toBeInstanceOf(Date)
    expect(c).toBe('2026-01-01T00:00:00.000Z')
  })

  it('drops functions (JSON serialization behavior)', () => {
    const a = { fn: () => 'hello', x: 1 }
    const b = deepClone(a) as any
    expect(b.fn).toBeUndefined()
    expect(b.x).toBe(1)
  })

  it('drops undefined values in objects', () => {
    const a = { x: 1, y: undefined }
    const b = deepClone(a)
    expect(b).toEqual({ x: 1 })
  })

  it('handles circular references by throwing (JSON limitation)', () => {
    const a: any = { x: 1 }
    a.self = a
    expect(() => deepClone(a)).toThrow()
  })

  it('clones Map (loses Map-ness, becomes plain object)', () => {
    const m = new Map<string, number>([['a', 1], ['b', 2]])
    const c = deepClone(m) as any
    // Maps don't survive JSON round-trip; becomes empty object
    expect(c).toEqual({})
  })

  it('clones Set (loses Set-ness, becomes empty)', () => {
    const s = new Set([1, 2, 3])
    const c = deepClone(s) as any
    expect(c).toEqual({})
  })

  it('preserves null values in nested objects', () => {
    const a = { x: null, y: { z: null } }
    const b = deepClone(a)
    expect(b).toEqual(a)
    expect(b.x).toBeNull()
    expect(b.y.z).toBeNull()
  })
})