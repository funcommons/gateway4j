import { describe, it, expect } from 'vitest'
import { deepMerge } from '@/utils'

describe('utils/deepMerge — array behavior', () => {
  it('arrays in source REPLACE arrays in target (not merged element-wise)', () => {
    // JSON-roundtrip behavior: arrays don't deep-merge, they replace
    const a = { items: [1, 2, 3] }
    const b = { items: [4, 5] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ items: [4, 5] })
  })

  it('arrays in target are dropped when source has different array', () => {
    const a = { tags: ['x', 'y', 'z'] }
    const b = { tags: ['w'] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ tags: ['w'] })
  })

  it('array in source but not target — added', () => {
    const a = { name: 'foo' }
    const b = { tags: ['a', 'b'] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ name: 'foo', tags: ['a', 'b'] })
  })

  it('array in target but not source — preserved', () => {
    const a = { tags: ['a', 'b'] }
    const b = { name: 'foo' }
    const result = deepMerge(a, b)
    expect(result).toEqual({ tags: ['a', 'b'], name: 'foo' })
  })

  it('nested object inside array — replaced (not deep-merged)', () => {
    const a = { items: [{ id: 1, name: 'old' }] }
    const b = { items: [{ id: 2, name: 'new' }] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ items: [{ id: 2, name: 'new' }] })
  })

  it('empty array in source REPLACES non-empty array in target', () => {
    const a = { items: [1, 2, 3] }
    const b = { items: [] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ items: [] })
  })

  it('array of primitives survives', () => {
    const a = { nums: [1, 2, 3] }
    const b = { nums: [4, 5, 6] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ nums: [4, 5, 6] })
  })
})

describe('utils/deepMerge — type conflicts (array vs object)', () => {
  it('object in target, array in source — source wins (replaces)', () => {
    const a = { data: { x: 1 } }
    const b = { data: [1, 2] }
    const result = deepMerge(a, b)
    expect(result).toEqual({ data: [1, 2] })
  })

  it('array in target, object in source — source wins (replaces)', () => {
    const a = { data: [1, 2, 3] }
    const b = { data: { x: 1 } }
    const result = deepMerge(a, b)
    expect(result).toEqual({ data: { x: 1 } })
  })

  it('string in target, object in source — source wins', () => {
    const a = { x: 'hello' }
    const b = { x: { nested: true } }
    const result = deepMerge(a, b)
    expect(result).toEqual({ x: { nested: true } })
  })

  it('null in target, object in source — source wins', () => {
    const a = { x: null }
    const b = { x: { nested: true } }
    const result = deepMerge(a, b)
    expect(result).toEqual({ x: { nested: true } })
  })
})

describe('utils/deepMerge — undefined handling', () => {
  it('undefined values in source are skipped (target preserved)', () => {
    const a = { x: 1, y: 2 }
    const b = { x: undefined, y: 3 } as any
    const result = deepMerge(a, b)
    // undefined in source: target value preserved for x, y overridden
    expect(result).toEqual({ x: 1, y: 3 })
  })

  it('undefined values in target are replaced by source', () => {
    const a = { x: undefined, y: 2 } as any
    const b = { x: 1, y: 3 }
    const result = deepMerge(a, b)
    expect(result).toEqual({ x: 1, y: 3 })
  })
})

describe('utils/deepMerge — does not mutate inputs', () => {
  it('source object is not mutated', () => {
    const a = { x: 1, y: { z: 2 } }
    const b = { y: { w: 3 } }
    const aSnapshot = JSON.parse(JSON.stringify(a))
    const bSnapshot = JSON.parse(JSON.stringify(b))
    deepMerge(a, b)
    expect(a).toEqual(aSnapshot)
    expect(b).toEqual(bSnapshot)
  })

  it('returns a new top-level reference (not a or b)', () => {
    const a = { x: 1 }
    const b = { y: 2 }
    const result = deepMerge(a, b)
    expect(result).not.toBe(a)
    expect(result).not.toBe(b)
  })
})
