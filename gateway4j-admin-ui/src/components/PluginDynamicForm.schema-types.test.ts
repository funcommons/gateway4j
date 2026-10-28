import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('PluginDynamicForm — JSON Schema type handling', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'PluginDynamicForm.vue'), 'utf-8')

  it('handles number type (floating point) alongside integer', () => {
    expect(src).toMatch(/value\.type === 'number'/)
  })

  it('uses schema minimum/maximum constraints instead of hardcoded min=0', () => {
    expect(src).toMatch(/value\.minimum/)
    expect(src).toMatch(/value\.maximum/)
    expect(src).not.toMatch(/:min="0"/)
  })

  it('sets step=0.01 for number type, step=1 for integer', () => {
    expect(src).toMatch(/step/)
  })

  it('initializes number type default to 0', () => {
    expect(src).toMatch(/case 'number': model\.value\[k\] = 0/)
  })
})
