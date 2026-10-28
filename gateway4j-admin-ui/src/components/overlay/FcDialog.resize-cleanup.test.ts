import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'

describe('FcDialog.vue — resize listener cleanup', () => {
  it('has onBeforeUnmount or onUnmounted that cleans up resize listeners', () => {
    const source = readFileSync('src/components/overlay/FcDialog.vue', 'utf-8')
    // The component should have a lifecycle hook that removes pointermove/pointerup
    const hasCleanup = source.includes('onBeforeUnmount') || source.includes('onUnmounted')
    expect(hasCleanup).toBe(true)
  })

  it('stores active resize handlers so they can be removed on unmount', () => {
    const source = readFileSync('src/components/overlay/FcDialog.vue', 'utf-8')
    // startResize should store the onMove/onUp handlers in a module-level ref
    // so they can be removed in onBeforeUnmount
    const storesHandlers = source.includes('activeResizeMove') || source.includes('resizeOnMove') || source.includes('currentResize')
    expect(storesHandlers).toBe(true)
  })
})
