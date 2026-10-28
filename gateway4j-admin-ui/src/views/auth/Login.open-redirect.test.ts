import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Login.vue'), 'utf-8')

describe('Login.vue — redirect validation', () => {
  it('validates redirect query param to prevent open redirect', () => {
    // The redirect from route.query.redirect is passed directly to router.push()
    // without validation. An attacker could craft /login?redirect=https://evil.com
    // to redirect the user after login. The redirect must be validated to be
    // a relative/internal path.
    const submitFn = source.match(/async function submit\(\)[\s\S]*?^}/m)
    expect(submitFn).toBeTruthy()
    // Should have some validation of the redirect value (e.g., starts with /)
    expect(submitFn![0]).toMatch(/redirect.*startsWith|startsWith.*redirect|isExternal|isValidRedirect/)
  })
})
