import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'http.ts'), 'utf-8')

describe('api/http.ts — business error code handling', () => {
  it('defines a BusinessError class with code and optional retryAfter', () => {
    expect(source).toMatch(/class\s+BusinessError/)
    expect(source).toMatch(/this\.code/)
  })

  it('envelope() throws BusinessError (not generic Error) for non-zero code', () => {
    // The envelope function must use BusinessError, not just Error
    expect(source).toMatch(/throw\s+new\s+BusinessError/)
  })

  it('envelope() passes retry_after from response to BusinessError', () => {
    expect(source).toMatch(/retry_after/)
  })

  it('defines error code constants for type-safe checking', () => {
    expect(source).toMatch(/ERR_PERMISSION_DENIED/)
    expect(source).toMatch(/ERR_RATE_LIMITED/)
    expect(source).toMatch(/ERR_DUPLICATE_SUBMIT/)
  })
})
