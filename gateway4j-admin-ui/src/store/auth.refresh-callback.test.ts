import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'auth.ts'), 'utf-8')

describe('auth.ts — token refresh callback references store correctly', () => {
  it('setOnTokenRefresh callback uses useAuthStore() to get store instance', () => {
    // The callback passed to setOnTokenRefresh runs at 401 error time, not at
    // module load time. It must call useAuthStore() to get the store instance
    // rather than referencing a bare `auth` variable that doesn't exist at
    // module scope.
    // Check the full source for useAuthStore usage within the callback
    const afterSetOnTokenRefresh = source.substring(source.indexOf('setOnTokenRefresh'))
    expect(afterSetOnTokenRefresh).toMatch(/useAuthStore\(\)/)
  })
})
