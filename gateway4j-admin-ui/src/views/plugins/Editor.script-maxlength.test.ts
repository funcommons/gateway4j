import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Plugin Editor — script_content maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('script_content textarea has maxlength matching 64KB limit', () => {
    // PRODUCT.md: Groovy script ≤ 64KB
    expect(src).toContain('maxlength="65536"')
  })
})
