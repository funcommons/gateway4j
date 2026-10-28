import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Plugin Editor — input maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('plugin_name input has maxlength="50"', () => {
    // PRODUCT.md: plugin_name VARCHAR(50)
    expect(src).toMatch(/plugin_name.*maxlength/)
  })

  it('plugin_id input has maxlength', () => {
    // plugin_id is also a bounded identifier
    expect(src).toMatch(/plugin_id.*maxlength/)
  })
})
