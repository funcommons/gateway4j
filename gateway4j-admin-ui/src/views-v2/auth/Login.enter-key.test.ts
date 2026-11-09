import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Login.vue — template uses .prevent on @keydown.enter', () => {
  it('has @keydown.enter.prevent (not just @keydown.enter)', () => {
    const source = readFileSync('src/views-v2/auth/Login.vue', 'utf-8')
    // Should contain the .prevent modifier on keydown.enter
    expect(source).toContain('@keydown.enter.prevent')
    // Should NOT contain the bare @keydown.enter without .prevent
    expect(source).not.toMatch(/@keydown\.enter(?!\.)/)
  })
})
