import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('routes/List.vue — navigation uses await router.push', () => {
  it('does not use $router.push directly in template', () => {
    // $router.push returns a Promise; if navigation fails (e.g. beforeEach
    // guard rejects), the unhandled rejection is silently swallowed.
    // The fix: use a method that awaits router.push().
    expect(source).not.toMatch(/\$router\.push/)
  })

  it('uses a method (e.g. onNav) that calls await router.push', () => {
    // Verify the component defines a navigation method that awaits router.push
    expect(source).toMatch(/await router\.push/)
  })
})
