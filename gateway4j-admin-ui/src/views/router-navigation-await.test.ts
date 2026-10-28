import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'

describe('Router navigation — await usage', () => {
  it('Login.vue awaits router.push after login', () => {
    const source = readFileSync('src/views/auth/Login.vue', 'utf-8')
    // Inside try/catch, router.push should be awaited
    expect(source).toContain('await router.push')
  })

  it('plugins/Editor.vue awaits router.push after save', () => {
    const source = readFileSync('src/views/plugins/Editor.vue', 'utf-8')
    expect(source).toContain('await router.push')
  })

  it('routes/Editor.vue awaits router.replace after create', () => {
    const source = readFileSync('src/views/routes/Editor.vue', 'utf-8')
    expect(source).toContain('await router.replace')
  })
})
