import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('http.ts — no hardcoded Chinese fallback messages', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'http.ts'), 'utf-8')

  it('has no hardcoded Chinese in BusinessError fallback', () => {
    expect(src).not.toMatch(/业务失败/)
    expect(src).not.toMatch(/请求失败/)
  })

  it('uses English fallback messages', () => {
    expect(src).toMatch(/Business error/)
    expect(src).toMatch(/Request failed/)
  })
})
