import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Login — input maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Login.vue'), 'utf-8')

  it('username input has maxlength', () => {
    // gw_user.username VARCHAR(50)
    expect(src).toMatch(/form\.username.*maxlength/)
  })
})
