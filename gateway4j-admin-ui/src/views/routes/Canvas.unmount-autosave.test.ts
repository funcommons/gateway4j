import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — onUnmounted auto-save safety', () => {
  it('does NOT call doAutoSave in onUnmounted (fire-and-forget is unsafe)', () => {
    // doAutoSave is async and onUnmounted is synchronous. Calling doAutoSave
    // without await means the save promise may never resolve before the
    // component is destroyed — silently losing user data on failure.
    const unmountedFn = source.match(/onUnmounted\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)/)
    expect(unmountedFn).toBeTruthy()
    expect(unmountedFn![0]).not.toMatch(/doAutoSave/)
  })

  it('has onBeforeRouteLeave guard for unsaved canvas changes', () => {
    expect(source).toMatch(/onBeforeRouteLeave/)
  })

  it('imports onBeforeRouteLeave from vue-router', () => {
    const importLine = source.match(/import\s*\{[^}]*onBeforeRouteLeave[^}]*\}\s*from\s*['"]([^'"]+)['"]/)?.[1]
    expect(importLine).toBe('vue-router')
  })

  it('onBeforeRouteLeave checks dirty flag', () => {
    const guardFn = source.match(/onBeforeRouteLeave\(\s*(?:async\s*)?\(\)\s*=>\s*\{[\s\S]*?\}\s*\)/)
    expect(guardFn).toBeTruthy()
    expect(guardFn![0]).toMatch(/dirty/)
  })
})
