import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Plugin Editor — sort_order fallback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('uses sort_order ?? 1 (not ?? 0) when loading plugin data', () => {
    // PRODUCT.md: sort_order range is 1-9999; 0 is out of range
    expect(src).toContain('sort_order: r.sort_order ?? 1')
  })

  it('does not use sort_order ?? 0', () => {
    expect(src).not.toContain('sort_order ?? 0')
  })
})
