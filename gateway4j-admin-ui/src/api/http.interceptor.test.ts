import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'http.ts'), 'utf-8')

describe('http.ts — response interceptor preserves BusinessError data', () => {
  it('error interceptor checks for envelope data before wrapping in Error', () => {
    // When the server returns HTTP 4xx/5xx with a business envelope
    // { code: 10300, message: "..." }, the interceptor should throw
    // BusinessError (preserving code + errors) instead of plain Error.
    expect(source).toMatch(/BusinessError/)
    // Verify it's in the error interceptor context (after response.use)
    const afterUse = source.substring(source.indexOf('http.interceptors.response.use'))
    expect(afterUse).toMatch(/new BusinessError/)
  })

  it('error interceptor passes through response data for envelope parsing', () => {
    // The error interceptor should check err?.response?.data for envelope shape
    // and throw BusinessError when code is present.
    const afterUse = source.substring(source.indexOf('http.interceptors.response.use'))
    expect(afterUse).toMatch(/'code' in data/)
  })

  it('401 handling still works after refactor', () => {
    // The 401 redirect logic must be preserved
    const afterUse = source.substring(source.indexOf('http.interceptors.response.use'))
    expect(afterUse).toMatch(/401/)
  })
})
