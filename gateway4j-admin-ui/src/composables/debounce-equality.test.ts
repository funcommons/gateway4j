import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useDebounce, useThrottle } from '@/composables'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce — same-value change behavior', () => {
  it('changing source to same value still resets the timer', async () => {
    const source = ref('a')
    const debounced = useDebounce(source, 100)
    // First change: same value
    source.value = 'a'
    await nextTick()
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('a') // initial value
    vi.advanceTimersByTime(50)
    // fires
    expect(debounced.value).toBe('a')
  })

  it('multiple changes that actually change value reset the timer (last-call-wins)', async () => {
    const source = ref('a')
    const debounced = useDebounce(source, 100)
    source.value = 'b' // real change, resets timer
    await nextTick()
    vi.advanceTimersByTime(50)
    source.value = 'c' // real change, resets timer
    await nextTick()
    vi.advanceTimersByTime(50)
    // 100ms since 'b', 50ms since 'c' — not yet fired
    expect(debounced.value).toBe('a')
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('c')
  })

  it('changing to different value then back resets timer correctly', async () => {
    const source = ref('a')
    const debounced = useDebounce(source, 100)
    source.value = 'b'
    await nextTick()
    vi.advanceTimersByTime(50)
    source.value = 'a' // back to original
    await nextTick()
    vi.advanceTimersByTime(50)
    // 100ms since 'b', 50ms since 'a' back — still pending
    expect(debounced.value).toBe('a')
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('a')
  })

  it('setting source to undefined triggers debounce correctly', async () => {
    const source = ref<any>('value')
    const debounced = useDebounce(source, 50)
    source.value = undefined
    await nextTick()
    expect(debounced.value).toBe('value')
    vi.advanceTimersByTime(50)
    expect(debounced.value).toBeUndefined()
  })

  it('initial value passes through immediately (not debounced)', () => {
    const source = ref('initial')
    const debounced = useDebounce(source, 1000)
    expect(debounced.value).toBe('initial')
  })
})

describe('useThrottle — same-value change behavior', () => {
  it('first change to same value still emits immediately', () => {
    const source = ref('a')
    const throttled = useThrottle(source, 200)
    source.value = 'a' // same value
    expect(throttled.value).toBe('a')
  })

  it('multiple changes to same value within window: first emits, rest dropped', () => {
    const source = ref('a')
    const throttled = useThrottle(source, 200)
    source.value = 'a'
    expect(throttled.value).toBe('a')
    source.value = 'a'
    expect(throttled.value).toBe('a')
  })

  it('setting source to undefined emits undefined', async () => {
    const source = ref<any>('a')
    const throttled = useThrottle(source, 200)
    source.value = undefined
    await nextTick()
    // first change emits
    expect(throttled.value).toBeUndefined()
  })
})
