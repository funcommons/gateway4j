import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useDebounce, useThrottle } from '@/composables'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce', () => {
  it('returns a Ref that updates after the delay elapses', async () => {
    const source = ref('initial')
    const debounced = useDebounce(source, 200)
    expect(debounced.value).toBe('initial')
    source.value = 'next'
    await nextTick()
    vi.advanceTimersByTime(199)
    expect(debounced.value).toBe('initial')
    vi.advanceTimersByTime(1)
    expect(debounced.value).toBe('next')
  })

  it('last-call-wins: rapid changes only emit the final value', async () => {
    const source = ref('a')
    const debounced = useDebounce(source, 100)
    source.value = 'b'
    await nextTick()
    vi.advanceTimersByTime(50)
    source.value = 'c'
    await nextTick()
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('a')
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('c')
  })

  it('uses default 200ms delay when none specified', async () => {
    const source = ref(1)
    const debounced = useDebounce(source)
    source.value = 2
    await nextTick()
    vi.advanceTimersByTime(199)
    expect(debounced.value).toBe(1)
    vi.advanceTimersByTime(1)
    expect(debounced.value).toBe(2)
  })

  it('preserves non-string types (numbers, objects)', async () => {
    const obj1 = { x: 1 }
    const obj2 = { x: 2 }
    const source = ref(obj1)
    const debounced = useDebounce(source, 50)
    source.value = obj2
    await nextTick()
    vi.advanceTimersByTime(50)
    expect(debounced.value).toEqual(obj2)
  })
})

describe('useThrottle', () => {
  it('emits the first value immediately', () => {
    const source = ref('a')
    const throttled = useThrottle(source, 200)
    expect(throttled.value).toBe('a')
  })

  it('drops subsequent changes within the throttle window (first change emits, then throttled)', async () => {
    const source = ref('a')
    const throttled = useThrottle(source, 200)
    source.value = 'b'
    await nextTick()
    expect(throttled.value).toBe('b') // first change emits immediately
    source.value = 'c'
    await nextTick()
    expect(throttled.value).toBe('b') // second change within window: dropped
    vi.advanceTimersByTime(50)
    expect(throttled.value).toBe('b') // still 'b' until trailing timer fires
  })

  it('emits the trailing value after the window elapses', async () => {
    const source = ref('a')
    const throttled = useThrottle(source, 200)
    source.value = 'b'
    await nextTick()
    vi.advanceTimersByTime(200)
    expect(throttled.value).toBe('b')
  })

  it('uses default 200ms delay when none specified', async () => {
    const source = ref(1)
    const throttled = useThrottle(source)
    source.value = 2
    await nextTick()
    expect(throttled.value).toBe(2) // first change emits immediately
    source.value = 3
    await nextTick()
    expect(throttled.value).toBe(2) // second change within window: dropped
    vi.advanceTimersByTime(200)
    expect(throttled.value).toBe(3) // trailing emit after window
  })
})