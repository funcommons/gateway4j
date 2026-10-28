import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — falsy-zero guard in loadConfig', () => {
  it('uses != null (not truthy check) for numeric fields from API', () => {
    // if (r.token_expiry_hours) silently drops 0 values because 0 is falsy.
    // Numeric fields must use `!= null` or `!== undefined` to preserve zero.
    const loadConfigFn = source.match(/async function loadConfig\(\)[\s\S]*?^}/m)
    expect(loadConfigFn).toBeTruthy()
    const body = loadConfigFn![0]
    // token_expiry_hours and refresh_expiry_days should NOT use truthy checks
    expect(body).toMatch(/token_expiry_hours\s*!=\s*null/)
    expect(body).toMatch(/refresh_expiry_days\s*!=\s*null/)
  })
})
