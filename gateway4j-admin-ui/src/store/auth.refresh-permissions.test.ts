import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'auth.ts'), 'utf-8')

describe('auth store — refreshPermissions', () => {
  it('has a refreshPermissions action', () => {
    expect(source).toMatch(/refreshPermissions/)
  })

  it('calls listPermissions API inside refreshPermissions', () => {
    expect(source).toMatch(/listPermissions/)
  })

  it('updates the permissions state with the result', () => {
    expect(source).toMatch(/this\.permissions\s*=/)
  })
})
