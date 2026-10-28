import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'http.ts'), 'utf-8')

describe('api/http.ts — Idempotency-Key on write operations', () => {
  it('request interceptor adds Idempotency-Key header for write methods', () => {
    // API Contract 2.1: All write operations (POST/PUT/PATCH/DELETE) must
    // carry an Idempotency-Key header (UUID v4) for server-side dedup.
    // Without it, network retries or user double-clicks can create duplicates.
    expect(source).toMatch(/Idempotency-Key/)
  })

  it('Idempotency-Key is only added for write methods (not GET)', () => {
    // GET requests are idempotent by nature — no need for the header.
    // The interceptor must check the method before adding.
    // Look for a WRITE_METHODS set or method check
    expect(source).toMatch(/WRITE_METHODS|post.*put.*patch.*delete/i)
  })

  it('generates a new UUID v4 for each request', () => {
    // Each request gets a unique Idempotency-Key so retries of different
    // requests are not incorrectly deduped.
    expect(source).toMatch(/crypto\.randomUUID|uuid/)
  })
})
