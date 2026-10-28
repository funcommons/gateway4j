import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebounce, useThrottle } from '@/composables'

beforeEach(() => {
  vi.useFakeTimers()
})

describe('useDebounce — cleanup', () => {
  it('returned ref is reactive to source changes', async () => {
    const Comp = defineComponent({
      setup() {
        const source = ref('initial')
        const debounced = useDebounce(source, 100)
        return { source, debounced }
      },
      template: '<div />'
    })
    const wrapper = mount(Comp)
    const vm = wrapper.vm as any
    // Vue auto-unwraps refs in setup return
    expect(vm.debounced).toBe('initial')
    vm.source = 'a'
    await nextTick()
    vi.advanceTimersByTime(100)
    expect(vm.debounced).toBe('a')
  })

  it('does not crash if component is unmounted while pending', async () => {
    const Comp = defineComponent({
      setup() {
        const source = ref('a')
        useDebounce(source, 100)
        return { source }
      },
      template: '<div />'
    })
    const wrapper = mount(Comp)
    const vm = wrapper.vm as any
    vm.source = 'b'
    await nextTick()
    // Unmount while debounce timer is pending
    wrapper.unmount()
    vi.advanceTimersByTime(100)
    // No crash, no assertion needed beyond "didn't throw"
    expect(true).toBe(true)
  })
})

describe('useThrottle — cleanup', () => {
  it('first change emits immediately', async () => {
    const Comp = defineComponent({
      setup() {
        const source = ref('a')
        const throttled = useThrottle(source, 200)
        return { source, throttled }
      },
      template: '<div />'
    })
    const wrapper = mount(Comp)
    const vm = wrapper.vm as any
    // Vue auto-unwraps refs in setup return, so vm.throttled is the value
    expect(vm.throttled).toBe('a')
  })

  it('emits trailing value after window elapses', async () => {
    const Comp = defineComponent({
      setup() {
        const source = ref('a')
        const throttled = useThrottle(source, 200)
        return { source, throttled }
      },
      template: '<div />'
    })
    const wrapper = mount(Comp)
    const vm = wrapper.vm as any
    expect(vm.throttled).toBe('a')
    // First change: emits immediately (leading edge)
    vm.source = 'b'
    await nextTick()
    expect(vm.throttled).toBe('b')
    // Second change within window: dropped
    vm.source = 'c'
    await nextTick()
    expect(vm.throttled).toBe('b')
    // After window elapses: trailing emit
    vi.advanceTimersByTime(200)
    expect(vm.throttled).toBe('c')
  })

  it('does not crash if component is unmounted while throttle pending', async () => {
    const Comp = defineComponent({
      setup() {
        const source = ref('a')
        useThrottle(source, 200)
        return { source }
      },
      template: '<div />'
    })
    const wrapper = mount(Comp)
    const vm = wrapper.vm as any
    vm.source = 'b'
    await nextTick()
    // Unmount while throttle trailing timer is pending
    wrapper.unmount()
    vi.advanceTimersByTime(200)
    expect(true).toBe(true)
  })
})
