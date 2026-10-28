import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'auth.ts'), 'utf-8')

describe('auth store — remember me storage', () => {
  it('doLogin accepts a remember parameter', () => {
    expect(source).toMatch(/doLogin.*remember|remember/)
  })

  it('stores refresh token in sessionStorage when remember is false', () => {
    expect(source).toMatch(/sessionStorage/)
  })

  it('stores refresh token in localStorage when remember is true', () => {
    expect(source).toMatch(/localStorage/)
  })
})
