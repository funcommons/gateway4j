import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'index.ts'), 'utf-8')

describe('router permission guard — no infinite redirect', () => {
  it('permission-denial aborts navigation instead of redirecting', () => {
    // When a user lacks a permission, the guard must NOT redirect to another
    // route (which could also be permission-gated, causing an infinite loop).
    // Instead, it should return false to abort the navigation and show a
    // warning message. This is better than redirecting to Login because the
    // user is already logged in — sending them to Login is confusing.
    const permGuardMatch = source.match(/!auth\.permissions\.some[\s\S]*?return\s*(false|\{[^}]+\})/)
    expect(permGuardMatch).toBeTruthy()
    expect(permGuardMatch![1].trim()).toBe('false')
  })
})
