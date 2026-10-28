import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBasicForm — sort_order range validation', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBasicForm.vue'), 'utf-8')

  it('has a sort_order validation rule with min: 1', () => {
    expect(src).toMatch(/sort_order:\s*\[/)
    expect(src).toMatch(/min:\s*1/)
  })

  it('has a sort_order validation rule with max: 9999', () => {
    expect(src).toMatch(/max:\s*9999/)
  })

  it('sort_order rule uses type number', () => {
    expect(src).toMatch(/type:\s*'number'/)
  })
})
