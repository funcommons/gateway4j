import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useDebounce, useThrottle } from '@/composables'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce — type support', () => {
  it('debounces boolean values', async () => {
    const source = ref(false)
    const debounced = useDebounce(source, 100)
    source.value = true
    await nextTick()
    expect(debounced.value).toBe(false)
    vi.advanceTimersByTime(100)
    expect(debounced.value).toBe(true)
  })

  it('debounces object values (deep equal)', async () => {
    const obj1 = { x: 1 }
    const obj2 = { x: 2 }
    const source = ref(obj1)
    const debounced = useDebounce(source, 50)
    source.value = obj2
    await nextTick()
    expect(debounced.value).toEqual(obj1)
    vi.advanceTimersByTime(50)
    expect(debounced.value).toEqual(obj2)
  })

  it('debounces array values', async () => {
    const arr1 = [1, 2, 3]
    const arr2 = [4, 5]
    const source = ref(arr1)
    const debounced = useDebounce(source, 50)
    source.value = arr2
    await nextTick()
    expect(debounced.value).toEqual([1, 2, 3])
    vi.advanceTimersByTime(50)
    expect(debounced.value).toEqual([4, 5])
  })

  it('debounces null', async () => {
    const source = ref<any>('value')
    const debounced = useDebounce(source, 50)
    source.value = null
    await nextTick()
    expect(debounced.value).toBe('value')
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe(null)
  })

  it('debounces 0 (falsy number)', async () => {
    const source = ref(1)
    const debounced = useDebounce(source, 50)
    source.value = 0
    await nextTick()
    expect(debounced.value).toBe(1)
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe(0)
  })

  it('keeps initial value when source is never changed', async () => {
    const source = ref('initial')
    const debounced = useDebounce(source, 100)
    vi.advanceTimersByTime(1000)
    expect(debounced.value).toBe('initial')
  })

  it('resets timer on each new change (last-call-wins)', async () => {
    const source = ref('a')
    const debounced = useDebounce(source, 100)
    source.value = 'b'
    await nextTick()
    vi.advanceTimersByTime(50)
    source.value = 'c'
    await nextTick()
    vi.advanceTimersByTime(50)
    // 100ms since 'b', 50ms since 'c' — not yet fired
    expect(debounced.value).toBe('a')
    vi.advanceTimersByTime(50)
    // 100ms since 'c' — fires
    expect(debounced.value).toBe('c')
  })
})

describe('useThrottle — type support', () => {
  it('throttles boolean values', async () => {
    const source = ref(false)
    const throttled = useThrottle(source, 200)
    source.value = true
    await nextTick()
    expect(throttled.value).toBe(true)
  })

  it('throttles object values (deep equal)', async () => {
    const obj1 = { x: 1 }
    const obj2 = { x: 2 }
    const source = ref(obj1)
    const throttled = useThrottle(source, 200)
    source.value = obj2
    await nextTick()
    expect(throttled.value).toEqual(obj2)
  })

  it('keeps initial value when source is never changed', () => {
    const source = ref(42)
    const throttled = useThrottle(source, 200)
    expect(throttled.value).toBe(42)
  })
})
