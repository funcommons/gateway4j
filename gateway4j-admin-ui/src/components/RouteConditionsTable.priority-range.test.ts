import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteConditionsTable — priority range validation', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteConditionsTable.vue'), 'utf-8')

  it('defaults priority to 1 (within valid range 1-999)', () => {
    expect(src).toMatch(/priority:\s*1/)
    expect(src).not.toMatch(/priority:\s*0/)
  })

  it('uses el-input-number with min=1 and max=999 for priority', () => {
    expect(src).toMatch(/el-input-number/)
    expect(src).toMatch(/:min="1"/)
    expect(src).toMatch(/:max="999"/)
  })
})
