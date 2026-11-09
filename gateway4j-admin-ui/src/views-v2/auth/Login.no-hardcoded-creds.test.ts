import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Login.vue'), 'utf-8')

describe('Login.vue — no hardcoded credentials', () => {
  it('form username defaults to empty string, not a hardcoded value', () => {
    // Hardcoded default credentials (e.g. admin/admin123) in the login form
    // expose default credentials to anyone who visits the login page.
    // The form should default to empty strings so the user must type their
    // own credentials.
    expect(source).not.toMatch(/username:\s*['"][^'"]+['"]/)
    expect(source).toMatch(/username:\s*['"]["']/)
  })

  it('form password defaults to empty string', () => {
    expect(source).not.toMatch(/password:\s*['"][^'"]+['"]/)
    expect(source).toMatch(/password:\s*['"]["']/)
  })
})
