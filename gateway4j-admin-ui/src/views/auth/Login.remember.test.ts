import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Login.vue'), 'utf-8')

describe('Login — Remember Me', () => {
  it('has a remember-me checkbox', () => {
    expect(source).toMatch(/remember/)
  })

  it('passes remember preference to auth store doLogin', () => {
    expect(source).toMatch(/doLogin.*remember|remember.*doLogin/)
  })
})
