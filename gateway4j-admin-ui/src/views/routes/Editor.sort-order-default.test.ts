import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Route Editor — sort_order default', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('EMPTY_BASIC defaults sort_order to 1 (within valid range 1-9999)', () => {
    expect(src).toMatch(/sort_order:\s*1/)
    expect(src).not.toMatch(/sort_order:\s*0/)
  })
})
