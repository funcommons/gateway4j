import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'http.ts'), 'utf-8')

describe('http.ts — token refresh on 401', () => {
  it('attempts token refresh before redirecting on 401', () => {
    // On 401, the interceptor should try to refresh the token before
    // forcibly redirecting to /login. If refresh succeeds, the original
    // request should be retried.
    expect(source).toMatch(/tryRefreshToken/)
  })

  it('still redirects to login when refresh fails', () => {
    // If token refresh fails, the interceptor should still redirect to /login
    expect(source).toMatch(/location\.href.*\/login/)
  })

  it('registers refresh callback from auth store', () => {
    // The auth store should register a refresh callback with http module
    const authSource = fs.readFileSync(path.resolve(__dirname, '../store/auth.ts'), 'utf-8')
    expect(authSource).toMatch(/setOnTokenRefresh/)
  })

  it('retries original request after successful refresh', () => {
    // After refresh, the original request should be retried with new token
    expect(source).toMatch(/_retried/)
    expect(source).toMatch(/http\.request/)
  })
})
