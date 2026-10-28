import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../composables/index.ts'), 'utf-8')

// Extract the useBodyScrollLock function body
const fnMatch = source.match(/export function useBodyScrollLock[\s\S]*?\n\}/)
const fnBody = fnMatch ? fnMatch[0] : ''

describe('useBodyScrollLock — must watch reactive lock value', () => {
  it('watches the lock parameter to react to changes', () => {
    // useBodyScrollLock is called with a computed(() => innerOpen.value) in FcDialog.
    // If the function only reads the boolean once (imperative if/else) instead of
    // watching the ref, the body stays locked forever after the dialog closes.
    // The function MUST contain a watch() call on the lock parameter.
    expect(fnBody).toContain('watch(')
  })

  it('clears overflow when lock becomes false', () => {
    // When the watched value becomes false, body.style.overflow must be cleared
    // so the page becomes scrollable again after the dialog closes.
    expect(fnBody).toMatch(/overflow\s*=\s*['"]/)
  })

  it('accepts a Ref<boolean> or computed parameter (not just boolean)', () => {
    // The function signature must accept Ref<boolean> | ComputedRef<boolean> | boolean
    // so it can watch the reactive value. A plain boolean parameter is a bug.
    const paramMatch = fnBody.match(/useBodyScrollLock\(([^)]*)\)/)
    expect(paramMatch).toBeTruthy()
    const param = paramMatch![1].trim()
    // Must be a type that includes Ref — not just `boolean`
    expect(param).not.toBe('lock: boolean')
  })
})
